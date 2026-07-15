"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const messagesRepo = __importStar(require("./db/repositories/messages"));
const statusesRepo = __importStar(require("./db/repositories/statuses"));
const settingsRepo = __importStar(require("./db/repositories/settings"));
const peersRepo = __importStar(require("./db/repositories/peers"));
const cryptoKeysRepo = __importStar(require("./db/repositories/cryptoKeys"));
const signaling_1 = require("./signaling");
const discovery_1 = require("./discovery");
const router_1 = require("./router");
const crypto_2 = require("./crypto");
let mainWindow = null;
let ourPeerId = '';
let ourUsername = '';
let ourIpAddress = '';
let ourSignalingPort = 0;
let isSimulatedOffline = false;
// In-memory cache of discovered/connected peers
// peerId -> DiscoveredPeer & { status: 'connected' | 'searching' | 'offline' }
const peerCache = new Map();
// Helper to log debug info and push to renderer
function sendDebugLog(category, message, data) {
    const log = {
        timestamp: Date.now(),
        level: 'info',
        category,
        message,
        data
    };
    console.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('debug:log', log);
    }
}
// Get local IPv4 address
function getLocalIp() {
    const interfaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const list = interfaces[name];
        if (list) {
            for (const info of list) {
                if (info.family === 'IPv4' && !info.internal) {
                    return info.address;
                }
            }
        }
    }
    return '127.0.0.1';
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 950,
        minHeight: 650,
        frame: false, // No browser chrome - custom title bar
        title: 'Signal',
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    // Load the app
    const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // Open devtools in development mode
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// IPC Window Controls
electron_1.ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
});
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
electron_1.ipcMain.on('window:close', () => {
    mainWindow?.close();
});
electron_1.app.whenReady().then(async () => {
    // 1. Setup paths and SQLite DB
    const userDataPath = electron_1.app.getPath('userData');
    await (0, db_1.getDatabase)(userDataPath);
    (0, db_1.startAutoSave)(5000);
    // Load/Create Peer ID
    let cachedPeerId = settingsRepo.getConfig('peer_id');
    if (!cachedPeerId) {
        cachedPeerId = crypto_1.default.randomUUID().substring(0, 8); // Short ID for easier readability in hackathon demo
        settingsRepo.setConfig('peer_id', cachedPeerId);
    }
    ourPeerId = cachedPeerId;
    // Load Username
    ourUsername = settingsRepo.getConfig('username') || '';
    ourIpAddress = getLocalIp();
    // 2. Start WebSocket Signaling Server
    try {
        ourSignalingPort = await (0, signaling_1.initSignalingServer)((signalData) => {
            // Received signaling data from another peer
            if (isSimulatedOffline)
                return;
            sendDebugLog('Signaling', `Received signal (${signalData.type}) from ${signalData.senderName} (${signalData.senderId})`);
            // Forward to renderer to handle WebRTC connection
            if (mainWindow) {
                mainWindow.webContents.send('message:received', {
                    id: crypto_1.default.randomUUID(),
                    senderId: signalData.senderId,
                    senderName: signalData.senderName,
                    type: 'signal',
                    payload: JSON.stringify(signalData),
                    timestamp: Date.now(),
                    hops: 0
                });
            }
        });
    }
    catch (err) {
        console.error('Failed to start signaling server:', err);
        sendDebugLog('Error', 'Failed to start signaling server', err.message);
    }
    // 3. Initialize Identity Keys (ECDH)
    try {
        await (0, crypto_2.getOrCreateIdentityKeys)();
        const fingerprint = await (0, crypto_2.getIdentityFingerprint)();
        sendDebugLog('Crypto', `Identity key loaded/generated. Fingerprint: ${fingerprint}`);
    }
    catch (err) {
        sendDebugLog('Error', 'Failed to initialize identity keys', err.message);
    }
    // 4. Initialize Router
    (0, router_1.initRouter)(ourPeerId, 
    // Callback to get connected peers from memory
    () => {
        if (isSimulatedOffline)
            return [];
        return Array.from(peerCache.entries())
            .filter(([_, info]) => info.status === 'connected')
            .map(([id]) => id);
    }, 
    // Callback to forward a message to a specific peer (calls Renderer WebRTC)
    (peerId, message) => {
        if (isSimulatedOffline)
            return;
        if (mainWindow) {
            sendDebugLog('Router', `Instructing Renderer to send message ${message.id} to peer ${peerId}`);
            mainWindow.webContents.send('topology:message-hop', {
                messageId: message.id,
                fromNode: ourPeerId,
                toNode: peerId,
                type: message.type
            });
            // Instruct WebRTC channel in Renderer to send
            mainWindow.webContents.send('webrtc:send', { peerId, message });
        }
    }, 
    // Callback when router processes a message meant for us
    (message) => {
        sendDebugLog('Router', `Message ${message.id} successfully received and validated.`);
        if (mainWindow) {
            mainWindow.webContents.send('message:received', message);
        }
    });
    // 5. Create Window
    createWindow();
    // 6. Initialize Discovery if username is set
    if (ourUsername) {
        startMeshServices();
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
function startMeshServices() {
    sendDebugLog('Mesh', `Starting discovery for ${ourUsername} (${ourPeerId})`);
    (0, discovery_1.initDiscovery)(ourPeerId, ourUsername, ourSignalingPort, 
    // Peer Found (mDNS 'up')
    (peer) => {
        if (isSimulatedOffline)
            return;
        const existing = peerCache.get(peer.id);
        peerCache.set(peer.id, {
            ...peer,
            status: existing?.status || 'searching'
        });
        sendDebugLog('Discovery', `Peer UP: ${peer.displayName} at ${peer.address}:${peer.port}`);
        // Notify Renderer to show and establish WebRTC connection
        sendPeerListUpdate();
    }, 
    // Peer Lost (mDNS 'down')
    (lostPeerId) => {
        const peer = peerCache.get(lostPeerId);
        if (peer) {
            peer.status = 'offline';
            sendDebugLog('Discovery', `Peer DOWN: ${peer.displayName}`);
            sendPeerListUpdate();
        }
    });
}
function sendPeerListUpdate() {
    if (!mainWindow)
        return;
    const list = Array.from(peerCache.values()).map(p => ({
        id: p.id,
        displayName: p.displayName,
        address: p.address,
        port: p.port,
        status: isSimulatedOffline ? 'offline' : p.status
    }));
    mainWindow.webContents.send('peer:list', list);
}
// --- IPC Listeners ---
// Identity
electron_1.ipcMain.on('identity:set-username', (_event, username) => {
    ourUsername = username;
    settingsRepo.setConfig('username', username);
    sendDebugLog('Identity', `Username set to: ${username}`);
    if (ourSignalingPort > 0) {
        startMeshServices();
    }
});
electron_1.ipcMain.handle('identity:get', () => {
    return {
        peerId: ourPeerId,
        username: ourUsername,
        address: ourIpAddress,
        port: ourSignalingPort
    };
});
// Get identity fingerprint
electron_1.ipcMain.handle('identity:get-fingerprint', async () => {
    return (0, crypto_2.getIdentityFingerprint)();
});
// Manual Connection Fallback
electron_1.ipcMain.on('peer:connect-manual', (_event, { address, port }) => {
    sendDebugLog('Mesh', `Manual connection requested to ${address}:${port}`);
    // Create a temporary peer entry
    const tempId = `manual-${crypto_1.default.randomBytes(4).toString('hex')}`;
    peerCache.set(tempId, {
        id: tempId,
        displayName: `Peer @ ${address}`,
        address,
        port,
        status: 'searching'
    });
    sendPeerListUpdate();
    // Send a signal directly to initiate connection
    if (mainWindow) {
        // Pass to renderer to generate offer SDP and start signaling
        mainWindow.webContents.send('message:received', {
            id: crypto_1.default.randomUUID(),
            senderId: tempId,
            senderName: `Peer @ ${address}`,
            type: 'signal-manual-initiate',
            payload: JSON.stringify({ address, port, tempId }),
            timestamp: Date.now(),
            hops: 0
        });
    }
});
// Messaging
electron_1.ipcMain.on('message:send', (_event, { recipientId, type, payload, attachmentMeta }) => {
    if (isSimulatedOffline)
        return;
    const meshMsg = {
        id: crypto_1.default.randomUUID(),
        senderId: ourPeerId,
        recipientId,
        type,
        payload,
        timestamp: Date.now(),
        ttl: 5,
        visitedNodes: [ourPeerId],
        hops: 0,
        attachmentMeta,
        priority: type === 'sos' ? 1 : 0
    };
    sendDebugLog('Router', `Originating message ${meshMsg.id} to ${recipientId} (${type})`);
    // Save to DB and broadcast/route
    (0, router_1.handleIncomingMessage)(meshMsg, true);
});
// WebRTC signal relay from Renderer to peer
electron_1.ipcMain.handle('webrtc:forward-signal', async (_event, { address, port, signal }) => {
    if (isSimulatedOffline)
        return;
    try {
        const payload = {
            senderId: ourPeerId,
            senderName: ourUsername || 'Anonymous',
            type: signal.type,
            signal
        };
        await (0, signaling_1.sendSignalToPeer)(address, port, payload);
    }
    catch (err) {
        sendDebugLog('Error', `Failed to send signal to ${address}:${port}`, err.message);
    }
});
// Update Peer connection status in cache (from Renderer WebRTC manager)
electron_1.ipcMain.on('webrtc:status', (_event, { peerId, status }) => {
    const peer = peerCache.get(peerId);
    if (peer) {
        const oldStatus = peer.status;
        peer.status = status;
        if (oldStatus !== status) {
            sendDebugLog('Mesh', `Connection to peer ${peer.displayName} changed from ${oldStatus} to ${status}`);
            sendPeerListUpdate();
            // If it connected, sync undelivered messages
            if (status === 'connected') {
                (0, router_1.syncUndeliveredMessagesToPeer)(peerId);
            }
        }
    }
});
// Incoming message from WebRTC channel in Renderer
electron_1.ipcMain.on('webrtc:received', (_event, { message }) => {
    if (isSimulatedOffline)
        return;
    const meshMsg = message;
    sendDebugLog('Router', `Received mesh packet ${meshMsg.id} over WebRTC DataChannel`);
    (0, router_1.handleIncomingMessage)(meshMsg, false);
});
// WebRTC key handshake completion
electron_1.ipcMain.on('webrtc:key-handshake', async (_event, { peerId, publicKeyJwk }) => {
    try {
        const stored = cryptoKeysRepo.getSessionKey(peerId);
        if (stored) {
            sendDebugLog('Crypto', `Session key already exists for peer ${peerId}`);
            return;
        }
        // The session key derivation happens in the renderer after key exchange
        sendDebugLog('Crypto', `Key handshake completed with peer ${peerId}`);
    }
    catch (err) {
        sendDebugLog('Crypto', `Failed to process key handshake for ${peerId}`, err.message);
    }
});
// Verify peer fingerprint
electron_1.ipcMain.handle('peer:verify-fingerprint', async (_event, { peerId, fingerprint, displayName }) => {
    const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
    if (existing && existing.fingerprint === fingerprint) {
        return { verified: true, trusted: existing.verified_by === 'user' };
    }
    // Store as auto-trusted (TOFU)
    cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'auto', displayName);
    return { verified: true, trusted: false };
});
electron_1.ipcMain.on('peer:trust-fingerprint', (_event, { peerId, fingerprint, displayName }) => {
    cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'user', displayName);
    sendDebugLog('Security', `Manually trusted peer ${peerId} fingerprint`);
});
// Get ICE servers for WebRTC
electron_1.ipcMain.handle('webrtc:get-ice-servers', () => {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // TURN server (public fallback - rate limited)
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };
});
// TURN configuration
electron_1.ipcMain.handle('settings:get-turn-config', () => {
    return {
        hostname: settingsRepo.getConfig('turn_hostname') || 'openrelay.metered.ca',
        port: parseInt(settingsRepo.getConfig('turn_port') || '443'),
        username: settingsRepo.getConfig('turn_username') || 'openrelayproject',
        credential: settingsRepo.getConfig('turn_credential') || 'openrelayproject',
    };
});
electron_1.ipcMain.on('settings:set-turn-config', (_event, config) => {
    if (config.hostname)
        settingsRepo.setConfig('turn_hostname', config.hostname);
    if (config.port)
        settingsRepo.setConfig('turn_port', config.port.toString());
    if (config.username)
        settingsRepo.setConfig('turn_username', config.username);
    if (config.credential)
        settingsRepo.setConfig('turn_credential', config.credential);
    sendDebugLog('Settings', 'TURN configuration updated');
});
// Offline Simulation
electron_1.ipcMain.on('sim:toggle-offline', (_event, { offline }) => {
    isSimulatedOffline = offline;
    sendDebugLog('Sim', `offline mode set to: ${offline}`);
    if (offline) {
        (0, discovery_1.destroyDiscovery)();
    }
    else if (ourUsername) {
        startMeshServices();
    }
    sendPeerListUpdate();
    if (mainWindow) {
        mainWindow.webContents.send('sim:status', { offline });
    }
});
// Get peer fingerprint
electron_1.ipcMain.handle('peer:get-fingerprint', async (_event, { peerId }) => {
    const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
    return existing ? { fingerprint: existing.fingerprint, trusted: existing.verified_by === 'user' } : null;
});
// Export/Import identity
electron_1.ipcMain.handle('identity:export', async (_event, { passphrase }) => {
    return (0, crypto_2.exportIdentity)(passphrase);
});
electron_1.ipcMain.handle('identity:import', async (_event, { backupData, passphrase }) => {
    await (0, crypto_2.importIdentity)(backupData, passphrase);
    // Re-initialize
    await (0, crypto_2.getOrCreateIdentityKeys)();
    const fingerprint = await (0, crypto_2.getIdentityFingerprint)();
    return { fingerprint };
});
// Get all known peers from database
electron_1.ipcMain.handle('peers:get-all', () => {
    return peersRepo.getAllPeers();
});
// Retrieve message and status check-in history on renderer startup
electron_1.ipcMain.handle('history:get', () => {
    return {
        messages: messagesRepo.getAllMessages().map(m => ({
            id: m.id,
            senderId: m.sender_id,
            recipientId: m.recipient_id,
            type: m.type,
            payload: m.payload,
            timestamp: m.timestamp,
            ttl: m.ttl,
            visitedNodes: JSON.parse(m.visited_nodes),
            hops: m.hops,
            attachmentMeta: m.attachment_meta ? JSON.parse(m.attachment_meta) : undefined,
            priority: m.priority,
            signature: m.signature
        })),
        statuses: statusesRepo.getAllPeerStatuses()
    };
});
// Cleanup on close
electron_1.app.on('window-all-closed', () => {
    (0, discovery_1.destroyDiscovery)();
    (0, signaling_1.closeSignalingServer)();
    (0, db_1.stopAutoSave)();
    (0, db_1.closeDatabase)();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});

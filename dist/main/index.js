"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("./database");
const signaling_1 = require("./signaling");
const discovery_1 = require("./discovery");
const router_1 = require("./router");
let mainWindow = null;
let ourPeerId = '';
let ourUsername = '';
let ourIpAddress = '';
let ourSignalingPort = 0;
let isSimulatedOffline = false;
// In-memory cache of discovered/connected peers
// peerId -> DiscoveredPeer
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
    (0, database_1.initDatabase)(userDataPath);
    // Load/Create Peer ID
    let cachedPeerId = (0, database_1.getConfig)('peer_id');
    if (!cachedPeerId) {
        cachedPeerId = crypto_1.default.randomUUID().substring(0, 8); // Short ID for easier readability in hackathon demo
        (0, database_1.setConfig)('peer_id', cachedPeerId);
    }
    ourPeerId = cachedPeerId;
    // Load Username
    ourUsername = (0, database_1.getConfig)('username') || '';
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
    // 3. Initialize Router
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
    // 4. Create Window
    createWindow();
    // 5. Initialize Discovery if username is set
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
// --- IPC IPC Listeners ---
// Identity
electron_1.ipcMain.on('identity:set-username', (_event, username) => {
    ourUsername = username;
    (0, database_1.setConfig)('username', username);
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
// Status check-ins
electron_1.ipcMain.on('status:update', (_event, { status, location }) => {
    const checkin = {
        peer_id: ourPeerId,
        display_name: ourUsername || 'Anonymous',
        status,
        location,
        timestamp: Date.now()
    };
    (0, database_1.savePeerStatus)(checkin);
    sendDebugLog('Status', `Own check-in updated: ${status} @ ${location || 'unknown'}`);
    // Propagate across mesh as a system message
    const meshMsg = {
        id: crypto_1.default.randomUUID(),
        senderId: ourPeerId,
        recipientId: 'broadcast',
        type: 'status',
        payload: JSON.stringify(checkin),
        timestamp: Date.now(),
        ttl: 5,
        visitedNodes: [ourPeerId],
        hops: 0,
        priority: 0
    };
    (0, router_1.handleIncomingMessage)(meshMsg, true);
    // Send updated status board to renderer
    if (mainWindow) {
        mainWindow.webContents.send('status:sync', (0, database_1.getAllPeerStatuses)());
    }
});
// Retrieve message and status history on renderer load
electron_1.ipcMain.handle('history:get', () => {
    return {
        messages: (0, database_1.getAllMessages)().map(m => ({
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
            priority: m.priority
        })),
        statuses: (0, database_1.getAllPeerStatuses)()
    };
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
electron_1.app.on('window-all-closed', () => {
    (0, discovery_1.destroyDiscovery)();
    (0, signaling_1.closeSignalingServer)();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});

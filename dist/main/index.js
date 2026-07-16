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
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const qrcode_1 = __importDefault(require("qrcode"));
const db_1 = require("./db");
const messagesRepo = __importStar(require("./db/repositories/messages"));
const statusesRepo = __importStar(require("./db/repositories/statuses"));
const settingsRepo = __importStar(require("./db/repositories/settings"));
const peersRepo = __importStar(require("./db/repositories/peers"));
const cryptoKeysRepo = __importStar(require("./db/repositories/cryptoKeys"));
const router_1 = require("./router");
const crypto_2 = require("./crypto");
let mainWindow = null;
let ourPeerId = '';
let ourUsername = '';
let isSimulatedOffline = false;
const peerCache = new Map();
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
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 950,
        minHeight: 650,
        frame: false,
        title: 'Signum',
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
    }
    mainWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
        if (validatedURL.startsWith('http://localhost:5173')) {
            console.log('[Main] Vite dev server offline. Falling back to local built assets...');
            mainWindow?.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
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
    const userDataPath = electron_1.app.getPath('userData');
    await (0, db_1.getDatabase)(userDataPath);
    (0, db_1.startAutoSave)(5000);
    let cachedPeerId = settingsRepo.getConfig('peer_id');
    if (!cachedPeerId) {
        cachedPeerId = crypto_1.default.randomUUID().substring(0, 8);
        settingsRepo.setConfig('peer_id', cachedPeerId);
    }
    ourPeerId = cachedPeerId;
    ourUsername = settingsRepo.getConfig('username') || '';
    try {
        await (0, crypto_2.getOrCreateIdentityKeys)();
        const fingerprint = await (0, crypto_2.getIdentityFingerprint)();
        sendDebugLog('Crypto', `Identity key loaded/generated. Fingerprint: ${fingerprint}`);
    }
    catch (err) {
        sendDebugLog('Error', 'Failed to initialize identity keys', err.message);
    }
    (0, router_1.initRouter)(ourPeerId, () => {
        if (isSimulatedOffline)
            return [];
        return Array.from(peerCache.entries())
            .filter(([_, info]) => info.status === 'connected')
            .map(([id]) => id);
    }, (peerId, message) => {
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
            mainWindow.webContents.send('webrtc:send', { peerId, message });
        }
    }, (message) => {
        sendDebugLog('Router', `Message ${message.id} successfully received and validated.`);
        if (mainWindow) {
            mainWindow.webContents.send('message:received', message);
        }
    });
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
function sendPeerListUpdate() {
    if (!mainWindow)
        return;
    const list = Array.from(peerCache.values()).map(p => ({
        id: p.id,
        displayName: p.displayName,
        address: p.address || 'direct',
        port: p.port || 0,
        status: isSimulatedOffline ? 'offline' : p.status
    }));
    mainWindow.webContents.send('peer:list', list);
}
electron_1.ipcMain.on('identity:set-username', (_event, username) => {
    ourUsername = username;
    settingsRepo.setConfig('username', username);
    sendDebugLog('Identity', `Username set to: ${username}`);
});
electron_1.ipcMain.handle('identity:get', () => {
    return {
        peerId: ourPeerId,
        username: ourUsername,
        address: 'direct',
        port: 0
    };
});
electron_1.ipcMain.handle('identity:get-fingerprint', async () => {
    return (0, crypto_2.getIdentityFingerprint)();
});
electron_1.ipcMain.handle('qr:generate', async (_event, { text }) => {
    try {
        return await qrcode_1.default.toDataURL(text);
    }
    catch (err) {
        sendDebugLog('Error', `Failed to generate QR code: ${err.message}`);
        throw err;
    }
});
electron_1.ipcMain.handle('file:save-dialog', async (_event, { defaultName, content }) => {
    if (!mainWindow)
        return false;
    const { filePath } = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: 'Signum Connection File', extensions: ['sig'] }]
    });
    if (filePath) {
        try {
            fs_1.default.writeFileSync(filePath, content, 'utf8');
            return true;
        }
        catch (err) {
            sendDebugLog('Error', `Failed to save connection file: ${err.message}`);
            return false;
        }
    }
    return false;
});
electron_1.ipcMain.handle('file:open-dialog', async () => {
    if (!mainWindow)
        return null;
    const { filePaths } = await electron_1.dialog.showOpenDialog(mainWindow, {
        filters: [{ name: 'Signum Connection File', extensions: ['sig'] }],
        properties: ['openFile']
    });
    if (filePaths && filePaths.length > 0) {
        try {
            return fs_1.default.readFileSync(filePaths[0], 'utf8');
        }
        catch (err) {
            sendDebugLog('Error', `Failed to read connection file: ${err.message}`);
            return null;
        }
    }
    return null;
});
electron_1.ipcMain.on('message:send', (_event, { recipientId, type, payload, attachmentMeta, messageId, timestamp }) => {
    if (isSimulatedOffline)
        return;
    const meshMsg = {
        id: messageId || crypto_1.default.randomUUID(),
        senderId: ourPeerId,
        senderName: ourUsername || 'Anonymous',
        recipientId,
        type,
        payload,
        timestamp: timestamp || Date.now(),
        ttl: 5,
        visitedNodes: [ourPeerId],
        hops: 0,
        attachmentMeta,
        priority: type === 'sos' ? 1 : 0
    };
    sendDebugLog('Router', `Originating message ${meshMsg.id} to ${recipientId} (${type})`);
    (0, router_1.handleIncomingMessage)(meshMsg, true);
});
electron_1.ipcMain.on('message:save-decrypted', (_event, { id, decryptedPayload }) => {
    const msg = messagesRepo.getMessageById(id);
    if (msg) {
        msg.payload = decryptedPayload;
        msg.encrypted = 0;
        messagesRepo.saveMessage(msg);
        sendDebugLog('Crypto', `Saved decrypted message ${id} to database history`);
    }
});
electron_1.ipcMain.on('webrtc:status', (_event, { peerId, status, address, port, displayName, tempId }) => {
    if (tempId) {
        peerCache.delete(tempId);
    }
    let peer = peerCache.get(peerId);
    let statusChanged = false;
    if (!peer && status === 'connected') {
        peer = {
            id: peerId,
            displayName: displayName || `Peer ${peerId.substring(0, 6)}`,
            address: address || 'direct',
            port: port || 0,
            status: 'connected'
        };
        peerCache.set(peerId, peer);
        statusChanged = true;
        sendDebugLog('Mesh', `Discovered manual connect peer: ${peer.displayName} (${peerId})`);
    }
    if (peer) {
        const oldStatus = peer.status;
        if (!statusChanged && oldStatus !== status) {
            peer.status = status;
            statusChanged = true;
            sendDebugLog('Mesh', `Connection to peer ${peer.displayName} changed from ${oldStatus} to ${status}`);
        }
        if (statusChanged) {
            sendPeerListUpdate();
            if (peer.status === 'connected') {
                (0, router_1.syncUndeliveredMessagesToPeer)(peerId);
            }
        }
    }
});
electron_1.ipcMain.on('webrtc:received', (_event, { message }) => {
    if (isSimulatedOffline)
        return;
    const meshMsg = message;
    sendDebugLog('Router', `Received mesh packet ${meshMsg.id} over WebRTC DataChannel`);
    (0, router_1.handleIncomingMessage)(meshMsg, false);
});
electron_1.ipcMain.on('status:update', (_event, { status, location }) => {
    if (isSimulatedOffline)
        return;
    const checkinData = {
        peer_id: ourPeerId,
        display_name: ourUsername || 'Anonymous',
        status,
        location: location || null,
        timestamp: Date.now()
    };
    statusesRepo.savePeerStatus(checkinData);
    sendDebugLog('Status', `Check-in saved: ${status}${location ? ' @ ' + location : ''}`);
    const meshMsg = {
        id: crypto_1.default.randomUUID(),
        senderId: ourPeerId,
        recipientId: 'broadcast',
        type: 'status',
        payload: JSON.stringify(checkinData),
        timestamp: Date.now(),
        ttl: 5,
        visitedNodes: [ourPeerId],
        hops: 0,
        priority: 0
    };
    (0, router_1.handleIncomingMessage)(meshMsg, true);
    const allStatuses = statusesRepo.getAllPeerStatuses();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status:sync', allStatuses);
    }
});
electron_1.ipcMain.on('webrtc:key-handshake', async (_event, { peerId, publicKeyJwk }) => {
    try {
        const stored = cryptoKeysRepo.getSessionKey(peerId);
        if (stored) {
            sendDebugLog('Crypto', `Session key already exists for peer ${peerId}`);
            return;
        }
        sendDebugLog('Crypto', `Key handshake completed with peer ${peerId}`);
    }
    catch (err) {
        sendDebugLog('Crypto', `Failed to process key handshake for ${peerId}`, err.message);
    }
});
electron_1.ipcMain.handle('peer:verify-fingerprint', async (_event, { peerId, fingerprint, displayName }) => {
    const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
    if (existing && existing.fingerprint === fingerprint) {
        return { verified: true, trusted: existing.verified_by === 'user' };
    }
    cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'auto', displayName);
    return { verified: true, trusted: false };
});
electron_1.ipcMain.on('peer:trust-fingerprint', (_event, { peerId, fingerprint, displayName }) => {
    cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'user', displayName);
    sendDebugLog('Security', `Manually trusted peer ${peerId} fingerprint`);
});
electron_1.ipcMain.handle('webrtc:get-ice-servers', () => {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
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
electron_1.ipcMain.handle('peer:get-fingerprint', async (_event, { peerId }) => {
    const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
    return existing ? { fingerprint: existing.fingerprint, trusted: existing.verified_by === 'user' } : null;
});
electron_1.ipcMain.handle('identity:export', async (_event, { passphrase }) => {
    return (0, crypto_2.exportIdentity)(passphrase);
});
electron_1.ipcMain.on('sim:toggle-offline', (_event, { offline }) => {
    isSimulatedOffline = offline;
    sendDebugLog('Sim', `offline mode set to: ${offline}`);
    sendPeerListUpdate();
    if (mainWindow) {
        mainWindow.webContents.send('sim:status', { offline });
    }
});
electron_1.ipcMain.handle('identity:import', async (_event, { backupData, passphrase }) => {
    await (0, crypto_2.importIdentity)(backupData, passphrase);
    await (0, crypto_2.getOrCreateIdentityKeys)();
    const fingerprint = await (0, crypto_2.getIdentityFingerprint)();
    return { fingerprint };
});
electron_1.ipcMain.handle('peers:get-all', () => {
    return peersRepo.getAllPeers();
});
electron_1.ipcMain.handle('history:get', () => {
    return {
        messages: messagesRepo.getAllMessages().map(m => ({
            id: m.id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            recipientId: m.recipient_id,
            type: m.type,
            payload: m.payload,
            encrypted: m.encrypted === 1,
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
electron_1.app.on('window-all-closed', () => {
    (0, db_1.stopAutoSave)();
    (0, db_1.closeDatabase)();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    setUsername: (username) => electron_1.ipcRenderer.send('identity:set-username', username),
    getIdentity: () => electron_1.ipcRenderer.invoke('identity:get'),
    getHistory: () => electron_1.ipcRenderer.invoke('history:get'),
    getFingerprint: () => electron_1.ipcRenderer.invoke('identity:get-fingerprint'),
    generateQRCode: (text) => electron_1.ipcRenderer.invoke('qr:generate', { text }),
    sendMessage: (recipientId, type, payload, attachmentMeta, messageId, timestamp) => electron_1.ipcRenderer.send('message:send', { recipientId, type, payload, attachmentMeta, messageId, timestamp }),
    saveDecryptedMessage: (id, decryptedPayload) => electron_1.ipcRenderer.send('message:save-decrypted', { id, decryptedPayload }),
    onMessageReceived: (callback) => {
        const subscription = (_event, msg) => callback(msg);
        electron_1.ipcRenderer.on('message:received', subscription);
        return () => electron_1.ipcRenderer.removeListener('message:received', subscription);
    },
    onMessageDelivered: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('message:delivered', subscription);
        return () => electron_1.ipcRenderer.removeListener('message:delivered', subscription);
    },
    onPeerListUpdated: (callback) => {
        const subscription = (_event, peers) => callback(peers);
        electron_1.ipcRenderer.on('peer:list', subscription);
        return () => electron_1.ipcRenderer.removeListener('peer:list', subscription);
    },
    saveConnectionFile: (defaultName, content) => electron_1.ipcRenderer.invoke('file:save-dialog', { defaultName, content }),
    loadConnectionFile: () => electron_1.ipcRenderer.invoke('file:open-dialog'),
    updateStatus: (status, location) => electron_1.ipcRenderer.send('status:update', { status, location }),
    onStatusSync: (callback) => {
        const subscription = (_event, statuses) => callback(statuses);
        electron_1.ipcRenderer.on('status:sync', subscription);
        return () => electron_1.ipcRenderer.removeListener('status:sync', subscription);
    },
    onTopologyUpdated: (callback) => {
        const subscription = (_event, topology) => callback(topology);
        electron_1.ipcRenderer.on('topology:update', subscription);
        return () => electron_1.ipcRenderer.removeListener('topology:update', subscription);
    },
    onMessageHop: (callback) => {
        const subscription = (_event, hop) => callback(hop);
        electron_1.ipcRenderer.on('topology:message-hop', subscription);
        return () => electron_1.ipcRenderer.removeListener('topology:message-hop', subscription);
    },
    toggleOffline: (offline) => electron_1.ipcRenderer.send('sim:toggle-offline', { offline }),
    onSimStatusUpdated: (callback) => {
        const subscription = (_event, status) => callback(status);
        electron_1.ipcRenderer.on('sim:status', subscription);
        return () => electron_1.ipcRenderer.removeListener('sim:status', subscription);
    },
    onDebugLog: (callback) => {
        const subscription = (_event, log) => callback(log);
        electron_1.ipcRenderer.on('debug:log', subscription);
        return () => electron_1.ipcRenderer.removeListener('debug:log', subscription);
    },
    webrtcSend: (peerId, message) => electron_1.ipcRenderer.send('webrtc:send-to-peer', { peerId, message }),
    webrtcStatus: (peerId, status, address, port, displayName, tempId) => electron_1.ipcRenderer.send('webrtc:status', { peerId, status, address, port, displayName, tempId }),
    webrtcReceived: (message) => electron_1.ipcRenderer.send('webrtc:received', { message }),
    onWebrtcSend: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('webrtc:send', subscription);
        return () => electron_1.ipcRenderer.removeListener('webrtc:send', subscription);
    },
    webrtcKeyHandshake: (peerId, publicKeyJwk) => electron_1.ipcRenderer.send('webrtc:key-handshake', { peerId, publicKeyJwk }),
    verifyPeerFingerprint: (peerId, fingerprint, displayName) => electron_1.ipcRenderer.invoke('peer:verify-fingerprint', { peerId, fingerprint, displayName }),
    trustPeerFingerprint: (peerId, fingerprint, displayName) => electron_1.ipcRenderer.send('peer:trust-fingerprint', { peerId, fingerprint, displayName }),
    getPeerFingerprint: (peerId) => electron_1.ipcRenderer.invoke('peer:get-fingerprint', { peerId }),
    getIceServers: () => electron_1.ipcRenderer.invoke('webrtc:get-ice-servers'),
    minimizeWindow: () => electron_1.ipcRenderer.send('window:minimize'),
    maximizeWindow: () => electron_1.ipcRenderer.send('window:maximize'),
    closeWindow: () => electron_1.ipcRenderer.send('window:close'),
    exportIdentity: (passphrase) => electron_1.ipcRenderer.invoke('identity:export', { passphrase }),
    importIdentity: (backupData, passphrase) => electron_1.ipcRenderer.invoke('identity:import', { backupData, passphrase }),
    getAllPeers: () => electron_1.ipcRenderer.invoke('peers:get-all'),
});

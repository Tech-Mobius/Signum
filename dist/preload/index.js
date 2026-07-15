"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose the API to the renderer process safely
electron_1.contextBridge.exposeInMainWorld('api', {
    // Identity
    setUsername: (username) => electron_1.ipcRenderer.send('identity:set-username', username),
    getIdentity: () => electron_1.ipcRenderer.invoke('identity:get'),
    getHistory: () => electron_1.ipcRenderer.invoke('history:get'),
    // Messaging
    sendMessage: (recipientId, type, payload, attachmentMeta) => electron_1.ipcRenderer.send('message:send', { recipientId, type, payload, attachmentMeta }),
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
    // Peer & Connection Management
    manualConnect: (address, port) => electron_1.ipcRenderer.send('peer:connect-manual', { address, port }),
    onPeerListUpdated: (callback) => {
        const subscription = (_event, peers) => callback(peers);
        electron_1.ipcRenderer.on('peer:list', subscription);
        return () => electron_1.ipcRenderer.removeListener('peer:list', subscription);
    },
    // Status Check-in
    updateStatus: (status, location) => electron_1.ipcRenderer.send('status:update', { status, location }),
    onStatusSync: (callback) => {
        const subscription = (_event, statuses) => callback(statuses);
        electron_1.ipcRenderer.on('status:sync', subscription);
        return () => electron_1.ipcRenderer.removeListener('status:sync', subscription);
    },
    // Topology & Routing Visualization
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
    // Offline Simulation
    toggleOffline: (offline) => electron_1.ipcRenderer.send('sim:toggle-offline', { offline }),
    onSimStatusUpdated: (callback) => {
        const subscription = (_event, status) => callback(status);
        electron_1.ipcRenderer.on('sim:status', subscription);
        return () => electron_1.ipcRenderer.removeListener('sim:status', subscription);
    },
    // Debug Logs
    onDebugLog: (callback) => {
        const subscription = (_event, log) => callback(log);
        electron_1.ipcRenderer.on('debug:log', subscription);
        return () => electron_1.ipcRenderer.removeListener('debug:log', subscription);
    }
});

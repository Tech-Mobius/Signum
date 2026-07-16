import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  setUsername: (username: string) => ipcRenderer.send('identity:set-username', username),
  getIdentity: () => ipcRenderer.invoke('identity:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  getFingerprint: () => ipcRenderer.invoke('identity:get-fingerprint'),
  generateQRCode: (text: string) => ipcRenderer.invoke('qr:generate', { text }),

  sendMessage: (recipientId: string, type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: any, messageId?: string, timestamp?: number) =>
    ipcRenderer.send('message:send', { recipientId, type, payload, attachmentMeta, messageId, timestamp }),
  saveDecryptedMessage: (id: string, decryptedPayload: string) =>
    ipcRenderer.send('message:save-decrypted', { id, decryptedPayload }),
  onMessageReceived: (callback: (message: any) => void) => {
    const subscription = (_event: any, msg: any) => callback(msg);
    ipcRenderer.on('message:received', subscription);
    return () => ipcRenderer.removeListener('message:received', subscription);
  },
  onMessageDelivered: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('message:delivered', subscription);
    return () => ipcRenderer.removeListener('message:delivered', subscription);
  },

  onPeerListUpdated: (callback: (peers: any[]) => void) => {
    const subscription = (_event: any, peers: any[]) => callback(peers);
    ipcRenderer.on('peer:list', subscription);
    return () => ipcRenderer.removeListener('peer:list', subscription);
  },

  saveConnectionFile: (defaultName: string, content: string) => ipcRenderer.invoke('file:save-dialog', { defaultName, content }),
  loadConnectionFile: () => ipcRenderer.invoke('file:open-dialog'),

  updateStatus: (status: 'safe' | 'need-help' | 'unknown', location?: string) =>
    ipcRenderer.send('status:update', { status, location }),
  onStatusSync: (callback: (statuses: any[]) => void) => {
    const subscription = (_event: any, statuses: any[]) => callback(statuses);
    ipcRenderer.on('status:sync', subscription);
    return () => ipcRenderer.removeListener('status:sync', subscription);
  },

  onTopologyUpdated: (callback: (topology: any) => void) => {
    const subscription = (_event: any, topology: any) => callback(topology);
    ipcRenderer.on('topology:update', subscription);
    return () => ipcRenderer.removeListener('topology:update', subscription);
  },
  onMessageHop: (callback: (hop: any) => void) => {
    const subscription = (_event: any, hop: any) => callback(hop);
    ipcRenderer.on('topology:message-hop', subscription);
    return () => ipcRenderer.removeListener('topology:message-hop', subscription);
  },

  toggleOffline: (offline: boolean) => ipcRenderer.send('sim:toggle-offline', { offline }),
  onSimStatusUpdated: (callback: (status: any) => void) => {
    const subscription = (_event: any, status: any) => callback(status);
    ipcRenderer.on('sim:status', subscription);
    return () => ipcRenderer.removeListener('sim:status', subscription);
  },

  onDebugLog: (callback: (log: any) => void) => {
    const subscription = (_event: any, log: any) => callback(log);
    ipcRenderer.on('debug:log', subscription);
    return () => ipcRenderer.removeListener('debug:log', subscription);
  },

  webrtcSend: (peerId: string, message: any) =>
    ipcRenderer.send('webrtc:send-to-peer', { peerId, message }),
  webrtcStatus: (peerId: string, status: 'connected' | 'offline', address?: string, port?: number, displayName?: string, tempId?: string) =>
    ipcRenderer.send('webrtc:status', { peerId, status, address, port, displayName, tempId }),
  webrtcReceived: (message: any) =>
    ipcRenderer.send('webrtc:received', { message }),
  onWebrtcSend: (callback: (data: { peerId: string; message: any }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('webrtc:send', subscription);
    return () => ipcRenderer.removeListener('webrtc:send', subscription);
  },
  webrtcKeyHandshake: (peerId: string, publicKeyJwk: JsonWebKey) =>
    ipcRenderer.send('webrtc:key-handshake', { peerId, publicKeyJwk }),

  verifyPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) =>
    ipcRenderer.invoke('peer:verify-fingerprint', { peerId, fingerprint, displayName }),
  trustPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) =>
    ipcRenderer.send('peer:trust-fingerprint', { peerId, fingerprint, displayName }),
  getPeerFingerprint: (peerId: string) => ipcRenderer.invoke('peer:get-fingerprint', { peerId }),

  getIceServers: () => ipcRenderer.invoke('webrtc:get-ice-servers'),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  exportIdentity: (passphrase: string) => ipcRenderer.invoke('identity:export', { passphrase }),
  importIdentity: (backupData: string, passphrase: string) => ipcRenderer.invoke('identity:import', { backupData, passphrase }),

  getAllPeers: () => ipcRenderer.invoke('peers:get-all'),
});
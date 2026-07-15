import { contextBridge, ipcRenderer } from 'electron';

// Expose the API to the renderer process safely
contextBridge.exposeInMainWorld('api', {
  // Identity
  setUsername: (username: string) => ipcRenderer.send('identity:set-username', username),
  getIdentity: () => ipcRenderer.invoke('identity:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  getFingerprint: () => ipcRenderer.invoke('identity:get-fingerprint'),

  // Messaging
  sendMessage: (recipientId: string, type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: any) =>
    ipcRenderer.send('message:send', { recipientId, type, payload, attachmentMeta }),
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

  // Peer & Connection Management
  manualConnect: (address: string, port: number) => ipcRenderer.send('peer:connect-manual', { address, port }),
  onPeerListUpdated: (callback: (peers: any[]) => void) => {
    const subscription = (_event: any, peers: any[]) => callback(peers);
    ipcRenderer.on('peer:list', subscription);
    return () => ipcRenderer.removeListener('peer:list', subscription);
  },

  // Status Check-in
  updateStatus: (status: 'safe' | 'need-help' | 'unknown', location?: string) =>
    ipcRenderer.send('status:update', { status, location }),
  onStatusSync: (callback: (statuses: any[]) => void) => {
    const subscription = (_event: any, statuses: any[]) => callback(statuses);
    ipcRenderer.on('status:sync', subscription);
    return () => ipcRenderer.removeListener('status:sync', subscription);
  },

  // Topology & Routing Visualization
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

  // Offline Simulation
  toggleOffline: (offline: boolean) => ipcRenderer.send('sim:toggle-offline', { offline }),
  onSimStatusUpdated: (callback: (status: any) => void) => {
    const subscription = (_event: any, status: any) => callback(status);
    ipcRenderer.on('sim:status', subscription);
    return () => ipcRenderer.removeListener('sim:status', subscription);
  },

  // Debug Logs
  onDebugLog: (callback: (log: any) => void) => {
    const subscription = (_event: any, log: any) => callback(log);
    ipcRenderer.on('debug:log', subscription);
    return () => ipcRenderer.removeListener('debug:log', subscription);
  },

  // WebRTC bridges — allow Renderer to send/receive WebRTC signaling and data
  // These are needed because App.tsx manages WebRTC connections in the renderer
  webrtcSend: (peerId: string, message: any) =>
    ipcRenderer.send('webrtc:send-to-peer', { peerId, message }),
  webrtcStatus: (peerId: string, status: 'connected' | 'offline') =>
    ipcRenderer.send('webrtc:status', { peerId, status }),
  webrtcReceived: (message: any) =>
    ipcRenderer.send('webrtc:received', { message }),
  onWebrtcSend: (callback: (data: { peerId: string; message: any }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('webrtc:send', subscription);
    return () => ipcRenderer.removeListener('webrtc:send', subscription);
  },
  forwardSignal: (address: string, port: number, signal: any) =>
    ipcRenderer.invoke('webrtc:forward-signal', { address, port, signal }),
  webrtcKeyHandshake: (peerId: string, publicKeyJwk: JsonWebKey) =>
    ipcRenderer.send('webrtc:key-handshake', { peerId, publicKeyJwk }),

  // Peer verification
  verifyPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) =>
    ipcRenderer.invoke('peer:verify-fingerprint', { peerId, fingerprint, displayName }),
  trustPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) =>
    ipcRenderer.send('peer:trust-fingerprint', { peerId, fingerprint, displayName }),
  getPeerFingerprint: (peerId: string) => ipcRenderer.invoke('peer:get-fingerprint', { peerId }),

  // ICE Servers
  getIceServers: () => ipcRenderer.invoke('webrtc:get-ice-servers'),

  // TURN Configuration
  getTurnConfig: () => ipcRenderer.invoke('settings:get-turn-config'),
  setTurnConfig: (config: any) => ipcRenderer.send('settings:set-turn-config', config),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  // Identity backup/restore
  exportIdentity: (passphrase: string) => ipcRenderer.invoke('identity:export', { passphrase }),
  importIdentity: (backupData: string, passphrase: string) => ipcRenderer.invoke('identity:import', { backupData, passphrase }),

  // Get all peers
  getAllPeers: () => ipcRenderer.invoke('peers:get-all'),
});
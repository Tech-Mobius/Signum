export interface DiscoveredPeer {
  id: string;
  displayName: string;
  address: string;
  port: number;
}

export interface PeerInfo extends DiscoveredPeer {
  status: 'connected' | 'searching' | 'offline' | 'relaying';
}

export interface DBMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  type: 'text' | 'sos' | 'file' | 'status';
  payload: string;
  timestamp: number;
  ttl: number;
  visited_nodes: string; 
  hops: number;
  delivered: number; 
  attachment_meta?: string; 
  priority: number;
  acknowledged?: number; 
  ack_timestamp?: number;
  retry_count?: number;
  signature?: string;
}

export interface MeshMessage {
  id: string;
  senderId: string;
  senderName?: string; 
  recipientId: string;
  type: 'text' | 'sos' | 'file' | 'status';
  payload: string;
  timestamp: number;
  ttl: number;
  visitedNodes: string[];
  hops: number;
  attachmentMeta?: any;
  priority: number;
  signature?: string;
}

export interface PeerStatus {
  peer_id: string;
  display_name: string;
  status: 'safe' | 'need-help' | 'unknown';
  location?: string;
  timestamp: number;
}

export interface DebugLog {
  timestamp: number;
  level: string;
  category: string;
  message: string;
  data?: any;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnConfig {
  hostname: string;
  port: number;
  username: string;
  credential: string;
}

export interface VerifiedPeerResult {
  verified: boolean;
  trusted: boolean;
  fingerprint: string;
}

export interface IPCAPI {
  setUsername: (username: string) => void;
  getIdentity: () => Promise<{ peerId: string; username: string; address: string; port: number }>;
  getHistory: () => Promise<{ messages: MeshMessage[]; statuses: PeerStatus[] }>;
  getFingerprint: () => Promise<string>;
  generateQRCode: (text: string) => Promise<string>;

  sendMessage: (recipientId: string, type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: any, messageId?: string, timestamp?: number) => void;
  saveDecryptedMessage: (id: string, decryptedPayload: string) => void;
  onMessageReceived: (callback: (message: any) => void) => () => void;
  onMessageDelivered: (callback: (data: { messageId: string; peerId: string }) => void) => () => void;

  onPeerListUpdated: (callback: (peers: PeerInfo[]) => void) => () => void;

  saveConnectionFile: (defaultName: string, content: string) => Promise<boolean>;
  loadConnectionFile: () => Promise<string | null>;

  updateStatus: (status: 'safe' | 'need-help' | 'unknown', location?: string) => void;
  onStatusSync: (callback: (statuses: PeerStatus[]) => void) => () => void;

  onTopologyUpdated: (callback: (topology: any) => void) => () => void;
  onMessageHop: (callback: (hop: { messageId: string; fromNode: string; toNode: string; type: string }) => void) => () => void;

  toggleOffline: (offline: boolean) => void;
  onSimStatusUpdated: (callback: (status: { offline: boolean }) => void) => () => void;

  onDebugLog: (callback: (log: DebugLog) => void) => () => void;

  webrtcSend: (peerId: string, message: any) => void;
  webrtcStatus: (peerId: string, status: 'connected' | 'offline', address?: string, port?: number, displayName?: string, tempId?: string) => void;
  webrtcReceived: (message: any) => void;
  onWebrtcSend: (callback: (data: { peerId: string; message: any }) => void) => () => void;
  webrtcKeyHandshake: (peerId: string, publicKeyJwk: any) => void;

  verifyPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) => Promise<VerifiedPeerResult>;
  trustPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) => void;
  getPeerFingerprint: (peerId: string) => Promise<{ fingerprint: string; trusted: boolean } | null>;

  getIceServers: () => Promise<{ iceServers: IceServerConfig[] }>;
  getTurnConfig: () => Promise<TurnConfig>;
  setTurnConfig: (config: Partial<TurnConfig>) => void;

  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  exportIdentity: (passphrase: string) => Promise<string>;
  importIdentity: (backupData: string, passphrase: string) => Promise<{ fingerprint: string }>;
}

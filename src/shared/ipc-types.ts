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
  visited_nodes: string; // JSON string of string[]
  hops: number;
  delivered: number; // 0 or 1
  attachment_meta?: string; // JSON string
  priority: number;
  acknowledged?: number; // 0 or 1
  ack_timestamp?: number;
  retry_count?: number;
  signature?: string;
}

export interface MeshMessage {
  id: string;
  senderId: string;
  senderName?: string; // Optional sender name for display
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
  // Identity
  setUsername: (username: string) => void;
  getIdentity: () => Promise<{ peerId: string; username: string; address: string; port: number }>;
  getHistory: () => Promise<{ messages: MeshMessage[]; statuses: PeerStatus[] }>;
  getFingerprint: () => Promise<string>;

  // Messaging
  sendMessage: (recipientId: string, type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: any) => void;
  onMessageReceived: (callback: (message: any) => void) => () => void;
  onMessageDelivered: (callback: (data: { messageId: string; peerId: string }) => void) => () => void;

  // Peer & Connection Management
  manualConnect: (address: string, port: number) => void;
  onPeerListUpdated: (callback: (peers: PeerInfo[]) => void) => () => void;

  // Status Check-in
  updateStatus: (status: 'safe' | 'need-help' | 'unknown', location?: string) => void;
  onStatusSync: (callback: (statuses: PeerStatus[]) => void) => () => void;

  // Topology & Routing Visualization
  onTopologyUpdated: (callback: (topology: any) => void) => () => void;
  onMessageHop: (callback: (hop: { messageId: string; fromNode: string; toNode: string; type: string }) => void) => () => void;

  // Offline Simulation
  toggleOffline: (offline: boolean) => void;
  onSimStatusUpdated: (callback: (status: { offline: boolean }) => void) => () => void;

  // Debug Logs
  onDebugLog: (callback: (log: DebugLog) => void) => () => void;

  // WebRTC bridges
  webrtcSend: (peerId: string, message: any) => void;
  webrtcStatus: (peerId: string, status: 'connected' | 'offline') => void;
  webrtcReceived: (message: any) => void;
  onWebrtcSend: (callback: (data: { peerId: string; message: any }) => void) => () => void;
  forwardSignal: (address: string, port: number, signal: any) => Promise<void>;
  webrtcKeyHandshake: (peerId: string, publicKeyJwk: any) => void;

  // Peer verification
  verifyPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) => Promise<VerifiedPeerResult>;
  trustPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) => void;
  getPeerFingerprint: (peerId: string) => Promise<{ fingerprint: string; trusted: boolean } | null>;

  // ICE & TURN Configs
  getIceServers: () => Promise<{ iceServers: IceServerConfig[] }>;
  getTurnConfig: () => Promise<TurnConfig>;
  setTurnConfig: (config: Partial<TurnConfig>) => void;

  // Window Controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // Identity backup/restore
  exportIdentity: (passphrase: string) => Promise<string>;
  importIdentity: (backupData: string, passphrase: string) => Promise<{ fingerprint: string }>;
}

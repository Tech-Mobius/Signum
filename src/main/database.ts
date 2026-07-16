import path from 'path';
import fs from 'fs';

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
}

export interface PeerStatus {
  peer_id: string;
  display_name: string;
  status: 'safe' | 'need-help' | 'unknown';
  location?: string;
  timestamp: number;
}

interface StoreSchema {
  config: Record<string, string>;
  messages: Record<string, DBMessage>;
  peer_statuses: Record<string, PeerStatus>;
}

let dbPath = '';
let storeData: StoreSchema = {
  config: {},
  messages: {},
  peer_statuses: {}
};

function saveStore() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(storeData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write JSON store to disk:', err);
  }
}

export function initDatabase(userDataPath: string) {
  dbPath = path.join(userDataPath, 'signal-store.json');
  
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    try {
      const content = fs.readFileSync(dbPath, 'utf-8');
      storeData = JSON.parse(content);
      if (!storeData.config) storeData.config = {};
      if (!storeData.messages) storeData.messages = {};
      if (!storeData.peer_statuses) storeData.peer_statuses = {};
    } catch (err) {
      console.error('Failed to parse JSON store, resetting...', err);
      saveStore();
    }
  } else {
    saveStore();
  }

  console.log(`JSON File Database initialized at: ${dbPath}`);
}

export function setConfig(key: string, value: string) {
  storeData.config[key] = value;
  saveStore();
}

export function getConfig(key: string): string | null {
  return storeData.config[key] || null;
}

export function saveMessage(msg: DBMessage) {
  storeData.messages[msg.id] = msg;
  saveStore();
}

export function messageExists(id: string): boolean {
  return storeData.messages[id] !== undefined;
}

export function markMessageDelivered(id: string) {
  if (storeData.messages[id]) {
    storeData.messages[id].delivered = 1;
    saveStore();
  }
}

export function getUndeliveredMessages(): DBMessage[] {
  return Object.values(storeData.messages)
    .filter(m => m.delivered === 0)
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    });
}

export function getAllMessages(): DBMessage[] {
  return Object.values(storeData.messages).sort((a, b) => a.timestamp - b.timestamp);
}

export function savePeerStatus(status: PeerStatus) {
  storeData.peer_statuses[status.peer_id] = status;
  saveStore();
}

export function getAllPeerStatuses(): PeerStatus[] {
  return Object.values(storeData.peer_statuses).sort((a, b) => b.timestamp - a.timestamp);
}

import * as SQLite from 'expo-sqlite';

export interface PeerRecord {
  id: string;
  display_name: string;
  address: string | null;
  port: number | null;
  last_seen: number;
  status: 'connected' | 'searching' | 'offline' | 'relaying';
}

export interface DBMessage {
  id: string;
  sender_id: string;
  sender_name?: string;
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
  encrypted: number; 
}

export interface PeerStatus {
  peer_id: string;
  display_name: string;
  status: 'safe' | 'need-help' | 'unknown';
  location?: string;
  timestamp: number;
}

export interface VerifiedPeerRecord {
  peer_id: string;
  fingerprint: string;
  verified_at: number;
  verified_by: 'user' | 'auto';
  display_name?: string;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  
  const db = await SQLite.openDatabaseAsync('signal.db');
  dbInstance = db;
  
  const res = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = res?.user_version ?? 0;
  
  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        recipient_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ttl INTEGER NOT NULL,
        visited_nodes TEXT NOT NULL,
        hops INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0,
        attachment_meta TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        ack_timestamp INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        signature TEXT,
        encrypted INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);

      CREATE TABLE IF NOT EXISTS peers (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        address TEXT,
        port INTEGER,
        last_seen INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'offline'
      );
      CREATE INDEX IF NOT EXISTS idx_peers_status ON peers(status);

      CREATE TABLE IF NOT EXISTS peer_statuses (
        peer_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL,
        location TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crypto_keys (
        id TEXT PRIMARY KEY,
        key_type TEXT NOT NULL,
        public_key TEXT NOT NULL,
        private_key TEXT,
        peer_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS verified_peers (
        peer_id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        verified_by TEXT NOT NULL,
        display_name TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      PRAGMA user_version = 3;
    `);
  }
  
  return dbInstance;
}

export async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDatabase();
  return await db.getAllAsync<T>(sql, params);
}

export async function queryOne<T>(sql: string, params: any[] = []): Promise<T | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<T>(sql, params);
}

export async function run(sql: string, params: any[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
  const db = await getDatabase();
  const res = await db.runAsync(sql, params);
  return { lastInsertRowId: res.lastInsertRowId, changes: res.changes };
}

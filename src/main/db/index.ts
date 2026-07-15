import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import * as migrations from './migrations';

let db: Database | null = null;
let dbPath = '';
let isInitialized = false;

// Initialize SQL.js WASM module
async function initializeSqlJs(): Promise<any> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      try {
        const distDir = path.dirname(require.resolve('sql.js'));
        const wasmPath = path.join(distDir, file);
        return wasmPath;
      } catch (err) {
        console.error('Failed to locate sql.js WASM file dynamically, using fallback relative path:', err);
        return `node_modules/sql.js/dist/${file}`;
      }
    },
  });
  return SQL;
}

// Get or create database instance
export async function getDatabase(userDataPath: string): Promise<Database> {
  if (db && isInitialized) {
    return db;
  }

  dbPath = path.join(userDataPath, 'signal.db');

  const SQL = await initializeSqlJs();

  // Load existing database or create new
  let fileBuffer: Uint8Array | null = null;
  if (fs.existsSync(dbPath)) {
    fileBuffer = new Uint8Array(fs.readFileSync(dbPath));
  }

  db = new SQL.Database(fileBuffer ?? undefined);
  isInitialized = true;

  // Run migrations
  await migrations.runMigrations(db!);

  // Enable WAL mode for better concurrency
  db!.exec('PRAGMA journal_mode = WAL;');
  db!.exec('PRAGMA synchronous = NORMAL;');
  db!.exec('PRAGMA foreign_keys = ON;');
  db!.exec('PRAGMA busy_timeout = 5000;');

  console.log(`SQLite database initialized at: ${dbPath}`);

  return db!;
}

// Save database to disk
export function saveDatabase(): void {
  if (!db || !isInitialized) return;

  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (err) {
    console.error('Failed to save database:', err);
  }
}

// Periodic save (call every 5 seconds or on app close)
let saveInterval: NodeJS.Timeout | null = null;
export function startAutoSave(intervalMs = 5000): void {
  if (saveInterval) return;
  saveInterval = setInterval(saveDatabase, intervalMs);
}

export function stopAutoSave(): void {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  saveDatabase(); // Final save
}

// Query helpers
export function query<T>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  const results: T[] = [];
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T>(sql: string, params: any[] = []): T | null {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = stmt.step() ? (stmt.getAsObject() as T) : null;
  stmt.free();
  return result;
}

export function run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  const changes = db.getRowsModified();
  const lastInsertRowid = db.exec('SELECT last_insert_rowid() as id;')[0]?.values?.[0]?.[0] as number ?? 0;
  stmt.free();
  return { changes, lastInsertRowid };
}

export function exec(sql: string): void {
  if (!db) throw new Error('Database not initialized');
  db.exec(sql);
}

// Transaction helper
export function transaction<T>(fn: () => T): T {
  if (!db) throw new Error('Database not initialized');
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// Close database
export function closeDatabase(): void {
  stopAutoSave();
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    isInitialized = false;
  }
}

// Export types for repositories
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

export interface PeerStatus {
  peer_id: string;
  display_name: string;
  status: 'safe' | 'need-help' | 'unknown';
  location?: string;
  timestamp: number;
}

export interface CryptoKeyRecord {
  id: string;
  key_type: 'identity' | 'session';
  public_key: string;
  private_key: string | null;
  peer_id: string | null;
  created_at: number;
  expires_at: number | null;
}

export interface SettingRecord {
  key: string;
  value: string;
  updated_at: number;
}

export interface VerifiedPeerRecord {
  peer_id: string;
  fingerprint: string;
  verified_at: number;
  verified_by: 'user' | 'auto';
  display_name?: string;
}

export interface PeerRecord {
  id: string;
  display_name: string;
  address: string | null;
  port: number | null;
  last_seen: number;
  status: 'connected' | 'searching' | 'offline' | 'relaying';
}
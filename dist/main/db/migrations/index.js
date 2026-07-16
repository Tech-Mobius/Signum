"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
exports.getMigrationStatus = getMigrationStatus;
const MIGRATIONS = [
    {
        version: 1,
        name: 'initial_schema',
        up: (db) => {
            // Messages table
            db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          sender_id TEXT NOT NULL,
          recipient_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('text', 'sos', 'file', 'status')),
          payload TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          ttl INTEGER NOT NULL,
          visited_nodes TEXT NOT NULL, -- JSON array
          hops INTEGER NOT NULL DEFAULT 0,
          delivered INTEGER NOT NULL DEFAULT 0, -- 0 or 1
          attachment_meta TEXT, -- JSON
          priority INTEGER NOT NULL DEFAULT 0,
          acknowledged INTEGER NOT NULL DEFAULT 0,
          ack_timestamp INTEGER,
          retry_count INTEGER NOT NULL DEFAULT 0,
          signature TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered);
        CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
      `);
            // Peers table
            db.exec(`
        CREATE TABLE IF NOT EXISTS peers (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          address TEXT,
          port INTEGER,
          last_seen INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('connected', 'searching', 'offline', 'relaying'))
        );
        CREATE INDEX IF NOT EXISTS idx_peers_status ON peers(status);
        CREATE INDEX IF NOT EXISTS idx_peers_last_seen ON peers(last_seen);
      `);
            // Peer statuses (check-ins)
            db.exec(`
        CREATE TABLE IF NOT EXISTS peer_statuses (
          peer_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('safe', 'need-help', 'unknown')),
          location TEXT,
          timestamp INTEGER NOT NULL
        );
      `);
            // Crypto keys
            db.exec(`
        CREATE TABLE IF NOT EXISTS crypto_keys (
          id TEXT PRIMARY KEY,
          key_type TEXT NOT NULL CHECK (key_type IN ('identity', 'session')),
          public_key TEXT NOT NULL,
          private_key TEXT, -- encrypted at rest
          peer_id TEXT, -- for session keys
          created_at INTEGER NOT NULL,
          expires_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_crypto_keys_type ON crypto_keys(key_type);
        CREATE INDEX IF NOT EXISTS idx_crypto_keys_peer ON crypto_keys(peer_id);
      `);
            // Verified peers (fingerprint verification)
            db.exec(`
        CREATE TABLE IF NOT EXISTS verified_peers (
          peer_id TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          verified_at INTEGER NOT NULL,
          verified_by TEXT NOT NULL CHECK (verified_by IN ('user', 'auto')),
          display_name TEXT
        );
      `);
            // Settings
            db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
            // Pending outbound messages (retry queue)
            db.exec(`
        CREATE TABLE IF NOT EXISTS outbound_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT NOT NULL,
          peer_id TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_retry_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(message_id, peer_id)
        );
        CREATE INDEX IF NOT EXISTS idx_outbound_queue_retry ON outbound_queue(next_retry_at);
      `);
        },
    },
    {
        version: 2,
        name: 'add_message_acknowledgment',
        up: (db) => {
            // Already included in v1, but keeping for reference
        },
    },
    {
        version: 3,
        name: 'add_sender_name_encrypted',
        up: (db) => {
            // Add sender_name column — safe to ignore if already exists
            try {
                db.exec(`ALTER TABLE messages ADD COLUMN sender_name TEXT;`);
            }
            catch (_) { }
            // Add encrypted column — safe to ignore if already exists
            try {
                db.exec(`ALTER TABLE messages ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;`);
            }
            catch (_) { }
        },
    },
];
let currentVersion = 0;
function getCurrentVersion(db) {
    try {
        const result = db.exec('PRAGMA user_version;');
        return result[0]?.values[0]?.[0] ?? 0;
    }
    catch {
        return 0;
    }
}
function setCurrentVersion(db, version) {
    db.exec(`PRAGMA user_version = ${version};`);
}
async function runMigrations(db) {
    currentVersion = getCurrentVersion(db);
    console.log(`Current DB version: ${currentVersion}`);
    for (const migration of MIGRATIONS) {
        if (migration.version > currentVersion) {
            console.log(`Running migration ${migration.version}: ${migration.name}`);
            try {
                db.exec('BEGIN TRANSACTION;');
                migration.up(db);
                setCurrentVersion(db, migration.version);
                db.exec('COMMIT;');
                currentVersion = migration.version;
                console.log(`Migration ${migration.version} completed`);
            }
            catch (err) {
                db.exec('ROLLBACK;');
                console.error(`Migration ${migration.version} failed:`, err);
                throw err;
            }
        }
    }
    console.log(`Database migrated to version ${currentVersion}`);
}
function getMigrationStatus() {
    return {
        version: currentVersion,
        pending: MIGRATIONS.filter(m => m.version > currentVersion).length,
    };
}

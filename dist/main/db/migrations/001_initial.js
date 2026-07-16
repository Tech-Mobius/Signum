"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migration_001_initial = void 0;
exports.migration_001_initial = {
    name: '001_initial',
    up: async (db) => {
        db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('text', 'sos', 'file', 'status')),
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ttl INTEGER NOT NULL DEFAULT 5,
        visited_nodes TEXT NOT NULL DEFAULT '[]',
        hops INTEGER NOT NULL DEFAULT 0,
        delivered INTEGER NOT NULL DEFAULT 0,
        attachment_meta TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        ack_timestamp INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        signature TEXT
      );
    `);
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_recipient_delivered
      ON messages (recipient_id, delivered);
    `);
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_sender_timestamp
      ON messages (sender_id, timestamp DESC);
    `);
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp
      ON messages (timestamp DESC);
    `);
        db.exec(`
      CREATE TABLE IF NOT EXISTS peer_statuses (
        peer_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('safe', 'need-help', 'unknown')),
        location TEXT,
        timestamp INTEGER NOT NULL
      );
    `);
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_peer_statuses_timestamp
      ON peer_statuses (timestamp DESC);
    `);
        db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_keys (
        id TEXT PRIMARY KEY,
        key_type TEXT NOT NULL CHECK (key_type IN ('identity', 'session')),
        public_key TEXT NOT NULL,
        private_key TEXT,
        peer_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );
    `);
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_crypto_keys_peer_id
      ON crypto_keys (peer_id);
    `);
        db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
        db.exec(`
      CREATE TABLE IF NOT EXISTS verified_peers (
        peer_id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        verified_by TEXT NOT NULL CHECK (verified_by IN ('user', 'auto')),
        display_name TEXT
      );
    `);
        db.exec(`
      CREATE TABLE IF NOT EXISTS peers (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        address TEXT,
        port INTEGER,
        last_seen INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('connected', 'searching', 'offline', 'relaying')) DEFAULT 'offline'
      );
    `);
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_peers_status
      ON peers (status);
    `);
    },
};

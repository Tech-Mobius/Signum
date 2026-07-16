"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migration_002_sender_name_encrypted = void 0;
exports.migration_002_sender_name_encrypted = {
    name: '002_sender_name_encrypted',
    up: async (db) => {
        // Add sender_name column if it doesn't exist
        try {
            db.exec(`ALTER TABLE messages ADD COLUMN sender_name TEXT;`);
        }
        catch (_) {
            // Column already exists — safe to ignore
        }
        // Add encrypted column if it doesn't exist
        try {
            db.exec(`ALTER TABLE messages ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;`);
        }
        catch (_) {
            // Column already exists — safe to ignore
        }
    },
};

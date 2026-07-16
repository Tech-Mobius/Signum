"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migration_002_sender_name_encrypted = void 0;
exports.migration_002_sender_name_encrypted = {
    name: '002_sender_name_encrypted',
    up: async (db) => {
        try {
            db.exec(`ALTER TABLE messages ADD COLUMN sender_name TEXT;`);
        }
        catch (_) {
        }
        try {
            db.exec(`ALTER TABLE messages ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;`);
        }
        catch (_) {
        }
    },
};

import { Database } from 'sql.js';

export const migration_002_sender_name_encrypted = {
  name: '002_sender_name_encrypted',
  up: async (db: Database): Promise<void> => {
    try {
      db.exec(`ALTER TABLE messages ADD COLUMN sender_name TEXT;`);
    } catch (_) {
    }

    try {
      db.exec(`ALTER TABLE messages ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;`);
    } catch (_) {
    }
  },
};

import { query, queryOne, run, saveDatabase } from '../index';

export function setConfig(key: string, value: string): void {
  run(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, value, Date.now()]
  );
  saveDatabase();
}

export function getConfig(key: string): string | null {
  const result = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return result?.value ?? null;
}

export function getAllConfig(): Record<string, string> {
  const results = query<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(results.map(r => [r.key, r.value]));
}

export function deleteConfig(key: string): void {
  run('DELETE FROM settings WHERE key = ?', [key]);
  saveDatabase();
}
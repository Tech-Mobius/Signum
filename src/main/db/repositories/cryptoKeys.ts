import { query, queryOne, run, transaction, saveDatabase } from '../index';

export interface CryptoKeyRecord {
  id: string;
  key_type: 'identity' | 'session';
  public_key: string;
  private_key: string | null;
  peer_id: string | null;
  created_at: number;
  expires_at: number | null;
}

export function saveCryptoKey(key: CryptoKeyRecord): void {
  run(
    `INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, peer_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [key.id, key.key_type, key.public_key, key.private_key, key.peer_id, key.created_at, key.expires_at ?? null]
  );
  saveDatabase();
}

export function getIdentityKey(): CryptoKeyRecord | null {
  return queryOne<CryptoKeyRecord>(
    `SELECT * FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`
  );
}

export function getSessionKey(peerId: string): CryptoKeyRecord | null {
  return queryOne<CryptoKeyRecord>(
    `SELECT * FROM crypto_keys WHERE key_type = 'session' AND peer_id = ? ORDER BY created_at DESC LIMIT 1`,
    [peerId]
  );
}

export function getAllSessionKeys(): CryptoKeyRecord[] {
  return query<CryptoKeyRecord>(
    `SELECT * FROM crypto_keys WHERE key_type = 'session' ORDER BY created_at DESC`
  );
}

export function deleteExpiredSessionKeys(): void {
  run('DELETE FROM crypto_keys WHERE key_type = ? AND expires_at IS NOT NULL AND expires_at < ?', ['session', Date.now()]);
  saveDatabase();
}

export function deleteSessionKey(peerId: string): void {
  run('DELETE FROM crypto_keys WHERE key_type = ? AND peer_id = ?', ['session', peerId]);
  saveDatabase();
}

export function saveVerifiedPeer(
  peerId: string,
  fingerprint: string,
  verifiedBy: 'user' | 'auto',
  displayName?: string
): void {
  run(
    `INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`,
    [peerId, fingerprint, Date.now(), verifiedBy, displayName ?? null]
  );
  saveDatabase();
}

export function getVerifiedPeer(peerId: string): {
  peer_id: string;
  fingerprint: string;
  verified_at: number;
  verified_by: 'user' | 'auto';
  display_name: string | null;
} | null {
  return queryOne(
    `SELECT * FROM verified_peers WHERE peer_id = ?`,
    [peerId]
  );
}

export function isPeerVerified(peerId: string, fingerprint: string): boolean {
  const result = queryOne<{ fingerprint: string }>(
    `SELECT fingerprint FROM verified_peers WHERE peer_id = ?`,
    [peerId]
  );
  return result?.fingerprint === fingerprint;
}

export function getAllVerifiedPeers(): Array<{
  peer_id: string;
  fingerprint: string;
  verified_at: number;
  verified_by: 'user' | 'auto';
  display_name: string | null;
}> {
  return query(
    `SELECT * FROM verified_peers ORDER BY verified_at DESC`
  );
}

export function deleteVerifiedPeer(peerId: string): void {
  run('DELETE FROM verified_peers WHERE peer_id = ?', [peerId]);
  saveDatabase();
}
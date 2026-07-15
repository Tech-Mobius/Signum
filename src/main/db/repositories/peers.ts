import { query, queryOne, run, saveDatabase } from '../index';

export interface PeerRecord {
  id: string;
  display_name: string;
  address: string | null;
  port: number | null;
  last_seen: number;
  status: 'connected' | 'searching' | 'offline' | 'relaying';
}

export function upsertPeer(peer: PeerRecord): void {
  run(
    `INSERT OR REPLACE INTO peers (id, display_name, address, port, last_seen, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [peer.id, peer.display_name, peer.address, peer.port, peer.last_seen, peer.status]
  );
  saveDatabase();
}

export function getPeer(id: string): PeerRecord | null {
  return queryOne<PeerRecord>('SELECT * FROM peers WHERE id = ?', [id]);
}

export function getAllPeers(): PeerRecord[] {
  return query<PeerRecord>('SELECT * FROM peers ORDER BY last_seen DESC');
}

export function getConnectedPeers(): PeerRecord[] {
  return query<PeerRecord>(
    `SELECT * FROM peers WHERE status = 'connected' ORDER BY last_seen DESC`
  );
}

export function updatePeerStatus(id: string, status: PeerRecord['status']): void {
  run('UPDATE peers SET status = ?, last_seen = ? WHERE id = ?', [status, Date.now(), id]);
  saveDatabase();
}

export function updatePeerLastSeen(id: string): void {
  run('UPDATE peers SET last_seen = ? WHERE id = ?', [Date.now(), id]);
  saveDatabase();
}

export function deletePeer(id: string): void {
  run('DELETE FROM peers WHERE id = ?', [id]);
  saveDatabase();
}

export function cleanupOldPeers(olderThan: number): void {
  run('DELETE FROM peers WHERE last_seen < ?', [olderThan]);
  saveDatabase();
}
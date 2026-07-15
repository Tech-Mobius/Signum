import { query, queryOne, run, PeerStatus, saveDatabase } from '../index';

export function savePeerStatus(status: PeerStatus): void {
  run(
    `INSERT OR REPLACE INTO peer_statuses (peer_id, display_name, status, location, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [status.peer_id, status.display_name, status.status, status.location ?? null, status.timestamp]
  );
  saveDatabase();
}

export function getAllPeerStatuses(): PeerStatus[] {
  return query<PeerStatus>('SELECT * FROM peer_statuses ORDER BY timestamp DESC');
}

export function getPeerStatus(peerId: string): PeerStatus | null {
  return queryOne<PeerStatus>('SELECT * FROM peer_statuses WHERE peer_id = ?', [peerId]);
}

export function getLatestStatusesForPeers(peerIds: string[]): PeerStatus[] {
  if (peerIds.length === 0) return [];
  const placeholders = peerIds.map(() => '?').join(',');
  return query<PeerStatus>(
    `SELECT * FROM peer_statuses WHERE peer_id IN (${placeholders}) ORDER BY timestamp DESC`,
    peerIds
  );
}

export function deleteOldStatuses(olderThan: number): void {
  run('DELETE FROM peer_statuses WHERE timestamp < ?', [olderThan]);
  saveDatabase();
}
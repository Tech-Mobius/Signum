import { query, queryOne, run, DBMessage, saveDatabase } from '../index';
export type { DBMessage };

export function saveMessage(msg: DBMessage): void {
  run(
    `INSERT OR REPLACE INTO messages (
      id, sender_id, sender_name, recipient_id, type, payload, encrypted, timestamp, ttl,
      visited_nodes, hops, delivered, attachment_meta, priority,
      acknowledged, ack_timestamp, retry_count, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.id,
      msg.sender_id,
      msg.sender_name ?? null,
      msg.recipient_id,
      msg.type,
      msg.payload,
      msg.encrypted ?? 0,
      msg.timestamp,
      msg.ttl,
      msg.visited_nodes,
      msg.hops,
      msg.delivered,
      msg.attachment_meta ?? null,
      msg.priority,
      msg.acknowledged ?? 0,
      msg.ack_timestamp ?? null,
      msg.retry_count ?? 0,
      msg.signature ?? null,
    ]
  );
  saveDatabase();
}

export function messageExists(id: string): boolean {
  const result = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages WHERE id = ?', [id]);
  return (result?.count ?? 0) > 0;
}

export function markMessageDelivered(id: string): void {
  run('UPDATE messages SET delivered = 1, acknowledged = 1, ack_timestamp = ? WHERE id = ?', [Date.now(), id]);
  saveDatabase();
}

export function markMessageAcknowledged(id: string): void {
  run('UPDATE messages SET acknowledged = 1, ack_timestamp = ? WHERE id = ?', [Date.now(), id]);
  saveDatabase();
}

export function incrementRetryCount(id: string): number {
  const result = queryOne<{ retry_count: number }>('SELECT retry_count FROM messages WHERE id = ?', [id]);
  const newCount = (result?.retry_count ?? 0) + 1;
  run('UPDATE messages SET retry_count = ? WHERE id = ?', [newCount, id]);
  saveDatabase();
  return newCount;
}

export function getUndeliveredMessages(): DBMessage[] {
  return query<DBMessage>(
    `SELECT * FROM messages
     WHERE delivered = 0
     ORDER BY priority DESC, timestamp ASC`
  );
}

export function getMessagesForPeer(peerId: string, limit = 100): DBMessage[] {
  return query<DBMessage>(
    `SELECT * FROM messages
     WHERE (sender_id = ? OR recipient_id = ?)
     ORDER BY timestamp DESC
     LIMIT ?`,
    [peerId, peerId, limit]
  );
}

export function getAllMessages(): DBMessage[] {
  return query<DBMessage>('SELECT * FROM messages ORDER BY timestamp ASC');
}

export function getBroadcastMessages(limit = 500): DBMessage[] {
  return query<DBMessage>(
    `SELECT * FROM messages
     WHERE recipient_id = 'broadcast'
     ORDER BY timestamp DESC
     LIMIT ?`,
    [limit]
  );
}

export function getMessagesSince(timestamp: number): DBMessage[] {
  return query<DBMessage>(
    `SELECT * FROM messages WHERE timestamp > ? ORDER BY timestamp ASC`,
    [timestamp]
  );
}

export function getMessageById(id: string): DBMessage | null {
  return queryOne<DBMessage>('SELECT * FROM messages WHERE id = ?', [id]);
}

export function getMessagesForRetry(maxRetries = 5): DBMessage[] {
  return query<DBMessage>(
    `SELECT * FROM messages
     WHERE delivered = 0 AND retry_count < ?
     ORDER BY priority DESC, timestamp ASC`,
    [maxRetries]
  );
}

export function getMessagesStats(): { total: number; delivered: number; pending: number; failed: number } {
  const total = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages')?.count ?? 0;
  const delivered = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages WHERE delivered = 1')?.count ?? 0;
  const pending = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages WHERE delivered = 0 AND retry_count < 5')?.count ?? 0;
  const failed = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM messages WHERE delivered = 0 AND retry_count >= 5')?.count ?? 0;
  return { total, delivered, pending, failed };
}
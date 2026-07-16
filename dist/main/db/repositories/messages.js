"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveMessage = saveMessage;
exports.messageExists = messageExists;
exports.markMessageDelivered = markMessageDelivered;
exports.markMessageAcknowledged = markMessageAcknowledged;
exports.incrementRetryCount = incrementRetryCount;
exports.getUndeliveredMessages = getUndeliveredMessages;
exports.getMessagesForPeer = getMessagesForPeer;
exports.getAllMessages = getAllMessages;
exports.getBroadcastMessages = getBroadcastMessages;
exports.getMessagesSince = getMessagesSince;
exports.getMessageById = getMessageById;
exports.getMessagesForRetry = getMessagesForRetry;
exports.getMessagesStats = getMessagesStats;
const index_1 = require("../index");
function saveMessage(msg) {
    (0, index_1.run)(`INSERT OR REPLACE INTO messages (
      id, sender_id, sender_name, recipient_id, type, payload, encrypted, timestamp, ttl,
      visited_nodes, hops, delivered, attachment_meta, priority,
      acknowledged, ack_timestamp, retry_count, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
    ]);
    (0, index_1.saveDatabase)();
}
function messageExists(id) {
    const result = (0, index_1.queryOne)('SELECT COUNT(*) as count FROM messages WHERE id = ?', [id]);
    return (result?.count ?? 0) > 0;
}
function markMessageDelivered(id) {
    (0, index_1.run)('UPDATE messages SET delivered = 1, acknowledged = 1, ack_timestamp = ? WHERE id = ?', [Date.now(), id]);
    (0, index_1.saveDatabase)();
}
function markMessageAcknowledged(id) {
    (0, index_1.run)('UPDATE messages SET acknowledged = 1, ack_timestamp = ? WHERE id = ?', [Date.now(), id]);
    (0, index_1.saveDatabase)();
}
function incrementRetryCount(id) {
    const result = (0, index_1.queryOne)('SELECT retry_count FROM messages WHERE id = ?', [id]);
    const newCount = (result?.retry_count ?? 0) + 1;
    (0, index_1.run)('UPDATE messages SET retry_count = ? WHERE id = ?', [newCount, id]);
    (0, index_1.saveDatabase)();
    return newCount;
}
function getUndeliveredMessages() {
    return (0, index_1.query)(`SELECT * FROM messages
     WHERE delivered = 0
     ORDER BY priority DESC, timestamp ASC`);
}
function getMessagesForPeer(peerId, limit = 100) {
    return (0, index_1.query)(`SELECT * FROM messages
     WHERE (sender_id = ? OR recipient_id = ?)
     ORDER BY timestamp DESC
     LIMIT ?`, [peerId, peerId, limit]);
}
function getAllMessages() {
    return (0, index_1.query)('SELECT * FROM messages ORDER BY timestamp ASC');
}
function getBroadcastMessages(limit = 500) {
    return (0, index_1.query)(`SELECT * FROM messages
     WHERE recipient_id = 'broadcast'
     ORDER BY timestamp DESC
     LIMIT ?`, [limit]);
}
function getMessagesSince(timestamp) {
    return (0, index_1.query)(`SELECT * FROM messages WHERE timestamp > ? ORDER BY timestamp ASC`, [timestamp]);
}
function getMessageById(id) {
    return (0, index_1.queryOne)('SELECT * FROM messages WHERE id = ?', [id]);
}
function getMessagesForRetry(maxRetries = 5) {
    return (0, index_1.query)(`SELECT * FROM messages
     WHERE delivered = 0 AND retry_count < ?
     ORDER BY priority DESC, timestamp ASC`, [maxRetries]);
}
function getMessagesStats() {
    const total = (0, index_1.queryOne)('SELECT COUNT(*) as count FROM messages')?.count ?? 0;
    const delivered = (0, index_1.queryOne)('SELECT COUNT(*) as count FROM messages WHERE delivered = 1')?.count ?? 0;
    const pending = (0, index_1.queryOne)('SELECT COUNT(*) as count FROM messages WHERE delivered = 0 AND retry_count < 5')?.count ?? 0;
    const failed = (0, index_1.queryOne)('SELECT COUNT(*) as count FROM messages WHERE delivered = 0 AND retry_count >= 5')?.count ?? 0;
    return { total, delivered, pending, failed };
}

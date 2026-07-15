"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCryptoKey = saveCryptoKey;
exports.getIdentityKey = getIdentityKey;
exports.getSessionKey = getSessionKey;
exports.getAllSessionKeys = getAllSessionKeys;
exports.deleteExpiredSessionKeys = deleteExpiredSessionKeys;
exports.deleteSessionKey = deleteSessionKey;
exports.saveVerifiedPeer = saveVerifiedPeer;
exports.getVerifiedPeer = getVerifiedPeer;
exports.isPeerVerified = isPeerVerified;
exports.getAllVerifiedPeers = getAllVerifiedPeers;
exports.deleteVerifiedPeer = deleteVerifiedPeer;
const index_1 = require("../index");
function saveCryptoKey(key) {
    (0, index_1.run)(`INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, peer_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [key.id, key.key_type, key.public_key, key.private_key, key.peer_id, key.created_at, key.expires_at ?? null]);
    (0, index_1.saveDatabase)();
}
function getIdentityKey() {
    return (0, index_1.queryOne)(`SELECT * FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`);
}
function getSessionKey(peerId) {
    return (0, index_1.queryOne)(`SELECT * FROM crypto_keys WHERE key_type = 'session' AND peer_id = ? ORDER BY created_at DESC LIMIT 1`, [peerId]);
}
function getAllSessionKeys() {
    return (0, index_1.query)(`SELECT * FROM crypto_keys WHERE key_type = 'session' ORDER BY created_at DESC`);
}
function deleteExpiredSessionKeys() {
    (0, index_1.run)('DELETE FROM crypto_keys WHERE key_type = ? AND expires_at IS NOT NULL AND expires_at < ?', ['session', Date.now()]);
    (0, index_1.saveDatabase)();
}
function deleteSessionKey(peerId) {
    (0, index_1.run)('DELETE FROM crypto_keys WHERE key_type = ? AND peer_id = ?', ['session', peerId]);
    (0, index_1.saveDatabase)();
}
function saveVerifiedPeer(peerId, fingerprint, verifiedBy, displayName) {
    (0, index_1.run)(`INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`, [peerId, fingerprint, Date.now(), verifiedBy, displayName ?? null]);
    (0, index_1.saveDatabase)();
}
function getVerifiedPeer(peerId) {
    return (0, index_1.queryOne)(`SELECT * FROM verified_peers WHERE peer_id = ?`, [peerId]);
}
function isPeerVerified(peerId, fingerprint) {
    const result = (0, index_1.queryOne)(`SELECT fingerprint FROM verified_peers WHERE peer_id = ?`, [peerId]);
    return result?.fingerprint === fingerprint;
}
function getAllVerifiedPeers() {
    return (0, index_1.query)(`SELECT * FROM verified_peers ORDER BY verified_at DESC`);
}
function deleteVerifiedPeer(peerId) {
    (0, index_1.run)('DELETE FROM verified_peers WHERE peer_id = ?', [peerId]);
    (0, index_1.saveDatabase)();
}

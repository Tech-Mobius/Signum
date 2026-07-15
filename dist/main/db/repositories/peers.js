"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertPeer = upsertPeer;
exports.getPeer = getPeer;
exports.getAllPeers = getAllPeers;
exports.getConnectedPeers = getConnectedPeers;
exports.updatePeerStatus = updatePeerStatus;
exports.updatePeerLastSeen = updatePeerLastSeen;
exports.deletePeer = deletePeer;
exports.cleanupOldPeers = cleanupOldPeers;
const index_1 = require("../index");
function upsertPeer(peer) {
    (0, index_1.run)(`INSERT OR REPLACE INTO peers (id, display_name, address, port, last_seen, status)
     VALUES (?, ?, ?, ?, ?, ?)`, [peer.id, peer.display_name, peer.address, peer.port, peer.last_seen, peer.status]);
    (0, index_1.saveDatabase)();
}
function getPeer(id) {
    return (0, index_1.queryOne)('SELECT * FROM peers WHERE id = ?', [id]);
}
function getAllPeers() {
    return (0, index_1.query)('SELECT * FROM peers ORDER BY last_seen DESC');
}
function getConnectedPeers() {
    return (0, index_1.query)(`SELECT * FROM peers WHERE status = 'connected' ORDER BY last_seen DESC`);
}
function updatePeerStatus(id, status) {
    (0, index_1.run)('UPDATE peers SET status = ?, last_seen = ? WHERE id = ?', [status, Date.now(), id]);
    (0, index_1.saveDatabase)();
}
function updatePeerLastSeen(id) {
    (0, index_1.run)('UPDATE peers SET last_seen = ? WHERE id = ?', [Date.now(), id]);
    (0, index_1.saveDatabase)();
}
function deletePeer(id) {
    (0, index_1.run)('DELETE FROM peers WHERE id = ?', [id]);
    (0, index_1.saveDatabase)();
}
function cleanupOldPeers(olderThan) {
    (0, index_1.run)('DELETE FROM peers WHERE last_seen < ?', [olderThan]);
    (0, index_1.saveDatabase)();
}

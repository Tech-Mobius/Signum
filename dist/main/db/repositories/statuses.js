"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePeerStatus = savePeerStatus;
exports.getAllPeerStatuses = getAllPeerStatuses;
exports.getPeerStatus = getPeerStatus;
exports.getLatestStatusesForPeers = getLatestStatusesForPeers;
exports.deleteOldStatuses = deleteOldStatuses;
const index_1 = require("../index");
function savePeerStatus(status) {
    (0, index_1.run)(`INSERT OR REPLACE INTO peer_statuses (peer_id, display_name, status, location, timestamp)
     VALUES (?, ?, ?, ?, ?)`, [status.peer_id, status.display_name, status.status, status.location ?? null, status.timestamp]);
    (0, index_1.saveDatabase)();
}
function getAllPeerStatuses() {
    return (0, index_1.query)('SELECT * FROM peer_statuses ORDER BY timestamp DESC');
}
function getPeerStatus(peerId) {
    return (0, index_1.queryOne)('SELECT * FROM peer_statuses WHERE peer_id = ?', [peerId]);
}
function getLatestStatusesForPeers(peerIds) {
    if (peerIds.length === 0)
        return [];
    const placeholders = peerIds.map(() => '?').join(',');
    return (0, index_1.query)(`SELECT * FROM peer_statuses WHERE peer_id IN (${placeholders}) ORDER BY timestamp DESC`, peerIds);
}
function deleteOldStatuses(olderThan) {
    (0, index_1.run)('DELETE FROM peer_statuses WHERE timestamp < ?', [olderThan]);
    (0, index_1.saveDatabase)();
}

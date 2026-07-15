"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.getAllConfig = getAllConfig;
exports.deleteConfig = deleteConfig;
const index_1 = require("../index");
function setConfig(key, value) {
    (0, index_1.run)(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`, [key, value, Date.now()]);
    (0, index_1.saveDatabase)();
}
function getConfig(key) {
    const result = (0, index_1.queryOne)('SELECT value FROM settings WHERE key = ?', [key]);
    return result?.value ?? null;
}
function getAllConfig() {
    const results = (0, index_1.query)('SELECT key, value FROM settings');
    return Object.fromEntries(results.map(r => [r.key, r.value]));
}
function deleteConfig(key) {
    (0, index_1.run)('DELETE FROM settings WHERE key = ?', [key]);
    (0, index_1.saveDatabase)();
}

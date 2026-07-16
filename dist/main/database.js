"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
exports.setConfig = setConfig;
exports.getConfig = getConfig;
exports.saveMessage = saveMessage;
exports.messageExists = messageExists;
exports.markMessageDelivered = markMessageDelivered;
exports.getUndeliveredMessages = getUndeliveredMessages;
exports.getAllMessages = getAllMessages;
exports.savePeerStatus = savePeerStatus;
exports.getAllPeerStatuses = getAllPeerStatuses;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let dbPath = '';
let storeData = {
    config: {},
    messages: {},
    peer_statuses: {}
};
function saveStore() {
    try {
        fs_1.default.writeFileSync(dbPath, JSON.stringify(storeData, null, 2), 'utf-8');
    }
    catch (err) {
        console.error('Failed to write JSON store to disk:', err);
    }
}
function initDatabase(userDataPath) {
    dbPath = path_1.default.join(userDataPath, 'signal-store.json');
    if (!fs_1.default.existsSync(userDataPath)) {
        fs_1.default.mkdirSync(userDataPath, { recursive: true });
    }
    if (fs_1.default.existsSync(dbPath)) {
        try {
            const content = fs_1.default.readFileSync(dbPath, 'utf-8');
            storeData = JSON.parse(content);
            if (!storeData.config)
                storeData.config = {};
            if (!storeData.messages)
                storeData.messages = {};
            if (!storeData.peer_statuses)
                storeData.peer_statuses = {};
        }
        catch (err) {
            console.error('Failed to parse JSON store, resetting...', err);
            saveStore();
        }
    }
    else {
        saveStore();
    }
    console.log(`JSON File Database initialized at: ${dbPath}`);
}
function setConfig(key, value) {
    storeData.config[key] = value;
    saveStore();
}
function getConfig(key) {
    return storeData.config[key] || null;
}
function saveMessage(msg) {
    storeData.messages[msg.id] = msg;
    saveStore();
}
function messageExists(id) {
    return storeData.messages[id] !== undefined;
}
function markMessageDelivered(id) {
    if (storeData.messages[id]) {
        storeData.messages[id].delivered = 1;
        saveStore();
    }
}
function getUndeliveredMessages() {
    return Object.values(storeData.messages)
        .filter(m => m.delivered === 0)
        .sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
    });
}
function getAllMessages() {
    return Object.values(storeData.messages).sort((a, b) => a.timestamp - b.timestamp);
}
function savePeerStatus(status) {
    storeData.peer_statuses[status.peer_id] = status;
    saveStore();
}
function getAllPeerStatuses() {
    return Object.values(storeData.peer_statuses).sort((a, b) => b.timestamp - a.timestamp);
}

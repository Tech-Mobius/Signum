"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabase = getDatabase;
exports.saveDatabase = saveDatabase;
exports.startAutoSave = startAutoSave;
exports.stopAutoSave = stopAutoSave;
exports.query = query;
exports.queryOne = queryOne;
exports.run = run;
exports.exec = exec;
exports.transaction = transaction;
exports.closeDatabase = closeDatabase;
const sql_js_1 = __importDefault(require("sql.js"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const migrations = __importStar(require("./migrations"));
let db = null;
let dbPath = '';
let isInitialized = false;
async function initializeSqlJs() {
    const SQL = await (0, sql_js_1.default)({
        locateFile: (file) => {
            try {
                const distDir = path_1.default.dirname(require.resolve('sql.js'));
                const wasmPath = path_1.default.join(distDir, file);
                return wasmPath;
            }
            catch (err) {
                console.error('Failed to locate sql.js WASM file dynamically, using fallback relative path:', err);
                return `node_modules/sql.js/dist/${file}`;
            }
        },
    });
    return SQL;
}
async function getDatabase(userDataPath) {
    if (db && isInitialized) {
        return db;
    }
    dbPath = path_1.default.join(userDataPath, 'signal.db');
    const SQL = await initializeSqlJs();
    let fileBuffer = null;
    if (fs_1.default.existsSync(dbPath)) {
        fileBuffer = new Uint8Array(fs_1.default.readFileSync(dbPath));
    }
    db = new SQL.Database(fileBuffer ?? undefined);
    isInitialized = true;
    await migrations.runMigrations(db);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    console.log(`SQLite database initialized at: ${dbPath}`);
    return db;
}
function saveDatabase() {
    if (!db || !isInitialized)
        return;
    try {
        const data = db.export();
        fs_1.default.writeFileSync(dbPath, Buffer.from(data));
    }
    catch (err) {
        console.error('Failed to save database:', err);
    }
}
let saveInterval = null;
function startAutoSave(intervalMs = 5000) {
    if (saveInterval)
        return;
    saveInterval = setInterval(saveDatabase, intervalMs);
}
function stopAutoSave() {
    if (saveInterval) {
        clearInterval(saveInterval);
        saveInterval = null;
    }
    saveDatabase();
}
function query(sql, params = []) {
    if (!db)
        throw new Error('Database not initialized');
    const stmt = db.prepare(sql);
    const results = [];
    stmt.bind(params);
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}
function queryOne(sql, params = []) {
    if (!db)
        throw new Error('Database not initialized');
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result;
}
function run(sql, params = []) {
    if (!db)
        throw new Error('Database not initialized');
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    const changes = db.getRowsModified();
    const lastInsertRowid = db.exec('SELECT last_insert_rowid() as id;')[0]?.values?.[0]?.[0] ?? 0;
    stmt.free();
    return { changes, lastInsertRowid };
}
function exec(sql) {
    if (!db)
        throw new Error('Database not initialized');
    db.exec(sql);
}
function transaction(fn) {
    if (!db)
        throw new Error('Database not initialized');
    db.exec('BEGIN TRANSACTION;');
    try {
        const result = fn();
        db.exec('COMMIT;');
        return result;
    }
    catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }
}
function closeDatabase() {
    stopAutoSave();
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        isInitialized = false;
    }
}

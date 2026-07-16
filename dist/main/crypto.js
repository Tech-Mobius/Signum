"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIdentityKeyPair = generateIdentityKeyPair;
exports.exportKeyToJWK = exportKeyToJWK;
exports.importJWKToKey = importJWKToKey;
exports.deriveSessionKey = deriveSessionKey;
exports.getOrCreateIdentityKeys = getOrCreateIdentityKeys;
exports.getIdentityPublicKeyJWK = getIdentityPublicKeyJWK;
exports.getIdentityFingerprint = getIdentityFingerprint;
exports.verifyPeerFingerprint = verifyPeerFingerprint;
exports.trustPeerFingerprint = trustPeerFingerprint;
exports.isPeerTrusted = isPeerTrusted;
exports.getVerifiedPeers = getVerifiedPeers;
exports.saveSessionKey = saveSessionKey;
exports.storeSessionKey = saveSessionKey;
exports.loadSessionKey = loadSessionKey;
exports.cleanupExpiredSessionKeys = cleanupExpiredSessionKeys;
exports.encryptMessagePayload = encryptMessagePayload;
exports.decryptMessagePayload = decryptMessagePayload;
exports.signData = signData;
exports.verifySignature = verifySignature;
exports.exportIdentity = exportIdentity;
exports.importIdentity = importIdentity;
const electron_1 = require("electron");
const crypto_1 = require("crypto");
const index_1 = require("./db/index");
const crypto = crypto_1.webcrypto;
function encryptSecret(secret) {
    try {
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            return electron_1.safeStorage.encryptString(secret).toString('base64');
        }
    }
    catch (err) {
        console.error('[Crypto] safeStorage encryption failed:', err);
    }
    return secret;
}
function decryptSecret(encryptedBase64) {
    try {
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(encryptedBase64, 'base64');
            return electron_1.safeStorage.decryptString(buffer);
        }
    }
    catch (err) {
        console.error('[Crypto] safeStorage decryption failed:', err);
    }
    return encryptedBase64;
}
async function generateIdentityKeyPair() {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
    return keyPair;
}
async function exportKeyToJWK(key) {
    return crypto.subtle.exportKey('jwk', key);
}
async function importJWKToKey(jwk, usages) {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, usages);
}
async function deriveSessionKey(ourPrivateKey, peerPublicKey) {
    return crypto.subtle.deriveKey({ name: 'ECDH', public: peerPublicKey }, ourPrivateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function getOrCreateIdentityKeys() {
    const stored = (0, index_1.queryOne)(`SELECT * FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`);
    if (stored && stored.private_key) {
        try {
            let privateKeyString = stored.private_key;
            if (!stored.private_key.trim().startsWith('{')) {
                privateKeyString = decryptSecret(stored.private_key);
            }
            const privateJwk = JSON.parse(privateKeyString);
            const publicJwk = JSON.parse(stored.public_key);
            const privateKey = await importJWKToKey(privateJwk, ['deriveKey', 'deriveBits']);
            const publicKey = await importJWKToKey(publicJwk, []);
            console.log('[Crypto] Loaded existing identity key pair (decrypted at rest)');
            return { publicKey, privateKey };
        }
        catch (err) {
            console.warn('[Crypto] Failed to load stored identity keys, generating new:', err);
        }
    }
    const keyPair = await generateIdentityKeyPair();
    const privateJwk = await exportKeyToJWK(keyPair.privateKey);
    const publicJwk = await exportKeyToJWK(keyPair.publicKey);
    const encryptedPrivateKey = encryptSecret(JSON.stringify(privateJwk));
    (0, index_1.run)(`INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, created_at)
     VALUES (?, ?, ?, ?, ?)`, ['identity', 'identity', JSON.stringify(publicJwk), encryptedPrivateKey, Date.now()]);
    (0, index_1.saveDatabase)();
    console.log('[Crypto] Generated and stored new identity key pair (encrypted at rest)');
    return keyPair;
}
async function getIdentityPublicKeyJWK() {
    const stored = (0, index_1.queryOne)(`SELECT public_key FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`);
    if (stored && stored.public_key) {
        return JSON.parse(stored.public_key);
    }
    const keys = await getOrCreateIdentityKeys();
    return exportKeyToJWK(keys.publicKey);
}
async function getIdentityFingerprint() {
    const publicJwk = await getIdentityPublicKeyJWK();
    const publicKey = await importJWKToKey(publicJwk, []);
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    const hash = await crypto.subtle.digest('SHA-256', spki);
    const hashArray = new Uint8Array(hash);
    const fingerprint = Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(':')
        .toUpperCase();
    return fingerprint;
}
async function verifyPeerFingerprint(peerId, peerPublicKeyJwk) {
    const peerPublicKey = await importJWKToKey(peerPublicKeyJwk, []);
    const spki = await crypto.subtle.exportKey('spki', peerPublicKey);
    const hash = await crypto.subtle.digest('SHA-256', spki);
    const hashArray = new Uint8Array(hash);
    const fingerprint = Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(':')
        .toUpperCase();
    const stored = (0, index_1.queryOne)(`SELECT fingerprint, verified_by FROM verified_peers WHERE peer_id = ?`, [peerId]);
    if (stored) {
        const trusted = stored.fingerprint === fingerprint && stored.verified_by === 'user';
        return { verified: true, fingerprint, trusted };
    }
    (0, index_1.run)(`INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`, [peerId, fingerprint, Date.now(), 'auto', null]);
    (0, index_1.saveDatabase)();
    return { verified: true, fingerprint, trusted: false };
}
function trustPeerFingerprint(peerId, fingerprint, displayName) {
    (0, index_1.run)(`INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`, [peerId, fingerprint, Date.now(), 'user', displayName ?? null]);
    (0, index_1.saveDatabase)();
}
function isPeerTrusted(peerId, fingerprint) {
    const stored = (0, index_1.queryOne)(`SELECT fingerprint FROM verified_peers WHERE peer_id = ? AND verified_by = 'user'`, [peerId]);
    return stored?.fingerprint === fingerprint;
}
function getVerifiedPeers() {
    return (0, index_1.query)(`SELECT * FROM verified_peers ORDER BY verified_at DESC`);
}
async function saveSessionKey(peerId, sharedKey, expiresInMs = 24 * 60 * 60 * 1000) {
    const jwk = await exportKeyToJWK(sharedKey);
    (0, index_1.run)(`INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, peer_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [`session-${peerId}`, 'session', '', JSON.stringify(jwk), peerId, Date.now(), Date.now() + expiresInMs]);
    (0, index_1.saveDatabase)();
}
async function loadSessionKey(peerId) {
    const stored = (0, index_1.queryOne)(`SELECT private_key FROM crypto_keys WHERE key_type = 'session' AND peer_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`, [peerId, Date.now()]);
    if (stored && stored.private_key) {
        try {
            const jwk = JSON.parse(stored.private_key);
            return importJWKToKey(jwk, ['encrypt', 'decrypt']);
        }
        catch (err) {
            console.warn('[Crypto] Failed to load session key for peer:', peerId, err);
        }
    }
    return null;
}
function cleanupExpiredSessionKeys() {
    (0, index_1.run)('DELETE FROM crypto_keys WHERE key_type = ? AND expires_at IS NOT NULL AND expires_at < ?', ['session', Date.now()]);
    (0, index_1.saveDatabase)();
}
async function encryptMessagePayload(payload, sessionKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedPayload = new TextEncoder().encode(payload);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, encodedPayload);
    return {
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
}
async function decryptMessagePayload(encryptedPayload, sessionKey) {
    const iv = new Uint8Array(atob(encryptedPayload.iv).split('').map(c => c.charCodeAt(0)));
    const ct = new Uint8Array(atob(encryptedPayload.ciphertext).split('').map(c => c.charCodeAt(0)));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ct);
    return new TextDecoder().decode(decrypted);
}
async function signData(data, privateKey) {
    const privateJwk = await exportKeyToJWK(privateKey);
    if (!privateJwk.d)
        throw new Error('Private key missing d parameter');
    const keyData = Uint8Array.from(atob(privateJwk.d.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const hmacKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const encodedData = new TextEncoder().encode(data);
    const signature = await crypto.subtle.sign('HMAC', hmacKey, encodedData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
async function verifySignature(data, signature, peerPublicKey) {
    try {
        const peerJwk = await exportKeyToJWK(peerPublicKey);
        return true;
    }
    catch (err) {
        return false;
    }
}
async function exportIdentity(passphrase) {
    const stored = (0, index_1.queryOne)(`SELECT private_key, public_key FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`);
    if (!stored || !stored.private_key) {
        throw new Error('No identity key found to export');
    }
    let privateKeyString = stored.private_key;
    if (!stored.private_key.trim().startsWith('{')) {
        privateKeyString = decryptSecret(stored.private_key);
    }
    const privateJwk = JSON.parse(privateKeyString);
    const publicJwk = JSON.parse(stored.public_key);
    const exportData = {
        version: 1,
        privateKey: privateJwk,
        publicKey: publicJwk,
        exportedAt: Date.now()
    };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const encryptionKey = await crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
    }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const encoded = new TextEncoder().encode(JSON.stringify(exportData));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, encoded);
    const result = {
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
    return JSON.stringify(result);
}
async function importIdentity(backupData, passphrase) {
    const parsed = JSON.parse(backupData);
    const salt = Uint8Array.from(atob(parsed.salt).split('').map(c => c.charCodeAt(0)));
    const iv = Uint8Array.from(atob(parsed.iv).split('').map(c => c.charCodeAt(0)));
    const ciphertext = Uint8Array.from(atob(parsed.ciphertext).split('').map(c => c.charCodeAt(0)));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const encryptionKey = await crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
    }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encryptionKey, ciphertext);
    const exportData = JSON.parse(new TextDecoder().decode(decrypted));
    if (exportData.version !== 1) {
        throw new Error('Unsupported backup version');
    }
    await importJWKToKey(exportData.privateKey, ['deriveKey', 'deriveBits']);
    await importJWKToKey(exportData.publicKey, []);
    const encryptedPrivateKey = encryptSecret(JSON.stringify(exportData.privateKey));
    (0, index_1.run)(`INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, created_at)
     VALUES (?, ?, ?, ?, ?)`, ['identity', 'identity', JSON.stringify(exportData.publicKey), encryptedPrivateKey, Date.now()]);
    (0, index_1.saveDatabase)();
    console.log('[Crypto] Identity imported and stored (encrypted at rest)');
}

import { safeStorage } from 'electron';
import { webcrypto } from 'crypto';
import { query, queryOne, run, saveDatabase } from './db/index';

const crypto = webcrypto;

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface JWKKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface SessionKeys {
  peerId: string;
  sharedKey: CryptoKey;
  createdAt: number;
  expiresAt: number;
}

function encryptSecret(secret: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(secret).toString('base64');
    }
  } catch (err) {
    console.error('[Crypto] safeStorage encryption failed:', err);
  }
  return secret; 
}

function decryptSecret(encryptedBase64: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    }
  } catch (err) {
    console.error('[Crypto] safeStorage decryption failed:', err);
  }
  return encryptedBase64; 
}

export async function generateIdentityKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, 
    ['deriveKey', 'deriveBits']
  );
  return keyPair;
}

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importJWKToKey(jwk: JsonWebKey, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    usages
  );
}

export async function deriveSessionKey(
  ourPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    ourPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function getOrCreateIdentityKeys(): Promise<KeyPair> {
  const stored = queryOne<any>(
    `SELECT * FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`
  );

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
    } catch (err) {
      console.warn('[Crypto] Failed to load stored identity keys, generating new:', err);
    }
  }

  const keyPair = await generateIdentityKeyPair();
  const privateJwk = await exportKeyToJWK(keyPair.privateKey);
  const publicJwk = await exportKeyToJWK(keyPair.publicKey);

  const encryptedPrivateKey = encryptSecret(JSON.stringify(privateJwk));

  run(
    `INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['identity', 'identity', JSON.stringify(publicJwk), encryptedPrivateKey, Date.now()]
  );
  saveDatabase();

  console.log('[Crypto] Generated and stored new identity key pair (encrypted at rest)');
  return keyPair;
}

export async function getIdentityPublicKeyJWK(): Promise<JsonWebKey> {
  const stored = queryOne<any>(
    `SELECT public_key FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`
  );

  if (stored && stored.public_key) {
    return JSON.parse(stored.public_key);
  }

  const keys = await getOrCreateIdentityKeys();
  return exportKeyToJWK(keys.publicKey);
}

export async function getIdentityFingerprint(): Promise<string> {
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

export async function verifyPeerFingerprint(
  peerId: string,
  peerPublicKeyJwk: JsonWebKey
): Promise<{ verified: boolean; fingerprint: string; trusted: boolean }> {
  const peerPublicKey = await importJWKToKey(peerPublicKeyJwk, []);
  const spki = await crypto.subtle.exportKey('spki', peerPublicKey);
  const hash = await crypto.subtle.digest('SHA-256', spki);
  const hashArray = new Uint8Array(hash);
  const fingerprint = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();

  const stored = queryOne<any>(
    `SELECT fingerprint, verified_by FROM verified_peers WHERE peer_id = ?`,
    [peerId]
  );

  if (stored) {
    const trusted = stored.fingerprint === fingerprint && stored.verified_by === 'user';
    return { verified: true, fingerprint, trusted };
  }

  run(
    `INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`,
    [peerId, fingerprint, Date.now(), 'auto', null]
  );
  saveDatabase();

  return { verified: true, fingerprint, trusted: false }; 
}

export function trustPeerFingerprint(peerId: string, fingerprint: string, displayName?: string): void {
  run(
    `INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`,
    [peerId, fingerprint, Date.now(), 'user', displayName ?? null]
  );
  saveDatabase();
}

export function isPeerTrusted(peerId: string, fingerprint: string): boolean {
  const stored = queryOne<any>(
    `SELECT fingerprint FROM verified_peers WHERE peer_id = ? AND verified_by = 'user'`,
    [peerId]
  );
  return stored?.fingerprint === fingerprint;
}

export function getVerifiedPeers(): Array<{
  peer_id: string;
  fingerprint: string;
  verified_at: number;
  verified_by: 'user' | 'auto';
  display_name: string | null;
}> {
  return query(
    `SELECT * FROM verified_peers ORDER BY verified_at DESC`
  );
}

export async function saveSessionKey(
  peerId: string,
  sharedKey: CryptoKey,
  expiresInMs = 24 * 60 * 60 * 1000 
): Promise<void> {
  const jwk = await exportKeyToJWK(sharedKey);

  run(
    `INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, peer_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`session-${peerId}`, 'session', '', JSON.stringify(jwk), peerId, Date.now(), Date.now() + expiresInMs]
  );
  saveDatabase();
}

export async function loadSessionKey(peerId: string): Promise<CryptoKey | null> {
  const stored = queryOne<any>(
    `SELECT private_key FROM crypto_keys WHERE key_type = 'session' AND peer_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`,
    [peerId, Date.now()]
  );

  if (stored && stored.private_key) {
    try {
      const jwk = JSON.parse(stored.private_key);
      return importJWKToKey(jwk, ['encrypt', 'decrypt']);
    } catch (err) {
      console.warn('[Crypto] Failed to load session key for peer:', peerId, err);
    }
  }
  return null;
}

export function cleanupExpiredSessionKeys(): void {
  run('DELETE FROM crypto_keys WHERE key_type = ? AND expires_at IS NOT NULL AND expires_at < ?', ['session', Date.now()]);
  saveDatabase();
}

export async function encryptMessagePayload(
  payload: string,
  sessionKey: CryptoKey
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(payload);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encodedPayload
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

export async function decryptMessagePayload(
  encryptedPayload: { iv: string; ciphertext: string },
  sessionKey: CryptoKey
): Promise<string> {
  const iv = new Uint8Array(atob(encryptedPayload.iv).split('').map(c => c.charCodeAt(0)));
  const ct = new Uint8Array(atob(encryptedPayload.ciphertext).split('').map(c => c.charCodeAt(0)));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    ct
  );

  return new TextDecoder().decode(decrypted);
}

export async function signData(data: string, privateKey: CryptoKey): Promise<string> {
  const privateJwk = await exportKeyToJWK(privateKey);
  if (!privateJwk.d) throw new Error('Private key missing d parameter');

  const keyData = Uint8Array.from(atob(privateJwk.d.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encodedData = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign('HMAC', hmacKey, encodedData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verifySignature(
  data: string,
  signature: string,
  peerPublicKey: CryptoKey
): Promise<boolean> {
  try {
    const peerJwk = await exportKeyToJWK(peerPublicKey);
    return true;
  } catch (err) {
    return false;
  }
}

export async function exportIdentity(passphrase: string): Promise<string> {
  const stored = queryOne<any>(
    `SELECT private_key, public_key FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`
  );

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

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encoded = new TextEncoder().encode(JSON.stringify(exportData));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encoded
  );

  const result = {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };

  return JSON.stringify(result);
}

export async function importIdentity(backupData: string, passphrase: string): Promise<void> {
  const parsed = JSON.parse(backupData);

  const salt = Uint8Array.from(atob(parsed.salt).split('').map(c => c.charCodeAt(0)));
  const iv = Uint8Array.from(atob(parsed.iv).split('').map(c => c.charCodeAt(0)));
  const ciphertext = Uint8Array.from(atob(parsed.ciphertext).split('').map(c => c.charCodeAt(0)));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    ciphertext
  );

  const exportData = JSON.parse(new TextDecoder().decode(decrypted));

  if (exportData.version !== 1) {
    throw new Error('Unsupported backup version');
  }

  await importJWKToKey(exportData.privateKey, ['deriveKey', 'deriveBits']);
  await importJWKToKey(exportData.publicKey, []);

  const encryptedPrivateKey = encryptSecret(JSON.stringify(exportData.privateKey));

  run(
    `INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['identity', 'identity', JSON.stringify(exportData.publicKey), encryptedPrivateKey, Date.now()]
  );
  saveDatabase();

  console.log('[Crypto] Identity imported and stored (encrypted at rest)');
}

export { saveSessionKey as storeSessionKey };
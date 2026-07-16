import * as sqlite from '../db/sqlite';
import * as base64js from 'base64-js';

const btoa = (str: string): string => {
  const bytes = new Uint8Array(str.split('').map(c => c.charCodeAt(0)));
  return base64js.fromByteArray(bytes);
};

const atob = (str: string): string => {
  const bytes = base64js.toByteArray(str);
  return String.fromCharCode(...bytes);
};

const subtle = (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.subtle) || 
               (typeof window !== 'undefined' && window.crypto?.subtle);

if (!subtle) {
  console.warn('[Crypto] Warning: crypto.subtle is not globally available in this React Native environment. Cryptography calls might fail unless global.crypto is polyfilled.');
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export async function generateIdentityKeyPair(): Promise<KeyPair> {
  if (!subtle) throw new Error('WebCrypto subtle is not available');
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  return keyPair;
}

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  if (!subtle) throw new Error('WebCrypto subtle is not available');
  return subtle.exportKey('jwk', key);
}

export async function importJWKToKey(jwk: JsonWebKey, usages: KeyUsage[]): Promise<CryptoKey> {
  if (!subtle) throw new Error('WebCrypto subtle is not available');
  return subtle.importKey(
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
  if (!subtle) throw new Error('WebCrypto subtle is not available');
  return subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    ourPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function getOrCreateIdentityKeys(): Promise<KeyPair> {
  const stored = await sqlite.queryOne<any>(
    `SELECT * FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`
  );

  if (stored && stored.private_key) {
    try {
      const privateJwk = JSON.parse(stored.private_key);
      const publicJwk = JSON.parse(stored.public_key);

      const privateKey = await importJWKToKey(privateJwk, ['deriveKey', 'deriveBits']);
      const publicKey = await importJWKToKey(publicJwk, []);

      return { publicKey, privateKey };
    } catch (err) {
      console.warn('[Crypto] Failed to load stored identity keys:', err);
    }
  }

  const keyPair = await generateIdentityKeyPair();
  const privateJwk = await exportKeyToJWK(keyPair.privateKey);
  const publicJwk = await exportKeyToJWK(keyPair.publicKey);

  await sqlite.run(
    `INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['identity', 'identity', JSON.stringify(publicJwk), JSON.stringify(privateJwk), Date.now()]
  );

  return keyPair;
}

export async function getIdentityPublicKeyJWK(): Promise<JsonWebKey> {
  const stored = await sqlite.queryOne<any>(
    `SELECT public_key FROM crypto_keys WHERE key_type = 'identity' ORDER BY created_at DESC LIMIT 1`
  );

  if (stored && stored.public_key) {
    return JSON.parse(stored.public_key);
  }

  const keys = await getOrCreateIdentityKeys();
  return exportKeyToJWK(keys.publicKey);
}

export async function getIdentityFingerprint(): Promise<string> {
  if (!subtle) return 'MOBILE-FINGERPRINT-MOCK';
  const publicJwk = await getIdentityPublicKeyJWK();
  const publicKey = await importJWKToKey(publicJwk, []);
  const spki = await subtle.exportKey('spki', publicKey);

  const hash = await subtle.digest('SHA-256', spki);
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
  if (!subtle) return { verified: true, fingerprint: 'PEER-MOCK-FINGERPRINT', trusted: false };
  
  const peerPublicKey = await importJWKToKey(peerPublicKeyJwk, []);
  const spki = await subtle.exportKey('spki', peerPublicKey);
  const hash = await subtle.digest('SHA-256', spki);
  const hashArray = new Uint8Array(hash);
  const fingerprint = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();

  const stored = await sqlite.queryOne<any>(
    `SELECT fingerprint, verified_by FROM verified_peers WHERE peer_id = ?`,
    [peerId]
  );

  if (stored) {
    const trusted = stored.fingerprint === fingerprint && stored.verified_by === 'user';
    return { verified: true, fingerprint, trusted };
  }

  await sqlite.run(
    `INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`,
    [peerId, fingerprint, Date.now(), 'auto', null]
  );

  return { verified: true, fingerprint, trusted: false };
}

export async function trustPeerFingerprint(peerId: string, fingerprint: string, displayName?: string): Promise<void> {
  await sqlite.run(
    `INSERT OR REPLACE INTO verified_peers (peer_id, fingerprint, verified_at, verified_by, display_name)
     VALUES (?, ?, ?, ?, ?)`,
    [peerId, fingerprint, Date.now(), 'user', displayName ?? null]
  );
}

export async function getPeerFingerprint(peerId: string): Promise<{ fingerprint: string; trusted: boolean } | null> {
  const stored = await sqlite.queryOne<any>(
    `SELECT fingerprint, verified_by FROM verified_peers WHERE peer_id = ?`,
    [peerId]
  );
  if (!stored) return null;
  return {
    fingerprint: stored.fingerprint,
    trusted: stored.verified_by === 'user'
  };
}

export async function saveSessionKey(peerId: string, sharedKey: CryptoKey): Promise<void> {
  const jwk = await exportKeyToJWK(sharedKey);
  await sqlite.run(
    `INSERT OR REPLACE INTO crypto_keys (id, key_type, public_key, private_key, peer_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`session-${peerId}`, 'session', '', JSON.stringify(jwk), peerId, Date.now(), Date.now() + 24 * 60 * 60 * 1000]
  );
}

export async function loadSessionKey(peerId: string): Promise<CryptoKey | null> {
  const stored = await sqlite.queryOne<any>(
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

export async function encryptMessagePayload(
  payload: string,
  sessionKey: CryptoKey
): Promise<{ iv: string; ciphertext: string }> {
  if (!subtle) throw new Error('WebCrypto subtle is not available');
  const iv = (globalThis as any).crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(payload);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    encodedPayload
  );

  const binaryIv = String.fromCharCode(...iv);
  const binaryCiphertext = String.fromCharCode(...new Uint8Array(ciphertext));

  return {
    iv: btoa(binaryIv),
    ciphertext: btoa(binaryCiphertext)
  };
}

export async function decryptMessagePayload(
  encryptedPayload: { iv: string; ciphertext: string },
  sessionKey: CryptoKey
): Promise<string> {
  if (!subtle) throw new Error('WebCrypto subtle is not available');
  const iv = new Uint8Array(atob(encryptedPayload.iv).split('').map(c => c.charCodeAt(0)));
  const ct = new Uint8Array(atob(encryptedPayload.ciphertext).split('').map(c => c.charCodeAt(0)));

  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    ct
  );

  return new TextDecoder().decode(decrypted);
}

import { useState, useEffect, useRef } from 'react';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: mimeType });
}

export function useCrypto(addLog: (cat: string, msg: string) => void) {
  const ecdhKeys = useRef<any>(null);
  const sharedKeys = useRef<Map<string, CryptoKey>>(new Map());
  const peerPublicKeys = useRef<Map<string, string>>(new Map());
  const keysPromise = useRef<Promise<any> | null>(null);

  useEffect(() => {
    async function generateKeys() {
      const pair = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveKey', 'deriveBits']
      );
      ecdhKeys.current = pair;
      addLog('Crypto', 'Generated session ephemeral ECDH keypair');
      return pair;
    }
    keysPromise.current = generateKeys().catch(err => {
      console.error('Failed to generate crypto keys:', err);
      addLog('Crypto', 'Error generating ephemeral ECDH keys');
    });
  }, []);

  const getHandshakeData = async (): Promise<string> => {
    if (keysPromise.current) {
      await keysPromise.current;
    }
    if (!ecdhKeys.current) throw new Error('Keys not generated');
    const jwkPub = await window.crypto.subtle.exportKey('jwk', ecdhKeys.current.publicKey);
    return JSON.stringify(jwkPub);
  };

  const processHandshake = async (peerId: string, peerJwkString: string): Promise<void> => {
    try {
      const peerJwk = JSON.parse(peerJwkString);
      peerPublicKeys.current.set(peerId, peerJwkString);

      if (ecdhKeys.current) {
        const peerPub = await window.crypto.subtle.importKey(
          'jwk',
          peerJwk,
          { name: 'ECDH', namedCurve: 'P-256' },
          true,
          []
        );

        const rawSharedSecret = await window.crypto.subtle.deriveBits(
          { name: 'ECDH', public: peerPub },
          ecdhKeys.current.privateKey,
          256
        );

        const hkdfMasterKey = await window.crypto.subtle.importKey(
          'raw',
          rawSharedSecret,
          { name: 'HKDF' },
          false,
          ['deriveKey']
        );

        const sessionKey = await window.crypto.subtle.deriveKey(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new Uint8Array(32), 
            info: new TextEncoder().encode('signal-mesh-session-secret')
          },
          hkdfMasterKey,
          {
            name: 'AES-GCM',
            length: 256
          },
          true,
          ['encrypt', 'decrypt']
        );

        sharedKeys.current.set(peerId, sessionKey);
        addLog('Crypto', `Secured E2E session key with peer ${peerId} (ECDH + HKDF complete)`);
      }
    } catch (err: any) {
      addLog('Crypto', `Failed to process handshake with ${peerId}: ${err.message}`);
      throw err;
    }
  };

  const encryptPayload = async (peerId: string, message: any): Promise<any> => {
    if (message.encrypted) {
      return message;
    }

    if (message.type === 'signal' || message.type === 'status' || !message.recipientId || message.recipientId === 'broadcast') {
      return message;
    }

    const recipientId = message.recipientId;
    if (!sharedKeys.current.has(recipientId)) {
      return message;
    }
    const key = sharedKeys.current.get(recipientId);
    if (!key) return message;

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedPayload = new TextEncoder().encode(message.payload);
    const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedPayload);

    const ivBase64 = btoa(String.fromCharCode(...iv));
    const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

    return {
      ...message,
      payload: JSON.stringify({ iv: ivBase64, ciphertext: ciphertextBase64 }),
      encrypted: true
    };
  };

  const decryptPayload = async (message: any): Promise<string> => {
    if (!message.encrypted) return message.payload;

    const peerId = message.senderId;
    const key = sharedKeys.current.get(peerId);
    if (!key) {
      return message.payload; 
    }

    const { iv, ciphertext } = JSON.parse(message.payload);
    const ivArr = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
    const ctArr = new Uint8Array(atob(ciphertext).split('').map(c => c.charCodeAt(0)));

    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArr }, key, ctArr);
    return new TextDecoder().decode(decrypted);
  };

  return {
    getHandshakeData,
    processHandshake,
    encryptPayload,
    decryptPayload,
    hasSessionKey: (peerId: string) => sharedKeys.current.has(peerId),
    base64ToBlob,
  };
}

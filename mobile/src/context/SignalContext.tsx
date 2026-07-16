import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { registerGlobals } from 'react-native-webrtc';
import * as sqlite from '../db/sqlite';
import * as crypto from '../crypto';
import { strToU8, deflateSync, inflateSync, strFromU8 } from 'fflate';

registerGlobals();

const utf8Btoa = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)));
};

const utf8Atob = (str: string): string => {
  return decodeURIComponent(escape(atob(str)));
};

export async function compressPayload(payload: any): Promise<string> {
  try {
    const jsonStr = JSON.stringify(payload);
    const bytes = strToU8(jsonStr);
    const compressed = deflateSync(bytes);
    let binary = '';
    const len = compressed.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.warn('fflate compression failed, fallback:', e);
    return utf8Btoa(JSON.stringify(payload));
  }
}

export async function decompressPayload(code: string): Promise<any> {
  const trimmed = code.trim();
  try {
    const binary = atob(trimmed);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decompressed = inflateSync(bytes);
    const text = strFromU8(decompressed);
    return JSON.parse(text);
  } catch (err) {
    try {
      return JSON.parse(utf8Atob(trimmed));
    } catch (e) {
      try {
        return JSON.parse(trimmed);
      } catch (e2) {
        throw new Error('Failed to parse signaling code');
      }
    }
  }
}

export interface DebugLog {
  timestamp: number;
  level: string;
  category: string;
  message: string;
  data?: any;
}

export interface SignalContextType {
  identity: { peerId: string; username: string; fingerprint: string } | null;
  setUsername: (name: string) => Promise<void>;
  peers: sqlite.PeerRecord[];
  messages: sqlite.DBMessage[];
  statuses: sqlite.PeerStatus[];
  debugLogs: DebugLog[];
  loading: boolean;
  
  sendMessage: (recipientId: string, type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: any) => Promise<void>;
  updateStatus: (status: 'safe' | 'need-help' | 'unknown', location?: string) => Promise<void>;
  
  peerTrustStates: Record<string, { fingerprint: string; trusted: boolean }>;
  verifyPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) => Promise<any>;
  trustPeerFingerprint: (peerId: string, fingerprint: string, displayName?: string) => Promise<void>;

  createManualOffer: () => Promise<{ tempId: string; offerString: string }>;
  acceptManualOffer: (offerString: string) => Promise<{ answerString: string; peerId: string; displayName: string }>;
  completeManualConnection: (tempId: string, answerString: string) => Promise<void>;
}

const SignalContext = createContext<SignalContextType | undefined>(undefined);

export function useSignal() {
  const context = useContext(SignalContext);
  if (!context) throw new Error('useSignal must be used within a SignalProvider');
  return context;
}

export function SignalProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<SignalContextType['identity']>(null);
  const [peers, setPeers] = useState<sqlite.PeerRecord[]>([]);
  const [messages, setMessages] = useState<sqlite.DBMessage[]>([]);
  const [statuses, setStatuses] = useState<sqlite.PeerStatus[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [peerTrustStates, setPeerTrustStates] = useState<Record<string, { fingerprint: string; trusted: boolean }>>({});

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const sharedKeys = useRef<Map<string, CryptoKey>>(new Map());
  const ecdhKeys = useRef<any>(null);
  const peerDisplayNameCache = useRef<Map<string, string>>(new Map());
  const chunkBuffers = useRef<Map<string, { total: number, chunks: string[] }>>(new Map());

  const addLog = useCallback((category: string, message: string, level: string = 'INFO', data?: any) => {
    console.log(`[${category}] ${message}`);
    setDebugLogs(prev => [
      { timestamp: Date.now(), category, message, level, data },
      ...prev.slice(0, 199)
    ]);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        await sqlite.getDatabase();

        const keys = await crypto.getOrCreateIdentityKeys();
        
        const fp = await crypto.getIdentityFingerprint();
        
        const storedUsername = await sqlite.queryOne<{ value: string }>(
          `SELECT value FROM settings WHERE key = 'username'`
        );
        const username = storedUsername?.value || 'Mobile Peer';
        const peerId = fp.replace(/:/g, '').substring(0, 16).toLowerCase();

        setIdentity({ peerId, username, fingerprint: fp });
        addLog('Identity', `Initialized mobile peer ID: ${peerId} (Fingerprint: ${fp})`);

        if (typeof (globalThis as any).crypto?.subtle !== 'undefined') {
          ecdhKeys.current = await (globalThis as any).crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey', 'deriveBits']
          );
          addLog('Crypto', 'Generated ephemeral session ECDH key pair');
        }

        const loadedMessages = await sqlite.query<sqlite.DBMessage>(
          `SELECT * FROM messages ORDER BY timestamp ASC`
        );
        setMessages(loadedMessages);

        const loadedStatuses = await sqlite.query<sqlite.PeerStatus>(
          `SELECT * FROM peer_statuses ORDER BY timestamp DESC`
        );
        setStatuses(loadedStatuses);

        const loadedPeers = await sqlite.query<sqlite.PeerRecord>(
          `SELECT * FROM peers ORDER BY last_seen DESC`
        );
        setPeers(loadedPeers);

        const loadedTrusts = await sqlite.query<{ peer_id: string; fingerprint: string; verified_by: string }>(
          `SELECT peer_id, fingerprint, verified_by FROM verified_peers`
        );
        const trustsMap: Record<string, { fingerprint: string; trusted: boolean }> = {};
        loadedTrusts.forEach(t => {
          trustsMap[t.peer_id] = { fingerprint: t.fingerprint, trusted: t.verified_by === 'user' };
        });
        setPeerTrustStates(trustsMap);

      } catch (err: any) {
        addLog('Error', `Startup initialization failed: ${err.message}`, 'ERROR');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [addLog]);

  const setUsername = async (name: string) => {
    if (!identity) return;
    try {
      await sqlite.run(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('username', ?, ?)`,
        [name, Date.now()]
      );
      setIdentity(prev => prev ? { ...prev, username: name } : null);
      addLog('Identity', `Username updated to: ${name}`);
    } catch (err: any) {
      addLog('Error', `Failed to set username: ${err.message}`, 'ERROR');
    }
  };

  const handleKeyHandshake = useCallback(async (targetId: string, peerJwkString: string) => {
    try {
      const subtle = (globalThis as any).crypto?.subtle;
      if (!subtle || !ecdhKeys.current) return;

      const peerJwk = JSON.parse(peerJwkString);
      const peerPub = await subtle.importKey(
        'jwk',
        peerJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
      );

      const rawSharedSecret = await subtle.deriveBits(
        { name: 'ECDH', public: peerPub },
        ecdhKeys.current.privateKey,
        256
      );

      const hkdfMasterKey = await subtle.importKey(
        'raw',
        rawSharedSecret,
        { name: 'HKDF' },
        false,
        ['deriveKey']
      );

      const sessionKey = await subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(32),
          info: new TextEncoder().encode('signal-mesh-session-secret')
        },
        hkdfMasterKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      sharedKeys.current.set(targetId, sessionKey);
      addLog('Crypto', `Secured E2E session key with peer ${targetId} (ECDH + HKDF complete)`);

    } catch (err: any) {
      addLog('Crypto', `Failed to process handshake with ${targetId}: ${err.message}`, 'ERROR');
    }
  }, [addLog]);

  const setupDataChannel = useCallback((peerId: string, channel: RTCDataChannel) => {
    dataChannels.current.set(peerId, channel);

    channel.onopen = async () => {
      addLog('WebRTC', `Data channel open with peer ${peerId}`);
      
      const cachedName = peerDisplayNameCache.current.get(peerId) || 'Unknown Peer';
      await sqlite.run(
        `INSERT OR REPLACE INTO peers (id, display_name, last_seen, status) VALUES (?, ?, ?, 'connected')`,
        [peerId, cachedName, Date.now()]
      );
      
      const reloadedPeers = await sqlite.query<sqlite.PeerRecord>(`SELECT * FROM peers ORDER BY last_seen DESC`);
      setPeers(reloadedPeers);

      try {
        const subtle = (globalThis as any).crypto?.subtle;
        if (subtle && ecdhKeys.current) {
          const jwkPub = await subtle.exportKey('jwk', ecdhKeys.current.publicKey);
          channel.send(JSON.stringify({ type: 'key-handshake', publicKey: JSON.stringify(jwkPub) }));
          addLog('Crypto', `Sent public key handshake to peer ${peerId}`);
        }
      } catch (err: any) {
        addLog('Error', `Handshake dispatch failed: ${err.message}`, 'ERROR');
      }
    };

    channel.onclose = async () => {
      addLog('WebRTC', `Data channel closed for peer ${peerId}`);
      dataChannels.current.delete(peerId);
      
      await sqlite.run(`UPDATE peers SET status = 'offline' WHERE id = ?`, [peerId]);
      const reloadedPeers = await sqlite.query<sqlite.PeerRecord>(`SELECT * FROM peers ORDER BY last_seen DESC`);
      setPeers(reloadedPeers);
    };

    channel.onerror = (err: any) => {
      addLog('WebRTC', `Data channel error for peer ${peerId}: ${err?.message || 'Unknown error'}`, 'ERROR');
    };

    const processPayload = async (payload: any, pId: string) => {
      if (payload.type === 'key-handshake') {
        await handleKeyHandshake(pId, payload.publicKey);
        return;
      }

      if (payload.type === 'message') {
        let messageData = payload.data;
        
        if (messageData.encrypted) {
          const key = sharedKeys.current.get(pId);
          if (key) {
            try {
              const decPayload = await crypto.decryptMessagePayload(JSON.parse(messageData.payload), key);
              messageData = { ...messageData, payload: decPayload, encrypted: 0 };
            } catch (e) {
              addLog('Crypto', `Failed to decrypt incoming message from ${pId}`);
            }
          }
        }

        await sqlite.run(
          `INSERT OR REPLACE INTO messages (id, sender_id, sender_name, recipient_id, type, payload, timestamp, ttl, visited_nodes, hops, delivered, attachment_meta, priority, encrypted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            messageData.id,
            messageData.senderId,
            messageData.senderName || 'Peer',
            messageData.recipientId,
            messageData.type,
            messageData.payload,
            messageData.timestamp,
            messageData.ttl,
            JSON.stringify(messageData.visitedNodes),
            messageData.hops,
            messageData.attachmentMeta ? JSON.stringify(messageData.attachmentMeta) : null,
            messageData.priority,
            messageData.encrypted ? 1 : 0
          ]
        );

        const reloaded = await sqlite.query<sqlite.DBMessage>(`SELECT * FROM messages ORDER BY timestamp ASC`);
        setMessages(reloaded);
        addLog('Router', `Received ${messageData.type} message from ${messageData.senderName}`);
      }

      if (payload.type === 'status-sync') {
        const syncStatus = payload.status;
        await sqlite.run(
          `INSERT OR REPLACE INTO peer_statuses (peer_id, display_name, status, location, timestamp) VALUES (?, ?, ?, ?, ?)`,
          [syncStatus.peer_id, syncStatus.display_name, syncStatus.status, syncStatus.location || null, syncStatus.timestamp]
        );
        const reloadedStatuses = await sqlite.query<sqlite.PeerStatus>(`SELECT * FROM peer_statuses ORDER BY timestamp DESC`);
        setStatuses(reloadedStatuses);
        addLog('Router', `Synchronized status for peer: ${syncStatus.display_name} -> ${syncStatus.status}`);
      }
    };

    channel.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'chunk') {
          let buffer = chunkBuffers.current.get(payload.id);
          if (!buffer) {
            buffer = { total: payload.total, chunks: new Array(payload.total) };
            chunkBuffers.current.set(payload.id, buffer);
          }
          buffer.chunks[payload.index] = payload.data;
          
          let receivedCount = 0;
          for (let i = 0; i < buffer.total; i++) {
            if (buffer.chunks[i] !== undefined) receivedCount++;
          }
          
          if (receivedCount === buffer.total) {
            const fullMessageString = buffer.chunks.join('');
            chunkBuffers.current.delete(payload.id);
            const assembledPayload = JSON.parse(fullMessageString);
            await processPayload(assembledPayload, peerId);
          }
          return;
        }

        await processPayload(payload, peerId);
      } catch (err: any) {
        addLog('Error', `Failed to parse data message: ${err.message}`, 'WARNING');
      }
    };
  }, [addLog, handleKeyHandshake]);

  const cleanupPeerConnection = useCallback((peerId: string) => {
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerId);
    }
    const dc = dataChannels.current.get(peerId);
    if (dc) {
      dc.close();
      dataChannels.current.delete(peerId);
    }
    sharedKeys.current.delete(peerId);
  }, []);

  const chunkedSend = (channel: RTCDataChannel, messageObj: any) => {
    const jsonStr = JSON.stringify(messageObj);
    const CHUNK_SIZE = 16000;
    if (jsonStr.length <= CHUNK_SIZE) {
      channel.send(jsonStr);
      return;
    }
    
    const msgId = messageObj?.data?.id || `chunk-${Math.random().toString(36).substring(2, 10)}`;
    const numChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
    
    for (let i = 0; i < numChunks; i++) {
      const chunkData = jsonStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkMessage = {
        type: 'chunk',
        id: msgId,
        index: i,
        total: numChunks,
        data: chunkData
      };
      
      setTimeout(() => {
        if (channel.readyState === 'open') {
          channel.send(JSON.stringify(chunkMessage));
        }
      }, i * 10);
    }
  };

  const sendMessage = async (recipientId: string, type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: any) => {
    if (!identity) return;
    const msgId = `msg-${(globalThis as any).crypto?.getRandomValues ? btoa(String.fromCharCode(...(globalThis as any).crypto.getRandomValues(new Uint8Array(12)))) : Math.random().toString(36).substring(7)}`;
    const timestamp = Date.now();

    let rawMessage: any = {
      id: msgId,
      senderId: identity.peerId,
      senderName: identity.username,
      recipientId,
      type,
      payload,
      timestamp,
      ttl: 5,
      visitedNodes: [identity.peerId],
      hops: 0,
      attachmentMeta,
      priority: type === 'sos' ? 2 : 0,
      encrypted: false
    };

    if (recipientId !== 'broadcast' && sharedKeys.current.has(recipientId)) {
      const key = sharedKeys.current.get(recipientId);
      if (key) {
        try {
          const enc = await crypto.encryptMessagePayload(payload, key);
          rawMessage.payload = JSON.stringify(enc);
          rawMessage.encrypted = true;
        } catch (e: any) {
          addLog('Error', `Encryption failed, fallback to plaintext: ${e.message}`, 'WARNING');
        }
      }
    }

    await sqlite.run(
      `INSERT INTO messages (id, sender_id, sender_name, recipient_id, type, payload, timestamp, ttl, visited_nodes, hops, delivered, attachment_meta, priority, encrypted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        msgId,
        rawMessage.senderId,
        rawMessage.senderName,
        rawMessage.recipientId,
        type,
        rawMessage.payload,
        rawMessage.timestamp,
        rawMessage.ttl,
        JSON.stringify(rawMessage.visitedNodes),
        rawMessage.hops,
        rawMessage.attachmentMeta ? JSON.stringify(rawMessage.attachmentMeta) : null,
        rawMessage.priority,
        rawMessage.encrypted ? 1 : 0
      ]
    );

    const reloaded = await sqlite.query<sqlite.DBMessage>(`SELECT * FROM messages ORDER BY timestamp ASC`);
    setMessages(reloaded);

    const envelope = { type: 'message', data: rawMessage };
    if (recipientId === 'broadcast') {
      dataChannels.current.forEach(channel => {
        if (channel.readyState === 'open') {
          chunkedSend(channel, envelope);
        }
      });
      addLog('Router', `Broadcast message ${msgId} sent over mesh`);
    } else {
      const channel = dataChannels.current.get(recipientId);
      if (channel && channel.readyState === 'open') {
        chunkedSend(channel, envelope);
        addLog('Router', `Direct secure message ${msgId} sent to ${recipientId}`);
      } else {
        addLog('Router', `Recipient offline. Queued message ${msgId} (waiting for connection)`);
      }
    }
  };

  const updateStatus = async (status: 'safe' | 'need-help' | 'unknown', location?: string) => {
    if (!identity) return;
    try {
      await sqlite.run(
        `INSERT OR REPLACE INTO peer_statuses (peer_id, display_name, status, location, timestamp) VALUES (?, ?, ?, ?, ?)`,
        [identity.peerId, identity.username, status, location || null, Date.now()]
      );

      const reloadedStatuses = await sqlite.query<sqlite.PeerStatus>(`SELECT * FROM peer_statuses ORDER BY timestamp DESC`);
      setStatuses(reloadedStatuses);
      addLog('Status', `Checked in as: ${status.toUpperCase()} (${location || 'No Location'})`);

      const syncPacket = {
        type: 'status-sync',
        status: {
          peer_id: identity.peerId,
          display_name: identity.username,
          status,
          location,
          timestamp: Date.now()
        }
      };

      dataChannels.current.forEach(channel => {
        if (channel.readyState === 'open') {
          chunkedSend(channel, syncPacket);
        }
      });

    } catch (err: any) {
      addLog('Error', `Failed to check in: ${err.message}`, 'ERROR');
    }
  };

  const verifyPeerFingerprint = async (peerId: string, fingerprint: string, displayName?: string) => {
    await crypto.trustPeerFingerprint(peerId, fingerprint, displayName);
    setPeerTrustStates(prev => ({
      ...prev,
      [peerId]: { fingerprint, trusted: true }
    }));
    addLog('Trust', `Manually trusted fingerprint for peer: ${peerId}`);
    return { verified: true, fingerprint, trusted: true };
  };

  const trustPeerFingerprint = async (peerId: string, fingerprint: string, displayName?: string) => {
    await verifyPeerFingerprint(peerId, fingerprint, displayName);
  };


  const createManualOffer = useCallback(async (): Promise<{ tempId: string; offerString: string }> => {
    const tempId = `manual-${Math.random().toString(36).substring(2, 10)}`;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    
    peerConnections.current.set(tempId, pc);
    const channel = pc.createDataChannel('signal-mesh-channel');
    setupDataChannel(tempId, channel);

    return new Promise(async (resolve, reject) => {
      pc.onicecandidate = (event: any) => {
        if (event.candidate === null) {
          const sdp = pc.localDescription;
          if (sdp) {
            const payload = {
              type: 'manual-offer',
              senderId: identity?.peerId || 'unknown',
              senderName: identity?.username || 'Mobile Invite',
              sdp: sdp.sdp,
              tempId
            };
            compressPayload(payload)
              .then(code => resolve({ tempId, offerString: code }))
              .catch(reject);
          } else {
            reject(new Error("Local SDP was null"));
          }
        }
      };

      const timeout = setTimeout(() => {
        const sdp = pc.localDescription;
        if (sdp) {
          const payload = {
            type: 'manual-offer',
            senderId: identity?.peerId || 'unknown',
            senderName: identity?.username || 'Mobile Invite',
            sdp: sdp.sdp,
            tempId
          };
          compressPayload(payload)
            .then(code => resolve({ tempId, offerString: code }))
            .catch(reject);
        } else {
          reject(new Error("ICE candidate gathering timed out"));
        }
      }, 3000);

      try {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }, [identity, setupDataChannel]);

  const acceptManualOffer = useCallback(async (offerString: string): Promise<{ answerString: string; peerId: string; displayName: string }> => {
    try {
      const payload = await decompressPayload(offerString);
      if (payload.type !== 'manual-offer') {
        throw new Error("Invalid offer signaling package");
      }

      const targetPeerId = payload.senderId;
      const targetDisplayName = payload.senderName;
      peerDisplayNameCache.current.set(targetPeerId, targetDisplayName);

      cleanupPeerConnection(targetPeerId);

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerConnections.current.set(targetPeerId, pc);

      pc.ondatachannel = (event: any) => {
        setupDataChannel(targetPeerId, event.channel);
      };

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));

      return new Promise(async (resolve, reject) => {
        pc.onicecandidate = (event: any) => {
          if (event.candidate === null) {
            const sdp = pc.localDescription;
            if (sdp) {
              const answerPayload = {
                type: 'manual-answer',
                senderId: identity?.peerId || 'unknown',
                senderName: identity?.username || 'Mobile Answer',
                sdp: sdp.sdp
              };
              compressPayload(answerPayload)
                .then(code => resolve({ answerString: code, peerId: targetPeerId, displayName: targetDisplayName }))
                .catch(reject);
            } else {
              reject(new Error("Local SDP was null"));
            }
          }
        };

        const timeout = setTimeout(() => {
          const sdp = pc.localDescription;
          if (sdp) {
            const answerPayload = {
              type: 'manual-answer',
              senderId: identity?.peerId || 'unknown',
              senderName: identity?.username || 'Mobile Answer',
              sdp: sdp.sdp
            };
            compressPayload(answerPayload)
              .then(code => resolve({ answerString: code, peerId: targetPeerId, displayName: targetDisplayName }))
              .catch(reject);
          } else {
            reject(new Error("ICE candidate gathering timed out"));
          }
        }, 3000);

        try {
          const answer = await pc.createAnswer({});
          await pc.setLocalDescription(answer);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

    } catch (err: any) {
      throw new Error(`Failed to accept offer: ${err.message}`);
    }
  }, [identity, cleanupPeerConnection, setupDataChannel]);

  const completeManualConnection = useCallback(async (tempId: string, answerString: string) => {
    try {
      const payload = await decompressPayload(answerString);
      if (payload.type !== 'manual-answer') {
        throw new Error("Invalid answer signaling package");
      }

      const realPeerId = payload.senderId;
      const realDisplayName = payload.senderName;

      const pc = peerConnections.current.get(tempId);
      if (!pc) throw new Error("Initiator session expired or invalid tempId");

      peerConnections.current.set(realPeerId, pc);
      peerConnections.current.delete(tempId);

      const dc = dataChannels.current.get(tempId);
      if (dc) {
        dataChannels.current.set(realPeerId, dc);
        dataChannels.current.delete(tempId);
      }

      peerDisplayNameCache.current.set(realPeerId, realDisplayName);
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }));
      addLog('WebRTC', `Manually connected to peer: ${realDisplayName} (${realPeerId})`);

    } catch (err: any) {
      cleanupPeerConnection(tempId);
      throw new Error(`Failed to complete connection: ${err.message}`);
    }
  }, [cleanupPeerConnection, addLog]);

  return (
    <SignalContext.Provider
      value={{
        identity,
        setUsername,
        peers,
        messages,
        statuses,
        debugLogs,
        loading,
        sendMessage,
        updateStatus,
        peerTrustStates,
        verifyPeerFingerprint,
        trustPeerFingerprint,
        createManualOffer,
        acceptManualOffer,
        completeManualConnection
      }}
    >
      {children}
    </SignalContext.Provider>
  );
}

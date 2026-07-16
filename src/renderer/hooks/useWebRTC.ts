import { useEffect, useRef, useCallback } from 'react';
import { strToU8, deflateSync, inflateSync, strFromU8 } from 'fflate';

export interface WebRTCHookConfig {
  peerId: string; 
  displayName: string; 
  addLog: (category: string, message: string) => void;
  onHandshakeReceived: (peerId: string, publicKeyJwk: string) => Promise<void>;
  onMeshMessageReceived: (message: any) => void;
  onFileReceived: (message: any) => void;
  onPeerRemapped?: (tempId: string, realId: string) => void;
}

export function useWebRTC({
  peerId,
  displayName,
  addLog,
  onHandshakeReceived,
  onMeshMessageReceived,
  onFileReceived,
  onPeerRemapped
}: WebRTCHookConfig) {
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const fileChunksBuffer = useRef<Map<string, { chunks: string[]; expectedChunks: number; fileName: string; type: string }>>(new Map());
  const messageChunkBuffers = useRef<Map<string, { total: number, chunks: string[] }>>(new Map());
  const tempIdRef = useRef<Map<string, string>>(new Map());
  const peerDisplayNameCache = useRef<Map<string, string>>(new Map());

  const peerIdRef = useRef(peerId);
  peerIdRef.current = peerId;
  const onHandshakeReceivedRef = useRef(onHandshakeReceived);
  onHandshakeReceivedRef.current = onHandshakeReceived;
  const onMeshMessageReceivedRef = useRef(onMeshMessageReceived);
  onMeshMessageReceivedRef.current = onMeshMessageReceived;
  const onFileReceivedRef = useRef(onFileReceived);
  onFileReceivedRef.current = onFileReceived;
  const onPeerRemappedRef = useRef(onPeerRemapped);
  onPeerRemappedRef.current = onPeerRemapped;

  const isPeerConnected = useCallback((id: string) => {
    const channel = dataChannels.current.get(id);
    return channel ? channel.readyState === 'open' : false;
  }, []);

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

  const getIceConfig = async (): Promise<RTCConfiguration> => {
    try {
      if (window.api && window.api.getIceServers) {
        const res = await window.api.getIceServers();
        return res;
      }
    } catch (err) {
      console.warn('Failed to fetch ICE servers, using local only', err);
    }
    return { iceServers: [] };
  };

  const cleanupPeerConnection = useCallback((targetPeerId: string) => {
    const pc = peerConnections.current.get(targetPeerId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(targetPeerId);
    }
    const channel = dataChannels.current.get(targetPeerId);
    if (channel) {
      channel.close();
      dataChannels.current.delete(targetPeerId);
    }
  }, []);

  const setupDataChannel = useCallback((targetPeerId: string, channel: RTCDataChannel, getHandshakeData: () => Promise<string>) => {
    dataChannels.current.set(targetPeerId, channel);

    const getActivePeerId = (): string => {
      if (dataChannels.current) {
        for (const [id, c] of dataChannels.current.entries()) {
          if (c === channel) return id;
        }
      }
      return targetPeerId;
    };

    const handleOpen = async () => {
      const activeId = getActivePeerId();
      addLog('WebRTC', `DataChannel opened/active with peer ${activeId}`);
      
      const displayName = peerDisplayNameCache.current.get(activeId);
      const tId = tempIdRef.current.get(activeId);
      if (window.api) {
        window.api.webrtcStatus(
          activeId, 
          'connected', 
          'direct', 
          0, 
          displayName,
          tId
        );
      }

      try {
        const jwkPubStr = await getHandshakeData();
        channel.send(JSON.stringify({ type: 'key-handshake', publicKey: jwkPubStr }));
        addLog('Crypto', `Sent public key handshake to peer ${activeId}`);
      } catch (err) {
        console.error('Failed to trigger handshake:', err);
      }
    };

    channel.onopen = handleOpen;

    if (channel.readyState === 'open') {
      handleOpen();
    }

    channel.onclose = () => {
      const activeId = getActivePeerId();
      addLog('WebRTC', `DataChannel closed with peer ${activeId}`);
      if (window.api) window.api.webrtcStatus(activeId, 'offline');
      cleanupPeerConnection(activeId);
    };

    channel.onerror = (event) => {
      const activeId = getActivePeerId();
      addLog('WebRTC', `DataChannel error with peer ${activeId}`);
    };

    const processPayload = async (payload: any, activeId: string) => {
      if (payload.type === 'key-handshake') {
        await onHandshakeReceivedRef.current(activeId, payload.publicKey);
      } else if (payload.type === 'mesh-message') {
        onMeshMessageReceivedRef.current(payload.message);
      } else if (payload.type === 'file-start') {
        fileChunksBuffer.current.set(payload.fileId, {
          chunks: new Array(payload.totalChunks),
          expectedChunks: payload.totalChunks,
          fileName: payload.fileName,
          type: payload.fileType
        });
        addLog('File', `Incoming file: ${payload.fileName}`);
      } else if (payload.type === 'file-chunk') {
        const buf = fileChunksBuffer.current.get(payload.fileId);
        if (buf) {
          buf.chunks[payload.chunkIndex] = payload.chunkData;
          const filled = buf.chunks.filter(Boolean).length;
          if (filled === buf.expectedChunks) {
            const base64Content = buf.chunks.join('');
            const blob = base64ToBlob(base64Content, buf.type);
            const fileUrl = URL.createObjectURL(blob);
            addLog('File', `Completed download: ${buf.fileName}`);
            
            onFileReceivedRef.current({
              id: payload.fileId,
              senderId: activeId,
              recipientId: peerIdRef.current,
              type: 'file',
              payload: fileUrl,
              timestamp: Date.now(),
              ttl: 5,
              visitedNodes: [activeId],
              hops: 1,
              attachmentMeta: { fileName: buf.fileName, fileSize: blob.size, fileType: buf.type },
              priority: 0
            });
            fileChunksBuffer.current.delete(payload.fileId);
          }
        }
      }
    };

    channel.onmessage = async (event) => {
      const activeId = getActivePeerId();
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === 'chunk') {
          let buffer = messageChunkBuffers.current.get(payload.id);
          if (!buffer) {
            buffer = { total: payload.total, chunks: new Array(payload.total) };
            messageChunkBuffers.current.set(payload.id, buffer);
          }
          buffer.chunks[payload.index] = payload.data;
          
          let receivedCount = 0;
          for (let i = 0; i < buffer.total; i++) {
            if (buffer.chunks[i] !== undefined) receivedCount++;
          }
          
          if (receivedCount === buffer.total) {
            const fullMessageString = buffer.chunks.join('');
            messageChunkBuffers.current.delete(payload.id);
            const assembledPayload = JSON.parse(fullMessageString);
            await processPayload(assembledPayload, activeId);
          }
          return;
        }

        await processPayload(payload, activeId);
      } catch (err: any) {
        console.error('DataChannel msg parse error:', err);
      }
    };
  }, [addLog, cleanupPeerConnection]);




  const chunkedSend = useCallback((channel: RTCDataChannel, messageObj: any) => {
    const jsonStr = JSON.stringify(messageObj);
    const CHUNK_SIZE = 16000; // 16KB per packet to stay well under WebRTC limits
    if (jsonStr.length <= CHUNK_SIZE) {
      channel.send(jsonStr);
      return;
    }
    
    const msgId = messageObj?.message?.id || `chunk-${Math.random().toString(36).substring(2, 10)}`;
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
  }, []);

  const webrtcSendPacket = useCallback((targetPeerId: string, message: any, encryptFn: (peerId: string, msg: any) => Promise<any>) => {
    const channel = dataChannels.current.get(targetPeerId);
    if (channel && channel.readyState === 'open') {
      encryptFn(targetPeerId, message).then((encryptedMsg) => {
        chunkedSend(channel, { type: 'mesh-message', message: encryptedMsg });
        addLog('WebRTC', `Dispatched packet ${message.id} to peer ${targetPeerId}`);
      }).catch(err => {
        addLog('Crypto', `Encryption failed for ${targetPeerId}, sending unencrypted: ${err.message}`);
        chunkedSend(channel, { type: 'mesh-message', message });
      });
    } else {
      addLog('WebRTC', `Cannot send to ${targetPeerId}: channel state is ${channel?.readyState ?? 'missing'}`);
    }
  }, [addLog]);

  const webrtcSendFile = useCallback((targetPeerId: string, file: File, onFileSent: (msg: any) => void) => {
    const channel = dataChannels.current.get(targetPeerId);
    if (!channel || channel.readyState !== 'open') {
      addLog('File', 'Cannot send file: Peer data channel not open.');
      return;
    }

    const fileId = crypto.randomUUID();
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
      const chunkSize = 16384;
      const totalChunks = Math.ceil(base64Data.length / chunkSize);

      addLog('File', `Uploading ${file.name} (${totalChunks} chunks)`);

      channel.send(JSON.stringify({
        type: 'file-start', fileId,
        fileName: file.name, fileSize: file.size,
        fileType: file.type, totalChunks
      }));

      for (let i = 0; i < totalChunks; i++) {
        channel.send(JSON.stringify({
          type: 'file-chunk', fileId, chunkIndex: i,
          chunkData: base64Data.slice(i * chunkSize, (i + 1) * chunkSize)
        }));
      }

      onFileSent({
        id: fileId,
        senderId: peerIdRef.current,
        senderName: displayName,
        recipientId: targetPeerId,
        type: 'file',
        payload: URL.createObjectURL(file),
        timestamp: Date.now(),
        hops: 0,
        ttl: 5,
        visitedNodes: [peerIdRef.current],
        priority: 0,
        attachmentMeta: { fileName: file.name, fileSize: file.size, fileType: file.type }
      });
    };
    reader.readAsDataURL(file);
  }, [displayName, addLog]);

  const compressPayload = async (payload: any): Promise<string> => {
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
      console.warn('fflate compression failed:', e);
      return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    }
  };

  const decompressPayload = async (code: string): Promise<any> => {
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
        const binary = atob(trimmed);
        return JSON.parse(decodeURIComponent(escape(binary)));
      } catch (err2) {
        return JSON.parse(trimmed);
      }
    }
  };

  const createManualOffer = useCallback(async (getHandshakeData: () => Promise<string>): Promise<{ tempId: string; offerString: string }> => {
    const iceConfig = await getIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    const tempId = `manual-${crypto.randomUUID().substring(0, 8)}`;
    
    peerConnections.current.set(tempId, pc);
    
    const channel = pc.createDataChannel('signal-mesh-channel');
    setupDataChannel(tempId, channel, getHandshakeData);
    
    return new Promise(async (resolve, reject) => {
      pc.onicecandidate = (event) => {
        if (event.candidate === null) {
          const sdp = pc.localDescription;
          if (sdp) {
            const payload = {
              type: 'manual-offer',
              senderId: peerIdRef.current,
              senderName: displayName,
              sdp: sdp.sdp,
              tempId
            };
            compressPayload(payload)
              .then(code => resolve({ tempId, offerString: code }))
              .catch(reject);
          } else {
            reject(new Error("Local description is null"));
          }
        }
      };
      
      const timeout = setTimeout(() => {
        const sdp = pc.localDescription;
        if (sdp) {
          const payload = {
            type: 'manual-offer',
            senderId: peerIdRef.current,
            senderName: displayName,
            sdp: sdp.sdp,
            tempId
          };
          compressPayload(payload)
            .then(code => resolve({ tempId, offerString: code }))
            .catch(reject);
        } else {
          reject(new Error("ICE gathering timed out and local description is null"));
        }
      }, 3000);
      
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }, [displayName, setupDataChannel]);

  const acceptManualOffer = useCallback(async (
    offerString: string, 
    getHandshakeData: () => Promise<string>
  ): Promise<{ answerString: string; peerId: string; displayName: string }> => {
    try {
      const payload = await decompressPayload(offerString);
      if (payload.type !== 'manual-offer') {
        throw new Error("Invalid connection code (not an offer)");
      }
      
      const targetPeerId = payload.senderId;
      const targetDisplayName = payload.senderName;
      
      peerDisplayNameCache.current.set(targetPeerId, targetDisplayName);
      cleanupPeerConnection(targetPeerId);
      
      const iceConfig = await getIceConfig();
      const pc = new RTCPeerConnection(iceConfig);
      peerConnections.current.set(targetPeerId, pc);
      
      pc.ondatachannel = (event) => {
        setupDataChannel(targetPeerId, event.channel, getHandshakeData);
      };
      
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }));
      
      return new Promise(async (resolve, reject) => {
        pc.onicecandidate = (event) => {
          if (event.candidate === null) {
            const sdp = pc.localDescription;
            if (sdp) {
              const answerPayload = {
                type: 'manual-answer',
                senderId: peerIdRef.current,
                senderName: displayName,
                sdp: sdp.sdp
              };
              compressPayload(answerPayload)
                .then(code => resolve({ answerString: code, peerId: targetPeerId, displayName: targetDisplayName }))
                .catch(reject);
            } else {
              reject(new Error("Local description is null"));
            }
          }
        };
        
        const timeout = setTimeout(() => {
          const sdp = pc.localDescription;
          if (sdp) {
            const answerPayload = {
              type: 'manual-answer',
              senderId: peerIdRef.current,
              senderName: displayName,
              sdp: sdp.sdp
            };
            compressPayload(answerPayload)
              .then(code => resolve({ answerString: code, peerId: targetPeerId, displayName: targetDisplayName }))
              .catch(reject);
          } else {
            reject(new Error("ICE gathering timed out and local description is null"));
          }
        }, 3000);
        
        try {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    } catch (err: any) {
      throw new Error(`Failed to accept offer: ${err.message}`);
    }
  }, [displayName, setupDataChannel, cleanupPeerConnection]);

  const completeManualConnection = useCallback(async (tempId: string, answerString: string) => {
    try {
      const payload = await decompressPayload(answerString);
      if (payload.type !== 'manual-answer') {
        throw new Error("Invalid connection code (not an answer)");
      }
      
      const realPeerId = payload.senderId;
      const realDisplayName = payload.senderName;
      
      const pc = peerConnections.current.get(tempId);
      if (!pc) {
        throw new Error("Initiator connection not found or expired");
      }
      
      peerConnections.current.set(realPeerId, pc);
      peerConnections.current.delete(tempId);
      
      const dc = dataChannels.current.get(tempId);
      if (dc) {
        dataChannels.current.set(realPeerId, dc);
        dataChannels.current.delete(tempId);
      }
      
      if (onPeerRemappedRef.current) {
        onPeerRemappedRef.current(tempId, realPeerId);
      }
      
      peerDisplayNameCache.current.set(realPeerId, realDisplayName);
      
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: payload.sdp }));
      addLog('WebRTC', `Manually connected to peer ${realDisplayName} (${realPeerId})`);
    } catch (err: any) {
      cleanupPeerConnection(tempId);
      throw new Error(`Failed to complete connection: ${err.message}`);
    }
  }, [cleanupPeerConnection, addLog]);

  return {
    webrtcSendPacket,
    webrtcSendFile,
    isPeerConnected,
    cleanupPeerConnection,
    createManualOffer,
    acceptManualOffer,
    completeManualConnection,
  };
}

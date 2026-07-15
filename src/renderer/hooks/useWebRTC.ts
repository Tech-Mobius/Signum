import { useEffect, useRef } from 'react';

export interface WebRTCHookConfig {
  peerId: string; // our peer id
  displayName: string; // our callsign
  addLog: (category: string, message: string) => void;
  onHandshakeReceived: (peerId: string, publicKeyJwk: string) => Promise<void>;
  onMeshMessageReceived: (message: any) => void;
  onFileReceived: (message: any) => void;
}

export function useWebRTC({
  peerId,
  displayName,
  addLog,
  onHandshakeReceived,
  onMeshMessageReceived,
  onFileReceived
}: WebRTCHookConfig) {
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const fileChunksBuffer = useRef<Map<string, { chunks: string[]; expectedChunks: number; fileName: string; type: string }>>(new Map());

  // Expose status checker
  const isPeerConnected = (id: string) => {
    const channel = dataChannels.current.get(id);
    return channel ? channel.readyState === 'open' : false;
  };

  // Helper to convert base64 to Blob offline
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

  // Get ICE configuration
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

  const cleanupPeerConnection = (targetPeerId: string) => {
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
  };

  const forwardWebRTCSignal = (peer: { address: string; port: number }, signal: any) => {
    if (!window.api) return;
    window.api.forwardSignal(peer.address, peer.port, signal).catch(err => {
      addLog('WebRTC', `Failed to forward signal to ${peer.address}: ${err?.message || err}`);
    });
  };

  const setupDataChannel = (targetPeerId: string, channel: RTCDataChannel, getHandshakeData: () => Promise<string>) => {
    dataChannels.current.set(targetPeerId, channel);

    channel.onopen = async () => {
      addLog('WebRTC', `DataChannel opened with peer ${targetPeerId}`);
      if (window.api) window.api.webrtcStatus(targetPeerId, 'connected');

      try {
        const jwkPubStr = await getHandshakeData();
        channel.send(JSON.stringify({ type: 'key-handshake', publicKey: jwkPubStr }));
        addLog('Crypto', `Sent public key handshake to peer ${targetPeerId}`);
      } catch (err) {
        console.error('Failed to trigger handshake:', err);
      }
    };

    channel.onclose = () => {
      addLog('WebRTC', `DataChannel closed with peer ${targetPeerId}`);
      if (window.api) window.api.webrtcStatus(targetPeerId, 'offline');
      cleanupPeerConnection(targetPeerId);
    };

    channel.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === 'key-handshake') {
          await onHandshakeReceived(targetPeerId, payload.publicKey);
        } else if (payload.type === 'mesh-message') {
          onMeshMessageReceived(payload.message);
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
              
              onFileReceived({
                id: payload.fileId,
                senderId: targetPeerId,
                recipientId: peerId,
                type: 'file',
                payload: fileUrl,
                timestamp: Date.now(),
                ttl: 5,
                visitedNodes: [targetPeerId],
                hops: 1,
                attachmentMeta: { fileName: buf.fileName, fileSize: blob.size, fileType: buf.type },
                priority: 0
              });
              fileChunksBuffer.current.delete(payload.fileId);
            }
          }
        }
      } catch (err: any) {
        console.error('DataChannel msg parse error:', err);
      }
    };
  };

  const initiateWebRTCConnection = async (peer: any, getHandshakeData: () => Promise<string>) => {
    try {
      const iceConfig = await getIceConfig();
      const pc = new RTCPeerConnection(iceConfig);
      peerConnections.current.set(peer.id, pc);

      const channel = pc.createDataChannel('signal-mesh-channel');
      setupDataChannel(peer.id, channel, getHandshakeData);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          forwardWebRTCSignal(peer, { type: 'candidate', candidate: event.candidate });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      forwardWebRTCSignal(peer, offer);
      addLog('WebRTC', `Sent SDP offer to ${peer.displayName}`);
    } catch (err: any) {
      addLog('WebRTC', `Error initiating connection to ${peer.id}: ${err.message}`);
    }
  };

  const handleIncomingSignal = async (payload: any, getHandshakeData: () => Promise<string>) => {
    const targetPeerId = payload.senderId;
    const peer = {
      id: targetPeerId,
      displayName: payload.senderName,
      address: payload.signal?.address || payload.address || '',
      port: payload.signal?.port || payload.port || 0
    };

    let pc = peerConnections.current.get(targetPeerId);

    try {
      if (payload.type === 'offer') {
        if (!pc) {
          const iceConfig = await getIceConfig();
          pc = new RTCPeerConnection(iceConfig);
          peerConnections.current.set(targetPeerId, pc);
          
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              forwardWebRTCSignal(peer, { type: 'candidate', candidate: event.candidate });
            }
          };
          
          pc.ondatachannel = (event) => {
            setupDataChannel(targetPeerId, event.channel, getHandshakeData);
          };
        }
        await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        forwardWebRTCSignal(peer, answer);
        addLog('WebRTC', `Received offer and sent answer to ${peer.displayName}`);
      } else if (payload.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
          addLog('WebRTC', `Received SDP answer from ${peer.displayName}`);
        }
      } else if (payload.type === 'candidate') {
        if (pc && payload.signal?.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
        }
      }
    } catch (err: any) {
      addLog('WebRTC', `Error processing signal: ${err.message}`);
    }
  };

  const webrtcSendPacket = (peerId: string, message: any, encryptFn: (peerId: string, msg: any) => Promise<any>) => {
    const channel = dataChannels.current.get(peerId);
    if (channel && channel.readyState === 'open') {
      encryptFn(peerId, message).then((encryptedMsg) => {
        channel.send(JSON.stringify({ type: 'mesh-message', message: encryptedMsg }));
        addLog('WebRTC', `Dispatched packet ${message.id} to peer ${peerId}`);
      }).catch(err => {
        addLog('Crypto', `Error encrypting packet for peer ${peerId}: ${err.message}`);
      });
    } else {
      addLog('WebRTC', `Cannot send to ${peerId}: channel state is ${channel?.readyState ?? 'missing'}`);
    }
  };

  const webrtcSendFile = (targetPeerId: string, file: File, onFileSent: (msg: any) => void) => {
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
        senderId: peerId,
        senderName: displayName,
        recipientId: targetPeerId,
        type: 'file',
        payload: URL.createObjectURL(file),
        timestamp: Date.now(),
        hops: 0,
        attachmentMeta: { fileName: file.name, fileSize: file.size, fileType: file.type }
      });
    };
    reader.readAsDataURL(file);
  };

  return {
    initiateWebRTCConnection,
    handleIncomingSignal,
    webrtcSendPacket,
    webrtcSendFile,
    isPeerConnected,
    cleanupPeerConnection,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { MeshMessage, PeerStatus, DebugLog } from '../../shared/ipc-types';

export function useMessages(
  ourPeerId: string,
  ourUsername: string,
  addLog: (cat: string, msg: string) => void,
  playMorseCode: (text: string) => void,
  setSosActive: (active: boolean) => void,
  decryptPayload: (msg: any) => Promise<string>,
  onDirectMessageReceived?: (peerId: string) => void
) {
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [statuses, setStatuses] = useState<PeerStatus[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

  const decryptRef = useRef(decryptPayload);
  decryptRef.current = decryptPayload;
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;
  const playMorseRef = useRef(playMorseCode);
  playMorseRef.current = playMorseCode;
  const setSosRef = useRef(setSosActive);
  setSosRef.current = setSosActive;
  const ourPeerIdRef = useRef(ourPeerId);
  ourPeerIdRef.current = ourPeerId;
  const onDirectMessageReceivedRef = useRef(onDirectMessageReceived);
  onDirectMessageReceivedRef.current = onDirectMessageReceived;

  useEffect(() => {
    if (!window.api) return;

    window.api.getHistory().then((hist) => {
      if (hist) {
        if (hist.messages && hist.messages.length > 0) {
          setMessages(prev => {
            const merged = new Map<string, MeshMessage>();
            for (const m of hist.messages) merged.set(m.id, m);
            for (const m of prev) merged.set(m.id, m);
            return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
          });
        }
        if (hist.statuses) setStatuses(hist.statuses);
      }
    }).catch(err => {
      console.error('Failed to load database history:', err);
    });
  }, []); 

  useEffect(() => {
    if (!window.api) return;

    const unsubMsg = window.api.onMessageReceived(async (msg: any) => {
      if (msg.type === 'signal' || msg.type === 'signal-manual-initiate') return;

      if (msg.recipientId === ourPeerIdRef.current && msg.senderId && msg.senderId !== ourPeerIdRef.current) {
        onDirectMessageReceivedRef.current?.(msg.senderId);
      }

      if (msg.type === 'text' || msg.type === 'sos' || msg.type === 'file') {
        try {
          const decryptedPayload = await decryptRef.current(msg);
          const displayMsg: MeshMessage = { ...msg, payload: decryptedPayload };
          setMessages(prev => [...prev.filter(m => m.id !== msg.id), displayMsg]);

          if (msg.encrypted && window.api) {
            window.api.saveDecryptedMessage(msg.id, decryptedPayload);
          }
          
          if (msg.type === 'sos') {
            setSosRef.current(true);
            setTimeout(() => setSosRef.current(false), 6000);
            playMorseRef.current(decryptedPayload);
          }
        } catch (err: any) {
          addLogRef.current('Crypto', `Failed to decrypt message ${msg.id}: ${err.message}`);
          setMessages(prev => [...prev.filter(m => m.id !== msg.id), msg]);
        }
      } else if (msg.type === 'status') {
        try {
          const decrypted = await decryptRef.current(msg);
          const checkin = JSON.parse(decrypted);
          setStatuses(prev => [checkin, ...prev.filter(s => s.peer_id !== checkin.peer_id)]);
        } catch (_) {
          try {
            const checkin = JSON.parse(msg.payload);
            setStatuses(prev => [checkin, ...prev.filter(s => s.peer_id !== checkin.peer_id)]);
          } catch (__) {
          }
        }
      }
    });

    const unsubDelivered = window.api.onMessageDelivered(({ messageId, peerId }: any) => {
      addLogRef.current('Router', `Receipt: Message ${messageId} reached peer ${peerId}`);
    });

    const unsubStatus = window.api.onStatusSync((list: PeerStatus[]) => {
      setStatuses(list);
    });

    const unsubLogs = window.api.onDebugLog((log: DebugLog) => {
      setDebugLogs(prev => [log, ...prev].slice(0, 200));
    });

    return () => {
      unsubMsg();
      unsubDelivered();
      unsubStatus();
      unsubLogs();
    };
  }, []); 

  const updateStatus = useCallback((status: 'safe' | 'need-help' | 'unknown', location?: string) => {
    if (!window.api) return;
    window.api.updateStatus(status, location);
    
    const localCheckin: PeerStatus = {
      peer_id: ourPeerId,
      display_name: ourUsername || 'Anonymous',
      status,
      location,
      timestamp: Date.now()
    };
    setStatuses(prev => [localCheckin, ...prev.filter(s => s.peer_id !== ourPeerId)]);
  }, [ourPeerId, ourUsername]);

  const addLocalMessage = useCallback((msg: MeshMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  return {
    messages,
    statuses,
    debugLogs,
    updateStatus,
    addLocalMessage,
    setDebugLogs,
  };
}

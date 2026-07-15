import { useState, useEffect } from 'react';
import { MeshMessage, PeerStatus, DebugLog } from '../../shared/ipc-types';

export function useMessages(
  ourPeerId: string,
  ourUsername: string,
  addLog: (cat: string, msg: string) => void,
  playSosBeeps: () => void,
  setSosActive: (active: boolean) => void,
  decryptPayload: (msg: any) => Promise<string>
) {
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [statuses, setStatuses] = useState<PeerStatus[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

  // Load message history on startup
  useEffect(() => {
    if (!window.api) return;

    window.api.getHistory().then((hist) => {
      if (hist) {
        if (hist.messages) {
          // Decrypt existing history if encrypted
          Promise.all(hist.messages.map(async (m: MeshMessage) => {
            try {
              const decrypted = await decryptPayload(m);
              return { ...m, payload: decrypted };
            } catch {
              return m;
            }
          })).then(setMessages);
        }
        if (hist.statuses) setStatuses(hist.statuses);
      }
    }).catch(err => {
      console.error('Failed to load database history:', err);
    });
  }, [decryptPayload]);

  useEffect(() => {
    if (!window.api) return;

    const unsubMsg = window.api.onMessageReceived(async (msg) => {
      if (msg.type === 'text' || msg.type === 'sos' || msg.type === 'file') {
        try {
          const decryptedPayload = await decryptPayload(msg);
          const displayMsg: MeshMessage = { ...msg, payload: decryptedPayload };
          setMessages(prev => [...prev.filter(m => m.id !== msg.id), displayMsg]);
          
          if (msg.type === 'sos') {
            setSosActive(true);
            setTimeout(() => setSosActive(false), 6000);
            playSosBeeps();
          }
        } catch (err: any) {
          addLog('Crypto', `Failed to decrypt message ${msg.id}: ${err.message}`);
          setMessages(prev => [...prev.filter(m => m.id !== msg.id), msg]);
        }
      } else if (msg.type === 'status') {
        try {
          const decrypted = await decryptPayload(msg);
          const checkin = JSON.parse(decrypted);
          setStatuses(prev => [checkin, ...prev.filter(s => s.peer_id !== checkin.peer_id)]);
        } catch (_) {
          // ignore malformed status
        }
      }
    });

    const unsubDelivered = window.api.onMessageDelivered(({ messageId, peerId }) => {
      addLog('Router', `Receipt: Message ${messageId} reached peer ${peerId}`);
    });

    const unsubStatus = window.api.onStatusSync((list) => setStatuses(list));
    const unsubLogs = window.api.onDebugLog((log) => {
      setDebugLogs(prev => [log, ...prev].slice(0, 200));
    });

    return () => {
      unsubMsg();
      unsubDelivered();
      unsubStatus();
      unsubLogs();
    };
  }, [decryptPayload, playSosBeeps, setSosActive, addLog]);

  const updateStatus = (status: 'safe' | 'need-help' | 'unknown', location?: string) => {
    if (!window.api) return;
    window.api.updateStatus(status, location);
    
    // Add local optimistic check-in
    const localCheckin: PeerStatus = {
      peer_id: ourPeerId,
      display_name: ourUsername || 'Anonymous',
      status,
      location,
      timestamp: Date.now()
    };
    setStatuses(prev => [localCheckin, ...prev.filter(s => s.peer_id !== ourPeerId)]);
  };

  const addLocalMessage = (msg: MeshMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  return {
    messages,
    statuses,
    debugLogs,
    updateStatus,
    addLocalMessage,
    setDebugLogs,
  };
}

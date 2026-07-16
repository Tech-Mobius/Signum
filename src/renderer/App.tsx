import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Shield, 
  Wifi, 
  WifiOff, 
  MessageSquare, 
  Activity, 
  User,
  Radio,
  Settings,
  Minus,
  Square,
  X
} from 'lucide-react';
import MeshGraph from './components/MeshGraph';
import ChatPanel from './components/ChatPanel';
import PeerList from './components/PeerList';
import StatusBoard from './components/StatusBoard';
import DebugPanel from './components/DebugPanel';
import UsernamePrompt from './components/UsernamePrompt';
import VerificationModal from './components/VerificationModal';
import SettingsPanel from './components/SettingsPanel';
import FaultyTerminal from './components/FaultyTerminal';
import { AsciiArt } from './components/AsciiArt';

import { useIdentity } from './hooks/useIdentity';
import { usePeers } from './hooks/usePeers';
import { useCrypto } from './hooks/useCrypto';
import { useMessages } from './hooks/useMessages';
import { useWebRTC } from './hooks/useWebRTC';
import { MeshMessage } from '../shared/ipc-types';

const MORSE_CODE_MAP: Record<string, string> = {
  'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',   'E': '.',
  'F': '..-.',  'G': '--.',   'H': '....',  'I': '..',    'J': '.---',
  'K': '-.-',   'L': '.-..',  'M': '--',    'N': '-.',    'O': '---',
  'P': '.--.',  'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
  'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',  'Y': '-.--',
  'Z': '--..',  '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..',
  '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.', ' ': '/',
};

function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .map(ch => MORSE_CODE_MAP[ch] || '')
    .filter(Boolean)
    .join(' ');
}

function playMorseCode(text: string) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    
    const freq = 700; // Hz — standard Morse tone
    const dotDur = 0.08; // seconds
    const dashDur = dotDur * 3;
    const elementGap = dotDur; // gap between dots/dashes within a character
    const charGap = dotDur * 3; // gap between characters
    const wordGap = dotDur * 7; // gap between words

    const morseStr = text.toUpperCase();
    let t = 0;

    const playTone = (duration: number, startTime: number) => {
      const osc = context.createOscillator();
      const gainNode = context.createGain();
      osc.connect(gainNode);
      gainNode.connect(context.destination);
      osc.frequency.setValueAtTime(freq, context.currentTime + startTime);
      gainNode.gain.setValueAtTime(0.25, context.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + startTime + duration);
      osc.start(context.currentTime + startTime);
      osc.stop(context.currentTime + startTime + duration);
    };

    const limitedText = morseStr.slice(0, 80);

    for (const ch of limitedText) {
      const morse = MORSE_CODE_MAP[ch];
      if (!morse) continue;

      if (ch === ' ') {
        t += wordGap;
        continue;
      }

      for (let i = 0; i < morse.length; i++) {
        const symbol = morse[i];
        if (symbol === '.') {
          playTone(dotDur, t);
          t += dotDur + elementGap;
        } else if (symbol === '-') {
          playTone(dashDur, t);
          t += dashDur + elementGap;
        }
      }
      t += charGap - elementGap; // char gap minus the element gap already added
    }
  } catch (e) {
    console.error('Morse Audio error:', e);
  }
}

export default function App() {
  const [selectedPeerId, setSelectedPeerId] = useState<string | 'broadcast'>('broadcast');
  const [sosActive, setSosActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [verificationPeer, setVerificationPeer] = useState<any | null>(null);
  const [peerTrustStates, setPeerTrustStates] = useState<Record<string, { fingerprint: string; trusted: boolean }>>({});

  const addLog = useCallback((category: string, message: string) => {
    setMessagesHook.setDebugLogs(prev => [
      { timestamp: Date.now(), level: 'info', category, message },
      ...prev
    ].slice(0, 200));
  }, []);

  const identityHook = useIdentity();
  const peersHook = usePeers();
  const cryptoHook = useCrypto(addLog);

  const setMessagesHook = useMessages(
    identityHook.identity?.peerId || '',
    identityHook.identity?.username || '',
    addLog,
    playMorseCode,
    setSosActive,
    cryptoHook.decryptPayload,
    (peerId) => setSelectedPeerId(peerId)
  );

  const webrtcHook = useWebRTC({
    peerId: identityHook.identity?.peerId || '',
    displayName: identityHook.identity?.username || '',
    addLog,
    onHandshakeReceived: async (targetId, publicKeyJwk) => {
      await cryptoHook.processHandshake(targetId, publicKeyJwk);
      if (window.api) {
        const finger = await window.api.getPeerFingerprint(targetId);
        if (finger) {
          setPeerTrustStates(prev => ({
            ...prev,
            [targetId]: { fingerprint: finger.fingerprint, trusted: finger.trusted }
          }));
        }
      }
    },
    onMeshMessageReceived: async (encryptedMsg) => {
      if (window.api) window.api.webrtcReceived(encryptedMsg);
    },
    onFileReceived: (fileMsg) => {
      if (window.api) window.api.webrtcReceived(fileMsg);
    },
    onPeerRemapped: (tempId, realId) => {
      setSelectedPeerId(prev => prev === tempId ? realId : prev);
      setPeerTrustStates(prev => {
        if (prev[tempId]) {
          const next = { ...prev };
          next[realId] = next[tempId];
          delete next[tempId];
          return next;
        }
        return prev;
      });
    }
  });
  useEffect(() => {
    if (!window.api) return;

    const unsubSend = window.api.onWebrtcSend(({ peerId, message }: { peerId: string; message: any }) => {
      webrtcHook.webrtcSendPacket(peerId, message, cryptoHook.encryptPayload);
    });

    return () => {
      unsubSend();
    };
  }, []); // Empty deps — the refs inside hooks are stable

  const handleSendMessage = useCallback((text: string, type: 'text' | 'sos' = 'text') => {
    if (!identityHook.identity) return;
    
    if (selectedPeerId !== 'broadcast') {
      const trust = peerTrustStates[selectedPeerId];
      if (trust && !trust.trusted) {
        addLog('Security', `Warning: Sending encrypted message to unverified peer ${selectedPeerId}`);
      }
    }

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();

    if (window.api) {
      window.api.sendMessage(selectedPeerId, type, text, undefined, messageId, timestamp);
    }
    
    const localMsg: MeshMessage = {
      id: messageId,
      senderId: identityHook.identity.peerId,
      senderName: identityHook.identity.username,
      recipientId: selectedPeerId,
      type,
      payload: text,
      timestamp,
      hops: 0,
      ttl: 5,
      visitedNodes: [identityHook.identity.peerId],
      priority: type === 'sos' ? 1 : 0
    };
    setMessagesHook.addLocalMessage(localMsg);

    if (type === 'sos') {
      setSosActive(true);
      setTimeout(() => setSosActive(false), 6000);
      playMorseCode(text);
    }
  }, [identityHook.identity, selectedPeerId, peerTrustStates, addLog]);

  const handleSendFile = useCallback((file: File) => {
    if (selectedPeerId === 'broadcast') return;
    webrtcHook.webrtcSendFile(selectedPeerId, file, (fileMsg) => {
      setMessagesHook.addLocalMessage(fileMsg);
      if (window.api) window.api.webrtcReceived(fileMsg);
    });
  }, [selectedPeerId, webrtcHook]);

  const showVerificationModal = async (targetId: string) => {
    const peer = peersHook.peers.find(p => p.id === targetId);
    if (!peer || !window.api) return;

    const finger = await window.api.getPeerFingerprint(targetId);
    if (finger) {
      setVerificationPeer({
        id: targetId,
        displayName: peer.displayName,
        fingerprint: finger.fingerprint,
        trusted: finger.trusted
      });
    }
  };

  const handleTrustPeer = () => {
    if (!verificationPeer) return;
    peersHook.trustFingerprint(verificationPeer.id, verificationPeer.fingerprint, verificationPeer.displayName);
    setPeerTrustStates(prev => ({
      ...prev,
      [verificationPeer.id]: { ...prev[verificationPeer.id], trusted: true }
    }));
    setVerificationPeer(null);
  };

  const showPrompt = identityHook.identity && !identityHook.identity.username;

  return (
    <div className="flex flex-col h-screen" style={{ position: 'relative' }}>
      
      {}
      {sosActive && <div className="sos-ring-overlay" />}

      {}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <FaultyTerminal
          scale={1.2}
          gridMul={[2, 1.5]}
          digitSize={1.4}
          timeScale={0.35}
          pause={false}
          scanlineIntensity={0.18}
          glitchAmount={0.08}
          flickerAmount={0.03}
          noiseAmp={0.01}
          chromaticAberration={0.8}
          curvature={0.15}
          tint="#4A9B6E"
          mouseReact={true}
          mouseStrength={0.3}
          pageLoadAnimation={true}
          brightness={0.85}
        />
        {}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 1, mixBlendMode: 'normal', pointerEvents: 'none' }}>
          <AsciiArt className="h-full w-full" />
        </div>
      </div>

      {}
      <div className="title-bar">
        <div className="title-bar-identity">
          <Shield className="w-4 h-4 text-amber-sos" />
          <span className="title-bar-logo">SIGNUM</span>
          {identityHook.identity && (
            <span className="text-[10px] text-fog font-mono ml-3 hidden xl:block">
              NODE: {identityHook.identity.peerId} · {identityHook.identity.username || 'ANON'}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {peersHook.isOffline && (
            <div className="flex items-center gap-1.5 text-[10px] text-caution-red font-mono px-2 py-0.5 border border-caution-red/30 rounded bg-caution-red/10">
              <WifiOff className="w-3 h-3" />
              SIMULATED OFFLINE
            </div>
          )}

          <div className="title-bar-controls">
            <button
              onClick={() => setShowSettings(true)}
              className="title-bar-btn"
              title="Open Configurations"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => peersHook.toggleOffline(!peersHook.isOffline)}
              className={`title-bar-btn ${peersHook.isOffline ? 'text-caution-red' : 'text-steady-green'}`}
              title={peersHook.isOffline ? 'Connect to Mesh' : 'Go Offline (Simulate)'}
            >
              {peersHook.isOffline ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
            </button>

            {}
            <div className="w-px h-4 bg-slate-light mx-1" />

            {}
            <button onClick={() => window.api?.minimizeWindow()} className="win-btn" title="Minimize">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => window.api?.maximizeWindow()} className="win-btn" title="Maximize / Restore">
              <Square className="w-3 h-3" />
            </button>
            <button onClick={() => window.api?.closeWindow()} className="win-btn win-close" title="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {}
      <div className="app-container">

        {}
        <div className="panel">
          <div className="panel-header">
            <span>MESH PARTICIPANTS</span>
            <Radio className="w-4 h-4 text-fog" />
          </div>
          <div className="panel-content flex flex-col gap-3">
            <PeerList
              peers={peersHook.peers}
              selectedPeerId={selectedPeerId}
              setSelectedPeerId={setSelectedPeerId}
              onVerifyFingerprint={showVerificationModal}
              peerTrustStates={peerTrustStates}
              createManualOffer={webrtcHook.createManualOffer}
              acceptManualOffer={webrtcHook.acceptManualOffer}
              completeManualConnection={webrtcHook.completeManualConnection}
              getHandshakeData={cryptoHook.getHandshakeData}
            />
            <div className="border-t border-slate-light pt-3 mt-1">
              <h4 className="text-[10px] font-semibold text-fog mb-2 uppercase tracking-wider">
                Safety Status Board
              </h4>
              <StatusBoard statuses={setMessagesHook.statuses} onCheckIn={setMessagesHook.updateStatus} />
            </div>
          </div>
        </div>

        {}
        <div className="panel">
          <div className="panel-header">
            <span>
              {selectedPeerId === 'broadcast'
                ? 'BROADCAST & SOS NET'
                : `SECURE CHANNEL · ${peersHook.peers.find(p => p.id === selectedPeerId)?.displayName || selectedPeerId}`
              }
            </span>
            <MessageSquare className="w-4 h-4 text-fog" />
          </div>
          <div className="flex-1 flex flex-col min-h-0 p-0">
            <ChatPanel
              messages={setMessagesHook.messages.filter(m =>
                selectedPeerId === 'broadcast'
                  ? m.recipientId === 'broadcast'
                  : (m.senderId === selectedPeerId && m.recipientId === identityHook.identity?.peerId) ||
                    (m.senderId === identityHook.identity?.peerId && m.recipientId === selectedPeerId)
              )}
              recipientId={selectedPeerId}
              onSendMessage={handleSendMessage}
              onSendFile={handleSendFile}
              ourPeerId={identityHook.identity?.peerId || ''}
            />
          </div>
        </div>

        {/* RIGHT: Topology Graph + Debug Log */}
        <div className="panel">
          <div className="panel-header">
            <span>LIVE TOPOLOGY</span>
            <Activity className="w-4 h-4 text-fog" />
          </div>
          <div className="flex-1 min-h-0" style={{ height: '60%', maxHeight: '60%' }}>
            <MeshGraph peers={peersHook.peers} ourId={identityHook.identity?.peerId || ''} messages={setMessagesHook.messages} />
          </div>
          <div className="flex flex-col overflow-hidden border-t border-slate-light" style={{ height: '40%' }}>
            <div className="panel-header py-1 text-[10px]">
              <span>DEBUG / ROUTING LOG</span>
            </div>
            <div className="flex-1 p-3 bg-slate-base/30 min-h-0 overflow-hidden">
              <DebugPanel logs={setMessagesHook.debugLogs} />
            </div>
          </div>
        </div>

      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${peersHook.isOffline ? 'bg-caution-red' : 'bg-steady-green'} animate-pulse`} />
          {peersHook.isOffline ? 'OFFLINE MODE' : 'FILE CONNECTION ACTIVE'}
        </span>
        {identityHook.identity && (
          <span className="font-mono text-[10px]">
            PEER ID: {identityHook.identity.peerId} · CONNECTED PEERS: {peersHook.peers.filter(p => p.status === 'connected').length}
          </span>
        )}
      </div>

      {}
      {showPrompt && (
        <UsernamePrompt
          onSave={(name) => identityHook.setUsername(name)}
        />
      )}

      {}
      {verificationPeer && (
        <VerificationModal
          peerId={verificationPeer.id}
          displayName={verificationPeer.displayName}
          fingerprint={verificationPeer.fingerprint}
          isTrusted={verificationPeer.trusted}
          onClose={() => setVerificationPeer(null)}
          onTrust={handleTrustPeer}
        />
      )}

      {}
      {showSettings && (
        <SettingsPanel
          currentUsername={identityHook.identity?.username || ''}
          ourFingerprint={identityHook.fingerprint}
          onSaveUsername={(name) => identityHook.setUsername(name)}
          onExportIdentity={identityHook.exportBackup}
          onImportIdentity={identityHook.importBackup}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

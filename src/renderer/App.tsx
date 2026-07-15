import React, { useState, useEffect } from 'react';
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

import { useIdentity } from './hooks/useIdentity';
import { usePeers } from './hooks/usePeers';
import { useCrypto } from './hooks/useCrypto';
import { useMessages } from './hooks/useMessages';
import { useWebRTC } from './hooks/useWebRTC';
import { MeshMessage } from '../shared/ipc-types';

// Synthesize S-O-S in Morse Code using Web Audio API
function playSosBeeps() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    
    const playBeep = (freq: number, duration: number, delay: number) => {
      const osc = context.createOscillator();
      const gainNode = context.createGain();
      osc.connect(gainNode);
      gainNode.connect(context.destination);
      osc.frequency.setValueAtTime(freq, context.currentTime + delay);
      gainNode.gain.setValueAtTime(0.3, context.currentTime + delay);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + delay + duration);
      osc.start(context.currentTime + delay);
      osc.stop(context.currentTime + delay + duration);
    };

    const shortDur = 0.12;
    const longDur  = 0.35;
    const gap      = 0.15;
    let t = 0;
    for (let i = 0; i < 3; i++) { playBeep(880, shortDur, t); t += shortDur + gap; }
    t += gap;
    for (let i = 0; i < 3; i++) { playBeep(880, longDur,  t); t += longDur  + gap; }
    t += gap;
    for (let i = 0; i < 3; i++) { playBeep(880, shortDur, t); t += shortDur + gap; }
  } catch (e) {
    console.error('AudioContext synth error:', e);
  }
}

export default function App() {
  const [selectedPeerId, setSelectedPeerId] = useState<string | 'broadcast'>('broadcast');
  const [sosActive, setSosActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [verificationPeer, setVerificationPeer] = useState<any | null>(null);
  const [peerTrustStates, setPeerTrustStates] = useState<Record<string, { fingerprint: string; trusted: boolean }>>({});

  // 1. Logs & Console states
  const addLog = (category: string, message: string) => {
    setMessagesHook.setDebugLogs(prev => [
      { timestamp: Date.now(), level: 'info', category, message },
      ...prev
    ].slice(0, 200));
  };

  // 2. Load Identity & Key Hooks
  const identityHook = useIdentity();
  const peersHook = usePeers();
  const cryptoHook = useCrypto(addLog);

  const setMessagesHook = useMessages(
    identityHook.identity?.peerId || '',
    identityHook.identity?.username || '',
    addLog,
    playSosBeeps,
    setSosActive,
    cryptoHook.decryptPayload
  );

  // 3. WebRTC Manager Hook
  const webrtcHook = useWebRTC({
    peerId: identityHook.identity?.peerId || '',
    displayName: identityHook.identity?.username || '',
    addLog,
    onHandshakeReceived: async (targetId, publicKeyJwk) => {
      await cryptoHook.processHandshake(targetId, publicKeyJwk);
      // Auto-fetch and trust check peer fingerprint
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
      if (window.api) window.api.webrtcReceived({ message: encryptedMsg });
    },
    onFileReceived: (fileMsg) => {
      if (window.api) window.api.webrtcReceived({ message: fileMsg });
    }
  });

  // 4. WebRTC Connection State Machine loop
  useEffect(() => {
    if (!identityHook.identity || peersHook.isOffline) return;

    peersHook.peers.forEach(async (peer) => {
      if (peer.status === 'searching') {
        if (identityHook.identity && identityHook.identity.peerId < peer.id) {
          addLog('WebRTC', `Initiating connection to ${peer.displayName}`);
          webrtcHook.initiateWebRTCConnection(peer, cryptoHook.getHandshakeData);
        }
      } else if (peer.status === 'offline') {
        webrtcHook.cleanupPeerConnection(peer.id);
      }
    });
  }, [peersHook.peers, identityHook.identity, peersHook.isOffline]);

  // 5. Handle incoming signaling messages forwarded from Main process
  useEffect(() => {
    if (!window.api) return;

    const unsubMsg = window.api.onMessageReceived(async (msg) => {
      if (msg.type === 'signal') {
        const payload = JSON.parse(msg.payload);
        webrtcHook.handleIncomingSignal(payload, cryptoHook.getHandshakeData);
      } else if (msg.type === 'signal-manual-initiate') {
        const payload = JSON.parse(msg.payload);
        webrtcHook.initiateWebRTCConnection({
          id: payload.tempId,
          displayName: `Peer @ ${payload.address}`,
          address: payload.address,
          port: payload.port
        }, cryptoHook.getHandshakeData);
      }
    });

    const unsubSend = window.api.onWebrtcSend(({ peerId, message }) => {
      webrtcHook.webrtcSendPacket(peerId, message, cryptoHook.encryptPayload);
    });

    return () => {
      unsubMsg();
      unsubSend();
    };
  }, [identityHook.identity, webrtcHook, cryptoHook]);

  const handleSendMessage = (text: string, type: 'text' | 'sos' = 'text') => {
    if (!identityHook.identity) return;
    
    // Check E2E verification warn if destination is not trusted direct peer
    if (selectedPeerId !== 'broadcast') {
      const trust = peerTrustStates[selectedPeerId];
      if (trust && !trust.trusted) {
        addLog('Security', `Warning: Sending encrypted message to unverified peer ${selectedPeerId}`);
      }
    }

    if (window.api) {
      window.api.sendMessage(selectedPeerId, type, text);
    }
    
    const localMsg: MeshMessage = {
      id: crypto.randomUUID(),
      senderId: identityHook.identity.peerId,
      senderName: identityHook.identity.username,
      recipientId: selectedPeerId,
      type,
      payload: text,
      timestamp: Date.now(),
      hops: 0,
      ttl: 5,
      visitedNodes: [identityHook.identity.peerId],
      priority: type === 'sos' ? 1 : 0
    };
    setMessagesHook.addLocalMessage(localMsg);

    if (type === 'sos') {
      setSosActive(true);
      setTimeout(() => setSosActive(false), 6000);
      playSosBeeps();
    }
  };

  const handleSendFile = (file: File) => {
    if (selectedPeerId === 'broadcast') return;
    webrtcHook.webrtcSendFile(selectedPeerId, file, (fileMsg) => {
      setMessagesHook.addLocalMessage(fileMsg);
      if (window.api) window.api.webrtcReceived({ message: fileMsg });
    });
  };

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
      
      {/* SOS ring overlay */}
      {sosActive && <div className="sos-ring-overlay" />}

      {/* Faulty Terminal WebGL background */}
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
      </div>

      {/* Title Bar */}
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

            {/* Separator */}
            <div className="w-px h-4 bg-slate-light mx-1" />

            {/* Window controls */}
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

      {/* Main 3-column layout */}
      <div className="app-container">

        {/* LEFT: Peer List & Status Board */}
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
            />
            <div className="border-t border-slate-light pt-3 mt-1">
              <h4 className="text-[10px] font-semibold text-fog mb-2 uppercase tracking-wider">
                Safety Status Board
              </h4>
              <StatusBoard statuses={setMessagesHook.statuses} onCheckIn={setMessagesHook.updateStatus} />
            </div>
          </div>
        </div>

        {/* CENTER: Chat */}
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
            <div className="flex-1 overflow-y-auto p-3 bg-slate-base/30 min-h-0">
              <DebugPanel logs={setMessagesHook.debugLogs} />
            </div>
          </div>
        </div>

      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${peersHook.isOffline ? 'bg-caution-red' : 'bg-steady-green'} animate-pulse`} />
          {peersHook.isOffline ? 'MESH DISCONNECTED' : 'ACTIVE MESH DISCOVERY'}
        </span>
        {identityHook.identity && (
          <span className="font-mono text-[10px]">
            {identityHook.identity.address}:{identityHook.identity.port} · PEERS: {peersHook.peers.filter(p => p.status === 'connected').length}
          </span>
        )}
      </div>

      {/* Username Prompt Overlay */}
      {showPrompt && (
        <UsernamePrompt
          onSave={(name) => identityHook.setUsername(name)}
        />
      )}

      {/* Verification Modal */}
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

      {/* Settings Modal */}
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

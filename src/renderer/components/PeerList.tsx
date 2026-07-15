import React, { useState } from 'react';
import { 
  Radio, 
  Plus, 
  SignalHigh, 
  Signal, 
  HelpCircle, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

interface PeerListProps {
  peers: any[];
  selectedPeerId: string | 'broadcast';
  setSelectedPeerId: (id: string | 'broadcast') => void;
  onVerifyFingerprint: (id: string) => void;
  peerTrustStates: Record<string, { fingerprint: string; trusted: boolean }>;
}

export default function PeerList({ 
  peers, 
  selectedPeerId, 
  setSelectedPeerId,
  onVerifyFingerprint,
  peerTrustStates
}: PeerListProps) {
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('50001');
  const [showManualForm, setShowManualForm] = useState(false);

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIp.trim()) return;
    window.api.manualConnect(manualIp.trim(), parseInt(manualPort));
    setManualIp('');
    setShowManualForm(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <SignalHigh className="w-3.5 h-3.5 text-steady-green flex-shrink-0" />;
      case 'relaying':  return <Signal      className="w-3.5 h-3.5 text-relay-blue flex-shrink-0" />;
      case 'searching': return <HelpCircle  className="w-3.5 h-3.5 text-fog animate-pulse flex-shrink-0" />;
      default:          return <AlertCircle className="w-3.5 h-3.5 text-caution-red flex-shrink-0" />;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Broadcast Option */}
      <div
        onClick={() => setSelectedPeerId('broadcast')}
        className={`broadcast-card ${selectedPeerId === 'broadcast' ? 'selected' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Radio className="w-4 h-4 text-amber-sos flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-xs text-snow">ALL PEERS (BROADCAST)</div>
            <div className="text-[10px] text-fog font-mono">Floods network · SOS Net</div>
          </div>
        </div>
        <span className="badge-status status-online flex-shrink-0">ALL</span>
      </div>

      {/* Section header */}
      <div className="flex justify-between items-center px-1 mt-1">
        <span className="text-[10px] font-semibold text-fog uppercase tracking-wider">
          Nearby Devices ({peers.length})
        </span>
        <button
          onClick={() => setShowManualForm(!showManualForm)}
          className="text-[10px] text-relay-blue hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
        >
          <Plus className="w-3 h-3" />
          MANUAL
          {showManualForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Manual Connection Form */}
      {showManualForm && (
        <form
          onSubmit={handleManualConnect}
          className="flex flex-col gap-2 p-2.5 bg-slate-base/50 rounded-lg border border-slate-light/50"
        >
          <div className="text-[10px] text-fog font-mono">Direct IP connection:</div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="192.168.x.x"
              value={manualIp}
              onChange={e => setManualIp(e.target.value)}
              className="input text-xs py-1.5 px-2"
              style={{ flex: 2 }}
              required
            />
            <input
              type="number"
              placeholder="Port"
              value={manualPort}
              onChange={e => setManualPort(e.target.value)}
              className="input text-xs py-1.5 px-2"
              style={{ flex: 1, minWidth: 0 }}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary py-1.5 text-xs">
            Connect
          </button>
        </form>
      )}

      {/* Peer List */}
      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '280px' }}>
        {peers.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-fog font-mono flex flex-col items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-fog/40 border-t-fog animate-spin" />
            Scanning for nearby devices...
          </div>
        ) : (
          peers.map(peer => {
            const trust = peerTrustStates[peer.id];
            const isConnected = peer.status === 'connected';

            return (
              <div
                key={peer.id}
                onClick={() => setSelectedPeerId(peer.id)}
                className={`peer-card ${selectedPeerId === peer.id ? 'selected' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getStatusIcon(peer.status)}
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-snow truncate max-w-[110px]">
                      {peer.displayName}
                    </div>
                    <div className="text-[9px] text-fog font-mono truncate">
                      {peer.id.substring(0, 8)} · {peer.address}
                    </div>
                  </div>
                </div>

                {/* Fingerprint verification status shield icon */}
                {isConnected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerifyFingerprint(peer.id);
                    }}
                    className="opacity-70 hover:opacity-100 transition-opacity p-0.5"
                    title={trust?.trusted ? "Identity Verified" : "Identity Unverified — Compare fingerprints"}
                  >
                    {trust?.trusted ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-steady-green flex-shrink-0" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-sos flex-shrink-0" />
                    )}
                  </button>
                )}

                <span className={`badge-status status-${peer.status} flex-shrink-0 ml-1`}>
                  {peer.status === 'connected' ? 'ON'
                    : peer.status === 'relaying' ? 'REL'
                    : peer.status === 'searching' ? '...'
                    : 'OFF'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

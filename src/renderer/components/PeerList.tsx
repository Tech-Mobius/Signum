import React, { useState } from 'react';
import { Radio, Users, Plus, Signal, SignalHigh, HelpCircle, AlertCircle } from 'lucide-react';

interface PeerListProps {
  peers: any[];
  selectedPeerId: string | 'broadcast';
  setSelectedPeerId: (id: string | 'broadcast') => void;
}

export default function PeerList({ peers, selectedPeerId, setSelectedPeerId }: PeerListProps) {
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('50001');
  const [showManualForm, setShowManualForm] = useState(false);

  const handleManualConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIp) return;
    
    // Call manual connect API
    window.api.manualConnect(manualIp, parseInt(manualPort));
    setManualIp('');
    setShowManualForm(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <SignalHigh className="w-4 h-4 text-steady-green" />;
      case 'relaying':
        return <Signal className="w-4 h-4 text-relay-blue" />;
      case 'searching':
        return <HelpCircle className="w-4 h-4 text-fog animate-pulse" />;
      default:
        return <AlertCircle className="w-4 h-4 text-caution-red" />;
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Broadcast Option */}
      <div 
        onClick={() => setSelectedPeerId('broadcast')}
        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
          selectedPeerId === 'broadcast' 
            ? 'bg-slate-light border-fog' 
            : 'bg-slate-base/50 border-transparent hover:border-slate-light'
        }`}
      >
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-amber-sos" />
          <div>
            <div className="font-semibold text-sm">ALL PEERS (BROADCAST)</div>
            <div className="text-xs text-fog">Floods network, SOS Net</div>
          </div>
        </div>
        <span className="badge-status status-online">ALL</span>
      </div>

      <div className="flex justify-between items-center mt-2 px-1">
        <span className="text-xs font-semibold text-fog uppercase tracking-wider">Nearby Devices</span>
        <button 
          onClick={() => setShowManualForm(!showManualForm)}
          className="text-xs text-relay-blue hover:text-white flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> MANUAL IP
        </button>
      </div>

      {/* Manual Connection Input Form */}
      {showManualForm && (
        <form onSubmit={handleManualConnect} className="flex flex-col gap-2 p-3 bg-slate-base/50 rounded-lg border border-slate-light">
          <div className="text-xs text-fog mb-1 font-mono">Connect manual target:</div>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="e.g. 192.168.1.15" 
              value={manualIp} 
              onChange={e => setManualIp(e.target.value)}
              className="input flex-1 py-1 px-2 text-xs"
              required 
            />
            <input 
              type="number" 
              placeholder="Port" 
              value={manualPort} 
              onChange={e => setManualPort(e.target.value)}
              className="input w-20 py-1 px-2 text-xs"
              required 
            />
          </div>
          <button type="submit" className="btn btn-primary py-1 text-xs">
            Connect
          </button>
        </form>
      )}

      {/* Peer List */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {peers.length === 0 ? (
          <div className="text-center py-8 text-xs text-fog font-mono flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-fog"></div>
            Searching for nearby devices...
          </div>
        ) : (
          peers.map(peer => (
            <div 
              key={peer.id}
              onClick={() => setSelectedPeerId(peer.id)}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
                selectedPeerId === peer.id 
                  ? 'bg-slate-light border-fog' 
                  : 'bg-slate-base/30 border-transparent hover:border-slate-light'
              }`}
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(peer.status)}
                <div>
                  <div className="font-semibold text-sm truncate max-w-[120px]">
                    {peer.displayName}
                  </div>
                  <div className="text-[10px] text-fog font-mono">
                    ID: {peer.id} • {peer.address}
                  </div>
                </div>
              </div>
              <span className={`badge-status status-${peer.status}`}>
                {peer.status.toUpperCase()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Heart, MapPin, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';

interface StatusBoardProps {
  statuses: any[];
  onCheckIn: (status: 'safe' | 'need-help' | 'unknown', location?: string) => void;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5000) return 'Just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function StatusBoard({ statuses, onCheckIn }: StatusBoardProps) {
  const [myStatus, setMyStatus] = useState<'safe' | 'need-help'>('safe');
  const [myLocation, setMyLocation] = useState('');
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(prev => prev + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    onCheckIn(myStatus, myLocation || undefined);
    setMyLocation('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return (
          <span className="flex items-center gap-1 text-[10px] text-steady-green font-semibold bg-steady-green/10 px-1.5 py-0.5 rounded border border-steady-green/20 flex-shrink-0">
            <CheckCircle className="w-3 h-3" /> SAFE
          </span>
        );
      case 'need-help':
        return (
          <span className="flex items-center gap-1 text-[10px] text-amber-sos font-semibold bg-amber-sos/10 px-1.5 py-0.5 rounded border border-amber-sos/20 flex-shrink-0 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> HELP
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] text-fog bg-slate-light/50 px-1.5 py-0.5 rounded flex-shrink-0">
            <HelpCircle className="w-3 h-3" /> UNK
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {}
      <form
        onSubmit={handleCheckIn}
        className="flex flex-col gap-2 p-2.5 bg-slate-base/40 rounded-lg border border-slate-light/50 transition-all hover:border-slate-light"
      >
        <div className="text-[10px] text-fog font-semibold uppercase tracking-wider">My Status</div>
        <select
          value={myStatus}
          onChange={e => setMyStatus(e.target.value as any)}
          className="input py-1.5 px-2 text-xs"
        >
          <option value="safe">✓ I'm Safe</option>
          <option value="need-help">⚠ Need Assistance</option>
        </select>
        <input
          type="text"
          placeholder="Location (e.g. Room 4B, Building C)"
          value={myLocation}
          onChange={e => setMyLocation(e.target.value)}
          className="input py-1.5 px-2 text-xs"
        />
        <button type="submit" className="btn btn-primary py-1.5 text-xs flex items-center justify-center gap-1.5">
          <Heart className="w-3 h-3" /> Check-in
        </button>
      </form>

      {}
      <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
        {statuses.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-fog/60 font-mono italic">
            No check-ins synced yet.
          </div>
        ) : (
          statuses.map((item) => (
            <div key={item.peer_id} className="status-item flex flex-col gap-0.5">
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-xs text-snow truncate">{item.display_name}</span>
                {getStatusBadge(item.status)}
              </div>
              <div className="flex justify-between items-center text-[9px] text-fog font-mono">
                <span className="flex items-center gap-0.5 truncate max-w-[160px]">
                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                  {item.location || 'Not specified'}
                </span>
                <span className="flex-shrink-0">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

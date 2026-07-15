import React, { useState } from 'react';
import { Heart, MapPin, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';

interface StatusBoardProps {
  statuses: any[];
  onCheckIn: (status: 'safe' | 'need-help' | 'unknown', location?: string) => void;
}

export default function StatusBoard({ statuses, onCheckIn }: StatusBoardProps) {
  const [myStatus, setMyStatus] = useState<'safe' | 'need-help'>('safe');
  const [myLocation, setMyLocation] = useState('');

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
          <span className="flex items-center gap-1 text-[10px] text-amber-sos font-semibold bg-amber-sos/10 px-1.5 py-0.5 rounded border border-amber-sos/20 flex-shrink-0">
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
      {/* Own Status check-in form */}
      <form
        onSubmit={handleCheckIn}
        className="flex flex-col gap-2 p-2.5 bg-slate-base/40 rounded-lg border border-slate-light/50"
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

      {/* Status list */}
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
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

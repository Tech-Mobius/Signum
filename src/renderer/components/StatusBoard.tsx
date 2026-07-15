import React, { useState } from 'react';
import { Heart, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';

interface StatusBoardProps {
  statuses: any[];
}

export default function StatusBoard({ statuses }: StatusBoardProps) {
  const [myStatus, setMyStatus] = useState<'safe' | 'need-help'>('safe');
  const [myLocation, setMyLocation] = useState('');

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    window.api.updateStatus(myStatus, myLocation);
    // Location clear or keep
    setMyLocation('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'safe':
        return (
          <span className="flex items-center gap-1 text-xs text-steady-green font-semibold bg-steady-green/10 px-2 py-0.5 rounded border border-steady-green/20">
            <CheckCircle className="w-3.5 h-3.5" /> SAFE
          </span>
        );
      case 'need-help':
        return (
          <span className="flex items-center gap-1 text-xs text-amber-sos font-semibold bg-amber-sos/10 px-2 py-0.5 rounded border border-amber-sos/20">
            <AlertTriangle className="w-3.5 h-3.5" /> NEED HELP
          </span>
        );
      default:
        return (
          <span className="text-xs text-fog bg-slate-light px-2 py-0.5 rounded">
            UNKNOWN
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Own Status check-in form */}
      <form onSubmit={handleCheckIn} className="flex flex-col gap-2 p-2 bg-slate-base/30 rounded border border-slate-light">
        <div className="text-[10px] text-fog font-semibold uppercase tracking-wider">Update my status</div>
        <div className="flex gap-2">
          <select 
            value={myStatus} 
            onChange={e => setMyStatus(e.target.value as any)}
            className="input py-1 px-2 text-xs flex-1"
          >
            <option value="safe">I'm Safe</option>
            <option value="need-help">Need Assistance</option>
          </select>
          <input 
            type="text" 
            placeholder="Location (e.g. Room 4B)" 
            value={myLocation} 
            onChange={e => setMyLocation(e.target.value)}
            className="input py-1 px-2 text-xs flex-[2]"
          />
        </div>
        <button type="submit" className="btn btn-primary py-1 text-xs w-full flex items-center justify-center gap-1">
          <Heart className="w-3.5 h-3.5" /> Check-in Status
        </button>
      </form>

      {/* Board status items list */}
      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
        {statuses.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-fog font-mono">
            No check-in reports synced yet.
          </div>
        ) : (
          statuses.map((item) => (
            <div key={item.peer_id} className="status-item flex flex-col gap-1 border-b border-slate-light/30 pb-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-xs text-snow">{item.display_name}</span>
                {getStatusBadge(item.status)}
              </div>
              <div className="flex justify-between items-center text-[10px] text-fog font-mono">
                <span className="flex items-center gap-0.5 truncate max-w-[150px]">
                  <MapPin className="w-3 h-3 text-fog" /> {item.location || 'Not Specified'}
                </span>
                <span>{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

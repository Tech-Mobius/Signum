import React, { useState } from 'react';
import { Shield, ArrowRight } from 'lucide-react';

interface UsernamePromptProps {
  onSave: (username: string) => void;
}

export default function UsernamePrompt({ onSave }: UsernamePromptProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content text-center">
        <div className="flex justify-center mb-2">
          <Shield className="w-12 h-12 text-amber-sos animate-pulse" />
        </div>
        
        <h2 className="text-lg font-bold text-snow">INITIALIZE DEVICE IDENTITY</h2>
        <p className="text-xs text-fog max-w-[320px] mx-auto leading-relaxed">
          Welcome to the Signal mesh network. Please choose a callsign or name to identify your device on the local emergency grid.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-2">
          <input 
            type="text" 
            placeholder="Enter callsign (e.g. Alice, Base-Alpha)" 
            value={name} 
            onChange={e => setName(e.target.value)}
            className="input w-full text-center text-sm py-2"
            maxLength={18}
            autoFocus
            required 
          />
          <button type="submit" className="btn btn-primary py-2 font-semibold flex items-center justify-center gap-1.5">
            Join Emergency Mesh <ArrowRight className="w-4 h-4" />
          </button>
        </form>
        
        <div className="text-[9px] font-mono text-fog mt-2">
          Offline P2P protocol • No internet connection required
        </div>
      </div>
    </div>
  );
}

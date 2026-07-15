import React, { useState } from 'react';
import { Shield, ArrowRight } from 'lucide-react';

interface UsernamePromptProps {
  onSave: (username: string) => void;
}

export default function UsernamePrompt({ onSave }: UsernamePromptProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a callsign.');
      return;
    }
    if (trimmed.length < 2) {
      setError('Callsign must be at least 2 characters.');
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content text-center">
        <div className="flex justify-center mb-1">
          <div className="w-14 h-14 rounded-full bg-amber-sos/10 border border-amber-sos/30 flex items-center justify-center">
            <Shield className="w-7 h-7 text-amber-sos animate-pulse" />
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-snow uppercase tracking-widest">Initialize Node Identity</h2>
          <p className="text-[11px] text-fog leading-relaxed mt-1 max-w-[300px] mx-auto">
            Welcome to the Signum mesh network. Choose a callsign to identify your node on the local emergency grid.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1">
          <input
            type="text"
            placeholder="Callsign (e.g. Alpha, Base-7, Alice)"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            className="input text-center text-sm py-2.5"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            maxLength={20}
            autoFocus
            required
          />
          {error && (
            <div className="text-[11px] text-caution-red font-mono">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary py-2.5 font-semibold flex items-center justify-center gap-2"
          >
            Join Emergency Mesh <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-[9px] font-mono text-fog/50 mt-2">
          Offline P2P · No internet required · E2E Encrypted
        </div>
      </div>
    </div>
  );
}

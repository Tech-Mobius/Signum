import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { X, ShieldAlert, Key, Globe, Copy, Check } from 'lucide-react';

interface SettingsPanelProps {
  currentUsername: string;
  ourFingerprint: string;
  onSaveUsername: (name: string) => void;
  onExportIdentity: (passphrase: string) => Promise<string>;
  onImportIdentity: (backupData: string, passphrase: string) => Promise<string>;
  onClose: () => void;
}

export default function SettingsPanel({
  currentUsername,
  ourFingerprint,
  onSaveUsername,
  onExportIdentity,
  onImportIdentity,
  onClose
}: SettingsPanelProps) {
  const [username, setUsername] = useState(currentUsername);
  const [turnHost, setTurnHost] = useState('');
  const [turnPort, setTurnPort] = useState('443');
  const [turnUser, setTurnUser] = useState('');
  const [turnCred, setTurnCred] = useState('');
  
  // Backup / Export
  const [exportPass, setExportPass] = useState('');
  const [exportString, setExportString] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Restore / Import
  const [importString, setImportString] = useState('');
  const [importPass, setImportPass] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  // Load existing TURN config
  useEffect(() => {
    if (!window.api) return;
    window.api.getTurnConfig().then((config: any) => {
      setTurnHost(config.hostname);
      setTurnPort(config.port.toString());
      setTurnUser(config.username);
      setTurnCred(config.credential);
    });
  }, []);

  // Generate QR Code when export string changes
  useEffect(() => {
    if (exportString && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, exportString, { width: 180, margin: 2 }, (err: any) => {
        if (err) console.error('[Settings] QR code generation failed:', err);
      });
    }
  }, [exportString]);

  const handleSaveUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    onSaveUsername(username.trim());
  };

  const handleSaveTurn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.api) return;
    window.api.setTurnConfig({
      hostname: turnHost.trim(),
      port: parseInt(turnPort),
      username: turnUser.trim(),
      credential: turnCred.trim()
    });
  };

  const handleExportKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportPass) return;
    try {
      const data = await onExportIdentity(exportPass);
      setExportString(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleImportKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importString.trim() || !importPass) return;
    setImportError('');
    setImportSuccess('');
    try {
      const fingerprint = await onImportIdentity(importString.trim(), importPass);
      setImportSuccess(`Identity imported! New fingerprint: ${fingerprint}`);
      setImportString('');
      setImportPass('');
    } catch (err: any) {
      setImportError('Failed to decrypt backup. Check passphrase or data.');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg w-full flex flex-col gap-4 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-light pb-2">
          <h2 className="text-sm font-bold text-snow uppercase tracking-wider">Node Configurations</h2>
          <button onClick={onClose} className="title-bar-btn">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Callsign Setup */}
        <form onSubmit={handleSaveUsername} className="flex flex-col gap-2">
          <div className="text-[10px] text-fog font-semibold uppercase tracking-wider">Callsign Identity</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="input text-xs py-1.5"
              required
            />
            <button type="submit" className="btn btn-primary text-xs py-1.5 px-3">
              Update Name
            </button>
          </div>
          <div className="text-[9px] text-fog font-mono">
            Fingerprint: {ourFingerprint || 'Unknown'}
          </div>
        </form>

        {/* 2. TURN Server Settings */}
        <form onSubmit={handleSaveTurn} className="flex flex-col gap-2 border-t border-slate-light pt-3">
          <div className="flex items-center gap-1 text-[10px] text-fog font-semibold uppercase tracking-wider">
            <Globe className="w-3.5 h-3.5" />
            STUN / TURN Routing (NAT Traversal)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-fog font-mono">TURN Host</span>
              <input
                type="text"
                value={turnHost}
                onChange={e => setTurnHost(e.target.value)}
                placeholder="openrelay.metered.ca"
                className="input text-xs py-1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-fog font-mono">TURN Port</span>
              <input
                type="number"
                value={turnPort}
                onChange={e => setTurnPort(e.target.value)}
                placeholder="443"
                className="input text-xs py-1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-fog font-mono">TURN Username</span>
              <input
                type="text"
                value={turnUser}
                onChange={e => setTurnUser(e.target.value)}
                placeholder="openrelayproject"
                className="input text-xs py-1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-fog font-mono">TURN Password</span>
              <input
                type="password"
                value={turnCred}
                onChange={e => setTurnCred(e.target.value)}
                placeholder="••••••••"
                className="input text-xs py-1"
              />
            </div>
          </div>
          <button type="submit" className="btn text-xs py-1.5 mt-1 self-end px-3">
            Save Server Config
          </button>
        </form>

        {/* 3. Export Identity QR Backup */}
        <div className="flex flex-col gap-2 border-t border-slate-light pt-3">
          <div className="flex items-center gap-1 text-[10px] text-fog font-semibold uppercase tracking-wider">
            <Key className="w-3.5 h-3.5" />
            Backup Identity (QR Export)
          </div>
          {!exportString ? (
            <form onSubmit={handleExportKeys} className="flex gap-2">
              <input
                type="password"
                placeholder="Set backup decryption passphrase"
                value={exportPass}
                onChange={e => setExportPass(e.target.value)}
                className="input text-xs py-1.5"
                required
              />
              <button type="submit" className="btn btn-primary text-xs py-1.5 px-3">
                Generate QR
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-2.5 p-2.5 bg-slate-base/50 rounded-lg border border-slate-light/40">
              <canvas ref={canvasRef} className="bg-white rounded p-1" />
              <div className="flex gap-2 w-full">
                <button
                  onClick={copyToClipboard}
                  className="btn text-xs py-1.5 flex-1 flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-steady-green" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied string!' : 'Copy raw string'}
                </button>
                <button
                  onClick={() => { setExportString(''); setExportPass(''); }}
                  className="btn text-xs py-1.5"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Import Identity Backup */}
        <form onSubmit={handleImportKeys} className="flex flex-col gap-2 border-t border-slate-light pt-3 pb-1">
          <div className="text-[10px] text-fog font-semibold uppercase tracking-wider">Restore / Import Identity</div>
          <textarea
            placeholder="Paste raw identity backup string..."
            value={importString}
            onChange={e => setImportString(e.target.value)}
            className="input text-xs resize-none"
            rows={2}
            required
          />
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Decryption Passphrase"
              value={importPass}
              onChange={e => setImportPass(e.target.value)}
              className="input text-xs py-1.5"
              required
            />
            <button type="submit" className="btn btn-danger text-xs py-1.5 px-3">
              Restore keys
            </button>
          </div>
          {importError && (
            <div className="text-[10px] text-caution-red font-mono">{importError}</div>
          )}
          {importSuccess && (
            <div className="text-[10px] text-steady-green font-mono">{importSuccess}</div>
          )}
        </form>

      </div>
    </div>
  );
}

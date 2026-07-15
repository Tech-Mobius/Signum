import React from 'react';
import { ShieldCheck, ShieldAlert, X } from 'lucide-react';

interface VerificationModalProps {
  peerId: string;
  displayName: string;
  fingerprint: string;
  isTrusted: boolean;
  onClose: () => void;
  onTrust: () => void;
}

export default function VerificationModal({
  peerId,
  displayName,
  fingerprint,
  isTrusted,
  onClose,
  onTrust
}: VerificationModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b border-slate-light pb-2.5">
          <div className="flex items-center gap-2">
            {isTrusted ? (
              <ShieldCheck className="w-5 h-5 text-steady-green" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-sos" />
            )}
            <h3 className="text-sm font-bold text-snow">Identity Verification</h3>
          </div>
          <button onClick={onClose} className="title-bar-btn">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 py-1">
          <div className="text-xs">
            Verify calls for <span className="font-semibold text-snow">{displayName}</span>
          </div>
          
          <div className="bg-slate-base/50 rounded p-3 border border-slate-light/60">
            <div className="text-[10px] text-fog font-mono uppercase tracking-wider mb-1.5">
              Safety Number Fingerprint:
            </div>
            <div className="text-xs font-mono text-snow break-all tracking-wider font-semibold select-text">
              {fingerprint || 'Computing fingerprint...'}
            </div>
          </div>

          <div className="text-[11px] text-fog leading-relaxed">
            {isTrusted ? (
              <span className="text-steady-green">✓ You have manually verified and trusted this peer call sign. Message content is secure.</span>
            ) : (
              <span>To guarantee security and rule out Middleperson (MITM) attacks, compare this safety number with the fingerprint shown on the peer's screen. If they match, click "Trust Identity".</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-light pt-3">
          <button onClick={onClose} className="btn flex-1">
            Close
          </button>
          {!isTrusted && (
            <button
              onClick={() => {
                onTrust();
                onClose();
              }}
              className="btn btn-primary flex-1"
            >
              Trust Identity
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

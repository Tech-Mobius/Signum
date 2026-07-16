import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  SignalHigh, 
  Signal, 
  HelpCircle, 
  AlertCircle, 
  ShieldCheck, 
  ShieldAlert, 
  Download, 
  Upload, 
  Loader2, 
  X,
  Camera,
  QrCode,
  Copy,
  Check,
  Scan
} from 'lucide-react';
import jsQR from 'jsqr';
import AnimatedQRCode from './AnimatedQRCode';

interface PeerListProps {
  peers: any[];
  selectedPeerId: string | 'broadcast';
  setSelectedPeerId: (id: string | 'broadcast') => void;
  onVerifyFingerprint: (id: string) => void;
  peerTrustStates: Record<string, { fingerprint: string; trusted: boolean }>;
  createManualOffer?: (getHandshakeData: () => Promise<string>) => Promise<{ tempId: string; offerString: string }>;
  acceptManualOffer?: (offerString: string, getHandshakeData: () => Promise<string>) => Promise<{ answerString: string; peerId: string; displayName: string }>;
  completeManualConnection?: (tempId: string, answerString: string) => Promise<void>;
  getHandshakeData?: () => Promise<string>;
}

const CameraScanner = ({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const blocksRef = useRef<string[]>([]);
  const totalBlocksRef = useRef<number>(0);
  const [scannedCount, setScannedCount] = useState(0);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error('Webcam access error:', err);
        setError('Could not access camera. Please copy/paste text or use files instead.');
      }
    }
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code) {
          const match = code.data.match(/^(\d+)\|(\d+)\|(.*)$/);
          if (match) {
            const idx = parseInt(match[1]);
            const tot = parseInt(match[2]);
            const data = match[3];

            if (totalBlocksRef.current === 0) {
              totalBlocksRef.current = tot;
              blocksRef.current = new Array(tot).fill('');
            }

            if (tot === totalBlocksRef.current) {
              if (blocksRef.current[idx] === '') {
                blocksRef.current[idx] = data;
                const filled = blocksRef.current.filter(b => b !== '').length;
                setScannedCount(filled);
                
                if (filled === tot) {
                  onScan(blocksRef.current.join(''));
                  blocksRef.current = [];
                  totalBlocksRef.current = 0;
                  return;
                }
              }
            }
          } else {
             onScan(code.data);
             return;
          }
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(scanFrame);
  };

  useEffect(() => {
    if (videoRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    }
  }, [videoRef.current]);

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-mid border border-slate-light rounded-lg">
      <div className="flex justify-between items-center text-xs font-bold text-snow">
        <span className="flex items-center gap-1.5">
          <Scan className="w-3.5 h-3.5 text-steady-green animate-pulse" />
          SCAN PEER'S QR CODE
        </span>
        <button onClick={onClose} className="text-caution-red hover:text-white font-bold text-xs cursor-pointer">CLOSE</button>
      </div>
      {error ? (
        <div className="text-xs text-caution-red text-center py-4">{error}</div>
      ) : (
        <div className="relative flex flex-col gap-2">
          <div className="relative aspect-video rounded overflow-hidden bg-black border border-slate-light">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          {totalBlocksRef.current > 0 && (
            <div className="flex flex-col gap-1 w-full px-1">
              <div className="flex justify-between text-[10px] text-snow font-mono">
                <span>Scanning Animated QR...</span>
                <span>{Math.round((scannedCount / totalBlocksRef.current) * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-base rounded overflow-hidden">
                <div 
                  className="h-full bg-steady-green transition-all duration-200"
                  style={{ width: `${(scannedCount / totalBlocksRef.current) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function PeerList({ 
  peers, 
  selectedPeerId, 
  setSelectedPeerId,
  onVerifyFingerprint,
  peerTrustStates,
  createManualOffer,
  acceptManualOffer,
  completeManualConnection,
  getHandshakeData
}: PeerListProps) {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'invite' | 'join'>('invite');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [offerString, setOfferString] = useState('');
  const [tempId, setTempId] = useState('');
  const [hasGeneratedInvite, setHasGeneratedInvite] = useState(false);
  
  const [answerString, setAnswerString] = useState('');
  const [manualCodeInput, setManualCodeInput] = useState('');
  
  const [showCamera, setShowCamera] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <SignalHigh className="w-3.5 h-3.5 text-steady-green flex-shrink-0 animate-[pulse-glow-green_2s_infinite]" />;
      case 'relaying':  return <Signal      className="w-3.5 h-3.5 text-relay-blue flex-shrink-0 animate-pulse" />;
      case 'searching': return <HelpCircle  className="w-3.5 h-3.5 text-fog animate-pulse flex-shrink-0" />;
      default:          return <AlertCircle className="w-3.5 h-3.5 text-caution-red flex-shrink-0" />;
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleGenerateInvite = async () => {
    if (!createManualOffer || !getHandshakeData) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await createManualOffer(getHandshakeData);
      setTempId(res.tempId);
      setOfferString(res.offerString);
      
      setSuccess('Invite code generated! Share QR, save the invite file, or copy the string.');
      setHasGeneratedInvite(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate invite');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInviteFile = async () => {
    if (!offerString || !window.api?.saveConnectionFile) return;
    try {
      const saved = await window.api.saveConnectionFile('signum_invite.sig', offerString);
      if (saved) {
        setSuccess('Invite file (signum_invite.sig) saved!');
      } else {
        setError('File save cancelled.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save invite file');
    }
  };

  const handleImportAnswerFile = async () => {
    if (!completeManualConnection || !tempId || !window.api?.loadConnectionFile) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const answerContent = await window.api.loadConnectionFile();
      if (!answerContent) {
        setError('No answer file selected.');
        setLoading(false);
        return;
      }
      await completeManualConnection(tempId, answerContent.trim());
      setSuccess('P2P Connection successfully established!');
      setTempId('');
      setHasGeneratedInvite(false);
      setOfferString('');
      setTimeout(() => setShowModal(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to complete connection');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessAnswerCode = async (code: string) => {
    if (!completeManualConnection || !tempId || !code.trim()) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await completeManualConnection(tempId, code.trim());
      setSuccess('P2P Connection successfully established!');
      setTempId('');
      setHasGeneratedInvite(false);
      setOfferString('');
      setManualCodeInput('');
      setTimeout(() => setShowModal(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to complete connection');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessInviteCode = async (code: string) => {
    if (!acceptManualOffer || !getHandshakeData) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await acceptManualOffer(code.trim(), getHandshakeData);
      setAnswerString(res.answerString);
      
      setSuccess(`Invite processed! Share the Answer QR, save the answer file, or copy the string back to ${res.displayName}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to process invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleImportInviteFile = async () => {
    if (!window.api?.loadConnectionFile) return;
    setError(null);
    setSuccess(null);
    try {
      const inviteContent = await window.api.loadConnectionFile();
      if (!inviteContent) {
        setError('No invite file selected.');
        return;
      }
      await handleProcessInviteCode(inviteContent.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to load invite file');
    }
  };

  const handleSaveAnswerFile = async () => {
    if (!answerString || !window.api?.saveConnectionFile) return;
    try {
      const saved = await window.api.saveConnectionFile('signum_answer.sig', answerString);
      if (saved) {
        setSuccess('Answer file (signum_answer.sig) saved!');
      } else {
        setError('File save cancelled.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save answer file');
    }
  };

  const handleCameraScan = (scannedText: string) => {
    setShowCamera(false);
    if (activeTab === 'invite') {
      handleProcessAnswerCode(scannedText);
    } else {
      handleProcessInviteCode(scannedText);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {}
      <div
        onClick={() => setSelectedPeerId('broadcast')}
        className={`broadcast-card transition-all duration-300 transform hover:scale-[1.01] ${selectedPeerId === 'broadcast' ? 'selected' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Radio className="w-4 h-4 text-amber-sos flex-shrink-0 animate-pulse" />
          <div className="min-w-0">
            <div className="font-bold text-xs text-snow tracking-wide">ALL PEERS (BROADCAST)</div>
            <div className="text-[10px] text-fog font-mono">Floods network · SOS Net</div>
          </div>
        </div>
        <span className="badge-status status-online flex-shrink-0">ALL</span>
      </div>

      {}
      <div className="flex justify-between items-center px-1 mt-1">
        <span className="text-[10px] font-bold text-fog uppercase tracking-wider">
          Mesh Members ({peers.length})
        </span>
        <button
          onClick={() => setShowModal(true)}
          className="text-[10px] text-steady-green hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors font-bold uppercase"
        >
          <QrCode className="w-3.5 h-3.5" />
          Offline Connect
        </button>
      </div>

      {}
      <div className="flex flex-col gap-1 overflow-y-auto pr-1" style={{ maxHeight: '280px' }}>
        {peers.length === 0 ? (
          <div className="text-center py-8 text-[10px] text-fog font-mono flex flex-col items-center gap-2 select-none opacity-80">
            <div className="w-4 h-4 rounded-full border-2 border-fog/40 border-t-fog animate-spin" />
            No active connections. Use Offline Connect.
          </div>
        ) : (
          peers.map(peer => {
            const trust = peerTrustStates[peer.id];
            const isConnected = peer.status === 'connected';

            return (
              <div
                key={peer.id}
                onClick={() => setSelectedPeerId(peer.id)}
                className={`peer-card transition-all duration-300 transform hover:scale-[1.01] animate-[slide-in-up_0.2s_ease-out] ${selectedPeerId === peer.id ? 'selected' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getStatusIcon(peer.status)}
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-snow truncate max-w-[110px]">
                      {peer.displayName}
                    </div>
                    <div className="text-[9px] text-fog font-mono truncate">
                      {peer.id.substring(0, 8)}
                    </div>
                  </div>
                </div>

                {isConnected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerifyFingerprint(peer.id);
                    }}
                    className="opacity-70 hover:opacity-100 hover:scale-110 transition-all p-0.5"
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

      {}
      {showModal && (
        <div className="fixed inset-0 bg-slate-base/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-[fade-in_0.2s_ease-out]">
          <div className="bg-slate-mid border border-slate-light w-full max-w-md rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {}
            <div className="flex justify-between items-center p-4 border-b border-slate-light bg-slate-base/50">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-steady-green" />
                <span className="font-bold text-sm text-snow tracking-wide uppercase">Offline Connection Setup</span>
              </div>
              <button 
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                  setSuccess(null);
                  setHasGeneratedInvite(false);
                  setOfferString('');
                  setAnswerString('');
                  setTempId('');
                  setShowCamera(false);
                  setManualCodeInput('');
                }} 
                className="text-fog hover:text-white p-1 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-light">
              <button
                onClick={() => { setActiveTab('invite'); setError(null); setSuccess(null); setShowCamera(false); }}
                className={`flex-1 py-3 text-xs font-bold text-center border-b-2 cursor-pointer transition-all ${activeTab === 'invite' ? 'border-steady-green text-steady-green bg-slate-base/20' : 'border-transparent text-fog hover:text-white'}`}
              >
                1. INVITE FRIEND
              </button>
              <button
                onClick={() => { setActiveTab('join'); setError(null); setSuccess(null); setShowCamera(false); }}
                className={`flex-1 py-3 text-xs font-bold text-center border-b-2 cursor-pointer transition-all ${activeTab === 'join' ? 'border-steady-green text-steady-green bg-slate-base/20' : 'border-transparent text-fog hover:text-white'}`}
              >
                2. JOIN FRIEND
              </button>
            </div>

            {}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0">
              {error && (
                <div className="text-xs text-caution-red bg-caution-red/10 border border-caution-red/20 p-3 rounded flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="text-xs text-steady-green bg-steady-green/10 border border-steady-green/20 p-3 rounded flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {showCamera ? (
                <CameraScanner
                  onScan={handleCameraScan}
                  onClose={() => setShowCamera(false)}
                />
              ) : (
                <>
                  {}
                  {activeTab === 'invite' && (
                    <div className="flex flex-col gap-4">
                      <p className="text-xs text-fog leading-relaxed">
                        Create a direct peer-to-peer connection entirely offline. Generate an Invite, share the QR or `.sig` file, and scan/import your friend's response.
                      </p>

                      {!hasGeneratedInvite ? (
                        <button
                          onClick={handleGenerateInvite}
                          disabled={loading}
                          className="btn btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Generating Invite...
                            </>
                          ) : (
                            <>
                              <QrCode className="w-4 h-4" />
                              Generate Invite Connection
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {offerString && (
                            <div className="p-2.5 bg-white rounded-lg border border-slate-light flex justify-center self-center shadow-lg">
                              <AnimatedQRCode payload={offerString} />
                            </div>
                          )}

                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={handleSaveInviteFile}
                              className="btn btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Save Invite File (.sig)
                            </button>
                            <button
                              onClick={() => handleCopy(offerString)}
                              className="btn btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 border border-slate-light bg-slate-base/30 text-snow hover:bg-slate-light"
                            >
                              {copiedText ? <Check className="w-3.5 h-3.5 text-steady-green" /> : <Copy className="w-3.5 h-3.5" />}
                              Copy Code String
                            </button>
                          </div>

                          <div className="w-full border-t border-slate-light/60 my-1" />

                          <div className="flex flex-col gap-2.5">
                            <span className="text-[10px] font-bold text-snow/60 uppercase">Import Friend's Answer</span>
                            
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowCamera(true)}
                                className="flex-1 btn btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-light bg-slate-base/30 text-snow hover:bg-slate-light cursor-pointer"
                              >
                                <Camera className="w-4 h-4 text-steady-green" />
                                Scan Answer QR
                              </button>
                              <button
                                onClick={handleImportAnswerFile}
                                className="flex-1 btn btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-light bg-slate-base/30 text-snow hover:bg-slate-light cursor-pointer"
                              >
                                <Upload className="w-4 h-4" />
                                Import File (.sig)
                              </button>
                            </div>

                            <textarea
                              placeholder="Or paste answer code string directly here..."
                              value={manualCodeInput}
                              onChange={e => setManualCodeInput(e.target.value)}
                              className="w-full h-16 bg-slate-base text-[10px] font-mono text-snow p-2 rounded border border-slate-light resize-none input"
                            />
                            {manualCodeInput.trim() && (
                              <button
                                onClick={() => handleProcessAnswerCode(manualCodeInput)}
                                className="btn btn-primary py-2 text-xs font-semibold cursor-pointer"
                              >
                                Process Answer Code
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {}
                  {activeTab === 'join' && (
                    <div className="flex flex-col gap-4">
                      <p className="text-xs text-fog leading-relaxed">
                        Join a friend's connection. Load their invite using their QR, `.sig` file, or raw code, then save and share your generated Answer.
                      </p>

                      {!answerString ? (
                        <div className="flex flex-col gap-3">
                          <span className="text-[10px] font-bold text-snow/60 uppercase">Step 1: Load Friend's Invite</span>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowCamera(true)}
                              className="flex-1 btn btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-light bg-slate-base/30 text-snow hover:bg-slate-light cursor-pointer"
                            >
                              <Camera className="w-4 h-4 text-steady-green" />
                              Scan Invite QR
                            </button>
                            <button
                              onClick={handleImportInviteFile}
                              className="flex-1 btn btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-light bg-slate-base/30 text-snow hover:bg-slate-light cursor-pointer"
                            >
                              <Upload className="w-4 h-4" />
                              Import File (.sig)
                            </button>
                          </div>

                          <textarea
                            placeholder="Or paste friend's invite code string directly here..."
                            value={manualCodeInput}
                            onChange={e => setManualCodeInput(e.target.value)}
                            className="w-full h-20 bg-slate-base text-[10px] font-mono text-snow p-2 rounded border border-slate-light resize-none input"
                          />
                          {manualCodeInput.trim() && (
                            <button
                              onClick={() => handleProcessInviteCode(manualCodeInput)}
                              className="btn btn-primary py-2.5 text-xs font-semibold cursor-pointer"
                            >
                              Process Invite Code
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {answerString && (
                            <div className="p-2.5 bg-white rounded-lg border border-slate-light flex justify-center self-center shadow-lg">
                              <AnimatedQRCode payload={answerString} />
                            </div>
                          )}

                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={handleSaveAnswerFile}
                              className="btn btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Save Answer File (.sig)
                            </button>
                            <button
                              onClick={() => handleCopy(answerString)}
                              className="btn btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 border border-slate-light bg-slate-base/30 text-snow hover:bg-slate-light"
                            >
                              {copiedText ? <Check className="w-3.5 h-3.5 text-steady-green" /> : <Copy className="w-3.5 h-3.5" />}
                              Copy Code String
                            </button>
                          </div>

                          <div className="text-[10px] text-fog text-center leading-normal max-w-xs mt-1 self-center">
                            👉 Ask your friend to scan this QR, upload the file, or paste this Answer string to establish the direct WebRTC link.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {}
            <div className="p-3 border-t border-slate-light bg-slate-base/30 text-center text-[9px] font-mono text-fog uppercase tracking-wider">
              Secure Serverless Mesh Offline Exchange
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

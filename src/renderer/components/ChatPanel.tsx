import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, ShieldAlert, FileText, Image, X, AlertTriangle } from 'lucide-react';

interface ChatPanelProps {
  messages: any[];
  recipientId: string | 'broadcast';
  onSendMessage: (text: string, type?: 'text' | 'sos') => void;
  onSendFile: (file: File) => void;
  ourPeerId?: string;
}

export default function ChatPanel({
  messages,
  recipientId,
  onSendMessage,
  onSendFile,
  ourPeerId
}: ChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosText, setSosText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    const el = messageListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim(), 'text');
    setInputText('');
    inputRef.current?.focus();
  };

  const handleSosConfirm = () => {
    if (!sosText.trim()) return;
    onSendMessage(sosText.trim(), 'sos');
    setSosText('');
    setShowSosModal(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      // Show inline error in log instead of alert
      console.warn('File size exceeds 5MB limit.');
      return;
    }
    onSendFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <>
      <div className="chat-container">
        {/* Message List */}
        <div
          ref={messageListRef}
          className="message-list"
        >
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
              <RadioWaveIcon />
              <span className="text-xs text-fog font-mono mt-2 leading-relaxed max-w-[220px]">
                {recipientId === 'broadcast'
                  ? 'SOS & Broadcast channel.\nMessages flood all nearby mesh nodes.'
                  : 'Direct secure channel.\nAll messages are E2E encrypted (ECDH + AES-GCM).'}
              </span>
            </div>
          ) : (
            messages.map((msg) => {
              const isSelf = msg.senderId === ourPeerId;
              const isSos  = msg.type === 'sos';
              const isFile = msg.type === 'file';

              return (
                <div
                  key={msg.id}
                  className={`message-bubble-wrapper ${isSelf ? 'self' : 'peer'} ${isSos ? 'sos' : ''}`}
                >
                  {/* Sender name */}
                  {!isSelf && (
                    <span className="text-[10px] text-fog font-semibold mb-0.5 px-1 font-mono">
                      {msg.senderName || `Node:${msg.senderId?.substring(0, 6)}`}
                    </span>
                  )}

                  {/* Bubble */}
                  <div className="message-bubble">
                    {isSos && (
                      <div className="flex items-center gap-1.5 mb-1 text-amber-sos text-[11px] font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        SOS ALERT
                      </div>
                    )}
                    {isFile && msg.attachmentMeta ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 p-2 bg-slate-base/50 rounded border border-slate-light/50">
                          {msg.attachmentMeta.fileType?.startsWith('image/')
                            ? <Image className="w-4 h-4 text-relay-blue flex-shrink-0" />
                            : <FileText className="w-4 h-4 text-fog flex-shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate text-snow">
                              {msg.attachmentMeta.fileName}
                            </div>
                            <div className="text-[9px] text-fog font-mono">
                              {formatBytes(msg.attachmentMeta.fileSize)}
                            </div>
                          </div>
                        </div>
                        {msg.attachmentMeta.fileType?.startsWith('image/') && (
                          <img
                            src={msg.payload}
                            alt="Attachment"
                            className="max-w-full max-h-[160px] object-contain rounded border border-slate-light"
                          />
                        )}
                        <a
                          href={msg.payload}
                          download={msg.attachmentMeta.fileName}
                          className="text-xs text-relay-blue hover:text-white font-semibold underline"
                        >
                          ↓ Save File
                        </a>
                      </div>
                    ) : (
                      <span>{msg.payload}</span>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className={`message-meta ${isSelf ? 'justify-end' : ''}`}>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>·</span>
                    <span className={msg.hops === 0 ? 'text-steady-green' : 'text-relay-blue'}>
                      {msg.hops === 0 ? 'Direct' : `${msg.hops}-hop relay`}
                    </span>
                    {msg.encrypted && (
                      <>
                        <span>·</span>
                        <span className="text-relay-blue">🔒 E2E</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Footer */}
        <div className="flex-shrink-0 p-2.5 bg-slate-base/50 border-t border-slate-light">
          <form onSubmit={handleSend} className="flex gap-2 items-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`btn px-2.5 py-2 flex-shrink-0 ${recipientId === 'broadcast' ? 'opacity-30 cursor-not-allowed' : 'hover:border-fog'}`}
              title={recipientId === 'broadcast' ? 'Attachments not available in Broadcast mode' : 'Attach File (<5MB)'}
              disabled={recipientId === 'broadcast'}
            >
              <Paperclip className="w-4 h-4 text-fog" />
            </button>

            <input
              ref={inputRef}
              type="text"
              placeholder={
                recipientId === 'broadcast'
                  ? 'Broadcast message to all peers...'
                  : 'Send encrypted direct message...'
              }
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="input flex-1 py-2 px-3 text-sm"
            />

            <button type="submit" className="btn btn-primary px-3 py-2 flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowSosModal(true)}
              className="btn btn-sos px-3 py-2 flex-shrink-0 flex items-center gap-1"
              title="Send Emergency SOS Alert"
            >
              <ShieldAlert className="w-4 h-4" />
              <span className="text-xs font-bold">SOS</span>
            </button>
          </form>
        </div>
      </div>

      {/* SOS Modal — inline, no browser prompt() */}
      {showSosModal && (
        <div className="modal-overlay" onClick={() => setShowSosModal(false)}>
          <div
            className="modal-content sos-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-sos/15 border border-amber-sos/30 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-amber-sos" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-snow uppercase tracking-wide">Emergency SOS Broadcast</h3>
                  <p className="text-[10px] text-fog font-mono">Floods ALL mesh nodes in range</p>
                </div>
              </div>
              <button
                onClick={() => setShowSosModal(false)}
                className="title-bar-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] text-amber-sos/70 font-mono bg-amber-sos/5 border border-amber-sos/20 rounded p-2.5 leading-relaxed">
              ⚠ This message will be sent as an urgent SOS to ALL connected peers with priority routing and Morse code alert beeps.
            </div>

            <textarea
              autoFocus
              placeholder="Describe the emergency (e.g. MEDICAL EMERGENCY AT BUILDING C, NEED IMMEDIATE HELP)"
              value={sosText}
              onChange={e => setSosText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSosConfirm();
                }
              }}
              className="input resize-none text-sm"
              rows={3}
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowSosModal(false)}
                className="btn flex-1 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleSosConfirm}
                disabled={!sosText.trim()}
                className="btn btn-danger flex-1 py-2 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShieldAlert className="w-4 h-4" />
                BROADCAST SOS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RadioWaveIcon() {
  return (
    <svg className="w-8 h-8 opacity-40 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

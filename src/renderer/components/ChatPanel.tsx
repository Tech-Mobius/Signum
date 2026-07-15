import React, { useState, useRef } from 'react';
import { Send, AlertTriangle, Paperclip, ShieldAlert, FileText, Image } from 'lucide-react';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText, 'text');
    setInputText('');
  };

  const handleSos = () => {
    const sosMessage = prompt('Type SOS alert details (e.g. MEDICAL EMERGENCY AT BUILDING C):');
    if (sosMessage) {
      onSendMessage(sosMessage, 'sos');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit.');
        return;
      }
      onSendFile(file);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="chat-container flex-1 flex flex-col h-full bg-slate-base/20">
      
      {/* Message List */}
      <div className="message-list flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-xs text-fog font-mono">
            <RadioWaveIcon />
            {recipientId === 'broadcast' 
              ? 'SOS & Broadcast channel. Messages sent here flood all nearby mesh devices.'
              : 'Direct connection. All messages are encrypted end-to-end (ECDH + AES-GCM).'
            }
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderId === ourPeerId;
            const isSos = msg.type === 'sos';
            const isFile = msg.type === 'file';
            
            return (
              <div 
                key={msg.id} 
                className={`message-bubble-wrapper flex flex-col ${
                  isSelf ? 'self' : 'peer'
                } ${isSos ? 'sos' : ''}`}
              >
                {/* Sender Name */}
                <span className="text-[10px] text-fog font-semibold mb-0.5 px-1 font-mono">
                  {msg.senderName || `Node: ${msg.senderId}`}
                </span>

                {/* Bubble */}
                <div className="message-bubble">
                  {/* File Attachment render */}
                  {isFile && msg.attachmentMeta ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 p-2 bg-slate-base/50 rounded border border-slate-light/50">
                        {msg.attachmentMeta.fileType.startsWith('image/') 
                          ? <Image className="w-5 h-5 text-relay-blue" />
                          : <FileText className="w-5 h-5 text-fog" />
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
                      
                      {/* Image Preview */}
                      {msg.attachmentMeta.fileType.startsWith('image/') && (
                        <img 
                          src={msg.payload} 
                          alt="Attachment" 
                          className="max-w-full max-h-[180px] object-contain rounded border border-slate-light"
                        />
                      )}

                      <a 
                        href={msg.payload} 
                        download={msg.attachmentMeta.fileName}
                        className="text-xs text-relay-blue hover:text-white font-semibold underline mt-1 block"
                      >
                        Save File
                      </a>
                    </div>
                  ) : (
                    <span>{msg.payload}</span>
                  )}
                </div>

                {/* Metadata details */}
                <div className="message-meta">
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                  <span>•</span>
                  <span className={msg.hops === 0 ? 'text-steady-green' : 'text-relay-blue'}>
                    {msg.hops === 0 ? 'Direct Link' : `Relayed (${msg.hops} hop${msg.hops > 1 ? 's' : ''})`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Form Footer */}
      <div className="p-3 bg-slate-base/40 border-t border-slate-light">
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden" 
          />
          
          {/* File attach button (disabled for broadcast as E2E E2EE is point-to-point) */}
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`btn px-3 py-2 ${recipientId === 'broadcast' ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={recipientId === 'broadcast' ? "Attachments not supported in Broadcast mode" : "Attach File (<5MB)"}
            disabled={recipientId === 'broadcast'}
          >
            <Paperclip className="w-4 h-4 text-fog" />
          </button>

          <input 
            type="text" 
            placeholder={
              recipientId === 'broadcast' 
                ? "Send broadcast/SOS message..." 
                : "Type secure direct message..."
            }
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            className="input flex-1 py-2 px-3 text-sm"
          />

          <button type="submit" className="btn btn-primary px-4 py-2">
            <Send className="w-4 h-4" />
          </button>

          {/* SOS Urgent Button */}
          <button 
            type="button"
            onClick={handleSos}
            className="btn btn-sos px-4 py-2 flex items-center gap-1.5"
            title="SEND EMERGENCY SOS BROADCAST"
          >
            <ShieldAlert className="w-4 h-4" /> SOS
          </button>

        </form>
      </div>

    </div>
  );
}

function RadioWaveIcon() {
  return (
    <svg className="w-8 h-8 text-fog/60 mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

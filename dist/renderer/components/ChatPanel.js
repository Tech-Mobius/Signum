"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ChatPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
function ChatPanel({ messages, recipientId, onSendMessage, onSendFile, ourPeerId }) {
    const [inputText, setInputText] = (0, react_1.useState)('');
    const fileInputRef = (0, react_1.useRef)(null);
    const handleSend = (e) => {
        e.preventDefault();
        if (!inputText.trim())
            return;
        onSendMessage(inputText, 'text');
        setInputText('');
    };
    const handleSos = () => {
        const sosMessage = prompt('Type SOS alert details (e.g. MEDICAL EMERGENCY AT BUILDING C):');
        if (sosMessage) {
            onSendMessage(sosMessage, 'sos');
        }
    };
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert('File size exceeds 5MB limit.');
                return;
            }
            onSendFile(file);
        }
    };
    const formatBytes = (bytes) => {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "chat-container flex-1 flex flex-col h-full bg-slate-base/20", children: [(0, jsx_runtime_1.jsx)("div", { className: "message-list flex-1 overflow-y-auto p-4 flex flex-col gap-3", children: messages.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center text-center p-8 text-xs text-fog font-mono", children: [(0, jsx_runtime_1.jsx)(RadioWaveIcon, {}), recipientId === 'broadcast'
                            ? 'SOS & Broadcast channel. Messages sent here flood all nearby mesh devices.'
                            : 'Direct connection. All messages are encrypted end-to-end (ECDH + AES-GCM).'] })) : (messages.map((msg) => {
                    const isSelf = msg.senderId === ourPeerId;
                    const isSos = msg.type === 'sos';
                    const isFile = msg.type === 'file';
                    return ((0, jsx_runtime_1.jsxs)("div", { className: `message-bubble-wrapper flex flex-col ${isSelf ? 'self' : 'peer'} ${isSos ? 'sos' : ''}`, children: [(0, jsx_runtime_1.jsx)("span", { className: "text-[10px] text-fog font-semibold mb-0.5 px-1 font-mono", children: msg.senderName || `Node: ${msg.senderId}` }), (0, jsx_runtime_1.jsx)("div", { className: "message-bubble", children: isFile && msg.attachmentMeta ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 p-2 bg-slate-base/50 rounded border border-slate-light/50", children: [msg.attachmentMeta.fileType.startsWith('image/')
                                                    ? (0, jsx_runtime_1.jsx)(lucide_react_1.Image, { className: "w-5 h-5 text-relay-blue" })
                                                    : (0, jsx_runtime_1.jsx)(lucide_react_1.FileText, { className: "w-5 h-5 text-fog" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 min-w-0", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-xs font-semibold truncate text-snow", children: msg.attachmentMeta.fileName }), (0, jsx_runtime_1.jsx)("div", { className: "text-[9px] text-fog font-mono", children: formatBytes(msg.attachmentMeta.fileSize) })] })] }), msg.attachmentMeta.fileType.startsWith('image/') && ((0, jsx_runtime_1.jsx)("img", { src: msg.payload, alt: "Attachment", className: "max-w-full max-h-[180px] object-contain rounded border border-slate-light" })), (0, jsx_runtime_1.jsx)("a", { href: msg.payload, download: msg.attachmentMeta.fileName, className: "text-xs text-relay-blue hover:text-white font-semibold underline mt-1 block", children: "Save File" })] })) : ((0, jsx_runtime_1.jsx)("span", { children: msg.payload })) }), (0, jsx_runtime_1.jsxs)("div", { className: "message-meta", children: [(0, jsx_runtime_1.jsx)("span", { children: new Date(msg.timestamp).toLocaleTimeString() }), (0, jsx_runtime_1.jsx)("span", { children: "\u2022" }), (0, jsx_runtime_1.jsx)("span", { className: msg.hops === 0 ? 'text-steady-green' : 'text-relay-blue', children: msg.hops === 0 ? 'Direct Link' : `Relayed (${msg.hops} hop${msg.hops > 1 ? 's' : ''})` })] })] }, msg.id));
                })) }), (0, jsx_runtime_1.jsx)("div", { className: "p-3 bg-slate-base/40 border-t border-slate-light", children: (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSend, className: "flex gap-2 items-center", children: [(0, jsx_runtime_1.jsx)("input", { type: "file", ref: fileInputRef, onChange: handleFileChange, className: "hidden" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => fileInputRef.current?.click(), className: `btn px-3 py-2 ${recipientId === 'broadcast' ? 'opacity-40 cursor-not-allowed' : ''}`, title: recipientId === 'broadcast' ? "Attachments not supported in Broadcast mode" : "Attach File (<5MB)", disabled: recipientId === 'broadcast', children: (0, jsx_runtime_1.jsx)(lucide_react_1.Paperclip, { className: "w-4 h-4 text-fog" }) }), (0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: recipientId === 'broadcast'
                                ? "Send broadcast/SOS message..."
                                : "Type secure direct message...", value: inputText, onChange: e => setInputText(e.target.value), className: "input flex-1 py-2 px-3 text-sm" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", className: "btn btn-primary px-4 py-2", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Send, { className: "w-4 h-4" }) }), (0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: handleSos, className: "btn btn-sos px-4 py-2 flex items-center gap-1.5", title: "SEND EMERGENCY SOS BROADCAST", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.ShieldAlert, { className: "w-4 h-4" }), " SOS"] })] }) })] }));
}
function RadioWaveIcon() {
    return ((0, jsx_runtime_1.jsx)("svg", { className: "w-8 h-8 text-fog/60 mb-2 animate-pulse", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: (0, jsx_runtime_1.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M13 10V3L4 14h7v7l9-11h-7z" }) }));
}

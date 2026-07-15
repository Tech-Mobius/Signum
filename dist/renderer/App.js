"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const MeshGraph_1 = __importDefault(require("./components/MeshGraph"));
const ChatPanel_1 = __importDefault(require("./components/ChatPanel"));
const PeerList_1 = __importDefault(require("./components/PeerList"));
const StatusBoard_1 = __importDefault(require("./components/StatusBoard"));
const DebugPanel_1 = __importDefault(require("./components/DebugPanel"));
const UsernamePrompt_1 = __importDefault(require("./components/UsernamePrompt"));
const FaultyTerminal_1 = __importDefault(require("./components/FaultyTerminal"));
// Helper to convert base64 to Blob offline without fetch
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: mimeType });
}
// Synthesize S-O-S in Morse Code using Web Audio API
function playSosBeeps() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass)
            return;
        const context = new AudioContextClass();
        const playBeep = (freq, duration, delay) => {
            const osc = context.createOscillator();
            const gainNode = context.createGain();
            osc.connect(gainNode);
            gainNode.connect(context.destination);
            osc.frequency.setValueAtTime(freq, context.currentTime + delay);
            gainNode.gain.setValueAtTime(0.3, context.currentTime + delay);
            // Exponential ramp down to avoid clicks
            gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + delay + duration);
            osc.start(context.currentTime + delay);
            osc.stop(context.currentTime + delay + duration);
        };
        const shortDur = 0.12;
        const longDur = 0.35;
        const gap = 0.15;
        let currentDelay = 0;
        // 3 Shorts (S)
        for (let i = 0; i < 3; i++) {
            playBeep(880, shortDur, currentDelay);
            currentDelay += shortDur + gap;
        }
        currentDelay += gap; // character gap
        // 3 Longs (O)
        for (let i = 0; i < 3; i++) {
            playBeep(880, longDur, currentDelay);
            currentDelay += longDur + gap;
        }
        currentDelay += gap; // character gap
        // 3 Shorts (S)
        for (let i = 0; i < 3; i++) {
            playBeep(880, shortDur, currentDelay);
            currentDelay += shortDur + gap;
        }
    }
    catch (e) {
        console.error('AudioContext synth error:', e);
    }
}
function App() {
    const [identity, setIdentity] = (0, react_1.useState)(null);
    const [peers, setPeers] = (0, react_1.useState)([]);
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [statuses, setStatuses] = (0, react_1.useState)([]);
    const [debugLogs, setDebugLogs] = (0, react_1.useState)([]);
    const [activeTab, setActiveTab] = (0, react_1.useState)('chat');
    const [selectedPeerId, setSelectedPeerId] = (0, react_1.useState)('broadcast');
    const [isOffline, setIsOffline] = (0, react_1.useState)(false);
    const [showUsernamePrompt, setShowUsernamePrompt] = (0, react_1.useState)(false);
    const [sosActive, setSosActive] = (0, react_1.useState)(false);
    // WebRTC & Key Refs
    const peerConnections = (0, react_1.useRef)(new Map());
    const dataChannels = (0, react_1.useRef)(new Map());
    const ecdhKeys = (0, react_1.useRef)(null);
    const sharedKeys = (0, react_1.useRef)(new Map()); // peerId -> AES shared secret
    const peerPublicKeys = (0, react_1.useRef)(new Map()); // peerId -> JWK pubkey string
    const fileChunksBuffer = (0, react_1.useRef)(new Map());
    // Log locally
    const addLog = (category, message) => {
        setDebugLogs(prev => [{ timestamp: Date.now(), category, message }, ...prev].slice(0, 100));
    };
    // 1. Generate ECDH Key Pair on startup
    (0, react_1.useEffect)(() => {
        async function generateKeys() {
            try {
                const pair = await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, // private key is non-extractable
                ['deriveKey', 'deriveBits']);
                ecdhKeys.current = pair;
                addLog('Crypto', 'Generated ECDH P-256 key pair for E2E encryption');
            }
            catch (err) {
                console.error('Failed to generate crypto keys:', err);
                addLog('Crypto', 'Error: Failed to generate ECDH keys');
            }
        }
        generateKeys();
    }, []);
    // 2. Load Identity & register general listeners
    (0, react_1.useEffect)(() => {
        // Check identity
        window.api.getIdentity().then((id) => {
            setIdentity(id);
            if (!id.username) {
                setShowUsernamePrompt(true);
            }
        });
        // Load persistent history
        window.api.getHistory().then((hist) => {
            if (hist) {
                if (hist.messages)
                    setMessages(hist.messages);
                if (hist.statuses)
                    setStatuses(hist.statuses);
            }
        }).catch(err => {
            console.error('Failed to load database history:', err);
        });
        // Listeners
        const unsubPeers = window.api.onPeerListUpdated((list) => {
            setPeers(list);
        });
        const unsubStatus = window.api.onStatusSync((list) => {
            setStatuses(list);
        });
        const unsubSim = window.api.onSimStatusUpdated((status) => {
            setIsOffline(status.offline);
        });
        const unsubLogs = window.api.onDebugLog((log) => {
            setDebugLogs(prev => [log, ...prev].slice(0, 100));
        });
        return () => {
            unsubPeers();
            unsubStatus();
            unsubSim();
            unsubLogs();
        };
    }, []);
    // 3. WebRTC Connection State Machine
    (0, react_1.useEffect)(() => {
        if (!identity || isOffline)
            return;
        peers.forEach(async (peer) => {
            // Connectable states
            if (peer.status === 'searching' && !peerConnections.current.has(peer.id)) {
                // If we are the initiator (lexicographically smaller peer ID), create offer
                if (identity.peerId < peer.id) {
                    addLog('WebRTC', `Initiating connection to ${peer.displayName} (${peer.id})`);
                    initiateWebRTCConnection(peer);
                }
            }
            else if (peer.status === 'offline' && peerConnections.current.has(peer.id)) {
                // Clean up connections
                cleanupPeerConnection(peer.id);
            }
        });
    }, [peers, identity, isOffline]);
    // 4. Handle incoming signals forwarded from Main process
    (0, react_1.useEffect)(() => {
        const unsubMsg = window.api.onMessageReceived(async (msg) => {
            // Check if this is a WebRTC signal
            if (msg.type === 'signal') {
                const payload = JSON.parse(msg.payload);
                handleIncomingSignal(payload);
            }
            else if (msg.type === 'signal-manual-initiate') {
                const payload = JSON.parse(msg.payload);
                initiateWebRTCConnection({
                    id: payload.tempId,
                    displayName: `Peer @ ${payload.address}`,
                    address: payload.address,
                    port: payload.port
                });
            }
            else if (msg.type === 'text' || msg.type === 'sos' || msg.type === 'file') {
                // Direct or Broadcast Message Decryption
                try {
                    const decryptedPayload = await decryptMessagePayload(msg);
                    const displayMsg = { ...msg, payload: decryptedPayload };
                    setMessages(prev => [...prev.filter(m => m.id !== msg.id), displayMsg]);
                    if (msg.type === 'sos') {
                        setSosActive(true);
                        setTimeout(() => setSosActive(false), 5000); // Pulse alert
                        playSosBeeps();
                    }
                }
                catch (err) {
                    addLog('Crypto', `Failed to decrypt message ${msg.id}: ${err.message}`);
                }
            }
            else if (msg.type === 'status') {
                // System check-in broadcast
                try {
                    const decrypted = await decryptMessagePayload(msg);
                    const checkin = JSON.parse(decrypted);
                    // Insert into statuses
                    setStatuses(prev => [checkin, ...prev.filter(s => s.peer_id !== checkin.peer_id)]);
                }
                catch (err) {
                    addLog('Crypto', `Failed to decrypt check-in: ${err.message}`);
                }
            }
        });
        return () => unsubMsg();
    }, [identity]);
    // Establish WebRTC Connection
    const initiateWebRTCConnection = async (peer) => {
        try {
            const pc = new RTCPeerConnection({ iceServers: [] });
            peerConnections.current.set(peer.id, pc);
            // Create DataChannel
            const channel = pc.createDataChannel('signal-mesh-channel');
            setupDataChannel(peer.id, channel);
            // Ice Candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    forwardWebRTCSignal(peer, {
                        type: 'candidate',
                        candidate: event.candidate
                    });
                }
            };
            // Create Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            forwardWebRTCSignal(peer, offer);
            addLog('WebRTC', `Sent SDP offer to ${peer.displayName}`);
        }
        catch (err) {
            addLog('WebRTC', `Error initiating connection to ${peer.id}: ${err.message}`);
        }
    };
    const handleIncomingSignal = async (payload) => {
        const peerId = payload.senderId;
        // Find matching peer info from lists
        const peer = peers.find(p => p.id === peerId) || {
            id: peerId,
            displayName: payload.senderName,
            // Fallback details if manual connect
            address: payload.signal?.address || '',
            port: payload.signal?.port || 0
        };
        let pc = peerConnections.current.get(peerId);
        try {
            if (payload.type === 'offer') {
                if (!pc) {
                    pc = new RTCPeerConnection({ iceServers: [] });
                    peerConnections.current.set(peerId, pc);
                    pc.onicecandidate = (event) => {
                        if (event.candidate) {
                            forwardWebRTCSignal(peer, {
                                type: 'candidate',
                                candidate: event.candidate
                            });
                        }
                    };
                    pc.ondatachannel = (event) => {
                        setupDataChannel(peerId, event.channel);
                    };
                }
                await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                forwardWebRTCSignal(peer, answer);
                addLog('WebRTC', `Received offer and sent answer to ${peer.displayName}`);
            }
            else if (payload.type === 'answer') {
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
                    addLog('WebRTC', `Received SDP answer from ${peer.displayName}`);
                }
            }
            else if (payload.type === 'candidate') {
                if (pc && payload.signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
                }
            }
        }
        catch (err) {
            addLog('WebRTC', `Error processing signal: ${err.message}`);
        }
    };
    const forwardWebRTCSignal = (peer, signal) => {
        // Call Electron Main process to send signal over WS
        // @ts-ignore
        window.api.ipcRenderer?.invoke?.('webrtc:forward-signal', {
            address: peer.address,
            port: peer.port,
            signal
        });
    };
    const setupDataChannel = (peerId, channel) => {
        dataChannels.current.set(peerId, channel);
        channel.onopen = async () => {
            addLog('WebRTC', `DataChannel opened with peer ${peerId}`);
            // Notify Main process that we're connected!
            // @ts-ignore
            window.api.ipcRenderer?.send?.('webrtc:status', { peerId, status: 'connected' });
            // Trigger E2E Key Handshake
            if (ecdhKeys.current) {
                const jwkPub = await window.crypto.subtle.exportKey('jwk', ecdhKeys.current.publicKey);
                channel.send(JSON.stringify({
                    type: 'key-handshake',
                    publicKey: JSON.stringify(jwkPub)
                }));
                addLog('Crypto', `Sent public key handshake to peer ${peerId}`);
            }
        };
        channel.onclose = () => {
            addLog('WebRTC', `DataChannel closed with peer ${peerId}`);
            // @ts-ignore
            window.api.ipcRenderer?.send?.('webrtc:status', { peerId, status: 'offline' });
            cleanupPeerConnection(peerId);
        };
        channel.onmessage = async (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === 'key-handshake') {
                    // Process ECDH Handshake
                    const peerJwk = JSON.parse(payload.publicKey);
                    peerPublicKeys.current.set(peerId, payload.publicKey);
                    if (ecdhKeys.current) {
                        const peerPub = await window.crypto.subtle.importKey('jwk', peerJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
                        const sharedSecret = await window.crypto.subtle.deriveKey({ name: 'ECDH', public: peerPub }, ecdhKeys.current.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
                        sharedKeys.current.set(peerId, sharedSecret);
                        addLog('Crypto', `Secured E2E key with peer ${peerId} (ECDH complete)`);
                    }
                }
                else if (payload.type === 'mesh-message') {
                    // Forward received mesh packet to SQLite router
                    // @ts-ignore
                    window.api.ipcRenderer?.send?.('webrtc:received', { message: payload.message });
                }
                else if (payload.type === 'file-start') {
                    fileChunksBuffer.current.set(payload.fileId, {
                        chunks: new Array(payload.totalChunks),
                        expectedChunks: payload.totalChunks,
                        fileName: payload.fileName,
                        type: payload.fileType
                    });
                    addLog('File', `Incoming file: ${payload.fileName} (${payload.fileSize} bytes)`);
                }
                else if (payload.type === 'file-chunk') {
                    const buf = fileChunksBuffer.current.get(payload.fileId);
                    if (buf) {
                        buf.chunks[payload.chunkIndex] = payload.chunkData;
                        // Check progress
                        const filled = buf.chunks.filter(Boolean).length;
                        if (filled === buf.expectedChunks) {
                            // Reassemble
                            const base64Content = buf.chunks.join('');
                            // Convert base64 back to blob
                            const blob = base64ToBlob(base64Content, buf.type);
                            const fileUrl = URL.createObjectURL(blob);
                            addLog('File', `Completed file download: ${buf.fileName}`);
                            // Trigger message insertion for attachment display
                            // @ts-ignore
                            window.api.ipcRenderer?.send?.('webrtc:received', {
                                message: {
                                    id: payload.fileId,
                                    senderId: peerId,
                                    recipientId: identity.peerId,
                                    type: 'file',
                                    payload: fileUrl,
                                    timestamp: Date.now(),
                                    ttl: 5,
                                    visitedNodes: [peerId, identity.peerId],
                                    hops: 1,
                                    attachmentMeta: {
                                        fileName: buf.fileName,
                                        fileSize: blob.size,
                                        fileType: buf.type
                                    }
                                }
                            });
                            fileChunksBuffer.current.delete(payload.fileId);
                        }
                    }
                }
            }
            catch (err) {
                console.error('DataChannel Msg error:', err);
            }
        };
    };
    const cleanupPeerConnection = (peerId) => {
        const pc = peerConnections.current.get(peerId);
        if (pc) {
            pc.close();
            peerConnections.current.delete(peerId);
        }
        const channel = dataChannels.current.get(peerId);
        if (channel) {
            channel.close();
            dataChannels.current.delete(peerId);
        }
        sharedKeys.current.delete(peerId);
        peerPublicKeys.current.delete(peerId);
    };
    // Main process instructing us to send a WebRTC payload
    (0, react_1.useEffect)(() => {
        // @ts-ignore
        const unsubSend = window.api.ipcRenderer?.on?.('webrtc:send', async (_event, { peerId, message }) => {
            const channel = dataChannels.current.get(peerId);
            if (channel && channel.readyState === 'open') {
                // E2E Encryption Phase
                try {
                    const encryptedMessage = await encryptMessagePayload(peerId, message);
                    channel.send(JSON.stringify({
                        type: 'mesh-message',
                        message: encryptedMessage
                    }));
                    addLog('WebRTC', `Dispatched packet ${message.id} to peer ${peerId}`);
                }
                catch (err) {
                    addLog('Crypto', `Error encrypting packet for peer ${peerId}: ${err.message}`);
                }
            }
            else {
                addLog('WebRTC', `Failed to send to peer ${peerId}: channel not open`);
            }
        });
        return () => unsubSend?.();
    }, [identity]);
    // E2E Encryption helper
    const encryptMessagePayload = async (peerId, message) => {
        // If it's a signal, don't encrypt
        if (message.type === 'signal' || message.type === 'status' || !sharedKeys.current.has(peerId)) {
            return message;
        }
        const key = sharedKeys.current.get(peerId);
        if (!key)
            return message;
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedPayload = new TextEncoder().encode(message.payload);
        const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedPayload);
        // Encode to base64
        const ivBase64 = btoa(String.fromCharCode(...iv));
        const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
        return {
            ...message,
            payload: JSON.stringify({ iv: ivBase64, ciphertext: ciphertextBase64 }),
            encrypted: true
        };
    };
    const decryptMessagePayload = async (message) => {
        if (!message.encrypted)
            return message.payload;
        const peerId = message.senderId;
        const key = sharedKeys.current.get(peerId);
        if (!key) {
            throw new Error(`No E2E session key established for peer ${peerId}`);
        }
        const { iv, ciphertext } = JSON.parse(message.payload);
        // Decode base64
        const ivArr = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
        const ctArr = new Uint8Array(atob(ciphertext).split('').map(c => c.charCodeAt(0)));
        const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArr }, key, ctArr);
        return new TextDecoder().decode(decrypted);
    };
    // Handle message sending (Text or SOS)
    const onSendMessage = (text, type = 'text') => {
        if (!identity)
            return;
        // Send to Main process SQLite router
        window.api.sendMessage(selectedPeerId, type, text);
        // Display in local UI immediately
        const localMsg = {
            id: crypto.randomUUID(),
            senderId: identity.peerId,
            senderName: identity.username,
            recipientId: selectedPeerId,
            type,
            payload: text,
            timestamp: Date.now(),
            hops: 0
        };
        setMessages(prev => [...prev, localMsg]);
    };
    // Handle file sharing
    const onSendFile = async (file) => {
        if (!identity || selectedPeerId === 'broadcast')
            return;
        const channel = dataChannels.current.get(selectedPeerId);
        if (!channel || channel.readyState !== 'open') {
            addLog('File', 'Cannot send file: Peer data channel not open.');
            return;
        }
        const fileId = crypto.randomUUID();
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target?.result;
            const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
            const chunkSize = 16384; // 16KB chunks
            const totalChunks = Math.ceil(base64Data.length / chunkSize);
            addLog('File', `Starting upload of ${file.name} to peer ${selectedPeerId}...`);
            // 1. Send file start
            channel.send(JSON.stringify({
                type: 'file-start',
                fileId,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                totalChunks
            }));
            // 2. Send chunks
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const chunk = base64Data.slice(start, start + chunkSize);
                channel.send(JSON.stringify({
                    type: 'file-chunk',
                    fileId,
                    chunkIndex: i,
                    chunkData: chunk
                }));
            }
            // Display in local chat
            setMessages(prev => [...prev, {
                    id: fileId,
                    senderId: identity.peerId,
                    senderName: identity.username,
                    recipientId: selectedPeerId,
                    type: 'file',
                    payload: URL.createObjectURL(file), // display local preview
                    timestamp: Date.now(),
                    hops: 0,
                    attachmentMeta: {
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type
                    }
                }]);
        };
        reader.readAsDataURL(file);
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: `flex flex-col h-screen ${sosActive ? 'sos-alert-pulse' : ''}`, style: { position: 'relative' }, children: [(0, jsx_runtime_1.jsx)("div", { style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }, children: (0, jsx_runtime_1.jsx)(FaultyTerminal_1.default, { scale: 1.2, gridMul: [2, 1.5], digitSize: 1.4, timeScale: 0.35, pause: false, scanlineIntensity: 0.35, glitchAmount: 1.2, flickerAmount: 0.85, noiseAmp: 0.15, chromaticAberration: 1.5, curvature: 0.15, tint: "#4A9B6E", mouseReact: true, mouseStrength: 0.3, pageLoadAnimation: true, brightness: 0.45 }) }), (0, jsx_runtime_1.jsxs)("div", { className: "title-bar", children: [(0, jsx_runtime_1.jsxs)("div", { className: "title-bar-identity", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-4 h-4 text-amber-sos" }), (0, jsx_runtime_1.jsx)("span", { className: "title-bar-logo", children: "SIGNAL" }), (0, jsx_runtime_1.jsx)("span", { className: "title-bar-badge", children: "OFFLINE EMERGENCY NET" }), identity && ((0, jsx_runtime_1.jsxs)("span", { className: "text-xs text-fog font-mono ml-4", children: ["NODE ID: ", identity.peerId, " (", identity.username || 'Anonymous', ")"] }))] }), isOffline && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-1.5 text-xs text-caution-red font-mono px-2 py-0.5 border border-caution-red/30 rounded bg-caution-red/10", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.WifiOff, { className: "w-3.5 h-3.5" }), "SIMULATED OFFLINE"] })), (0, jsx_runtime_1.jsxs)("div", { className: "title-bar-controls", children: [(0, jsx_runtime_1.jsx)("button", { onClick: () => window.api.setUsername(''), className: "title-bar-btn", title: "Change Identity", children: (0, jsx_runtime_1.jsx)(lucide_react_1.User, { className: "w-3.5 h-3.5" }) }), (0, jsx_runtime_1.jsx)("button", { onClick: () => window.api.toggleOffline(!isOffline), className: `title-bar-btn ${isOffline ? 'text-caution-red' : 'text-steady-green'}`, title: isOffline ? "Connect to Mesh" : "Go Offline (Simulate)", children: isOffline ? (0, jsx_runtime_1.jsx)(lucide_react_1.WifiOff, { className: "w-3.5 h-3.5" }) : (0, jsx_runtime_1.jsx)(lucide_react_1.Wifi, { className: "w-3.5 h-3.5" }) })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "app-container", children: [(0, jsx_runtime_1.jsxs)("div", { className: "panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "panel-header", children: [(0, jsx_runtime_1.jsx)("span", { children: "MESH PARTICIPANTS" }), (0, jsx_runtime_1.jsx)(lucide_react_1.Radio, { className: "w-4 h-4 text-fog" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "panel-content flex flex-col gap-4", children: [(0, jsx_runtime_1.jsx)(PeerList_1.default, { peers: peers, selectedPeerId: selectedPeerId, setSelectedPeerId: setSelectedPeerId }), (0, jsx_runtime_1.jsxs)("div", { className: "mt-4 border-t border-slate-light pt-4", children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xs font-semibold text-fog mb-2 uppercase tracking-wider", children: "Status Board" }), (0, jsx_runtime_1.jsx)(StatusBoard_1.default, { statuses: statuses })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "panel-header", children: [(0, jsx_runtime_1.jsx)("span", { children: selectedPeerId === 'broadcast'
                                            ? 'BROADCAST & SOS NET'
                                            : `SECURE NET: ${peers.find(p => p.id === selectedPeerId)?.displayName || selectedPeerId}` }), (0, jsx_runtime_1.jsx)(lucide_react_1.MessageSquare, { className: "w-4 h-4 text-fog" })] }), (0, jsx_runtime_1.jsx)("div", { className: "panel-content flex flex-col p-0", children: (0, jsx_runtime_1.jsx)(ChatPanel_1.default, { messages: messages.filter(m => selectedPeerId === 'broadcast'
                                        ? m.recipientId === 'broadcast'
                                        : (m.senderId === selectedPeerId && m.recipientId === identity?.peerId) ||
                                            (m.senderId === identity?.peerId && m.recipientId === selectedPeerId)), recipientId: selectedPeerId, onSendMessage: onSendMessage, onSendFile: onSendFile, ourPeerId: identity?.peerId }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "panel-header", children: [(0, jsx_runtime_1.jsx)("span", { children: "LIVE TOPOLOGY VIEW" }), (0, jsx_runtime_1.jsx)(lucide_react_1.Activity, { className: "w-4 h-4 text-fog" })] }), (0, jsx_runtime_1.jsx)("div", { className: "h-2/3 border-b border-slate-light", children: (0, jsx_runtime_1.jsx)(MeshGraph_1.default, { peers: peers, ourId: identity?.peerId, messages: messages }) }), (0, jsx_runtime_1.jsxs)("div", { className: "h-1/3 flex flex-col overflow-hidden", children: [(0, jsx_runtime_1.jsx)("div", { className: "panel-header py-1 h-8 border-b border-slate-light text-xs", children: (0, jsx_runtime_1.jsx)("span", { children: "DEBUG ROUTING EVENTS" }) }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 overflow-y-auto p-4 bg-slate-base", children: (0, jsx_runtime_1.jsx)(DebugPanel_1.default, { logs: debugLogs }) })] })] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "status-bar", children: [(0, jsx_runtime_1.jsx)("span", { children: "STATUS: ACTIVE NET DISCOVERY" }), identity && ((0, jsx_runtime_1.jsxs)("span", { children: ["ADDR: ", identity.address, ":", identity.port, " \u2022 PEERS CONNECTED: ", peers.filter(p => p.status === 'connected').length] }))] }), showUsernamePrompt && ((0, jsx_runtime_1.jsx)(UsernamePrompt_1.default, { onSave: (name) => {
                    window.api.setUsername(name);
                    setShowUsernamePrompt(false);
                    // Refresh identity
                    window.api.getIdentity().then(setIdentity);
                } }))] }));
}

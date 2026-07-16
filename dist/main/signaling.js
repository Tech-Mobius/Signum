"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSignalingServer = initSignalingServer;
exports.sendSignalToPeer = sendSignalToPeer;
exports.getSignalingPort = getSignalingPort;
exports.closeSignalingServer = closeSignalingServer;
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
let wss = null;
let serverPort = 0;
let onSignalReceivedCallback = () => { };
function initSignalingServer(onSignal) {
    return new Promise((resolve, reject) => {
        onSignalReceivedCallback = onSignal;
        // Create an HTTP server so we can listen on a dynamic port easily
        const server = http_1.default.createServer();
        wss = new ws_1.WebSocketServer({ server });
        wss.on('connection', (ws, req) => {
            // Extract sender's IP address from the WebSocket upgrade request
            const rawIp = req.socket.remoteAddress || '';
            // Normalize IPv6-mapped IPv4 addresses (e.g. ::ffff:192.168.1.5 -> 192.168.1.5)
            const senderAddress = rawIp.replace(/^::ffff:/, '');
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    onSignalReceivedCallback(data, senderAddress);
                }
                catch (err) {
                    console.error('Failed to parse signaling message:', err);
                }
            });
        });
        server.listen(0, '0.0.0.0', () => {
            const address = server.address();
            if (address && typeof address !== 'string') {
                serverPort = address.port;
                console.log(`WebSocket Signaling Server listening on port: ${serverPort}`);
                resolve(serverPort);
            }
            else {
                reject(new Error('Failed to obtain server port'));
            }
        });
        server.on('error', (err) => {
            reject(err);
        });
    });
}
// Send a signaling payload to a target peer's signaling server
function sendSignalToPeer(peerAddress, peerPort, signalPayload) {
    return new Promise((resolve, reject) => {
        const wsUrl = `ws://${peerAddress}:${peerPort}`;
        console.log(`Sending signal to ${wsUrl}...`);
        const ws = new ws_1.WebSocket(wsUrl);
        ws.on('open', () => {
            ws.send(JSON.stringify(signalPayload));
            ws.close();
            resolve();
        });
        ws.on('error', (err) => {
            console.error(`Failed to connect to signaling server at ${wsUrl}:`, err.message);
            reject(err);
        });
    });
}
function getSignalingPort() {
    return serverPort;
}
function closeSignalingServer() {
    if (wss) {
        wss.close();
        wss = null;
    }
}

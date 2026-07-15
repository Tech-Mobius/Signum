import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

export interface SignalData {
  senderId: string;
  senderName: string;
  type: 'offer' | 'answer' | 'candidate';
  signal: any;
}

let wss: WebSocketServer | null = null;
let serverPort = 0;
let onSignalReceivedCallback: (data: SignalData) => void = () => {};

export function initSignalingServer(onSignal: (data: SignalData) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    onSignalReceivedCallback = onSignal;
    
    // Create an HTTP server so we can listen on a dynamic port easily
    const server = http.createServer();
    
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString()) as SignalData;
          onSignalReceivedCallback(data);
        } catch (err) {
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
      } else {
        reject(new Error('Failed to obtain server port'));
      }
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

// Send a signaling payload to a target peer's signaling server
export function sendSignalToPeer(peerAddress: string, peerPort: number, signalPayload: SignalData): Promise<void> {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://${peerAddress}:${peerPort}`;
    console.log(`Sending signal to ${wsUrl}...`);
    
    const ws = new WebSocket(wsUrl);
    
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

export function getSignalingPort(): number {
  return serverPort;
}

export function closeSignalingServer() {
  if (wss) {
    wss.close();
  }
}

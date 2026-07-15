import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import { 
  initDatabase, 
  setConfig, 
  getConfig, 
  savePeerStatus, 
  getAllPeerStatuses, 
  getAllMessages, 
  PeerStatus 
} from './database';
import { initSignalingServer, sendSignalToPeer, getSignalingPort, closeSignalingServer } from './signaling';
import { initDiscovery, destroyDiscovery, updateDiscoveryName, DiscoveredPeer } from './discovery';
import { initRouter, handleIncomingMessage, syncUndeliveredMessagesToPeer, MeshMessage } from './router';

let mainWindow: BrowserWindow | null = null;
let ourPeerId = '';
let ourUsername = '';
let ourIpAddress = '';
let ourSignalingPort = 0;
let isSimulatedOffline = false;

// In-memory cache of discovered/connected peers
// peerId -> DiscoveredPeer
const peerCache = new Map<string, DiscoveredPeer & { status: 'connected' | 'searching' | 'offline' }>();

// Helper to log debug info and push to renderer
function sendDebugLog(category: string, message: string, data?: any) {
  const log = {
    timestamp: Date.now(),
    level: 'info',
    category,
    message,
    data
  };
  console.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('debug:log', log);
  }
}

// Get local IPv4 address
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (list) {
      for (const info of list) {
        if (info.family === 'IPv4' && !info.internal) {
          return info.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 950,
    minHeight: 650,
    frame: false, // No browser chrome - custom title bar
    title: 'Signal',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Open devtools in development mode
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Window Controls
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

app.whenReady().then(async () => {
  // 1. Setup paths and SQLite DB
  const userDataPath = app.getPath('userData');
  initDatabase(userDataPath);

  // Load/Create Peer ID
  let cachedPeerId = getConfig('peer_id');
  if (!cachedPeerId) {
    cachedPeerId = crypto.randomUUID().substring(0, 8); // Short ID for easier readability in hackathon demo
    setConfig('peer_id', cachedPeerId);
  }
  ourPeerId = cachedPeerId;

  // Load Username
  ourUsername = getConfig('username') || '';
  ourIpAddress = getLocalIp();

  // 2. Start WebSocket Signaling Server
  try {
    ourSignalingPort = await initSignalingServer((signalData) => {
      // Received signaling data from another peer
      if (isSimulatedOffline) return;
      
      sendDebugLog('Signaling', `Received signal (${signalData.type}) from ${signalData.senderName} (${signalData.senderId})`);
      
      // Forward to renderer to handle WebRTC connection
      if (mainWindow) {
        mainWindow.webContents.send('message:received', {
          id: crypto.randomUUID(),
          senderId: signalData.senderId,
          senderName: signalData.senderName,
          type: 'signal',
          payload: JSON.stringify(signalData),
          timestamp: Date.now(),
          hops: 0
        });
      }
    });
  } catch (err: any) {
    console.error('Failed to start signaling server:', err);
    sendDebugLog('Error', 'Failed to start signaling server', err.message);
  }

  // 3. Initialize Router
  initRouter(
    ourPeerId,
    // Callback to get connected peers from memory
    () => {
      if (isSimulatedOffline) return [];
      return Array.from(peerCache.entries())
        .filter(([_, info]) => info.status === 'connected')
        .map(([id]) => id);
    },
    // Callback to forward a message to a specific peer (calls Renderer WebRTC)
    (peerId, message) => {
      if (isSimulatedOffline) return;
      if (mainWindow) {
        sendDebugLog('Router', `Instructing Renderer to send message ${message.id} to peer ${peerId}`);
        mainWindow.webContents.send('topology:message-hop', {
          messageId: message.id,
          fromNode: ourPeerId,
          toNode: peerId,
          type: message.type
        });
        // Instruct WebRTC channel in Renderer to send
        mainWindow.webContents.send('webrtc:send', { peerId, message });
      }
    },
    // Callback when router processes a message meant for us
    (message) => {
      sendDebugLog('Router', `Message ${message.id} successfully received and validated.`);
      if (mainWindow) {
        mainWindow.webContents.send('message:received', message);
      }
    }
  );

  // 4. Create Window
  createWindow();

  // 5. Initialize Discovery if username is set
  if (ourUsername) {
    startMeshServices();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function startMeshServices() {
  sendDebugLog('Mesh', `Starting discovery for ${ourUsername} (${ourPeerId})`);
  initDiscovery(
    ourPeerId,
    ourUsername,
    ourSignalingPort,
    // Peer Found (mDNS 'up')
    (peer) => {
      if (isSimulatedOffline) return;
      
      const existing = peerCache.get(peer.id);
      peerCache.set(peer.id, {
        ...peer,
        status: existing?.status || 'searching'
      });

      sendDebugLog('Discovery', `Peer UP: ${peer.displayName} at ${peer.address}:${peer.port}`);
      
      // Notify Renderer to show and establish WebRTC connection
      sendPeerListUpdate();
    },
    // Peer Lost (mDNS 'down')
    (lostPeerId) => {
      const peer = peerCache.get(lostPeerId);
      if (peer) {
        peer.status = 'offline';
        sendDebugLog('Discovery', `Peer DOWN: ${peer.displayName}`);
        sendPeerListUpdate();
      }
    }
  );
}

function sendPeerListUpdate() {
  if (!mainWindow) return;
  const list = Array.from(peerCache.values()).map(p => ({
    id: p.id,
    displayName: p.displayName,
    address: p.address,
    port: p.port,
    status: isSimulatedOffline ? 'offline' : p.status
  }));
  mainWindow.webContents.send('peer:list', list);
}

// --- IPC IPC Listeners ---

// Identity
ipcMain.on('identity:set-username', (_event, username) => {
  ourUsername = username;
  setConfig('username', username);
  sendDebugLog('Identity', `Username set to: ${username}`);
  
  if (ourSignalingPort > 0) {
    startMeshServices();
  }
});

ipcMain.handle('identity:get', () => {
  return {
    peerId: ourPeerId,
    username: ourUsername,
    address: ourIpAddress,
    port: ourSignalingPort
  };
});

// Manual Connection Fallback
ipcMain.on('peer:connect-manual', (_event, { address, port }) => {
  sendDebugLog('Mesh', `Manual connection requested to ${address}:${port}`);
  
  // Create a temporary peer entry
  const tempId = `manual-${crypto.randomBytes(4).toString('hex')}`;
  peerCache.set(tempId, {
    id: tempId,
    displayName: `Peer @ ${address}`,
    address,
    port,
    status: 'searching'
  });
  
  sendPeerListUpdate();

  // Send a signal directly to initiate connection
  if (mainWindow) {
    // Pass to renderer to generate offer SDP and start signaling
    mainWindow.webContents.send('message:received', {
      id: crypto.randomUUID(),
      senderId: tempId,
      senderName: `Peer @ ${address}`,
      type: 'signal-manual-initiate',
      payload: JSON.stringify({ address, port, tempId }),
      timestamp: Date.now(),
      hops: 0
    });
  }
});

// Messaging
ipcMain.on('message:send', (_event, { recipientId, type, payload, attachmentMeta }) => {
  if (isSimulatedOffline) return;

  const meshMsg: MeshMessage = {
    id: crypto.randomUUID(),
    senderId: ourPeerId,
    recipientId,
    type,
    payload,
    timestamp: Date.now(),
    ttl: 5,
    visitedNodes: [ourPeerId],
    hops: 0,
    attachmentMeta,
    priority: type === 'sos' ? 1 : 0
  };

  sendDebugLog('Router', `Originating message ${meshMsg.id} to ${recipientId} (${type})`);
  
  // Save to DB and broadcast/route
  handleIncomingMessage(meshMsg, true);
});

// WebRTC signal relay from Renderer to peer
ipcMain.handle('webrtc:forward-signal', async (_event, { address, port, signal }) => {
  if (isSimulatedOffline) return;
  
  try {
    const payload = {
      senderId: ourPeerId,
      senderName: ourUsername || 'Anonymous',
      type: signal.type,
      signal
    };
    await sendSignalToPeer(address, port, payload);
  } catch (err: any) {
    sendDebugLog('Error', `Failed to send signal to ${address}:${port}`, err.message);
  }
});

// Update Peer connection status in cache (from Renderer WebRTC manager)
ipcMain.on('webrtc:status', (_event, { peerId, status }) => {
  const peer = peerCache.get(peerId);
  if (peer) {
    const oldStatus = peer.status;
    peer.status = status;
    if (oldStatus !== status) {
      sendDebugLog('Mesh', `Connection to peer ${peer.displayName} changed from ${oldStatus} to ${status}`);
      sendPeerListUpdate();
      
      // If it connected, sync undelivered messages
      if (status === 'connected') {
        syncUndeliveredMessagesToPeer(peerId);
      }
    }
  }
});

// Incoming message from WebRTC channel in Renderer
ipcMain.on('webrtc:received', (_event, { message }) => {
  if (isSimulatedOffline) return;
  
  const meshMsg = message as MeshMessage;
  sendDebugLog('Router', `Received mesh packet ${meshMsg.id} over WebRTC DataChannel`);
  
  handleIncomingMessage(meshMsg, false);
});

// Status check-ins
ipcMain.on('status:update', (_event, { status, location }) => {
  const checkin: PeerStatus = {
    peer_id: ourPeerId,
    display_name: ourUsername || 'Anonymous',
    status,
    location,
    timestamp: Date.now()
  };

  savePeerStatus(checkin);
  sendDebugLog('Status', `Own check-in updated: ${status} @ ${location || 'unknown'}`);
  
  // Propagate across mesh as a system message
  const meshMsg: MeshMessage = {
    id: crypto.randomUUID(),
    senderId: ourPeerId,
    recipientId: 'broadcast',
    type: 'status',
    payload: JSON.stringify(checkin),
    timestamp: Date.now(),
    ttl: 5,
    visitedNodes: [ourPeerId],
    hops: 0,
    priority: 0
  };
  
  handleIncomingMessage(meshMsg, true);
  
  // Send updated status board to renderer
  if (mainWindow) {
    mainWindow.webContents.send('status:sync', getAllPeerStatuses());
  }
});

// Retrieve message and status history on renderer load
ipcMain.handle('history:get', () => {
  return {
    messages: getAllMessages().map(m => ({
      id: m.id,
      senderId: m.sender_id,
      recipientId: m.recipient_id,
      type: m.type,
      payload: m.payload,
      timestamp: m.timestamp,
      ttl: m.ttl,
      visitedNodes: JSON.parse(m.visited_nodes),
      hops: m.hops,
      attachmentMeta: m.attachment_meta ? JSON.parse(m.attachment_meta) : undefined,
      priority: m.priority
    })),
    statuses: getAllPeerStatuses()
  };
});

// Offline Simulation
ipcMain.on('sim:toggle-offline', (_event, { offline }) => {
  isSimulatedOffline = offline;
  sendDebugLog('Sim', `offline mode set to: ${offline}`);
  
  if (offline) {
    destroyDiscovery();
  } else if (ourUsername) {
    startMeshServices();
  }
  
  sendPeerListUpdate();
  if (mainWindow) {
    mainWindow.webContents.send('sim:status', { offline });
  }
});

app.on('window-all-closed', () => {
  destroyDiscovery();
  closeSignalingServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

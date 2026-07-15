import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import {
  getDatabase,
  saveDatabase,
  startAutoSave,
  stopAutoSave,
  closeDatabase,
} from './db';
import * as messagesRepo from './db/repositories/messages';
import * as statusesRepo from './db/repositories/statuses';
import * as settingsRepo from './db/repositories/settings';
import * as peersRepo from './db/repositories/peers';
import * as cryptoKeysRepo from './db/repositories/cryptoKeys';
import {
  initSignalingServer,
  sendSignalToPeer,
  getSignalingPort,
  closeSignalingServer,
} from './signaling';
import { initDiscovery, destroyDiscovery, updateDiscoveryName, DiscoveredPeer } from './discovery';
import { initRouter, handleIncomingMessage, syncUndeliveredMessagesToPeer, MeshMessage } from './router';
import {
  getOrCreateIdentityKeys,
  getIdentityFingerprint,
  verifyPeerFingerprint,
  trustPeerFingerprint,
  storeSessionKey,
  getVerifiedPeers,
  exportIdentity,
  importIdentity,
  encryptMessagePayload,
  decryptMessagePayload,
} from './crypto';

let mainWindow: BrowserWindow | null = null;
let ourPeerId = '';
let ourUsername = '';
let ourIpAddress = '';
let ourSignalingPort = 0;
let isSimulatedOffline = false;

// In-memory cache of discovered/connected peers
// peerId -> DiscoveredPeer & { status: 'connected' | 'searching' | 'offline' }
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
    title: 'Signum',
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

  // Fallback if Vite dev server is offline during local run
  mainWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
    if (validatedURL.startsWith('http://localhost:5173')) {
      console.log('[Main] Vite dev server offline. Falling back to local built assets...');
      mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
  });

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
  await getDatabase(userDataPath);
  startAutoSave(5000);

  // Load/Create Peer ID
  let cachedPeerId = settingsRepo.getConfig('peer_id');
  if (!cachedPeerId) {
    cachedPeerId = crypto.randomUUID().substring(0, 8); // Short ID for easier readability in hackathon demo
    settingsRepo.setConfig('peer_id', cachedPeerId);
  }
  ourPeerId = cachedPeerId;

  // Load Username
  ourUsername = settingsRepo.getConfig('username') || '';
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

  // 3. Initialize Identity Keys (ECDH)
  try {
    await getOrCreateIdentityKeys();
    const fingerprint = await getIdentityFingerprint();
    sendDebugLog('Crypto', `Identity key loaded/generated. Fingerprint: ${fingerprint}`);
  } catch (err: any) {
    sendDebugLog('Error', 'Failed to initialize identity keys', err.message);
  }

  // 4. Initialize Router
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

  // 5. Create Window
  createWindow();

  // 6. Initialize Discovery if username is set
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

// --- IPC Listeners ---

// Identity
ipcMain.on('identity:set-username', (_event, username) => {
  ourUsername = username;
  settingsRepo.setConfig('username', username);
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

// Get identity fingerprint
ipcMain.handle('identity:get-fingerprint', async () => {
  return getIdentityFingerprint();
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

// WebRTC key handshake completion
ipcMain.on('webrtc:key-handshake', async (_event, { peerId, publicKeyJwk }) => {
  try {
    const stored = cryptoKeysRepo.getSessionKey(peerId);
    if (stored) {
      sendDebugLog('Crypto', `Session key already exists for peer ${peerId}`);
      return;
    }
    // The session key derivation happens in the renderer after key exchange
    sendDebugLog('Crypto', `Key handshake completed with peer ${peerId}`);
  } catch (err: any) {
    sendDebugLog('Crypto', `Failed to process key handshake for ${peerId}`, err.message);
  }
});

// Verify peer fingerprint
ipcMain.handle('peer:verify-fingerprint', async (_event, { peerId, fingerprint, displayName }) => {
  const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
  if (existing && existing.fingerprint === fingerprint) {
    return { verified: true, trusted: existing.verified_by === 'user' };
  }

  // Store as auto-trusted (TOFU)
  cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'auto', displayName);
  return { verified: true, trusted: false };
});

ipcMain.on('peer:trust-fingerprint', (_event, { peerId, fingerprint, displayName }) => {
  cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'user', displayName);
  sendDebugLog('Security', `Manually trusted peer ${peerId} fingerprint`);
});

// Get ICE servers for WebRTC
ipcMain.handle('webrtc:get-ice-servers', () => {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // TURN server (public fallback - rate limited)
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };
});

// TURN configuration
ipcMain.handle('settings:get-turn-config', () => {
  return {
    hostname: settingsRepo.getConfig('turn_hostname') || 'openrelay.metered.ca',
    port: parseInt(settingsRepo.getConfig('turn_port') || '443'),
    username: settingsRepo.getConfig('turn_username') || 'openrelayproject',
    credential: settingsRepo.getConfig('turn_credential') || 'openrelayproject',
  };
});

ipcMain.on('settings:set-turn-config', (_event, config) => {
  if (config.hostname) settingsRepo.setConfig('turn_hostname', config.hostname);
  if (config.port) settingsRepo.setConfig('turn_port', config.port.toString());
  if (config.username) settingsRepo.setConfig('turn_username', config.username);
  if (config.credential) settingsRepo.setConfig('turn_credential', config.credential);
  sendDebugLog('Settings', 'TURN configuration updated');
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

// Get peer fingerprint
ipcMain.handle('peer:get-fingerprint', async (_event, { peerId }) => {
  const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
  return existing ? { fingerprint: existing.fingerprint, trusted: existing.verified_by === 'user' } : null;
});

// Export/Import identity
ipcMain.handle('identity:export', async (_event, { passphrase }) => {
  return exportIdentity(passphrase);
});

ipcMain.handle('identity:import', async (_event, { backupData, passphrase }) => {
  await importIdentity(backupData, passphrase);
  // Re-initialize
  await getOrCreateIdentityKeys();
  const fingerprint = await getIdentityFingerprint();
  return { fingerprint };
});

// Get all known peers from database
ipcMain.handle('peers:get-all', () => {
  return peersRepo.getAllPeers();
});

// Retrieve message and status check-in history on renderer startup
ipcMain.handle('history:get', () => {
  return {
    messages: messagesRepo.getAllMessages().map(m => ({
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
      priority: m.priority,
      signature: m.signature
    })),
    statuses: statusesRepo.getAllPeerStatuses()
  };
});

// Cleanup on close
app.on('window-all-closed', () => {
  destroyDiscovery();
  closeSignalingServer();
  stopAutoSave();
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
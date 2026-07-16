import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import QRCode from 'qrcode';
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
let isSimulatedOffline = false;

const peerCache = new Map<string, any>();

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 950,
    minHeight: 650,
    frame: false, 
    title: 'Signum',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

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
  const userDataPath = app.getPath('userData');
  await getDatabase(userDataPath);
  startAutoSave(5000);

  let cachedPeerId = settingsRepo.getConfig('peer_id');
  if (!cachedPeerId) {
    cachedPeerId = crypto.randomUUID().substring(0, 8); 
    settingsRepo.setConfig('peer_id', cachedPeerId);
  }
  ourPeerId = cachedPeerId;

  ourUsername = settingsRepo.getConfig('username') || '';

  try {
    await getOrCreateIdentityKeys();
    const fingerprint = await getIdentityFingerprint();
    sendDebugLog('Crypto', `Identity key loaded/generated. Fingerprint: ${fingerprint}`);
  } catch (err: any) {
    sendDebugLog('Error', 'Failed to initialize identity keys', err.message);
  }

  initRouter(
    ourPeerId,
    () => {
      if (isSimulatedOffline) return [];
      return Array.from(peerCache.entries())
        .filter(([_, info]) => info.status === 'connected')
        .map(([id]) => id);
    },
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
        mainWindow.webContents.send('webrtc:send', { peerId, message });
      }
    },
    (message) => {
      sendDebugLog('Router', `Message ${message.id} successfully received and validated.`);
      if (mainWindow) {
        mainWindow.webContents.send('message:received', message);
      }
    }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function sendPeerListUpdate() {
  if (!mainWindow) return;
  const list = Array.from(peerCache.values()).map(p => ({
    id: p.id,
    displayName: p.displayName,
    address: p.address || 'direct',
    port: p.port || 0,
    status: isSimulatedOffline ? 'offline' : p.status
  }));
  mainWindow.webContents.send('peer:list', list);
}


ipcMain.on('identity:set-username', (_event, username) => {
  ourUsername = username;
  settingsRepo.setConfig('username', username);
  sendDebugLog('Identity', `Username set to: ${username}`);
});

ipcMain.handle('identity:get', () => {
  return {
    peerId: ourPeerId,
    username: ourUsername,
    address: 'direct',
    port: 0
  };
});

ipcMain.handle('identity:get-fingerprint', async () => {
  return getIdentityFingerprint();
});

ipcMain.handle('qr:generate', async (_event, { text }: { text: string }) => {
  try {
    return await QRCode.toDataURL(text);
  } catch (err: any) {
    sendDebugLog('Error', `Failed to generate QR code: ${err.message}`);
    throw err;
  }
});

ipcMain.handle('file:save-dialog', async (_event, { defaultName, content }) => {
  if (!mainWindow) return false;
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Signum Connection File', extensions: ['sig'] }]
  });
  if (filePath) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (err: any) {
      sendDebugLog('Error', `Failed to save connection file: ${err.message}`);
      return false;
    }
  }
  return false;
});

ipcMain.handle('file:open-dialog', async () => {
  if (!mainWindow) return null;
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Signum Connection File', extensions: ['sig'] }],
    properties: ['openFile']
  });
  if (filePaths && filePaths.length > 0) {
    try {
      return fs.readFileSync(filePaths[0], 'utf8');
    } catch (err: any) {
      sendDebugLog('Error', `Failed to read connection file: ${err.message}`);
      return null;
    }
  }
  return null;
});

ipcMain.on('message:send', (_event, { recipientId, type, payload, attachmentMeta, messageId, timestamp }) => {
  if (isSimulatedOffline) return;

  const meshMsg: MeshMessage = {
    id: messageId || crypto.randomUUID(),
    senderId: ourPeerId,
    senderName: ourUsername || 'Anonymous',
    recipientId,
    type,
    payload,
    timestamp: timestamp || Date.now(),
    ttl: 5,
    visitedNodes: [ourPeerId],
    hops: 0,
    attachmentMeta,
    priority: type === 'sos' ? 1 : 0
  };

  sendDebugLog('Router', `Originating message ${meshMsg.id} to ${recipientId} (${type})`);

  handleIncomingMessage(meshMsg, true);
});

ipcMain.on('message:save-decrypted', (_event, { id, decryptedPayload }) => {
  const msg = messagesRepo.getMessageById(id);
  if (msg) {
    msg.payload = decryptedPayload;
    msg.encrypted = 0; 
    messagesRepo.saveMessage(msg);
    sendDebugLog('Crypto', `Saved decrypted message ${id} to database history`);
  }
});



ipcMain.on('webrtc:status', (_event, { peerId, status, address, port, displayName, tempId }) => {
  if (tempId) {
    peerCache.delete(tempId);
  }

  let peer = peerCache.get(peerId);
  if (!peer && status === 'connected') {
    peer = {
      id: peerId,
      displayName: displayName || `Peer ${peerId.substring(0, 6)}`,
      address: address || 'direct',
      port: port || 0,
      status: 'connected'
    };
    peerCache.set(peerId, peer);
    sendDebugLog('Mesh', `Discovered manual connect peer: ${peer.displayName} (${peerId})`);
  }

  if (peer) {
    const oldStatus = peer.status;
    peer.status = status;
    if (oldStatus !== status) {
      sendDebugLog('Mesh', `Connection to peer ${peer.displayName} changed from ${oldStatus} to ${status}`);
      sendPeerListUpdate();

      if (status === 'connected') {
        syncUndeliveredMessagesToPeer(peerId);
      }
    }
  }
});

ipcMain.on('webrtc:received', (_event, { message }) => {
  if (isSimulatedOffline) return;

  const meshMsg = message as MeshMessage;
  sendDebugLog('Router', `Received mesh packet ${meshMsg.id} over WebRTC DataChannel`);

  handleIncomingMessage(meshMsg, false);
});

ipcMain.on('status:update', (_event, { status, location }) => {
  if (isSimulatedOffline) return;

  const checkinData = {
    peer_id: ourPeerId,
    display_name: ourUsername || 'Anonymous',
    status,
    location: location || null,
    timestamp: Date.now()
  };

  statusesRepo.savePeerStatus(checkinData);
  sendDebugLog('Status', `Check-in saved: ${status}${location ? ' @ ' + location : ''}`);

  const meshMsg: MeshMessage = {
    id: crypto.randomUUID(),
    senderId: ourPeerId,
    recipientId: 'broadcast',
    type: 'status',
    payload: JSON.stringify(checkinData),
    timestamp: Date.now(),
    ttl: 5,
    visitedNodes: [ourPeerId],
    hops: 0,
    priority: 0
  };
  handleIncomingMessage(meshMsg, true);

  const allStatuses = statusesRepo.getAllPeerStatuses();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status:sync', allStatuses);
  }
});

ipcMain.on('webrtc:key-handshake', async (_event, { peerId, publicKeyJwk }) => {
  try {
    const stored = cryptoKeysRepo.getSessionKey(peerId);
    if (stored) {
      sendDebugLog('Crypto', `Session key already exists for peer ${peerId}`);
      return;
    }
    sendDebugLog('Crypto', `Key handshake completed with peer ${peerId}`);
  } catch (err: any) {
    sendDebugLog('Crypto', `Failed to process key handshake for ${peerId}`, err.message);
  }
});

ipcMain.handle('peer:verify-fingerprint', async (_event, { peerId, fingerprint, displayName }) => {
  const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
  if (existing && existing.fingerprint === fingerprint) {
    return { verified: true, trusted: existing.verified_by === 'user' };
  }

  cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'auto', displayName);
  return { verified: true, trusted: false };
});

ipcMain.on('peer:trust-fingerprint', (_event, { peerId, fingerprint, displayName }) => {
  cryptoKeysRepo.saveVerifiedPeer(peerId, fingerprint, 'user', displayName);
  sendDebugLog('Security', `Manually trusted peer ${peerId} fingerprint`);
});

ipcMain.handle('webrtc:get-ice-servers', () => {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
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

ipcMain.handle('file:save-dialog', async (_event, { defaultName, content }) => {
  if (!mainWindow) return false;
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Signum Connection File', extensions: ['sig'] }]
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
});

ipcMain.handle('file:open-dialog', async () => {
  if (!mainWindow) return null;
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Signum Connection File', extensions: ['sig'] }],
    properties: ['openFile']
  });
  if (filePaths && filePaths.length > 0) {
    return fs.readFileSync(filePaths[0], 'utf8');
  }
  return null;
});

ipcMain.handle('peer:get-fingerprint', async (_event, { peerId }) => {
  const existing = cryptoKeysRepo.getVerifiedPeer(peerId);
  return existing ? { fingerprint: existing.fingerprint, trusted: existing.verified_by === 'user' } : null;
});

ipcMain.handle('identity:export', async (_event, { passphrase }) => {
  return exportIdentity(passphrase);
});

ipcMain.on('sim:toggle-offline', (_event, { offline }) => {
  isSimulatedOffline = offline;
  sendDebugLog('Sim', `offline mode set to: ${offline}`);

  sendPeerListUpdate();
  if (mainWindow) {
    mainWindow.webContents.send('sim:status', { offline });
  }
});

ipcMain.handle('identity:import', async (_event, { backupData, passphrase }) => {
  await importIdentity(backupData, passphrase);
  await getOrCreateIdentityKeys();
  const fingerprint = await getIdentityFingerprint();
  return { fingerprint };
});

ipcMain.handle('peers:get-all', () => {
  return peersRepo.getAllPeers();
});

ipcMain.handle('history:get', () => {
  return {
    messages: messagesRepo.getAllMessages().map(m => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      recipientId: m.recipient_id,
      type: m.type,
      payload: m.payload,
      encrypted: m.encrypted === 1,
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

app.on('window-all-closed', () => {
  stopAutoSave();
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
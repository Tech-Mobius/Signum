import { messageExists, saveMessage, DBMessage, getUndeliveredMessages, markMessageAcknowledged, getMessagesForRetry } from './db/repositories/messages';

export interface MeshMessage {
  id: string;
  senderId: string;
  senderName?: string; 
  recipientId: string;
  type: 'text' | 'sos' | 'file' | 'status';
  payload: string;
  timestamp: number;
  ttl: number;
  visitedNodes: string[];
  hops: number;
  attachmentMeta?: any;
  priority: number;
  signature?: string; 
  encrypted?: boolean; 
}

let ourPeerId = '';
let getConnectedPeerIds: () => string[] = () => [];
let sendToPeerCallback: (peerId: string, message: MeshMessage) => void = () => {};
let notifyRendererMessageReceived: (message: MeshMessage) => void = () => {};

export function initRouter(
  peerId: string,
  getConnectedPeers: () => string[],
  sendToPeer: (peerId: string, message: MeshMessage) => void,
  onMessageReceived: (message: MeshMessage) => void
) {
  ourPeerId = peerId;
  getConnectedPeerIds = getConnectedPeers;
  sendToPeerCallback = sendToPeer;
  notifyRendererMessageReceived = onMessageReceived;
}

function dbToMesh(dbMsg: DBMessage): MeshMessage {
  return {
    id: dbMsg.id,
    senderId: dbMsg.sender_id,
    senderName: dbMsg.sender_name,
    recipientId: dbMsg.recipient_id,
    type: dbMsg.type,
    payload: dbMsg.payload,
    encrypted: dbMsg.encrypted === 1,
    timestamp: dbMsg.timestamp,
    ttl: dbMsg.ttl,
    visitedNodes: JSON.parse(dbMsg.visited_nodes),
    hops: dbMsg.hops,
    attachmentMeta: dbMsg.attachment_meta ? JSON.parse(dbMsg.attachment_meta) : undefined,
    priority: dbMsg.priority,
    signature: dbMsg.signature,
  };
}

function meshToDb(meshMsg: MeshMessage, delivered = 0): DBMessage {
  return {
    id: meshMsg.id,
    sender_id: meshMsg.senderId,
    sender_name: meshMsg.senderName,
    recipient_id: meshMsg.recipientId,
    type: meshMsg.type,
    payload: meshMsg.payload,
    encrypted: meshMsg.encrypted ? 1 : 0,
    timestamp: meshMsg.timestamp,
    ttl: meshMsg.ttl,
    visited_nodes: JSON.stringify(meshMsg.visitedNodes),
    hops: meshMsg.hops,
    delivered,
    attachment_meta: meshMsg.attachmentMeta ? JSON.stringify(meshMsg.attachmentMeta) : undefined,
    priority: meshMsg.priority,
    signature: meshMsg.signature,
  };
}

export function handleIncomingMessage(msg: MeshMessage, isSelfOriginated = false): boolean {
  if (msg.hops === undefined) msg.hops = 0;
  if (msg.ttl === undefined) msg.ttl = 5;
  if (msg.priority === undefined) msg.priority = 0;
  if (!msg.visitedNodes) msg.visitedNodes = [];

  if (messageExists(msg.id) && !isSelfOriginated) {
    console.log(`[Router] Message ${msg.id} already exists. Deduplicated (dropped).`);
    return false;
  }

  console.log(`[Router] Processing message ${msg.id} from ${msg.senderId} to ${msg.recipientId} (Hops: ${msg.hops}, TTL: ${msg.ttl})`);

  if (!isSelfOriginated) {
    msg.ttl -= 1;
    msg.hops += 1;
  }

  if (msg.ttl <= 0) {
    console.log(`[Router] Message ${msg.id} TTL expired. Dropping.`);
    saveMessage(meshToDb(msg, 1));
    return false;
  }

  if (!msg.visitedNodes.includes(ourPeerId)) {
    msg.visitedNodes.push(ourPeerId);
  }

  const isForUs = msg.recipientId === ourPeerId || msg.recipientId === 'broadcast';

  saveMessage(meshToDb(msg, isForUs ? 1 : 0));

  if (isForUs && !isSelfOriginated) {
    notifyRendererMessageReceived(msg);
  }

  if (msg.recipientId === 'broadcast' || msg.recipientId !== ourPeerId) {
    const connectedPeers = getConnectedPeerIds();

    connectedPeers.forEach(peerId => {
      if (!msg.visitedNodes.includes(peerId)) {
        console.log(`[Router] Relaying message ${msg.id} to peer ${peerId}`);
        sendToPeerCallback(peerId, msg);
      }
    });
  }

  return true;
}

export function syncUndeliveredMessagesToPeer(peerId: string) {
  const undelivered = getUndeliveredMessages();

  if (undelivered.length === 0) return;

  console.log(`[Router] Syncing ${undelivered.length} potential messages to newly connected peer: ${peerId}`);

  undelivered.forEach(dbMsg => {
    const msg = dbToMesh(dbMsg);

    if (!msg.visitedNodes.includes(peerId)) {
      const isRecipientReachable = msg.recipientId === 'broadcast' || msg.recipientId === peerId;

      console.log(`[Router] Sync-forwarding stored message ${msg.id} to peer ${peerId}`);
      sendToPeerCallback(peerId, msg);
    }
  });
}

export function handleMessageAck(messageId: string, peerId: string): void {
  markMessageAcknowledged(messageId);
  console.log(`[Router] Message ${messageId} acknowledged by peer ${peerId}`);
}

export function retryUndeliveredMessages(): void {
  const messages = getMessagesForRetry(5); 

  messages.forEach(dbMsg => {
    const msg = dbToMesh(dbMsg);
    const connectedPeers = getConnectedPeerIds();

    connectedPeers.forEach(peerId => {
      if (!msg.visitedNodes.includes(peerId)) {
        console.log(`[Router] Retrying message ${msg.id} to peer ${peerId} (attempt ${(dbMsg.retry_count ?? 0) + 1})`);
        sendToPeerCallback(peerId, msg);
      }
    });
  });
}
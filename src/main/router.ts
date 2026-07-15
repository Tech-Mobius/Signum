import { 
  saveMessage, 
  messageExists, 
  DBMessage, 
  getUndeliveredMessages,
  markMessageDelivered
} from './database';

export interface MeshMessage {
  id: string;
  senderId: string;
  recipientId: string;
  type: 'text' | 'sos' | 'file' | 'status';
  payload: string;
  timestamp: number;
  ttl: number;
  visitedNodes: string[];
  hops: number;
  attachmentMeta?: any;
  priority: number;
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

// Convert DB message to Mesh message
function dbToMesh(dbMsg: DBMessage): MeshMessage {
  return {
    id: dbMsg.id,
    senderId: dbMsg.sender_id,
    recipientId: dbMsg.recipient_id,
    type: dbMsg.type,
    payload: dbMsg.payload,
    timestamp: dbMsg.timestamp,
    ttl: dbMsg.ttl,
    visitedNodes: JSON.parse(dbMsg.visited_nodes),
    hops: dbMsg.hops,
    attachmentMeta: dbMsg.attachment_meta ? JSON.parse(dbMsg.attachment_meta) : undefined,
    priority: dbMsg.priority
  };
}

// Convert Mesh message to DB message
function meshToDb(meshMsg: MeshMessage, delivered = 0): DBMessage {
  return {
    id: meshMsg.id,
    sender_id: meshMsg.senderId,
    recipient_id: meshMsg.recipientId,
    type: meshMsg.type,
    payload: meshMsg.payload,
    timestamp: meshMsg.timestamp,
    ttl: meshMsg.ttl,
    visited_nodes: JSON.stringify(meshMsg.visitedNodes),
    hops: meshMsg.hops,
    delivered,
    attachment_meta: meshMsg.attachmentMeta ? JSON.stringify(meshMsg.attachmentMeta) : undefined,
    priority: meshMsg.priority
  };
}

/**
 * Epidemic/Flood Mesh Routing Logic
 * Handles both outgoing messages and incoming relayed messages.
 */
export function handleIncomingMessage(msg: MeshMessage, isSelfOriginated = false): boolean {
  // 1. Deduplicate: check if message ID already processed
  if (messageExists(msg.id) && !isSelfOriginated) {
    console.log(`[Router] Message ${msg.id} already exists. Deduplicated (dropped).`);
    return false;
  }

  console.log(`[Router] Processing message ${msg.id} from ${msg.senderId} to ${msg.recipientId} (Hops: ${msg.hops}, TTL: ${msg.ttl})`);

  // 2. Decrement TTL and increment hops
  if (!isSelfOriginated) {
    msg.ttl -= 1;
    msg.hops += 1;
  }

  // Check TTL expiration
  if (msg.ttl <= 0) {
    console.log(`[Router] Message ${msg.id} TTL expired. Dropping.`);
    // Still save it to local database so we don't process it again (deduplication)
    saveMessage(meshToDb(msg, 1));
    return false;
  }

  // 3. Mark ourselves as visited to prevent back-and-forth loops
  if (!msg.visitedNodes.includes(ourPeerId)) {
    msg.visitedNodes.push(ourPeerId);
  }

  const isForUs = msg.recipientId === ourPeerId || msg.recipientId === 'broadcast';

  // 4. Save to database. If it's for us, mark as delivered (completed)
  saveMessage(meshToDb(msg, isForUs ? 1 : 0));

  // 5. Notify the renderer to display it if it's meant for us
  if (isForUs && !isSelfOriginated) {
    notifyRendererMessageReceived(msg);
  }

  // 6. Forwarding decision
  // If the message is a broadcast, or it's not meant for us, we flood/relay it
  if (msg.recipientId === 'broadcast' || msg.recipientId !== ourPeerId) {
    const connectedPeers = getConnectedPeerIds();
    
    // Flood routing: send to all connected peers who haven't seen it yet
    connectedPeers.forEach(peerId => {
      // Don't send back to nodes that have already visited/seen the message
      if (!msg.visitedNodes.includes(peerId)) {
        console.log(`[Router] Relaying message ${msg.id} to peer ${peerId}`);
        sendToPeerCallback(peerId, msg);
      }
    });
  }

  return true;
}

/**
 * Triggered when a new peer connects.
 * Syncs undelivered messages that haven't been seen by the peer.
 */
export function syncUndeliveredMessagesToPeer(peerId: string) {
  const undelivered = getUndeliveredMessages();
  
  if (undelivered.length === 0) return;
  
  console.log(`[Router] Syncing ${undelivered.length} potential messages to newly connected peer: ${peerId}`);

  undelivered.forEach(dbMsg => {
    const msg = dbToMesh(dbMsg);
    
    // Check if the peer has not visited/seen this message
    // And if it is a broadcast, or if it is destined for this peer
    if (!msg.visitedNodes.includes(peerId)) {
      const isRecipientReachable = msg.recipientId === 'broadcast' || msg.recipientId === peerId;
      
      // If it's a direct message for someone else, we can still relay it to this peer 
      // if it helps it reach the destination (epidemic routing allows storing and carrying).
      // So we forward it to any peer who hasn't seen it yet to increase the chance of delivery.
      console.log(`[Router] Sync-forwarding stored message ${msg.id} to peer ${peerId}`);
      sendToPeerCallback(peerId, msg);
    }
  });
}

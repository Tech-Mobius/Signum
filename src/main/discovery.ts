import { Bonjour } from 'bonjour-service';

let bonjourInstance: any = null;
let publishedService: any = null;
let browserInstance: any = null;
let isDestroying = false;

export interface DiscoveredPeer {
  id: string;
  displayName: string;
  address: string;
  port: number;
}

export function initDiscovery(
  peerId: string,
  displayName: string,
  signalingPort: number,
  onPeerUp: (peer: DiscoveredPeer) => void,
  onPeerDown: (peerId: string) => void
) {
  // If already initializing, wait
  if (isDestroying) {
    console.log('[Discovery] Waiting for cleanup to complete...');
    setTimeout(() => {
      initDiscovery(peerId, displayName, signalingPort, onPeerUp, onPeerDown);
    }, 100);
    return;
  }

  // Clean up existing instance if any
  if (bonjourInstance) {
    destroyDiscovery();
  }

  try {
    bonjourInstance = new Bonjour();

    // 1. Publish ourselves
    publishedService = bonjourInstance.publish({
      name: `signal-${peerId}`,
      type: 'signal-mesh',
      protocol: 'tcp',
      port: signalingPort,
      txt: {
        id: peerId,
        name: displayName,
      },
    });

    publishedService.on('error', (err: any) => {
      console.error('mDNS Publish Error:', err);
    });

    console.log(`mDNS Published: signal-${peerId} (Name: ${displayName}) on port ${signalingPort}`);

    // 2. Discover others
    browserInstance = bonjourInstance.find({
      type: 'signal-mesh',
      protocol: 'tcp',
    });

    browserInstance.on('up', (service: any) => {
      // Ignore ourselves
      if (service.name === `signal-${peerId}`) return;

      const txt = service.txt || {};
      const discoveredPeerId = txt.id;
      const discoveredName = txt.name || 'Anonymous Peer';

      // Get local IPv4 address
      const address = service.addresses?.[0] || service.referer?.address || '127.0.0.1';
      const port = service.port;

      if (discoveredPeerId) {
        console.log(`mDNS Peer Found: ${discoveredName} (${discoveredPeerId}) at ${address}:${port}`);
        onPeerUp({
          id: discoveredPeerId,
          displayName: discoveredName,
          address,
          port,
        });
      }
    });

    browserInstance.on('down', (service: any) => {
      const txt = service.txt || {};
      const discoveredPeerId = txt.id;
      if (discoveredPeerId) {
        console.log(`mDNS Peer Lost: ${discoveredPeerId}`);
        onPeerDown(discoveredPeerId);
      }
    });

    browserInstance.on('error', (err: any) => {
      console.error('mDNS Browser Error:', err);
    });

    browserInstance.start();
  } catch (err) {
    console.error('Failed to initialize discovery:', err);
    destroyDiscovery();
  }
}

export function updateDiscoveryName(peerId: string, newName: string, port: number) {
  if (publishedService) {
    publishedService.stop(() => {
      if (bonjourInstance) {
        publishedService = bonjourInstance.publish({
          name: `signal-${peerId}`,
          type: 'signal-mesh',
          protocol: 'tcp',
          port: port,
          txt: {
            id: peerId,
            name: newName,
          },
        });
      }
    });
  }
}

export function destroyDiscovery() {
  if (isDestroying) return;

  isDestroying = true;
  console.log('mDNS Discovery stopping...');

  // Stop browser
  if (browserInstance) {
    try {
      browserInstance.stop();
    } catch (e) {
      console.error('Error stopping browser:', e);
    }
    browserInstance = null;
  }

  // Stop published service
  if (publishedService) {
    try {
      publishedService.stop();
    } catch (e) {
      console.error('Error stopping service:', e);
    }
    publishedService = null;
  }

  // Destroy bonjour instance
  if (bonjourInstance) {
    try {
      bonjourInstance.destroy();
    } catch (e) {
      console.error('Error destroying bonjour:', e);
    }
    bonjourInstance = null;
  }

  isDestroying = false;
  console.log('mDNS Discovery stopped.');
}
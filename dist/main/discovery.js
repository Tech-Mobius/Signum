"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDiscovery = initDiscovery;
exports.updateDiscoveryName = updateDiscoveryName;
exports.destroyDiscovery = destroyDiscovery;
const bonjour_service_1 = require("bonjour-service");
let bonjourInstance = null;
let publishedService = null;
function initDiscovery(peerId, displayName, signalingPort, onPeerUp, onPeerDown) {
    if (bonjourInstance) {
        destroyDiscovery();
    }
    bonjourInstance = new bonjour_service_1.Bonjour();
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
    publishedService.on('error', (err) => {
        console.error('mDNS Publish Error:', err);
    });
    console.log(`mDNS Published: signal-${peerId} (Name: ${displayName}) on port ${signalingPort}`);
    // 2. Discover others
    const browser = bonjourInstance.find({
        type: 'signal-mesh',
        protocol: 'tcp',
    });
    browser.on('up', (service) => {
        // Ignore ourselves
        if (service.name === `signal-${peerId}`)
            return;
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
    browser.on('down', (service) => {
        const txt = service.txt || {};
        const discoveredPeerId = txt.id;
        if (discoveredPeerId) {
            console.log(`mDNS Peer Lost: ${discoveredPeerId}`);
            onPeerDown(discoveredPeerId);
        }
    });
}
function updateDiscoveryName(peerId, newName, port) {
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
function destroyDiscovery() {
    if (publishedService) {
        try {
            publishedService.stop();
        }
        catch (e) {
            console.error('Error stopping service:', e);
        }
        publishedService = null;
    }
    if (bonjourInstance) {
        try {
            bonjourInstance.destroy();
        }
        catch (e) {
            console.error('Error destroying bonjour:', e);
        }
        bonjourInstance = null;
    }
    console.log('mDNS Discovery stopped.');
}

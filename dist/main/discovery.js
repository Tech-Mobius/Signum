"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDiscovery = initDiscovery;
exports.updateDiscoveryName = updateDiscoveryName;
exports.destroyDiscovery = destroyDiscovery;
const bonjour_service_1 = require("bonjour-service");
let bonjourInstance = null;
let publishedService = null;
let browserInstance = null;
let isDestroying = false;
let updateTimer = null;
function initDiscovery(peerId, displayName, signalingPort, onPeerUp, onPeerDown) {
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
        browserInstance = bonjourInstance.find({
            type: 'signal-mesh',
            protocol: 'tcp',
        });
        browserInstance.on('up', (service) => {
            // Ignore ourselves
            if (service.name === `signal-${peerId}`)
                return;
            const txt = service.txt || {};
            const discoveredPeerId = txt.id;
            const discoveredName = txt.name || 'Anonymous Peer';
            // Get local IPv4 address
            const address = service.addresses?.find((addr) => !addr.includes(':')) || service.referer?.address || '127.0.0.1';
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
        // Periodically force update/query to handle Wi-Fi multicast packet loss
        if (updateTimer) {
            clearInterval(updateTimer);
        }
        updateTimer = setInterval(() => {
            if (browserInstance && !isDestroying) {
                console.log('[Discovery] Sending periodic mDNS query...');
                try {
                    browserInstance.update();
                }
                catch (e) {
                    console.error('[Discovery] Failed to update browser instance:', e);
                }
            }
        }, 5000);
        browserInstance.on('down', (service) => {
            const txt = service.txt || {};
            const discoveredPeerId = txt.id;
            if (discoveredPeerId) {
                console.log(`mDNS Peer Lost: ${discoveredPeerId}`);
                onPeerDown(discoveredPeerId);
            }
        });
        browserInstance.on('error', (err) => {
            console.error('mDNS Browser Error:', err);
        });
        browserInstance.start();
    }
    catch (err) {
        console.error('Failed to initialize discovery:', err);
        destroyDiscovery();
    }
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
    if (isDestroying)
        return;
    isDestroying = true;
    console.log('mDNS Discovery stopping...');
    // Stop browser
    if (browserInstance) {
        try {
            browserInstance.stop();
        }
        catch (e) {
            console.error('Error stopping browser:', e);
        }
        browserInstance = null;
    }
    // Stop published service
    if (publishedService) {
        try {
            publishedService.stop();
        }
        catch (e) {
            console.error('Error stopping service:', e);
        }
        publishedService = null;
    }
    // Clear update timer
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
    }
    // Destroy bonjour instance
    if (bonjourInstance) {
        try {
            bonjourInstance.destroy();
        }
        catch (e) {
            console.error('Error destroying bonjour:', e);
        }
        bonjourInstance = null;
    }
    isDestroying = false;
    console.log('mDNS Discovery stopped.');
}

import { useState, useEffect } from 'react';

export interface PeerInfo {
  id: string;
  displayName: string;
  address: string;
  port: number;
  status: 'connected' | 'searching' | 'offline' | 'relaying';
}

export function usePeers() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!window.api) return;

    // Load initial offline state
    const unsubSim = window.api.onSimStatusUpdated((status) => {
      setIsOffline(status.offline);
    });

    // Handle peer list updates from discovery
    const unsubPeers = window.api.onPeerListUpdated((list) => {
      setPeers(list);
    });

    return () => {
      unsubSim();
      unsubPeers();
    };
  }, []);

  const manualConnect = (address: string, port: number) => {
    if (!window.api) return;
    window.api.manualConnect(address, port);
  };

  const toggleOffline = (offline: boolean) => {
    if (!window.api) return;
    window.api.toggleOffline(offline);
    setIsOffline(offline);
  };

  const verifyFingerprint = async (peerId: string, fingerprint: string, displayName?: string) => {
    if (!window.api) return { verified: false, trusted: false, fingerprint: '' };
    return await window.api.verifyPeerFingerprint(peerId, fingerprint, displayName);
  };

  const trustFingerprint = (peerId: string, fingerprint: string, displayName?: string) => {
    if (!window.api) return;
    window.api.trustPeerFingerprint(peerId, fingerprint, displayName);
  };

  const getPeerFingerprint = async (peerId: string) => {
    if (!window.api) return null;
    return await window.api.getPeerFingerprint(peerId);
  };

  return {
    peers,
    isOffline,
    manualConnect,
    toggleOffline,
    verifyFingerprint,
    trustFingerprint,
    getPeerFingerprint,
  };
}

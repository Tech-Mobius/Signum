import { useState, useEffect } from 'react';

export interface IdentityInfo {
  peerId: string;
  username: string;
  address: string;
  port: number;
}

export function useIdentity() {
  const [identity, setIdentity] = useState<IdentityInfo | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.api) {
      setLoading(false);
      return;
    }

    async function loadIdentity() {
      try {
        const id = await window.api.getIdentity();
        setIdentity(id);
        const fp = await window.api.getFingerprint();
        setFingerprint(fp);
      } catch (err) {
        console.error('Failed to load identity info:', err);
      } finally {
        setLoading(false);
      }
    }

    loadIdentity();
  }, []);

  const setUsername = (username: string) => {
    if (!window.api) return;
    window.api.setUsername(username);
    window.api.getIdentity().then(setIdentity);
  };

  const exportBackup = async (passphrase: string): Promise<string> => {
    if (!window.api) throw new Error('Electron context not available');
    return await window.api.exportIdentity(passphrase);
  };

  const importBackup = async (backupData: string, passphrase: string): Promise<string> => {
    if (!window.api) throw new Error('Electron context not available');
    const res = await window.api.importIdentity(backupData, passphrase);
    const id = await window.api.getIdentity();
    setIdentity(id);
    setFingerprint(res.fingerprint);
    return res.fingerprint;
  };

  return {
    identity,
    fingerprint,
    loading,
    setUsername,
    exportBackup,
    importBackup,
  };
}

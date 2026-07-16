import React, { useState } from 'react';
import { StyleSheet, Text, View, Button, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function CameraScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  
  const [expectedTotalSize, setExpectedTotalSize] = useState<number | null>(null);
  const [receivedBlocks, setReceivedBlocks] = useState<Record<number, string>>({});
  const [payloadSize, setPayloadSize] = useState<number | null>(null);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.titleText}>Camera Permission Required</Text>
        <Text style={styles.descriptionText}>
          Signum needs permission to use your camera in order to scan connection invite and answer QR codes.
        </Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
            <Text style={styles.btnText}>GRANT PERMISSION</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.btnText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const decodeQRText = (qrText: string) => {
    const firstComma = qrText.indexOf(',');
    if (firstComma === -1) return null; 

    const checksumStr = qrText.substring(0, firstComma);
    const checksum = parseInt(checksumStr, 10);
    if (isNaN(checksum)) return null;

    const remainder = qrText.substring(firstComma);
    let expectedChecksum = 0;
    for (let i = 0; i < remainder.length; i++) {
      expectedChecksum += remainder.charCodeAt(i);
    }
    expectedChecksum %= 256;

    if (checksum !== expectedChecksum) return null;

    const parts = remainder.split(',');
    if (parts.length < 4) return null;

    const offset = parseInt(parts[1], 10);
    const totalSize = parseInt(parts[2], 10);
    const payload = parts.slice(3).join(',');

    if (isNaN(offset) || isNaN(totalSize)) return null;

    return { offset, totalSize, payload };
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    const decoded = decodeQRText(data);
    
    if (!decoded) {
      setScanned(true);
      onScan(data);
      return;
    }

    const { offset, totalSize, payload } = decoded;

    if (expectedTotalSize === null) {
      setExpectedTotalSize(totalSize);
      setPayloadSize(payload.length);
    } else if (totalSize !== expectedTotalSize) {
      return;
    }

    setReceivedBlocks((prev) => {
      if (prev[offset]) return prev; 
      const next = { ...prev, [offset]: payload };
      
      let currentSize = 0;
      Object.values(next).forEach(p => currentSize += p.length);
      
      if (currentSize === totalSize) {
        setScanned(true);
        const sortedOffsets = Object.keys(next).map(Number).sort((a, b) => a - b);
        let fullMessage = '';
        sortedOffsets.forEach(off => {
          fullMessage += next[off];
        });
        onScan(fullMessage);
      }
      return next;
    });
  };

  const numBlocksReceived = Object.keys(receivedBlocks).length;
  const numBlocksTotal = (expectedTotalSize && payloadSize) ? Math.ceil(expectedTotalSize / payloadSize) : 0;
  const progressPercent = numBlocksTotal > 0 ? Math.round((numBlocksReceived / numBlocksTotal) * 100) : 0;

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />
      <View style={styles.overlay}>
        {numBlocksTotal > 0 ? (
          <View style={styles.progressBox}>
            <Text style={styles.progressText}>
              RECEIVING: {numBlocksReceived} / {numBlocksTotal} BLOCKS ({progressPercent}%)
            </Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
          </View>
        ) : (
          <View style={styles.boxContainer}>
            <Text style={styles.overlayText}>ALIGN QR CODE IN FRAME</Text>
          </View>
        )}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>CLOSE SCANNER</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2328',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    color: '#8B95A5',
    fontFamily: 'System',
    fontSize: 14,
  },
  titleText: {
    color: '#E8ECF1',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  descriptionText: {
    color: '#8B95A5',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 280,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  grantBtn: {
    backgroundColor: '#5B8DB8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  cancelBtn: {
    backgroundColor: '#3A424D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  btnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  overlay: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
    width: '100%',
  },
  boxContainer: {
    backgroundColor: 'rgba(30, 35, 40, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4A9B6E',
    marginBottom: 24,
  },
  overlayText: {
    color: '#4A9B6E',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  closeButton: {
    backgroundColor: '#C45B5B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  progressBox: {
    backgroundColor: 'rgba(30, 35, 40, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5B8DB8',
    marginBottom: 24,
    width: '85%',
  },
  progressText: {
    color: '#E8ECF1',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#1E2328',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A424D',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4A9B6E',
  },
});

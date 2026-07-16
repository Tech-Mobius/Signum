import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import QRCodeSVG from 'react-native-qrcode-svg';

interface AnimatedQRCodeProps {
  value: string;
  payloadSize?: number;
  intervalMs?: number;
  size?: number;
}

export default function AnimatedQRCode({ 
  value, 
  payloadSize = 300, 
  intervalMs = 150,
  size = 200 
}: AnimatedQRCodeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const numQRCodes = Math.ceil(value.length / payloadSize) || 1;

  useEffect(() => {
    if (numQRCodes <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % numQRCodes);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [numQRCodes, intervalMs]);

  const offset = currentIndex * payloadSize;
  const payloadChunk = value.substring(offset, offset + payloadSize);
  
  let qrText = `,${offset},${value.length},${payloadChunk}`;
  let checksum = 0;
  for (let i = 0; i < qrText.length; i++) {
    checksum += qrText.charCodeAt(i);
  }
  checksum = checksum % 256;
  qrText = `${checksum}${qrText}`;

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCodeSVG value={qrText} size={size} color="#1E2328" backgroundColor="#fff" />
      </View>
      <View style={styles.controlsRow}>
        <Text style={styles.counterText}>
          {numQRCodes > 1 ? `Block ${currentIndex + 1} of ${numQRCodes}` : 'Single Block'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  qrWrapper: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    color: '#8B95A5',
    fontSize: 12,
    fontWeight: 'bold',
  }
});

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface Props {
  payload: string;
  chunkSize?: number;
  fps?: number;
}

export default function AnimatedQRCode({ payload, chunkSize = 200, fps = 10 }: Props) {
  const [frames, setFrames] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    async function generateFrames() {
      const total = Math.ceil(payload.length / chunkSize);
      if (total <= 1) {
        const url = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'L', width: 256, margin: 2 });
        setFrames([url]);
        setCurrentIndex(0);
        return;
      }

      const newFrames: string[] = [];
      for (let i = 0; i < total; i++) {
        const chunk = payload.substring(i * chunkSize, (i + 1) * chunkSize);
        const rawText = `${i}|${total}|${chunk}`;
        try {
          const url = await QRCode.toDataURL(rawText, { errorCorrectionLevel: 'L', width: 256, margin: 2 });
          newFrames.push(url);
        } catch (e) {
          console.error("QR Generate error", e);
        }
      }
      setFrames(newFrames);
      setCurrentIndex(0);
    }
    generateFrames();
  }, [payload, chunkSize]);

  useEffect(() => {
    if (frames.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % frames.length);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [frames, fps]);

  if (frames.length === 0) return <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-fog">Generating...</div>;

  return (
    <div className="flex flex-col items-center gap-2">
      <img src={frames[currentIndex]} alt="Animated QR" className="w-[180px] h-[180px] select-none rounded bg-white p-1" />
      {frames.length > 1 && (
        <div className="text-[10px] text-fog font-mono">
          Frame {currentIndex + 1} / {frames.length}
        </div>
      )}
    </div>
  );
}

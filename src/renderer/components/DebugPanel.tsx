import React, { useRef, useEffect } from 'react';

interface DebugPanelProps {
  logs: any[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Crypto:    'text-relay-blue',
  Router:    'text-amber-sos',
  Discovery: 'text-steady-green',
  Error:     'text-caution-red',
  WebRTC:    'text-relay-blue',
  File:      'text-fog',
  Mesh:      'text-steady-green',
  Signaling: 'text-relay-blue',
  Identity:  'text-snow',
  Status:    'text-steady-green',
  Sim:       'text-caution-red',
};

export default function DebugPanel({ logs }: DebugPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest log is prepended, so top = newest)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="text-[10px] text-fog/50 font-mono italic py-2">
        Waiting for network activity...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-0">
      {logs.map((log, idx) => {
        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const color = CATEGORY_COLORS[log.category] || 'text-fog';

        return (
          <div key={idx} className="log-row">
            <span className="text-fog/40 flex-shrink-0">[{time}]</span>
            <span className={`font-semibold flex-shrink-0 ${color}`}>
              [{log.category?.toUpperCase()}]
            </span>
            <span className="text-snow/80 break-all">{log.message}</span>
          </div>
        );
      })}
    </div>
  );
}

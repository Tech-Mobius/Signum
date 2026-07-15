import React from 'react';

interface DebugPanelProps {
  logs: any[];
}

export default function DebugPanel({ logs }: DebugPanelProps) {
  return (
    <div className="font-mono text-xs flex flex-col gap-1 text-fog select-text">
      {logs.length === 0 ? (
        <div className="text-[10px] text-fog/60 italic">
          No routing decisions logged yet. Network activity will appear here in real time.
        </div>
      ) : (
        logs.map((log, idx) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          
          let color = 'text-fog';
          if (log.category === 'Crypto') color = 'text-relay-blue';
          if (log.category === 'Router') color = 'text-amber-sos';
          if (log.category === 'Discovery') color = 'text-steady-green';
          if (log.category === 'Error') color = 'text-caution-red';

          return (
            <div key={idx} className="log-row flex gap-2">
              <span className="text-fog/40">[{time}]</span>
              <span className={`font-semibold ${color}`}>[{log.category.toUpperCase()}]</span>
              <span className="text-snow flex-1">{log.message}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

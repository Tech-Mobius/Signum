"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DebugPanel;
const jsx_runtime_1 = require("react/jsx-runtime");
function DebugPanel({ logs }) {
    return ((0, jsx_runtime_1.jsx)("div", { className: "font-mono text-xs flex flex-col gap-1 text-fog select-text", children: logs.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "text-[10px] text-fog/60 italic", children: "No routing decisions logged yet. Network activity will appear here in real time." })) : (logs.map((log, idx) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            let color = 'text-fog';
            if (log.category === 'Crypto')
                color = 'text-relay-blue';
            if (log.category === 'Router')
                color = 'text-amber-sos';
            if (log.category === 'Discovery')
                color = 'text-steady-green';
            if (log.category === 'Error')
                color = 'text-caution-red';
            return ((0, jsx_runtime_1.jsxs)("div", { className: "log-row flex gap-2", children: [(0, jsx_runtime_1.jsxs)("span", { className: "text-fog/40", children: ["[", time, "]"] }), (0, jsx_runtime_1.jsxs)("span", { className: `font-semibold ${color}`, children: ["[", log.category.toUpperCase(), "]"] }), (0, jsx_runtime_1.jsx)("span", { className: "text-snow flex-1", children: log.message })] }, idx));
        })) }));
}

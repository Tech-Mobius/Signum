"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PeerList;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
function PeerList({ peers, selectedPeerId, setSelectedPeerId }) {
    const [manualIp, setManualIp] = (0, react_1.useState)('');
    const [manualPort, setManualPort] = (0, react_1.useState)('50001');
    const [showManualForm, setShowManualForm] = (0, react_1.useState)(false);
    const handleManualConnect = (e) => {
        e.preventDefault();
        if (!manualIp)
            return;
        // Call manual connect API
        window.api.manualConnect(manualIp, parseInt(manualPort));
        setManualIp('');
        setShowManualForm(false);
    };
    const getStatusIcon = (status) => {
        switch (status) {
            case 'connected':
                return (0, jsx_runtime_1.jsx)(lucide_react_1.SignalHigh, { className: "w-4 h-4 text-steady-green" });
            case 'relaying':
                return (0, jsx_runtime_1.jsx)(lucide_react_1.Signal, { className: "w-4 h-4 text-relay-blue" });
            case 'searching':
                return (0, jsx_runtime_1.jsx)(lucide_react_1.HelpCircle, { className: "w-4 h-4 text-fog animate-pulse" });
            default:
                return (0, jsx_runtime_1.jsx)(lucide_react_1.AlertCircle, { className: "w-4 h-4 text-caution-red" });
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-3 h-full", children: [(0, jsx_runtime_1.jsxs)("div", { onClick: () => setSelectedPeerId('broadcast'), className: `flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${selectedPeerId === 'broadcast'
                    ? 'bg-slate-light border-fog'
                    : 'bg-slate-base/50 border-transparent hover:border-slate-light'}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Radio, { className: "w-5 h-5 text-amber-sos" }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "font-semibold text-sm", children: "ALL PEERS (BROADCAST)" }), (0, jsx_runtime_1.jsx)("div", { className: "text-xs text-fog", children: "Floods network, SOS Net" })] })] }), (0, jsx_runtime_1.jsx)("span", { className: "badge-status status-online", children: "ALL" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center mt-2 px-1", children: [(0, jsx_runtime_1.jsx)("span", { className: "text-xs font-semibold text-fog uppercase tracking-wider", children: "Nearby Devices" }), (0, jsx_runtime_1.jsxs)("button", { onClick: () => setShowManualForm(!showManualForm), className: "text-xs text-relay-blue hover:text-white flex items-center gap-1 cursor-pointer", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Plus, { className: "w-3.5 h-3.5" }), " MANUAL IP"] })] }), showManualForm && ((0, jsx_runtime_1.jsxs)("form", { onSubmit: handleManualConnect, className: "flex flex-col gap-2 p-3 bg-slate-base/50 rounded-lg border border-slate-light", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-xs text-fog mb-1 font-mono", children: "Connect manual target:" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "e.g. 192.168.1.15", value: manualIp, onChange: e => setManualIp(e.target.value), className: "input flex-1 py-1 px-2 text-xs", required: true }), (0, jsx_runtime_1.jsx)("input", { type: "number", placeholder: "Port", value: manualPort, onChange: e => setManualPort(e.target.value), className: "input w-20 py-1 px-2 text-xs", required: true })] }), (0, jsx_runtime_1.jsx)("button", { type: "submit", className: "btn btn-primary py-1 text-xs", children: "Connect" })] })), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 overflow-y-auto flex flex-col gap-2", children: peers.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "text-center py-8 text-xs text-fog font-mono flex flex-col items-center gap-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "animate-spin rounded-full h-4 w-4 border-b-2 border-fog" }), "Searching for nearby devices..."] })) : (peers.map(peer => ((0, jsx_runtime_1.jsxs)("div", { onClick: () => setSelectedPeerId(peer.id), className: `flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${selectedPeerId === peer.id
                        ? 'bg-slate-light border-fog'
                        : 'bg-slate-base/30 border-transparent hover:border-slate-light'}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [getStatusIcon(peer.status), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("div", { className: "font-semibold text-sm truncate max-w-[120px]", children: peer.displayName }), (0, jsx_runtime_1.jsxs)("div", { className: "text-[10px] text-fog font-mono", children: ["ID: ", peer.id, " \u2022 ", peer.address] })] })] }), (0, jsx_runtime_1.jsx)("span", { className: `badge-status status-${peer.status}`, children: peer.status.toUpperCase() })] }, peer.id)))) })] }));
}

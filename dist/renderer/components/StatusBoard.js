"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = StatusBoard;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
function StatusBoard({ statuses }) {
    const [myStatus, setMyStatus] = (0, react_1.useState)('safe');
    const [myLocation, setMyLocation] = (0, react_1.useState)('');
    const handleCheckIn = (e) => {
        e.preventDefault();
        window.api.updateStatus(myStatus, myLocation);
        // Location clear or keep
        setMyLocation('');
    };
    const getStatusBadge = (status) => {
        switch (status) {
            case 'safe':
                return ((0, jsx_runtime_1.jsxs)("span", { className: "flex items-center gap-1 text-xs text-steady-green font-semibold bg-steady-green/10 px-2 py-0.5 rounded border border-steady-green/20", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.CheckCircle, { className: "w-3.5 h-3.5" }), " SAFE"] }));
            case 'need-help':
                return ((0, jsx_runtime_1.jsxs)("span", { className: "flex items-center gap-1 text-xs text-amber-sos font-semibold bg-amber-sos/10 px-2 py-0.5 rounded border border-amber-sos/20", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.AlertTriangle, { className: "w-3.5 h-3.5" }), " NEED HELP"] }));
            default:
                return ((0, jsx_runtime_1.jsx)("span", { className: "text-xs text-fog bg-slate-light px-2 py-0.5 rounded", children: "UNKNOWN" }));
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-3", children: [(0, jsx_runtime_1.jsxs)("form", { onSubmit: handleCheckIn, className: "flex flex-col gap-2 p-2 bg-slate-base/30 rounded border border-slate-light", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-[10px] text-fog font-semibold uppercase tracking-wider", children: "Update my status" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-2", children: [(0, jsx_runtime_1.jsxs)("select", { value: myStatus, onChange: e => setMyStatus(e.target.value), className: "input py-1 px-2 text-xs flex-1", children: [(0, jsx_runtime_1.jsx)("option", { value: "safe", children: "I'm Safe" }), (0, jsx_runtime_1.jsx)("option", { value: "need-help", children: "Need Assistance" })] }), (0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Location (e.g. Room 4B)", value: myLocation, onChange: e => setMyLocation(e.target.value), className: "input py-1 px-2 text-xs flex-[2]" })] }), (0, jsx_runtime_1.jsxs)("button", { type: "submit", className: "btn btn-primary py-1 text-xs w-full flex items-center justify-center gap-1", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.Heart, { className: "w-3.5 h-3.5" }), " Check-in Status"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1", children: statuses.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "text-center py-4 text-[10px] text-fog font-mono", children: "No check-in reports synced yet." })) : (statuses.map((item) => ((0, jsx_runtime_1.jsxs)("div", { className: "status-item flex flex-col gap-1 border-b border-slate-light/30 pb-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center", children: [(0, jsx_runtime_1.jsx)("span", { className: "font-semibold text-xs text-snow", children: item.display_name }), getStatusBadge(item.status)] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex justify-between items-center text-[10px] text-fog font-mono", children: [(0, jsx_runtime_1.jsxs)("span", { className: "flex items-center gap-0.5 truncate max-w-[150px]", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.MapPin, { className: "w-3 h-3 text-fog" }), " ", item.location || 'Not Specified'] }), (0, jsx_runtime_1.jsx)("span", { children: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] })] }, item.peer_id)))) })] }));
}

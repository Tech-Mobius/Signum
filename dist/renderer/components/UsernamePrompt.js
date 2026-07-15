"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = UsernamePrompt;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
function UsernamePrompt({ onSave }) {
    const [name, setName] = (0, react_1.useState)('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim())
            return;
        onSave(name.trim());
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "modal-overlay", children: (0, jsx_runtime_1.jsxs)("div", { className: "modal-content text-center", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex justify-center mb-2", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Shield, { className: "w-12 h-12 text-amber-sos animate-pulse" }) }), (0, jsx_runtime_1.jsx)("h2", { className: "text-lg font-bold text-snow", children: "INITIALIZE DEVICE IDENTITY" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-fog max-w-[320px] mx-auto leading-relaxed", children: "Welcome to the Signal mesh network. Please choose a callsign or name to identify your device on the local emergency grid." }), (0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, className: "flex flex-col gap-3 mt-2", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "Enter callsign (e.g. Alice, Base-Alpha)", value: name, onChange: e => setName(e.target.value), className: "input w-full text-center text-sm py-2", maxLength: 18, autoFocus: true, required: true }), (0, jsx_runtime_1.jsxs)("button", { type: "submit", className: "btn btn-primary py-2 font-semibold flex items-center justify-center gap-1.5", children: ["Join Emergency Mesh ", (0, jsx_runtime_1.jsx)(lucide_react_1.ArrowRight, { className: "w-4 h-4" })] })] }), (0, jsx_runtime_1.jsx)("div", { className: "text-[9px] font-mono text-fog mt-2", children: "Offline P2P protocol \u2022 No internet connection required" })] }) }));
}

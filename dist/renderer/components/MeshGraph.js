"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MeshGraph;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const d3 = __importStar(require("d3"));
function MeshGraph({ peers, ourId, messages }) {
    const svgRef = (0, react_1.useRef)(null);
    const simulationRef = (0, react_1.useRef)(null);
    // Triggered when messages update to check for new hops to animate
    (0, react_1.useEffect)(() => {
        if (messages.length === 0 || !ourId)
            return;
        // Find the latest message and animate it if it was received recently (within last 3 seconds)
        const latestMsg = messages[messages.length - 1];
        if (Date.now() - latestMsg.timestamp > 3000)
            return;
        // Determine hop sender and receiver coordinates
        // We animate from the sender node to the receiver node (or broadcast to all connected)
        const fromId = latestMsg.senderId;
        const toId = latestMsg.recipientId === 'broadcast' ? null : latestMsg.recipientId;
        if (toId) {
            animateParticle(fromId, toId, latestMsg.type);
        }
        else {
            // For broadcast, animate to all connected peers
            peers.filter(p => p.status === 'connected').forEach(peer => {
                animateParticle(fromId, peer.id, latestMsg.type);
            });
        }
    }, [messages]);
    const animateParticle = (fromId, toId, type) => {
        const svg = d3.select(svgRef.current);
        const fromNode = svg.select(`#node-${fromId}`);
        const toNode = svg.select(`#node-${toId}`);
        if (fromNode.empty() || toNode.empty())
            return;
        // Get positions
        const fromX = parseFloat(fromNode.attr('cx'));
        const fromY = parseFloat(fromNode.attr('cy'));
        const toX = parseFloat(toNode.attr('cx'));
        const toY = parseFloat(toNode.attr('cy'));
        if (isNaN(fromX) || isNaN(fromY) || isNaN(toX) || isNaN(toY))
            return;
        // Create flying particle
        const color = type === 'sos' ? '#E5A83B' : '#5B8DB8';
        const radius = type === 'sos' ? 6 : 4;
        const particle = svg.append('circle')
            .attr('cx', fromX)
            .attr('cy', fromY)
            .attr('r', radius)
            .attr('fill', color)
            .attr('opacity', 0.9)
            .style('pointer-events', 'none');
        // Animate along the straight line
        particle.transition()
            .duration(1000)
            .ease(d3.easeQuadOut)
            .attr('cx', toX)
            .attr('cy', toY)
            .on('end', () => {
            particle.remove();
            // Target Node Impact Ripple
            const ripple = svg.append('circle')
                .attr('cx', toX)
                .attr('cy', toY)
                .attr('r', 10)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('opacity', 0.8)
                .style('pointer-events', 'none');
            ripple.transition()
                .duration(800)
                .attr('r', type === 'sos' ? 50 : 30)
                .attr('opacity', 0)
                .on('end', () => ripple.remove());
        });
    };
    (0, react_1.useEffect)(() => {
        if (!svgRef.current || !ourId)
            return;
        const svg = d3.select(svgRef.current);
        const width = svgRef.current.clientWidth || 340;
        const height = svgRef.current.clientHeight || 450;
        // Clear svg elements
        svg.selectAll('*').remove();
        // Prepare graph data
        // 1. Nodes: Add ourselves and online/relaying peers
        const nodes = [
            { id: ourId, label: 'YOU (Self)', isSelf: true, status: 'connected' },
            ...peers.map(p => ({
                id: p.id,
                label: p.displayName,
                isSelf: false,
                status: p.status
            }))
        ];
        // 2. Links: Add edges
        const links = [];
        peers.forEach(peer => {
            if (peer.status === 'connected') {
                links.push({ source: ourId, target: peer.id, type: 'direct' });
            }
            else if (peer.status === 'relaying') {
                links.push({ source: ourId, target: peer.id, type: 'relay' });
            }
        });
        // Create D3 groups
        const gLinks = svg.append('g').attr('class', 'links');
        const gNodes = svg.append('g').attr('class', 'nodes');
        const gLabels = svg.append('g').attr('class', 'labels');
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id((d) => d.id).distance(120))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(25));
        simulationRef.current = simulation;
        // Draw Links
        const link = gLinks.selectAll('line')
            .data(links)
            .enter()
            .append('line')
            .attr('class', (d) => `d3-link ${d.type}`)
            .attr('stroke', (d) => d.type === 'direct' ? '#4A9B6E' : '#5B8DB8')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', (d) => d.type === 'relay' ? '4 4' : 'none');
        // Draw Nodes
        const node = gNodes.selectAll('circle')
            .data(nodes)
            .enter()
            .append('circle')
            .attr('id', (d) => `node-${d.id}`)
            .attr('class', 'd3-node')
            .attr('r', (d) => d.isSelf ? 15 : 12)
            .attr('fill', (d) => {
            if (d.isSelf)
                return '#E5A83B';
            if (d.status === 'connected')
                return '#4A9B6E';
            if (d.status === 'relaying')
                return '#5B8DB8';
            return '#8B95A5'; // offline or searching
        })
            .attr('stroke', '#1E2328')
            .attr('stroke-width', 2)
            .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));
        // Draw Labels
        const label = gLabels.selectAll('text')
            .data(nodes)
            .enter()
            .append('text')
            .attr('font-size', '10px')
            .attr('font-family', 'Inter, sans-serif')
            .attr('fill', '#E8ECF1')
            .attr('text-anchor', 'middle')
            .attr('dy', (d) => d.isSelf ? -22 : -18)
            .text((d) => d.label);
        // Tick listener
        simulation.on('tick', () => {
            link
                .attr('x1', (d) => d.source.x)
                .attr('y1', (d) => d.source.y)
                .attr('x2', (d) => d.target.x)
                .attr('y2', (d) => d.target.y);
            node
                .attr('cx', (d) => d.x = Math.max(15, Math.min(width - 15, d.x)))
                .attr('cy', (d) => d.y = Math.max(15, Math.min(height - 15, d.y)));
            label
                .attr('x', (d) => d.x)
                .attr('y', (d) => d.y);
        });
        // Drag Helpers
        function dragstarted(event, d) {
            if (!event.active)
                simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active)
                simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        return () => {
            simulation.stop();
        };
    }, [peers, ourId]);
    return ((0, jsx_runtime_1.jsx)("div", { className: "d3-container w-full h-full", children: (0, jsx_runtime_1.jsx)("svg", { ref: svgRef, className: "d3-svg" }) }));
}

# Project: Signal — Offline-First P2P Emergency Communication App

## Overview
An Electron + React/Vite desktop application for peer-to-peer emergency mesh communication over local networks. Uses WebRTC DataChannels, mDNS auto-discovery, SQLite store-and-forward routing, ECDH+AES-256-GCM encryption, and D3.js force-directed mesh visualization. Packaged as a standalone Windows executable distributable via USB.

## Architecture

### System Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ mDNS Service │  │  WebSocket   │  │  SQLite DB    │ │
│  │ (bonjour-    │  │  Signaling   │  │ (better-      │ │
│  │  service)    │  │  Server      │  │  sqlite3)     │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                 │                   │         │
│  ┌──────┴─────────────────┴───────────────────┴───────┐ │
│  │              PeerManager (IPC Bridge)               │ │
│  └─────────────────────┬───────────────────────────────┘ │
│                        │ IPC                             │
├────────────────────────┼────────────────────────────────┤
│                        │                                 │
│  ┌─────────────────────┴───────────────────────────────┐ │
│  │             Electron Renderer (React/Vite)          │ │
│  │                                                     │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────────┐ │ │
│  │  │Messages│ │Peers   │ │Status  │ │ D3.js Mesh  │ │ │
│  │  │Panel   │ │List    │ │Board   │ │ Topology    │ │ │
│  │  └────────┘ └────────┘ └────────┘ └─────────────┘ │ │
│  │  ┌────────┐ ┌────────┐ ┌────────────────────────┐ │ │
│  │  │SOS     │ │File    │ │ Debug/Log Panel        │ │ │
│  │  │Button  │ │Attach  │ │                        │ │ │
│  │  └────────┘ └────────┘ └────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Flow
1. **Discovery**: mDNS broadcasts/listens → finds peers on LAN → exchanges IPs
2. **Connection**: WebSocket signaling exchanges SDP/ICE → WebRTC DataChannel established
3. **Key Exchange**: ECDH public keys exchanged over DataChannel → shared secret derived
4. **Messaging**: Messages encrypted (AES-256-GCM) → sent over DataChannel or stored/forwarded
5. **Routing**: Flood routing with TTL, visited-nodes dedup, SQLite persistence
6. **Visualization**: Peer/connection state → D3.js force graph updated in real time

### Technology Stack
- **Runtime**: Electron 28+
- **Renderer**: React 18 + Vite 5
- **WebRTC**: simple-peer + wrtc
- **Discovery**: bonjour-service (pure JS mDNS)
- **Signaling**: ws (WebSocket server in main process)
- **Database**: better-sqlite3 (SQLite)
- **Encryption**: WebCrypto API (ECDH + AES-256-GCM)
- **Visualization**: D3.js (force-directed graph)
- **Packaging**: electron-builder (Windows NSIS/portable)
- **Fonts**: Inter (humanist sans), JetBrains Mono (monospace) — bundled locally

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Project Scaffold & Electron Shell | Electron + Vite + React boilerplate, window management, IPC bridge, username prompt, font bundling | none | PLANNED |
| 2 | Networking Layer | mDNS discovery, WebSocket signaling server, WebRTC DataChannel connections, peer management | M1 | PLANNED |
| 3 | Core Features | Store-and-forward routing (SQLite), E2E encryption (ECDH+AES-256-GCM), direct/broadcast messaging, file transfer, I'm Safe status, SOS alerts | M2 | PLANNED |
| 4 | UI & Visualization | D3.js force-directed topology graph, design system implementation, all UI panels, offline simulation button, debug log panel, SOS animations | M3 | PLANNED |
| 5 | Packaging, Testing & Documentation | electron-builder config, README, automated 3-instance test script, final integration | M4 | PLANNED |

## Interface Contracts

### Main Process ↔ Renderer (IPC Channels)

```typescript
// Discovery & Connection
'peer:discovered'       → { peerId: string, displayName: string, address: string, port: number }
'peer:connected'        → { peerId: string, displayName: string, connectionType: 'direct' | 'relay' }
'peer:disconnected'     → { peerId: string, reason: string }
'peer:connect-manual'   ← { address: string, port: number }
'peer:list'             → PeerInfo[]

// Messaging
'message:send'          ← { recipientId: string | 'broadcast', type: 'text' | 'sos' | 'file', payload: string, attachmentMeta?: FileMeta }
'message:received'      → { messageId: string, senderId: string, senderName: string, type: string, payload: string, hops: number, timestamp: number, encrypted: boolean }
'message:delivered'     → { messageId: string, recipientId: string, hops: number }
'message:stored'        → { messageId: string, reason: 'peer-offline' }

// File Transfer
'file:send'             ← { recipientId: string, filePath: string, fileName: string, fileSize: number }
'file:progress'         → { messageId: string, progress: number }
'file:received'         → { messageId: string, fileName: string, filePath: string, senderId: string }

// Status Board
'status:update'         ← { status: 'safe' | 'need-help' | 'unknown', location?: string }
'status:sync'           → { peerId: string, displayName: string, status: string, location?: string, timestamp: number }[]

// Mesh Topology
'topology:update'       → { nodes: TopologyNode[], edges: TopologyEdge[] }
'topology:message-hop'  → { messageId: string, fromNode: string, toNode: string, type: string }

// Simulation & Debug
'sim:toggle-offline'    ← { offline: boolean }
'sim:status'            → { offline: boolean }
'debug:log'             → { timestamp: number, level: 'info'|'warn'|'error', category: string, message: string, data?: any }

// Identity
'identity:set-username' ← { username: string }
'identity:get'          → { peerId: string, username: string, address: string, port: number }
```

### Data Models

```typescript
interface Message {
  id: string;              // UUID
  senderId: string;        // Peer ID of sender
  recipientId: string;     // Peer ID or 'broadcast'
  type: 'text' | 'sos' | 'file' | 'status';
  payload: string;         // Encrypted payload (base64)
  timestamp: number;       // Unix ms
  ttl: number;             // Hop count limit (default 5)
  visitedNodes: string[];  // Peer IDs that have seen this message
  hops: number;            // Current hop count
  delivered: boolean;
}

interface PeerInfo {
  id: string;
  displayName: string;
  address: string;
  port: number;
  status: 'connected' | 'relaying' | 'searching' | 'offline';
  publicKey?: string;      // ECDH public key (JWK base64)
  lastSeen: number;
}

interface TopologyNode {
  id: string;
  label: string;
  status: 'online' | 'offline';
  isSelf: boolean;
}

interface TopologyEdge {
  source: string;
  target: string;
  strength: 'direct' | 'relay';
  active: boolean;
}

interface StatusEntry {
  peerId: string;
  displayName: string;
  status: 'safe' | 'need-help' | 'unknown';
  location?: string;
  timestamp: number;
}
```

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  payload TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 5,
  visited_nodes TEXT NOT NULL DEFAULT '[]',
  hops INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS peer_statuses (
  peer_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  location TEXT,
  timestamp INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS identity (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_delivered ON messages(delivered);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
```

## Code Layout

```
Signal/
├── package.json                  # Dependencies, scripts, electron-builder config
├── electron-builder.yml          # electron-builder configuration (or in package.json)
├── vite.config.ts                # Vite configuration for renderer
├── vite.main.config.ts           # Vite configuration for main process
├── vite.preload.config.ts        # Vite configuration for preload script
├── tsconfig.json                 # TypeScript configuration
├── README.md                     # Build, distribution, demo instructions
├── PROJECT.md                    # This file
│
├── src/
│   ├── main/                     # Electron main process
│   │   ├── index.ts              # Entry point, window creation, IPC setup
│   │   ├── discovery.ts          # mDNS service (bonjour-service)
│   │   ├── signaling.ts          # WebSocket signaling server
│   │   ├── peer-manager.ts       # WebRTC peer connections (simple-peer + wrtc)
│   │   ├── router.ts             # Store-and-forward mesh routing logic
│   │   ├── database.ts           # SQLite database (better-sqlite3)
│   │   ├── encryption.ts         # ECDH + AES-256-GCM encryption
│   │   ├── file-transfer.ts      # File chunking and reassembly
│   │   └── ipc-handlers.ts       # IPC channel handlers
│   │
│   ├── preload/
│   │   └── index.ts              # Preload script, contextBridge API
│   │
│   └── renderer/                 # React renderer
│       ├── index.html            # HTML entry point
│       ├── main.tsx              # React entry point
│       ├── App.tsx               # Root component, layout
│       ├── styles/
│       │   ├── globals.css       # Global styles, CSS variables, font-face
│       │   └── design-tokens.ts  # Design system tokens (colors, typography)
│       ├── components/
│       │   ├── Layout/
│       │   │   ├── TitleBar.tsx   # Custom title bar
│       │   │   ├── Sidebar.tsx    # Navigation sidebar
│       │   │   └── StatusBar.tsx  # Bottom status bar
│       │   ├── Chat/
│       │   │   ├── MessageList.tsx    # Message list with routing indicators
│       │   │   ├── MessageInput.tsx   # Text input + file attachment
│       │   │   ├── MessageBubble.tsx  # Individual message display
│       │   │   └── SOSButton.tsx      # SOS broadcast button
│       │   ├── Peers/
│       │   │   ├── PeerList.tsx       # Connected peers list
│       │   │   ├── PeerCard.tsx       # Individual peer status card
│       │   │   └── ManualConnect.tsx  # Manual IP connection form
│       │   ├── Topology/
│       │   │   └── MeshGraph.tsx      # D3.js force-directed graph (centerpiece)
│       │   ├── StatusBoard/
│       │   │   ├── StatusBoard.tsx    # I'm Safe status board
│       │   │   └── StatusEntry.tsx    # Individual status entry
│       │   ├── Debug/
│       │   │   └── DebugPanel.tsx     # Real-time debug log panel
│       │   └── Common/
│       │       ├── UsernamePrompt.tsx # First-launch username dialog
│       │       └── OfflineToggle.tsx  # Simulate offline button
│       ├── hooks/
│       │   ├── useIPC.ts             # IPC communication hook
│       │   ├── usePeers.ts           # Peer state management
│       │   ├── useMessages.ts        # Message state management
│       │   └── useTopology.ts        # Topology state management
│       └── lib/
│           ├── ipc-api.ts            # Typed IPC API wrapper
│           └── types.ts              # Shared TypeScript types
│
├── assets/
│   ├── fonts/
│   │   ├── Inter/                # Inter font family files (.woff2)
│   │   └── JetBrainsMono/       # JetBrains Mono font files (.woff2)
│   ├── icons/
│   │   └── icon.png             # App icon (256x256+)
│   └── sounds/
│       └── sos-alert.mp3        # SOS alert sound
│
├── test/
│   └── store-and-forward-test.js # Automated 3-instance test script
│
└── .agents/                      # Agent metadata only
```

## Design System

### Color Palette
| Name | Hex | Use |
|------|-----|-----|
| Slate Base | #1E2328 | Primary background, dark mode base |
| Slate Mid | #2A3038 | Panel backgrounds, cards |
| Slate Light | #3A424D | Borders, dividers, inactive elements |
| Fog | #8B95A5 | Secondary text, muted labels, timestamps |
| Snow | #E8ECF1 | Primary text, headings |
| Signal Amber | #E5A83B | SOS/urgent states — RESERVED exclusively |
| Steady Green | #4A9B6E | Connected, delivered, safe status |
| Relay Blue | #5B8DB8 | Relay connections, in-transit, 1-2 hop |
| Caution Red | #C45B5B | Offline, error, disconnected states |

### Typography
- **Humanist Sans (Inter)**: Messages, names, statuses, UI labels — warmth and readability
- **Monospace (JetBrains Mono)**: Peer IDs, hop counts, timestamps, debug logs, technical data

### Layout
A three-column control-panel layout optimized for laptop screens. Left panel: peer list and status board (narrow). Center panel: message area with SOS button. Right panel: mesh topology graph (D3.js force-directed — the visual anchor) with debug log below. Top: custom title bar with app identity and connection status. Bottom: status bar with own IP address and mesh stats. Clean dividers, no heavy card shadows. Information hierarchy through typography weight and spacing rather than visual clutter.

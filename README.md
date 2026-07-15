# Signal — Offline P2P Emergency Mesh Net

Signal is an offline-first, peer-to-peer emergency communication tool built for situations where cell towers and the internet are completely disabled. It runs on local network hardware (WiFi hotspot or direct Ethernet) with zero external uplink, enabling direct and store-and-forward mesh messaging, location check-ins, and file sharing.

---

## Technical Architecture

Signal is packaged as a standalone **Electron** app with a **React (Vite)** frontend. It operates on a hybrid WebRTC architecture:
1. **Local Auto-Discovery**: Handled in the **Electron Main process** using pure JavaScript mDNS (`bonjour-service`) to avoid native C++ compilation issues.
2. **Signaling Server**: An embedded WebSocket server runs inside the Main process of each app instance on a dynamic port, exchanging SDP offers/answers.
3. **P2P Channels**: WebRTC DataChannels are instantiated in the **Renderer process** (using Chromium's native `RTCPeerConnection` for stability and zero native module headaches).
4. **Mesh Routing**: Store-and-forward epidemic/flood routing backed by a local **JSON file-based database** in the Main process.
5. **E2E Encryption**: Direct messages are secured using **ECDH P-256** key exchange and **AES-256-GCM** via the WebCrypto API.
6. **Visual Centerpiece**: A live, physics-based, force-directed network topology graph rendered with **D3.js** in real time, featuring flying message packets and SOS ripples.
7. **Audio Alerts**: SOS broadcasts dynamically synthesize Morse Code beeps for "S-O-S" via the Web Audio API (100% offline, zero file dependency).

---

## Installation & Build Instructions

### Prerequisites
- Node.js (v18 or v20 recommended)
- Windows OS (to package the portable `.exe`)

### 1. Build the Executable
To install dependencies, compile the TypeScript, bundle the React frontend, and package the Windows application, run:
```bash
# Install dependencies
npm install

# Build and package the portable executable folder
npm run build
```
Once the build completes, the standalone executable folder will be located in:
`dist-package/Signal-win32-x64/` (run `Signal.exe` inside it).

### 2. Distributing via USB/Pendrive
Simply copy the generated `Signal-win32-x64` folder onto a USB drive. You can run `Signal.exe` on **any other Windows machine** with zero installation steps, zero dependencies, and no active internet connection required.

---

## Live Demo Guide (3-Machine Setup)

Use this guide to demonstrate the mesh resilience to judges.

### Setup
1. **Network**: Create a local WiFi hotspot from a phone or router **with no internet uplink**. Connect 3 laptops (A, B, and C) to this network.
2. **Launch**: Insert the USB drive into all 3 machines, copy `Signal.exe` to their desktops, and double-click to launch.
3. **Identity**: Enter a username on startup for each machine:
   - **Laptop A**: `Alice`
   - **Laptop B**: `Bob`
   - **Laptop C**: `Charlie`
4. **Discovery**: Verify that all nodes auto-discover each other within 10-15 seconds. The **Live Topology View** (right panel) on all machines will display three connected nodes.

### Demo Scenario 1: Multi-Hop Relay
1. Laptop A (`Alice`) is too far from Laptop C (`Charlie`) but both are close to Laptop B (`Bob`). Alternatively, simulate this chain.
2. `Alice` sends a message to `Charlie`.
3. The message is automatically relayed through `Bob` to `Charlie`.
4. `Charlie` receives the message. The routing indicator on the bubble displays: **Relayed (1 hop)**.
5. `Bob`'s bottom debug panel shows the routing event: `[ROUTER] Relaying message <id> to peer Charlie`.

### Demo Scenario 2: Store-and-Forward Resilience
1. **Disconnect Peer**: On Laptop C (`Charlie`), click the **Wifi** icon in the custom title bar to simulate going offline.
   - The topology graph on `Alice` and `Bob` will show Charlie going grey/offline.
2. **Send Message**: On Laptop A (`Alice`), select `Charlie` in the list, type: *"Emergency: Need medical kit at Sector 4."*, and click **Send**.
3. **Queueing**: Because Charlie is offline, `Alice` sends the message to `Bob`. `Bob`'s router realizes Charlie is unreachable and stores the message in its local JSON database.
   - `Bob`'s debug panel logs: `[DATABASE] Saved message <id> as undelivered`.
4. **Reconnect Peer**: On Laptop C (`Charlie`), click the **Wifi** icon again to connect back to the mesh.
5. **Auto-Forward**: Within seconds of connecting, `Bob`'s router detects Charlie's presence and automatically synchronizes the undelivered message queue.
6. **Delivery**: `Charlie` receives the message, which triggers a **visual SOS flash** and synthesizes a **Morse Code audio alert**.
7. The message bubble on Charlie's screen displays: **Relayed (1 hop)**, proving store-and-forward works!

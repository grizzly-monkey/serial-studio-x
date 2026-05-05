<div align="center">

# ⚡ Modbus Storm

**A production-ready, open-source Modbus TCP/RTU/ASCII desktop client**

[![GitHub release](https://img.shields.io/github/v/release/grw-io/modbus-storm?style=for-the-badge&color=6366f1)](https://github.com/grw-io/modbus-storm/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/grw-io/modbus-storm/total?style=for-the-badge&color=22c55e)](https://github.com/grw-io/modbus-storm/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=for-the-badge)](https://github.com/grw-io/modbus-storm/releases/latest)

<br/>

<img src="resources/Screenshot 2026-05-05 at 2.00.13 AM.png" alt="Modbus Storm Dashboard" width="800"/>

<br/>

> **Multi-connection Modbus dashboard** · **Live sparklines & gauges** · **Raw frame inspector** · **Threshold alerts** · **Workspace persistence**

</div>

---

## 🎯 What is Modbus Storm?

Modbus Storm is a cross-platform **Electron desktop application** for engineers, technicians, and developers working with industrial Modbus devices. Connect to PLCs, sensors, drives, and any Modbus-compliant hardware over TCP/IP, RTU serial, or ASCII — all from one beautifully designed dashboard.

No cloud. No subscription. No telemetry. Just a fast, offline-capable tool that works.

---

## ✨ Features

### 🔌 Protocol Support
- **Modbus TCP/IP** — Connect to any Modbus TCP server over LAN/WAN
- **Modbus RTU** — Serial port communication (RS-232/RS-485) with full flow control
- **Modbus ASCII** — ASCII-encoded serial mode for legacy devices
- **Function Codes** — FC01, FC02, FC03, FC04 (coils & registers), FC23 (read/write)

### 📊 Live Dashboard
- **Multi-connection panels** — Monitor dozens of devices simultaneously in a responsive drag-and-drop grid
- **Per-register widgets** — Switch each register between table view, sparkline chart, or gauge — live
- **Data type decoding** — `uint16`, `int16`, `float32`, `uint32`, `int32`, `binary`, `hex`, `ascii` with configurable scale and offset
- **Sparkline history** — Configurable time window (seconds) per register with recharts rendering at up to 60 fps

### 🔍 Raw Frame Inspector
- Capture every TX/RX byte in real time
- Build and send arbitrary Modbus frames manually
- Hex + decimal display side-by-side

### 🚨 Threshold Alerts
- Per-register low/high limit configuration
- Native OS desktop notifications when limits are breached
- Visual indicator states: `ok` / `low` / `high`

### 💾 Workspace Persistence
- Save and restore complete connection layouts (JSON)
- Export register logs as **CSV** or **JSON**
- Virtualised log drawer handles millions of rows without lag

### 🛡️ Privacy First
- 100% offline — zero telemetry, zero analytics, zero cloud
- All data stays on your machine
- Open source under GPL v3

---

## 📦 Installation

### 🍎 macOS

| Chip | Download |
|------|----------|
| **Apple Silicon** (M1 / M2 / M3 / M4) | [📥 Download DMG (arm64)](https://github.com/grw-io/modbus-storm/releases/latest) |
| **Intel** (x86_64) | [📥 Download DMG (x64)](https://github.com/grw-io/modbus-storm/releases/latest) |

> **Note:** macOS may show a security warning on first launch since the app is not notarized.  
> Right-click → **Open** → **Open** to bypass Gatekeeper, or run:
> ```bash
> xattr -d com.apple.quarantine /Applications/Modbus\ Storm.app
> ```

### 🪟 Windows

| Format | Download |
|--------|----------|
| **Installer** (recommended) | [📥 Download NSIS Installer](https://github.com/grw-io/modbus-storm/releases/latest) |
| **Portable** (no install) | [📥 Download Portable .exe](https://github.com/grw-io/modbus-storm/releases/latest) |

### 🐧 Linux

| Format | Architecture | Download |
|--------|-------------|----------|
| **AppImage** (universal) | x86_64 | [📥 Download AppImage](https://github.com/grw-io/modbus-storm/releases/latest) |
| **Debian/Ubuntu** `.deb` | x86_64 | [📥 Download .deb](https://github.com/grw-io/modbus-storm/releases/latest) |
| **Fedora/RHEL** `.rpm` | x86_64 | [📥 Download .rpm](https://github.com/grw-io/modbus-storm/releases/latest) |

```bash
# AppImage — make executable and run
chmod +x modbus-storm-*.AppImage
./modbus-storm-*.AppImage

# Debian/Ubuntu
sudo dpkg -i modbus-storm-*.deb

# Fedora/RHEL
sudo rpm -i modbus-storm-*.rpm
```

---

## 🚀 Quick Start

### 1. Add a Modbus TCP Connection

1. Click **+** in the left sidebar
2. Set **Protocol** → `TCP`
3. Enter **Host** (e.g. `192.168.1.100`) and **Port** (default `502`)
4. Set **Unit ID** (slave address, e.g. `1`)
5. Set **Poll Interval** (e.g. `500` ms)
6. Click **Connect**

### 2. Configure Registers

1. Click **Edit Registers** on a connection panel
2. Add a **Register Group** — pick a Function Code, start address, and register count
3. For each register, set:
   - **Label** — friendly name (e.g. "Motor RPM")
   - **Data Type** — `float32`, `int16`, `uint16`, etc.
   - **Scale / Offset** — engineering unit conversion (e.g. `×0.1` for tenths)
   - **Unit** — display unit (e.g. `RPM`, `°C`, `bar`)
   - **Widget** — `table` | `sparkline` | `gauge`

### 3. Set Alerts

1. Click the **⚠️** icon on any register row
2. Enable alerts and set low/high limits
3. Enable **OS Notification** to get desktop popups when limits are breached

### 4. Save Your Workspace

`File` → **Save Workspace** — saves your complete layout as a `.json` file you can reload later.

---

## 🖥️ Platform Support

| Platform | Architecture | Status |
|----------|-------------|--------|
| macOS 12+ | Apple Silicon (arm64) | ✅ Native |
| macOS 12+ | Intel (x86_64) | ✅ Native |
| Windows 10/11 | x86_64 | ✅ Native |
| Ubuntu 20.04+ | x86_64 | ✅ Native |
| Fedora 36+ | x86_64 | ✅ Native |
| Any Linux | x86_64 | ✅ AppImage |

---

## 🏗️ Architecture

Modbus Storm uses a strict **three-layer Electron process model** for reliability and security:

```
┌─────────────────────────────────────────────────────┐
│  Renderer Process (React 18 + Zustand)               │
│  ├─ Dashboard (react-grid-layout)                    │
│  ├─ RegisterRow → sparkline / gauge / table widget   │
│  ├─ RawFrameInspector + LogDrawer                    │
│  └─ window.api (contextBridge) — NO Node access      │
├─────────────────────────────────────────────────────┤
│  Main Process (Electron + Node.js)                   │
│  ├─ worker-registry.ts — spawns/kills workers        │
│  ├─ transform.ts — uint16 → typed value decoding     │
│  ├─ alert-engine.ts — threshold checks + OS notifs   │
│  ├─ file-io.ts — workspace JSON + CSV/JSON export    │
│  └─ ipc-router.ts — all ipcMain.handle handlers      │
├─────────────────────────────────────────────────────┤
│  Worker Threads (one per connection)                 │
│  └─ modbus-worker.ts                                 │
│     ├─ Owns the Modbus socket / serial port          │
│     ├─ Poll loop at configurable pollIntervalMs      │
│     ├─ Async read/write queue (no concurrent ops)    │
│     └─ Exponential-backoff auto-reconnect            │
└─────────────────────────────────────────────────────┘
```

**Data flow:**  
`Worker poll loop` → `poll-result postMessage` → `Main: transform + alert check` → `IPC push to renderer (≤60 Hz)` → `Zustand store merge` → `React re-render`

---

## 🛠️ Development

### Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Python** 3.x (for native module compilation)
- **Xcode Command Line Tools** (macOS) or **Visual Studio Build Tools** (Windows)

### Setup

```bash
git clone https://github.com/grw-io/modbus-storm.git
cd modbus-storm
npm install
npx electron-rebuild   # rebuild native modules (serialport) for Electron
```

### Commands

```bash
npm run dev          # Start with hot reload (Vite HMR for renderer)
npm run build        # Build all layers (main + preload + renderer)
npm run dist         # Build + package for current OS
npm run dist:mac     # macOS DMG + ZIP (native arch)
npm run dist:win     # Windows NSIS installer + portable .exe
npm run dist:linux   # Linux AppImage + .deb + .rpm
```

### Project Structure

```
src/
├── main/               # Main process
│   ├── index.ts        # Entry point, app lifecycle
│   ├── ipc-router.ts   # IPC handlers
│   ├── worker-registry.ts
│   ├── alert-engine.ts
│   └── file-io.ts
├── preload/
│   └── index.ts        # contextBridge → window.api
├── renderer/           # React app
│   ├── App.tsx
│   ├── store/
│   │   ├── connections.ts  # Live values, sparklines
│   │   └── workspace.ts    # Persisted config
│   └── components/
│       ├── Dashboard.tsx
│       ├── ConnectionPanel.tsx
│       ├── RegisterRow.tsx
│       ├── RawFrameInspector.tsx
│       ├── LogDrawer.tsx
│       └── ...
├── shared/
│   ├── types.ts        # Shared TypeScript types
│   └── ipc-channels.ts # IPC channel name constants
└── workers/
    └── modbus-worker.ts  # Per-connection worker thread
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** — `git checkout -b feature/my-feature`
3. **Make your changes** and ensure `npm run build` passes
4. **Open a Pull Request** with a clear description

### Reporting Bugs

Please open a [GitHub Issue](https://github.com/grw-io/modbus-storm/issues) with:
- Your OS and version
- Steps to reproduce
- Expected vs actual behavior
- Any relevant log output

### Feature Requests

Open a [GitHub Discussion](https://github.com/grw-io/modbus-storm/discussions) — let's talk about it before implementing.

---

## 🔐 Security

This application:
- Makes **no network requests** except to the Modbus devices you configure
- Stores all data **locally** in your OS app data directory
- Has **no auto-update** that could deliver unsigned payloads
- Is fully **auditable** — the entire source is in this repository

Found a security issue? Please open a private [Security Advisory](https://github.com/grw-io/modbus-storm/security/advisories/new) rather than a public issue.

---

## 📄 License

**Modbus Storm** is free software distributed under the [GNU General Public License v3.0](LICENSE).

You are free to use, study, share, and improve it. If you distribute modified versions, you must also make the source available under the same license.

---

<div align="center">

Built with ❤️ using [Electron](https://www.electronjs.org/), [React](https://react.dev/), [modbus-serial](https://github.com/yaacov/node-modbus-serial), and [recharts](https://recharts.org/)

⭐ **Star this repo** if Modbus Storm saves you time!

</div>
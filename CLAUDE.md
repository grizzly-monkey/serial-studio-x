# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`modbus-storm` is a production-ready, open-source, cross-platform Electron desktop app for Modbus communication. It supports Modbus TCP/IP, RTU (serial), and ASCII with a multi-connection dashboard featuring per-register widgets (table, sparkline, gauge), raw frame inspector, workspace persistence, logging, and threshold alerts.

**License:** GPL v3

## Commands

```bash
npm run dev          # Start Electron app with hot reload (renderer HMR via Vite)
npm run build        # Build all layers (main, preload, renderer) via electron-vite
npm run dist         # Build + package all formats for current OS
npm run dist:mac     # macOS DMG + zip (universal)
npm run dist:win     # Windows NSIS installer + portable exe
npm run dist:linux   # Linux AppImage + deb + rpm
```

## Architecture

Three-layer Electron process model with strict boundaries:

**`src/workers/modbus-worker.ts`** — One Node.js Worker thread spawned per connection. Owns the Modbus socket/serial port for its lifetime. Runs the poll loop at `pollIntervalMs`, serialises reads and writes through an async queue, handles exponential-backoff reconnect. Posts `poll-result` and `status` messages to main process.

**`src/main/`** — Hub process. `worker-registry.ts` spawns/kills workers and aggregates poll data. `transform.ts` decodes raw uint16 registers into typed values (float32, int32, binary, etc.) with scale+offset. `alert-engine.ts` evaluates thresholds and fires OS `Notification`. `file-io.ts` handles workspace JSON persistence and CSV/JSON log file writing. `ipc-router.ts` registers all `ipcMain.handle` handlers.

**`src/preload/index.ts`** — `contextBridge` exposing a typed `window.api` to the renderer. No Node.js access in renderer.

**`src/renderer/`** — React 18 app. State via Zustand (`store/workspace.ts` for persisted config, `store/connections.ts` for live register values/sparklines/log). Components: `Dashboard` (react-grid-layout responsive grid of `ConnectionPanel`), `Sidebar` (connection list), `RegisterRow` (per-register with widget toggle and write panel), `RawFrameInspector` (monitor + builder), `LogDrawer` (virtualised log with CSV/JSON export).

**`src/shared/`** — TypeScript types and IPC channel names shared across all layers.

## Key Libraries

- `electron-vite` — build orchestrator (Vite renderer HMR, esbuild main/preload)
- `modbus-serial` — Modbus TCP/RTU/ASCII protocol implementation
- `serialport` — native serial port access (requires `electron-rebuild` after install)
- `react-grid-layout` — draggable/resizable dashboard panels
- `recharts` — sparkline charts
- `zustand` — renderer state management

## Native Modules

`modbus-serial` depends on `serialport` which has native Node.js bindings. After adding/updating dependencies run:

```bash
npx electron-rebuild
```

## Data Flow

Poll loop (worker) → `poll-result` postMessage → main process transform + alert check → IPC push to renderer (rate-limited to 60Hz) → Zustand store merge → React re-render of subscribed register components.

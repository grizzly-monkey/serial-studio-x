# modbus-storm — Product Design Spec

**Date:** 2026-05-04
**License:** GPL v3
**Status:** Approved

---

## Overview

modbus-storm is a production-ready, open-source, cross-platform Electron desktop application for Modbus communication. It targets developers who build and test Modbus devices, and industrial engineers who debug PLCs and field equipment. The design prioritises developer ergonomics first while remaining comfortable for engineers on the floor.

Single-executable distribution for Windows, macOS, and Linux. All platforms built from a single codebase via GitHub Actions CI.

---

## Protocols

All three Modbus variants are supported in a single application:

- **Modbus TCP/IP** — network-connected PLCs and devices
- **Modbus RTU** — serial (RS-485 / RS-232), buffered mode
- **Modbus ASCII** — serial, ASCII framing

### Function Codes

Full coverage:

| FC | Name |
|---|---|
| FC01 | Read Coils |
| FC02 | Read Discrete Inputs |
| FC03 | Read Holding Registers |
| FC04 | Read Input Registers |
| FC05 | Write Single Coil |
| FC06 | Write Single Register |
| FC08 | Diagnostics |
| FC15 | Write Multiple Coils |
| FC16 | Write Multiple Registers |
| FC23 | Read/Write Multiple Registers |
| FC43 | Read Device Identification (MEI) |

---

## Architecture

Three-layer Electron process model using worker-per-connection isolation.

### Renderer Process (React + TypeScript + Vite)

Pure UI — no Node.js APIs. Communicates exclusively through a typed `contextBridge` preload. Owns:

- Dashboard layout and panel management (`react-grid-layout`)
- Per-register widget rendering (table / sparkline / gauge)
- Workspace profile UI (load / save / export / import)
- Log viewer (virtualised list, filter, export)
- Zustand state store — merges incoming IPC data, maintains sparkline circular buffers

### Main Process (Node.js)

The hub between renderer and workers. Owns:

- **IPC Router** — typed `ipcMain` handlers, preload bridge
- **WorkerRegistry** — spawns and kills one Worker thread per connection, aggregates poll data
- **Transform pipeline** — type decode, scale/offset, display base formatting
- **Alert Engine** — threshold evaluation, state-transition logic, OS `Notification` dispatch
- **File I/O** — workspace JSON read/write, CSV/JSON log file management, migration

IPC push to renderer is rate-limited to one batch per 16ms (one animation frame) regardless of poll frequency.

### Worker Threads (one per connection)

Each worker owns one Modbus connection for its entire lifetime:

- **ModbusTransport** — wraps `modbus-serial`, connects via the correct method for the protocol
- **Async write queue** — serialises poll reads and UI-triggered writes so they never interleave on the bus
- **Poll loop** — `setInterval` at `pollIntervalMs`; skips tick if previous read is still in flight
- **Raw frame capture** — hooks socket `data` events, forwards every request/response buffer with timestamp to main process
- **Reconnect** — exponential backoff on error: 250ms → 500ms → 1s → 2s → max 30s; posts status updates to main process after each attempt; crashed worker does not affect other connections

---

## UI Structure

### Top Bar
App name, light/dark theme toggle, workspace profile selector (load / save / save as / export / import), global alert count badge, global connection status summary.

### Left Sidebar
Connection list. Each entry: connection name, protocol badge (TCP / RTU / ASCII), status dot (idle / connecting / connected / error), poll rate label. Clicking selects the connection. `+` button opens the connection config sheet.

### Main Dashboard
`react-grid-layout` grid. Each connection owns a panel group — draggable, resizable, minimisable to title bar. Within each panel, register rows display their configured widget. Panel header shows connection name, status, alert badge, logging toggle (record button), and raw frame inspector toggle.

### Register Rows
Each row: address, label, raw value (hex or dec per toggle), data type selector, scaled value + unit, alert indicator, widget type toggle (table cell / sparkline / gauge). Cells flash on value change.

A write icon in each row opens an inline write panel: value input (hex or dec), data type selector, and a Send button. For coils, a toggle replaces the input. Write operations use the appropriate FC (FC05 for single coil, FC06 for single register, FC15/FC16 for multi). One-shot diagnostic commands (FC08, FC43) are accessible from a connection-level "Diagnostics" button in the panel header.

### Raw Frame Inspector
Per-connection panel (toggled from panel header). Two tabs:

- **Monitor** — live stream of every request/response: byte-by-byte breakdown with field labels (Function Code, Start Address, Quantity, Byte Count, CRC, etc.), displayed in hex and decoded ASCII side by side.
- **Builder** — manual frame constructor. Enter bytes in hex or decimal, select target function code, fire the frame, see raw response. For debugging non-standard or non-compliant devices.

### Bottom Log Drawer
Collapsible. Virtualised list (`react-virtual`) of timestamped entries across all connections. Columns: timestamp, connection, direction (TX/RX), FC, address(es), raw (hex/dec), decoded value, unit, status. Colour-coded: grey (read), blue (write), amber (alert), red (error). Filter bar: connection, level, time range, address. Export button: CSV or JSON of current filtered view. Header badge shows rolling error and alert counts.

### Connection Config Sheet
Slides in from right. Fields adapt by protocol:

- **TCP:** host, port, unit ID, poll interval (ms)
- **RTU / ASCII:** serial port picker, baud rate, data bits (5–8), stop bits (1–2), parity (none/even/odd/mark/space), flow control (none/RTS-CTS/XON-XOFF), slave ID, poll interval (ms)

---

## Data Model

Full workspace persisted to JSON. Runtime-only state is not persisted.

```
Workspace
  schemaVersion: number
  preferredBase: 'hex' | 'dec'
  theme: 'light' | 'dark'
  logDrawerOpen: boolean
  connections: Connection[]

Connection
  id: string
  name: string
  protocol: 'tcp' | 'rtu' | 'ascii'
  // TCP
  host?: string
  port?: number
  unitId?: number
  // RTU / ASCII
  serialPort?: string
  baudRate?: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
  flowControl?: 'none' | 'rts-cts' | 'xon-xoff'
  slaveId?: number
  // common
  pollIntervalMs: number
  panelLayout: ReactGridLayout.Layout
  registerGroups: RegisterGroup[]

RegisterGroup
  id: string
  label: string
  // Read FCs only — groups are polled automatically.
  // Write operations (FC05, FC06, FC15, FC16) are ad-hoc from the register row.
  // FC08 and FC43 are one-shot diagnostic commands, not poll groups.
  functionCode: 1 | 2 | 3 | 4 | 23
  startAddress: number
  count: number
  registers: RegisterConfig[]

RegisterConfig
  address: number
  label: string
  dataType: 'uint16' | 'int16' | 'float32' | 'uint32' | 'int32' | 'binary' | 'hex' | 'ascii'
  scale: number          // scaledValue = raw * scale + offset
  offset: number
  unit: string           // display string e.g. "°C", "RPM"
  displayBase: 'hex' | 'dec' | 'inherit'
  widgetType: 'table' | 'sparkline' | 'gauge'
  gaugeMin: number
  gaugeMax: number
  sparklineWindowSecs: number
  alert:
    enabled: boolean
    lowLimit: number | null
    highLimit: number | null
    notifyOS: boolean
```

**Runtime-only (not persisted):**
- `RegisterValue[]` — timestamped circular buffer of raw readings per register (drives sparklines, capped at `sparklineWindowSecs × (1000 / pollIntervalMs)` entries)
- `LogEntry[]` — append-only ring buffer (capped at 50k entries in memory)
- Worker connection state and error/reconnect counts

---

## Data Pipeline

### 1. Poll Loop (worker thread)
`setInterval` at `pollIntervalMs`. Fires configured read command via `ModbusTransport`. Receives raw `uint16[]`. Timestamps result. Posts `poll-result` message to main process. Skips tick if previous read still in flight.

### 2. Transform (main process)
For each register in the result:
1. **Type decode** — combines register pairs for float32/int32/uint32; formats binary, hex, ascii
2. **Scale + offset** — `displayValue = rawValue * scale + offset`
3. **Alert check** — compare `displayValue` against limits; evaluate state transition; fire OS notification on `ok→breach` or `breach→ok`; debounced (one notification per transition)
4. **Log append** — if logging active, append `LogEntry`

### 3. IPC Push (main → renderer)
Batch transformed values, push `registers-update` IPC event. Rate-limited to max 60Hz (16ms minimum between pushes) — renderer never flooded regardless of poll rate.

### 4. Renderer State (Zustand)
Merges `registers-update` into register value map. Components subscribed to specific register slices re-render only on change. Sparkline widgets maintain their own circular buffer.

---

## Display Base

A global `preferredBase` (`hex` / `dec`) in workspace settings controls how addresses and raw values are displayed throughout the app. Each `RegisterConfig` has its own `displayBase` field that overrides the global setting when set to `hex` or `dec` (defaults to `inherit`).

The global toggle is in the top bar. Per-register override is in the register row context menu. Applies to: register addresses, raw values, write input fields, and the Raw Frame Builder.

---

## Workspace Persistence

- **Storage location:** `app.getPath('userData')/workspaces/`
- **Auto-save:** 2 seconds after any change (debounced)
- **Persisted:** all connection configs, register groups, register configs, dashboard panel layout, global display preferences
- **Not persisted:** live register values, sparkline history, log entries
- **Migration:** `schemaVersion` field; main process runs forward migrations on load
- **Export/Import:** standard file dialog; JSON files are shareable between machines

---

## Logging

### In-App Viewer
Virtualised list in the bottom drawer. Columns: timestamp, connection, direction, FC, address, raw hex, raw dec, decoded value, unit, status. Filter by connection / level / time range / address. Export filtered view to CSV or JSON via save-file dialog.

### File Logging
Toggled per-connection. When active, main process appends to:
- `<connection-name>-<YYYY-MM-DD>.csv` — one row per register read: `timestamp, connection, fc, address, raw_hex, raw_dec, decoded_value, unit, status`
- `<connection-name>-<YYYY-MM-DD>.jsonl` — one JSON object per entry (same fields)

Files rotate daily at midnight without interrupting the session. User chooses the output directory via a folder dialog on first enable.

### Alert Log
Every alert transition (trigger and recovery) is written as a dedicated `alert` level log entry regardless of whether file logging is active.

---

## Alert System

### Configuration
Per-register, via alert bell icon in register row. Popover fields: enable toggle, low limit (scaled value), high limit (scaled value), OS notification toggle.

### State Machine
Three states: `ok`, `low`, `high`.

| Transition | Action |
|---|---|
| `ok → low` or `ok → high` | Trigger alert + OS notification (if enabled) |
| `low/high → ok` | Trigger recovery notification |
| Same state repeat | No action (no spam) |
| `low → high` or `high → low` | Treat as new alert |

### Visual Indicators
- Register row: amber background on any alert (`low` or `high` state); red background reserved for connection errors only
- Panel header: active alert count badge
- Top bar: global alert count badge
- All indicators clear automatically on recovery

### OS Notifications
Uses Electron `Notification` API (native on all platforms). Body: connection name, register label, current value, breached limit. Click brings app to focus and scrolls to the register.

---

## Build & Packaging

### Dev Toolchain
- `electron-vite` — Vite for renderer (HMR), esbuild for main + preload
- `electron-rebuild` — recompiles native modules (`serialport`) against Electron's Node version; runs as `postinstall`
- Single `npm run dev` starts everything with hot reload

### Package Targets (electron-builder)

| Platform | Outputs |
|---|---|
| Windows | NSIS installer (`.exe`) + portable `.exe` |
| macOS | Universal DMG (Apple Silicon + Intel) + `.zip` |
| Linux | AppImage + `.deb` + `.rpm` |

### CI (GitHub Actions)
Matrix of three jobs (ubuntu / windows / macos) running in parallel:
`checkout → install → rebuild native modules → build → package → upload artifacts`

Releases triggered by version tags (`v*`). Artifacts attached to GitHub Release automatically.

### Code Signing
macOS notarisation and Windows Authenticode signing defined in `electron-builder` config via environment variable placeholders (`APPLE_CERT`, `WIN_CERT`). Optional in dev, required for release builds. Documented in `CONTRIBUTING.md`.

### Repository Structure

```
src/
  main/          # main process, WorkerRegistry, IPC router, Alert engine, File I/O
  workers/       # ModbusTransport, poll loop, write queue, frame capture
  preload/       # contextBridge typed definitions
  renderer/      # React app (components, Zustand store, hooks)
  shared/        # TypeScript types shared across all layers
resources/
  icons/         # app icons — all sizes and formats for all platforms
docs/
  superpowers/specs/
```

---

## Tech Stack Summary

| Layer | Choice |
|---|---|
| Framework | Electron (latest stable) |
| Build | electron-vite + electron-builder |
| Renderer | React 18 + TypeScript |
| State | Zustand |
| Layout | react-grid-layout |
| Charts | recharts (sparklines) |
| Virtualised list | react-virtual |
| Modbus | modbus-serial |
| Serial port | serialport (via modbus-serial) |
| License | GPL v3 |

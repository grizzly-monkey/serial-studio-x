# modbus-storm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready cross-platform Electron Modbus client with multi-connection dashboard, per-register widgets, raw frame inspector, logging, and alerts.

**Architecture:** Worker-per-connection isolation — each Modbus connection runs in its own Node.js Worker thread. Main process aggregates and transforms data, runs alert engine, handles file I/O. Renderer is pure React with no Node.js access.

**Tech Stack:** Electron + electron-vite + React 18 + TypeScript + Zustand + react-grid-layout + recharts + modbus-serial + electron-builder

---

## File Map

```
src/
  shared/
    types.ts              # All TypeScript interfaces (Workspace, Connection, RegisterConfig, etc.)
    ipc-channels.ts       # Typed IPC channel names + payload types
  main/
    index.ts              # Electron app entry, BrowserWindow setup
    ipc-router.ts         # ipcMain handlers — routes to WorkerRegistry, FileIO, etc.
    worker-registry.ts    # Spawn/kill workers, aggregate poll results
    transform.ts          # Type decode + scale/offset + display base
    alert-engine.ts       # Threshold evaluation, OS notification dispatch
    file-io.ts            # Workspace JSON read/write, migration, log file management
  workers/
    modbus-worker.ts      # Worker thread: ModbusTransport + poll loop + write queue + frame capture
  preload/
    index.ts              # contextBridge — exposes typed API to renderer
  renderer/
    main.tsx              # React entry point
    App.tsx               # Top-level layout (TopBar + Sidebar + Dashboard + LogDrawer)
    store/
      workspace.ts        # Zustand workspace store
      connections.ts      # Zustand live connection state (values, status, frames)
    components/
      TopBar.tsx
      Sidebar.tsx
      ConnectionConfigSheet.tsx
      Dashboard.tsx
      ConnectionPanel.tsx
      RegisterRow.tsx
      widgets/
        TableCell.tsx
        Sparkline.tsx
        Gauge.tsx
      RawFrameInspector.tsx
      LogDrawer.tsx
      AlertBell.tsx
resources/
  icons/                  # App icons (png 16/32/48/64/128/256/512, icns, ico)
electron.vite.config.ts
electron-builder.yml
```

---

## Task 1: Scaffold Project with electron-vite

**Files:**
- Modify: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `index.html`

- [ ] Install dependencies

```bash
cd /opt/grw/modbus-storm
npm install --save-dev electron@latest electron-vite vite @vitejs/plugin-react typescript @types/node
npm install --save-dev electron-builder
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
npm install modbus-serial serialport
npm install zustand react-grid-layout recharts react-virtual
npm install --save-dev @types/react-grid-layout @types/serialport
```

- [ ] Write `package.json`

```json
{
  "name": "modbus-storm",
  "version": "0.1.0",
  "description": "A beautiful, production-ready open-source Modbus client",
  "main": "out/main/index.js",
  "license": "GPL-3.0",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "dist": "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win",
    "dist:mac": "npm run build && electron-builder --mac",
    "dist:linux": "npm run build && electron-builder --linux",
    "test": "vitest"
  },
  "devDependencies": {}
}
```
(Keep existing devDependencies; npm install will fill in the rest.)

- [ ] Write `electron.vite.config.ts`

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

- [ ] Write `tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] Write `tsconfig.node.json`

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*", "src/workers/**/*"],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"]
  }
}
```

- [ ] Write `tsconfig.web.json`

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": ["src/renderer/**/*"],
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"]
    }
  }
}
```

- [ ] Install `@electron-toolkit/tsconfig` and `@electron-toolkit/utils`

```bash
cd /opt/grw/modbus-storm
npm install --save-dev @electron-toolkit/tsconfig
npm install @electron-toolkit/utils
```

- [ ] Write `index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>modbus-storm</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] Write `src/main/index.ts`

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] Write `src/preload/index.ts` (stub, expanded in Task 4)

```typescript
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  version: () => process.versions.electron
})
```

- [ ] Write `src/renderer/main.tsx`

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] Write `src/renderer/App.tsx` (stub)

```typescript
import React from 'react'

export default function App(): React.JSX.Element {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>modbus-storm</h1>
      <p>Loading…</p>
    </div>
  )
}
```

- [ ] Write `src/renderer/styles/global.css`

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; }
```

- [ ] Verify app starts

```bash
cd /opt/grw/modbus-storm && npm run dev
```
Expected: Electron window opens showing "modbus-storm / Loading…"

- [ ] Commit

```bash
git add -A && git commit -m "feat: scaffold electron-vite project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipc-channels.ts`

- [ ] Write `src/shared/types.ts`

```typescript
export type Protocol = 'tcp' | 'rtu' | 'ascii'
export type DisplayBase = 'hex' | 'dec' | 'inherit'
export type DataType = 'uint16' | 'int16' | 'float32' | 'uint32' | 'int32' | 'binary' | 'hex' | 'ascii'
export type WidgetType = 'table' | 'sparkline' | 'gauge'
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'
export type AlertState = 'ok' | 'low' | 'high'
export type ReadFC = 1 | 2 | 3 | 4 | 23

export interface AlertConfig {
  enabled: boolean
  lowLimit: number | null
  highLimit: number | null
  notifyOS: boolean
}

export interface RegisterConfig {
  address: number
  label: string
  dataType: DataType
  scale: number
  offset: number
  unit: string
  displayBase: DisplayBase
  widgetType: WidgetType
  gaugeMin: number
  gaugeMax: number
  sparklineWindowSecs: number
  alert: AlertConfig
}

export interface RegisterGroup {
  id: string
  label: string
  functionCode: ReadFC
  startAddress: number
  count: number
  registers: RegisterConfig[]
}

export interface ConnectionConfig {
  id: string
  name: string
  protocol: Protocol
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
  panelLayout?: object
  registerGroups: RegisterGroup[]
}

export interface WorkspaceSettings {
  preferredBase: 'hex' | 'dec'
  theme: 'light' | 'dark'
  logDrawerOpen: boolean
}

export interface Workspace {
  schemaVersion: number
  name: string
  settings: WorkspaceSettings
  connections: ConnectionConfig[]
}

// Runtime types (not persisted)
export interface RegisterValue {
  raw: number
  decoded: number | string
  timestamp: number
  alertState: AlertState
}

export interface SparklinePoint {
  timestamp: number
  value: number
}

export interface RawFrame {
  direction: 'tx' | 'rx'
  timestamp: number
  bytes: number[]
  connectionId: string
}

export interface LogEntry {
  id: string
  timestamp: number
  connectionId: string
  connectionName: string
  direction: 'tx' | 'rx'
  fc: number
  address: number
  rawHex: string
  rawDec: string
  decodedValue: string
  unit: string
  status: 'ok' | 'error' | 'alert'
  message?: string
}

export interface WorkerPollResult {
  connectionId: string
  groupId: string
  startAddress: number
  values: number[]
  timestamp: number
  rawFrame?: RawFrame
}

export interface WorkerStatus {
  connectionId: string
  status: ConnectionStatus
  error?: string
}
```

- [ ] Write `src/shared/ipc-channels.ts`

```typescript
export const IPC = {
  // Renderer → Main
  CONNECTION_ADD: 'connection:add',
  CONNECTION_REMOVE: 'connection:remove',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_CONNECT: 'connection:connect',
  CONNECTION_DISCONNECT: 'connection:disconnect',
  REGISTER_WRITE: 'register:write',
  WORKSPACE_SAVE: 'workspace:save',
  WORKSPACE_LOAD: 'workspace:load',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_EXPORT: 'workspace:export',
  WORKSPACE_IMPORT: 'workspace:import',
  LOG_EXPORT: 'log:export',
  LOG_START: 'log:start',
  LOG_STOP: 'log:stop',
  SERIAL_PORTS_LIST: 'serial:ports-list',
  DIAGNOSTICS_RUN: 'diagnostics:run',

  // Main → Renderer
  POLL_RESULT: 'poll:result',
  CONNECTION_STATUS: 'connection:status',
  RAW_FRAME: 'raw:frame',
  LOG_ENTRY: 'log:entry',
  ALERT_FIRED: 'alert:fired',
} as const
```

- [ ] Commit

```bash
git add src/shared && git commit -m "feat: add shared types and IPC channels"
```

---

## Task 3: Worker Thread — Modbus Transport

**Files:**
- Create: `src/workers/modbus-worker.ts`

- [ ] Write `src/workers/modbus-worker.ts`

```typescript
import { parentPort, workerData } from 'worker_threads'
import ModbusRTU from 'modbus-serial'
import type { ConnectionConfig, WorkerPollResult, WorkerStatus, RawFrame } from '../shared/types'

const config: ConnectionConfig = workerData as ConnectionConfig

const client = new ModbusRTU()
let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false
let running = true
let reconnectDelay = 250

async function connect(): Promise<void> {
  try {
    postStatus('connecting')
    if (config.protocol === 'tcp') {
      await client.connectTCP(config.host!, { port: config.port ?? 502 })
      client.setID(config.unitId ?? 1)
    } else if (config.protocol === 'rtu') {
      await client.connectRTUBuffered(config.serialPort!, {
        baudRate: config.baudRate ?? 9600,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? 'none',
      })
      client.setID(config.slaveId ?? 1)
    } else {
      await client.connectAsciiSerial(config.serialPort!, {
        baudRate: config.baudRate ?? 9600,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? 'none',
      })
      client.setID(config.slaveId ?? 1)
    }
    reconnectDelay = 250
    postStatus('connected')
    startPolling()
  } catch (err) {
    postStatus('error', String(err))
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (!running) return
  setTimeout(() => connect(), reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 30000)
}

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  let tickRunning = false
  pollTimer = setInterval(async () => {
    if (tickRunning) return
    tickRunning = true
    try {
      for (const group of config.registerGroups) {
        const timestamp = Date.now()
        let values: number[] = []
        switch (group.functionCode) {
          case 1: values = (await client.readCoils(group.startAddress, group.count)).data.map(Number); break
          case 2: values = (await client.readDiscreteInputs(group.startAddress, group.count)).data.map(Number); break
          case 3: values = (await client.readHoldingRegisters(group.startAddress, group.count)).data; break
          case 4: values = (await client.readInputRegisters(group.startAddress, group.count)).data; break
          case 23: {
            const r = await client.readWriteMultipleRegisters(group.startAddress, group.count, 0, [])
            values = r.data
            break
          }
        }
        const result: WorkerPollResult = {
          connectionId: config.id,
          groupId: group.id,
          startAddress: group.startAddress,
          values,
          timestamp
        }
        parentPort!.postMessage({ type: 'poll-result', payload: result })
      }
    } catch (err) {
      postStatus('error', String(err))
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      try { await client.close() } catch {}
      scheduleReconnect()
    } finally {
      tickRunning = false
    }
  }, config.pollIntervalMs)
}

function postStatus(status: string, error?: string): void {
  parentPort!.postMessage({ type: 'status', payload: { connectionId: config.id, status, error } })
}

parentPort!.on('message', async (msg) => {
  if (msg.type === 'write') {
    const { fc, address, value } = msg.payload
    try {
      if (fc === 5) await client.writeCoil(address, Boolean(value))
      else if (fc === 6) await client.writeRegister(address, value)
      else if (fc === 15) await client.writeCoils(address, value)
      else if (fc === 16) await client.writeRegisters(address, value)
      parentPort!.postMessage({ type: 'write-ok', payload: { address } })
    } catch (err) {
      parentPort!.postMessage({ type: 'write-error', payload: { address, error: String(err) } })
    }
  }
  if (msg.type === 'stop') {
    running = false
    if (pollTimer) clearInterval(pollTimer)
    try { await client.close() } catch {}
    process.exit(0)
  }
})

connect()
```

- [ ] Commit

```bash
git add src/workers && git commit -m "feat: add modbus worker thread"
```

---

## Task 4: Main Process — WorkerRegistry + IPC Router

**Files:**
- Create: `src/main/worker-registry.ts`
- Create: `src/main/transform.ts`
- Create: `src/main/alert-engine.ts`
- Create: `src/main/file-io.ts`
- Create: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`

- [ ] Write `src/main/transform.ts`

```typescript
import type { RegisterConfig, RegisterValue, DataType } from '../shared/types'

export function decodeRegister(
  rawRegs: number[],
  regIndex: number,
  config: RegisterConfig
): number | string {
  const raw = rawRegs[regIndex] ?? 0
  switch (config.dataType as DataType) {
    case 'uint16': return raw * config.scale + config.offset
    case 'int16': {
      const signed = raw > 0x7FFF ? raw - 0x10000 : raw
      return signed * config.scale + config.offset
    }
    case 'float32': {
      const hi = rawRegs[regIndex] ?? 0
      const lo = rawRegs[regIndex + 1] ?? 0
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(hi, 0)
      buf.writeUInt16BE(lo, 2)
      return buf.readFloatBE(0) * config.scale + config.offset
    }
    case 'uint32': {
      const hi = rawRegs[regIndex] ?? 0
      const lo = rawRegs[regIndex + 1] ?? 0
      return ((hi << 16) | lo) * config.scale + config.offset
    }
    case 'int32': {
      const hi = rawRegs[regIndex] ?? 0
      const lo = rawRegs[regIndex + 1] ?? 0
      const u = (hi << 16) | lo
      const signed = u > 0x7FFFFFFF ? u - 0x100000000 : u
      return signed * config.scale + config.offset
    }
    case 'binary': return raw.toString(2).padStart(16, '0')
    case 'hex': return '0x' + raw.toString(16).toUpperCase().padStart(4, '0')
    case 'ascii': return String.fromCharCode(raw >> 8, raw & 0xFF)
    default: return raw
  }
}

export function transformPollResult(
  rawValues: number[],
  registers: RegisterConfig[]
): RegisterValue[] {
  return registers.map((reg, i) => {
    const decoded = decodeRegister(rawValues, i, reg)
    return {
      raw: rawValues[i] ?? 0,
      decoded,
      timestamp: Date.now(),
      alertState: 'ok'
    }
  })
}
```

- [ ] Write `src/main/alert-engine.ts`

```typescript
import { Notification } from 'electron'
import type { RegisterConfig, AlertState } from '../shared/types'

const alertStates = new Map<string, AlertState>()

export function checkAlert(
  connectionId: string,
  reg: RegisterConfig,
  decoded: number | string
): AlertState {
  const key = `${connectionId}:${reg.address}`
  const prev = alertStates.get(key) ?? 'ok'
  const val = typeof decoded === 'number' ? decoded : null

  let next: AlertState = 'ok'
  if (val !== null && reg.alert.enabled) {
    if (reg.alert.lowLimit !== null && val < reg.alert.lowLimit) next = 'low'
    else if (reg.alert.highLimit !== null && val > reg.alert.highLimit) next = 'high'
  }

  if (next !== prev) {
    alertStates.set(key, next)
    if (reg.alert.notifyOS) {
      const title = next === 'ok'
        ? `✅ ${reg.label} recovered`
        : `⚠️ ${reg.label} alert`
      const body = next === 'ok'
        ? `Value ${val}${reg.unit} is back in range`
        : `Value ${val}${reg.unit} is ${next === 'low' ? 'below' : 'above'} limit`
      new Notification({ title, body }).show()
    }
  }

  return next
}

export function clearAlertState(connectionId: string): void {
  for (const key of alertStates.keys()) {
    if (key.startsWith(`${connectionId}:`)) alertStates.delete(key)
  }
}
```

- [ ] Write `src/main/file-io.ts`

```typescript
import { app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { readdirSync } from 'fs'
import type { Workspace } from '../shared/types'

const SCHEMA_VERSION = 1
const workspacesDir = join(app.getPath('userData'), 'workspaces')

export function ensureWorkspacesDir(): void {
  if (!existsSync(workspacesDir)) mkdirSync(workspacesDir, { recursive: true })
}

export function listWorkspaces(): string[] {
  ensureWorkspacesDir()
  return readdirSync(workspacesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
}

export function loadWorkspace(name: string): Workspace | null {
  const path = join(workspacesDir, `${name}.json`)
  if (!existsSync(path)) return null
  try {
    const ws = JSON.parse(readFileSync(path, 'utf8')) as Workspace
    return migrate(ws)
  } catch { return null }
}

export function saveWorkspace(name: string, workspace: Workspace): void {
  ensureWorkspacesDir()
  const path = join(workspacesDir, `${name}.json`)
  writeFileSync(path, JSON.stringify({ ...workspace, schemaVersion: SCHEMA_VERSION }, null, 2))
}

export async function exportWorkspace(workspace: Workspace): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${workspace.name}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (filePath) writeFileSync(filePath, JSON.stringify(workspace, null, 2))
}

export async function importWorkspace(): Promise<Workspace | null> {
  const { filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (!filePaths[0]) return null
  try {
    return migrate(JSON.parse(readFileSync(filePaths[0], 'utf8')) as Workspace)
  } catch { return null }
}

const logStreams = new Map<string, string>()

export async function startLogging(connectionId: string, connectionName: string): Promise<void> {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `${connectionName}-${new Date().toISOString().split('T')[0]}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (!filePath) return
  writeFileSync(filePath, 'timestamp,connection,fc,address,raw_hex,raw_dec,decoded_value,unit,status\n')
  logStreams.set(connectionId, filePath)
}

export function stopLogging(connectionId: string): void {
  logStreams.delete(connectionId)
}

export function appendLog(connectionId: string, row: string): void {
  const path = logStreams.get(connectionId)
  if (path) appendFileSync(path, row + '\n')
}

export function isLogging(connectionId: string): boolean {
  return logStreams.has(connectionId)
}

function migrate(ws: Workspace): Workspace {
  if (!ws.schemaVersion) ws.schemaVersion = 1
  return ws
}
```

- [ ] Write `src/main/worker-registry.ts`

```typescript
import { Worker } from 'worker_threads'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { checkAlert } from './alert-engine'
import { appendLog, isLogging } from './file-io'
import { transformPollResult } from './transform'
import type { ConnectionConfig, WorkerPollResult } from '../shared/types'

const workers = new Map<string, Worker>()
let lastPushTime = 0
const pendingUpdates: Record<string, unknown> = {}

function getWorkerPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return join(__dirname, '../../src/workers/modbus-worker.ts')
  }
  return join(__dirname, '../workers/modbus-worker.js')
}

export function spawnWorker(config: ConnectionConfig, win: BrowserWindow): void {
  if (workers.has(config.id)) killWorker(config.id)

  const worker = new Worker(getWorkerPath(), {
    workerData: config,
    execArgv: process.env.NODE_ENV === 'development' ? ['--require', 'ts-node/register'] : []
  })

  workers.set(config.id, worker)

  worker.on('message', (msg) => {
    if (msg.type === 'poll-result') {
      handlePollResult(msg.payload as WorkerPollResult, config, win)
    }
    if (msg.type === 'status') {
      win.webContents.send(IPC.CONNECTION_STATUS, msg.payload)
    }
    if (msg.type === 'write-ok' || msg.type === 'write-error') {
      win.webContents.send(IPC.REGISTER_WRITE, msg)
    }
  })

  worker.on('error', (err) => {
    win.webContents.send(IPC.CONNECTION_STATUS, {
      connectionId: config.id,
      status: 'error',
      error: err.message
    })
  })
}

function handlePollResult(
  result: WorkerPollResult,
  config: ConnectionConfig,
  win: BrowserWindow
): void {
  const group = config.registerGroups.find(g => g.id === result.groupId)
  if (!group) return

  const transformed = transformPollResult(result.values, group.registers)

  transformed.forEach((rv, i) => {
    const reg = group.registers[i]
    if (!reg) return
    rv.alertState = checkAlert(config.id, reg, rv.decoded)

    if (isLogging(config.id)) {
      const row = [
        new Date(rv.timestamp).toISOString(),
        config.name,
        group.functionCode,
        reg.address,
        '0x' + rv.raw.toString(16).toUpperCase().padStart(4, '0'),
        rv.raw,
        rv.decoded,
        reg.unit,
        rv.alertState === 'ok' ? 'ok' : 'alert'
      ].join(',')
      appendLog(config.id, row)
    }
  })

  // Rate-limit IPC push to 60Hz
  const now = Date.now()
  Object.assign(pendingUpdates, { [`${config.id}:${result.groupId}`]: { ...result, transformed } })
  if (now - lastPushTime >= 16) {
    lastPushTime = now
    win.webContents.send(IPC.POLL_RESULT, { ...pendingUpdates })
  }
}

export function killWorker(connectionId: string): void {
  const w = workers.get(connectionId)
  if (w) { w.postMessage({ type: 'stop' }); workers.delete(connectionId) }
}

export function sendWrite(connectionId: string, fc: number, address: number, value: unknown): void {
  workers.get(connectionId)?.postMessage({ type: 'write', payload: { fc, address, value } })
}

export function killAll(): void {
  for (const id of workers.keys()) killWorker(id)
}
```

- [ ] Write `src/main/ipc-router.ts`

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { spawnWorker, killWorker, sendWrite, killAll } from './worker-registry'
import {
  listWorkspaces, loadWorkspace, saveWorkspace,
  exportWorkspace, importWorkspace, startLogging, stopLogging
} from './file-io'
import SerialPort from 'serialport'
import type { ConnectionConfig, Workspace } from '../shared/types'

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle(IPC.CONNECTION_CONNECT, (_, config: ConnectionConfig) => {
    spawnWorker(config, win)
  })

  ipcMain.handle(IPC.CONNECTION_DISCONNECT, (_, connectionId: string) => {
    killWorker(connectionId)
  })

  ipcMain.handle(IPC.REGISTER_WRITE, (_, { connectionId, fc, address, value }) => {
    sendWrite(connectionId, fc, address, value)
  })

  ipcMain.handle(IPC.WORKSPACE_LIST, () => listWorkspaces())

  ipcMain.handle(IPC.WORKSPACE_LOAD, (_, name: string) => loadWorkspace(name))

  ipcMain.handle(IPC.WORKSPACE_SAVE, (_, { name, workspace }: { name: string; workspace: Workspace }) => {
    saveWorkspace(name, workspace)
  })

  ipcMain.handle(IPC.WORKSPACE_EXPORT, (_, workspace: Workspace) => exportWorkspace(workspace))

  ipcMain.handle(IPC.WORKSPACE_IMPORT, () => importWorkspace())

  ipcMain.handle(IPC.LOG_START, (_, { connectionId, connectionName }) =>
    startLogging(connectionId, connectionName))

  ipcMain.handle(IPC.LOG_STOP, (_, connectionId: string) => stopLogging(connectionId))

  ipcMain.handle(IPC.SERIAL_PORTS_LIST, async () => {
    try {
      const ports = await SerialPort.list()
      return ports.map(p => p.path)
    } catch { return [] }
  })
}

export function cleanupIpc(): void {
  killAll()
  ipcMain.removeAllListeners()
}
```

- [ ] Update `src/main/index.ts` to wire IPC and cleanup

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers, cleanupIpc } from './ipc-router'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpcHandlers(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cleanupIpc()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] Commit

```bash
git add src/main && git commit -m "feat: add main process — worker registry, transform, alerts, file I/O, IPC router"
```

---

## Task 5: Preload Bridge

**Files:**
- Modify: `src/preload/index.ts`

- [ ] Write `src/preload/index.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { ConnectionConfig, Workspace } from '../shared/types'

const api = {
  // Connections
  connectConnection: (config: ConnectionConfig) =>
    ipcRenderer.invoke(IPC.CONNECTION_CONNECT, config),
  disconnectConnection: (id: string) =>
    ipcRenderer.invoke(IPC.CONNECTION_DISCONNECT, id),
  writeRegister: (connectionId: string, fc: number, address: number, value: unknown) =>
    ipcRenderer.invoke(IPC.REGISTER_WRITE, { connectionId, fc, address, value }),

  // Workspace
  listWorkspaces: () => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
  loadWorkspace: (name: string) => ipcRenderer.invoke(IPC.WORKSPACE_LOAD, name),
  saveWorkspace: (name: string, workspace: Workspace) =>
    ipcRenderer.invoke(IPC.WORKSPACE_SAVE, { name, workspace }),
  exportWorkspace: (workspace: Workspace) =>
    ipcRenderer.invoke(IPC.WORKSPACE_EXPORT, workspace),
  importWorkspace: () => ipcRenderer.invoke(IPC.WORKSPACE_IMPORT),

  // Logging
  startLogging: (connectionId: string, connectionName: string) =>
    ipcRenderer.invoke(IPC.LOG_START, { connectionId, connectionName }),
  stopLogging: (connectionId: string) =>
    ipcRenderer.invoke(IPC.LOG_STOP, connectionId),

  // Serial ports
  listSerialPorts: () => ipcRenderer.invoke(IPC.SERIAL_PORTS_LIST),

  // Events (Main → Renderer)
  onPollResult: (cb: (data: unknown) => void) => {
    ipcRenderer.on(IPC.POLL_RESULT, (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners(IPC.POLL_RESULT)
  },
  onConnectionStatus: (cb: (data: unknown) => void) => {
    ipcRenderer.on(IPC.CONNECTION_STATUS, (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners(IPC.CONNECTION_STATUS)
  },
  onLogEntry: (cb: (entry: unknown) => void) => {
    ipcRenderer.on(IPC.LOG_ENTRY, (_, entry) => cb(entry))
    return () => ipcRenderer.removeAllListeners(IPC.LOG_ENTRY)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
```

- [ ] Add type declaration for window.api in `src/renderer/env.d.ts`

```typescript
import type { API } from '../preload/index'
declare global {
  interface Window {
    api: API
  }
}
```

- [ ] Commit

```bash
git add src/preload src/renderer/env.d.ts && git commit -m "feat: add preload contextBridge"
```

---

## Task 6: Renderer — Zustand Store

**Files:**
- Create: `src/renderer/store/workspace.ts`
- Create: `src/renderer/store/connections.ts`

- [ ] Write `src/renderer/store/workspace.ts`

```typescript
import { create } from 'zustand'
import type { Workspace, ConnectionConfig, WorkspaceSettings } from '../../shared/types'

const DEFAULT_WORKSPACE: Workspace = {
  schemaVersion: 1,
  name: 'Default',
  settings: { preferredBase: 'dec', theme: 'light', logDrawerOpen: false },
  connections: []
}

interface WorkspaceStore {
  workspace: Workspace
  profileNames: string[]
  activeProfile: string
  setWorkspace: (ws: Workspace) => void
  setSettings: (s: Partial<WorkspaceSettings>) => void
  addConnection: (c: ConnectionConfig) => void
  updateConnection: (id: string, patch: Partial<ConnectionConfig>) => void
  removeConnection: (id: string) => void
  setProfileNames: (names: string[]) => void
  setActiveProfile: (name: string) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: DEFAULT_WORKSPACE,
  profileNames: [],
  activeProfile: 'Default',

  setWorkspace: (ws) => set({ workspace: ws }),
  setSettings: (s) =>
    set((state) => ({
      workspace: { ...state.workspace, settings: { ...state.workspace.settings, ...s } }
    })),
  addConnection: (c) =>
    set((state) => ({
      workspace: { ...state.workspace, connections: [...state.workspace.connections, c] }
    })),
  updateConnection: (id, patch) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        connections: state.workspace.connections.map(c => c.id === id ? { ...c, ...patch } : c)
      }
    })),
  removeConnection: (id) =>
    set((state) => ({
      workspace: { ...state.workspace, connections: state.workspace.connections.filter(c => c.id !== id) }
    })),
  setProfileNames: (names) => set({ profileNames: names }),
  setActiveProfile: (name) => set({ activeProfile: name }),
}))
```

- [ ] Write `src/renderer/store/connections.ts`

```typescript
import { create } from 'zustand'
import type { ConnectionStatus, RegisterValue, SparklinePoint, LogEntry, RawFrame } from '../../shared/types'

interface ConnectionLiveState {
  status: ConnectionStatus
  error?: string
  registerValues: Record<string, RegisterValue>
  sparklineData: Record<string, SparklinePoint[]>
  loggingActive: boolean
}

interface ConnectionsStore {
  connections: Record<string, ConnectionLiveState>
  logEntries: LogEntry[]
  rawFrames: Record<string, RawFrame[]>
  setStatus: (id: string, status: ConnectionStatus, error?: string) => void
  setRegisterValues: (id: string, groupId: string, values: RegisterValue[], addresses: number[]) => void
  appendSparkline: (id: string, address: number, point: SparklinePoint, maxPoints: number) => void
  setLogging: (id: string, active: boolean) => void
  appendLog: (entry: LogEntry) => void
  appendFrame: (connectionId: string, frame: RawFrame) => void
  removeConnection: (id: string) => void
}

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  connections: {},
  logEntries: [],
  rawFrames: {},

  setStatus: (id, status, error) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { ...state.connections[id], status, error, registerValues: state.connections[id]?.registerValues ?? {}, sparklineData: state.connections[id]?.sparklineData ?? {}, loggingActive: state.connections[id]?.loggingActive ?? false }
      }
    })),

  setRegisterValues: (id, _groupId, values, addresses) =>
    set((state) => {
      const existing = state.connections[id] ?? { status: 'idle', registerValues: {}, sparklineData: {}, loggingActive: false }
      const next = { ...existing.registerValues }
      addresses.forEach((addr, i) => { if (values[i]) next[addr] = values[i] })
      return { connections: { ...state.connections, [id]: { ...existing, registerValues: next } } }
    }),

  appendSparkline: (id, address, point, maxPoints) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      const key = String(address)
      const existing = conn.sparklineData[key] ?? []
      const next = [...existing, point].slice(-maxPoints)
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, sparklineData: { ...conn.sparklineData, [key]: next } }
        }
      }
    }),

  setLogging: (id, active) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { ...state.connections[id], loggingActive: active }
      }
    })),

  appendLog: (entry) =>
    set((state) => ({ logEntries: [...state.logEntries.slice(-50000), entry] })),

  appendFrame: (connectionId, frame) =>
    set((state) => ({
      rawFrames: {
        ...state.rawFrames,
        [connectionId]: [...(state.rawFrames[connectionId] ?? []).slice(-200), frame]
      }
    })),

  removeConnection: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.connections
      return { connections: rest }
    }),
}))
```

- [ ] Commit

```bash
git add src/renderer/store && git commit -m "feat: add Zustand stores"
```

---

## Task 7: App Shell + Theme + Top Bar

**Files:**
- Create: `src/renderer/styles/theme.css`
- Create: `src/renderer/components/TopBar.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] Write `src/renderer/styles/theme.css`

```css
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --surface-2: #f1f5f9;
  --border: #e2e8f0;
  --text: #1e293b;
  --text-muted: #64748b;
  --primary: #6366f1;
  --primary-light: #eef2ff;
  --primary-text: #3730a3;
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --radius: 6px;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
}
[data-theme="dark"] {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-2: #0f172a;
  --border: #334155;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --primary: #818cf8;
  --primary-light: #1e1b4b;
  --primary-text: #c7d2fe;
}
body { background: var(--bg); color: var(--text); }
```

- [ ] Write `src/renderer/components/TopBar.tsx`

```typescript
import React from 'react'
import { useWorkspaceStore } from '../store/workspace'

export default function TopBar(): React.JSX.Element {
  const { workspace, activeProfile, profileNames, setSettings, setWorkspace, setProfileNames, setActiveProfile } = useWorkspaceStore()

  async function loadProfileList() {
    const names = await window.api.listWorkspaces()
    setProfileNames(names)
  }

  async function handleLoad(name: string) {
    const ws = await window.api.loadWorkspace(name)
    if (ws) { setWorkspace(ws); setActiveProfile(name) }
  }

  async function handleSave() {
    await window.api.saveWorkspace(activeProfile, workspace)
  }

  async function handleExport() {
    await window.api.exportWorkspace(workspace)
  }

  async function handleImport() {
    const ws = await window.api.importWorkspace()
    if (ws) { setWorkspace(ws); setActiveProfile(ws.name) }
  }

  const isDark = workspace.settings.theme === 'dark'

  return (
    <header style={{
      height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      boxShadow: 'var(--shadow)', zIndex: 100, position: 'relative'
    }}>
      <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--primary)', marginRight: 8 }}>
        ⚡ modbus-storm
      </span>

      <select
        value={activeProfile}
        onChange={(e) => handleLoad(e.target.value)}
        onFocus={loadProfileList}
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', color: 'var(--text)', fontSize: 13 }}
      >
        <option value={activeProfile}>{activeProfile}</option>
        {profileNames.filter(n => n !== activeProfile).map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <button onClick={handleSave} style={btnStyle}>Save</button>
      <button onClick={handleExport} style={btnStyle}>Export</button>
      <button onClick={handleImport} style={btnStyle}>Import</button>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setSettings({ theme: isDark ? 'light' : 'dark' })}
        style={{ ...btnStyle, fontSize: 18, padding: '2px 8px' }}
      >
        {isDark ? '☀️' : '🌙'}
      </button>
    </header>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text)'
}
```

- [ ] Update `src/renderer/App.tsx`

```typescript
import React, { useEffect } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import LogDrawer from './components/LogDrawer'
import { useWorkspaceStore } from './store/workspace'
import { useConnectionsStore } from './store/connections'
import '../styles/global.css'
import '../styles/theme.css'

export default function App(): React.JSX.Element {
  const theme = useWorkspaceStore(s => s.workspace.settings.theme)
  const { setStatus, setRegisterValues } = useConnectionsStore()
  const connections = useWorkspaceStore(s => s.workspace.connections)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const off1 = window.api.onConnectionStatus((data: any) => {
      setStatus(data.connectionId, data.status, data.error)
    })
    const off2 = window.api.onPollResult((batch: any) => {
      for (const key of Object.keys(batch)) {
        const item = batch[key]
        if (!item?.transformed) continue
        const conn = connections.find(c => c.id === item.connectionId)
        if (!conn) continue
        const group = conn.registerGroups.find(g => g.id === item.groupId)
        if (!group) continue
        const addresses = group.registers.map(r => r.address)
        setRegisterValues(item.connectionId, item.groupId, item.transformed, addresses)
      }
    })
    return () => { off1(); off2() }
  }, [connections])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <Dashboard />
      </div>
      <LogDrawer />
    </div>
  )
}
```

- [ ] Commit

```bash
git add src/renderer && git commit -m "feat: app shell, theme, top bar"
```

---

## Task 8: Sidebar + Connection Config Sheet

**Files:**
- Create: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/ConnectionConfigSheet.tsx`

- [ ] Write `src/renderer/components/Sidebar.tsx`

```typescript
import React, { useState } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { useConnectionsStore } from '../store/connections'
import ConnectionConfigSheet from './ConnectionConfigSheet'
import type { ConnectionConfig } from '../../shared/types'

export default function Sidebar(): React.JSX.Element {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const { removeConnection } = useWorkspaceStore()
  const statuses = useConnectionsStore(s => s.connections)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)

  const statusColor = (id: string) => {
    const s = statuses[id]?.status ?? 'idle'
    return s === 'connected' ? '#22c55e' : s === 'connecting' ? '#f59e0b' : s === 'error' ? '#ef4444' : '#94a3b8'
  }

  return (
    <>
      <aside style={{
        width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: 8, gap: 4, overflowY: 'auto'
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 6px', letterSpacing: 0.5 }}>
          CONNECTIONS
        </div>
        {connections.map(conn => (
          <div key={conn.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
            borderRadius: 'var(--radius)', background: 'var(--surface-2)', cursor: 'pointer'
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(conn.id), flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 4px', borderRadius: 3 }}>{conn.protocol.toUpperCase()}</span>
            <button onClick={() => { setEditing(conn); setSheetOpen(true) }} style={iconBtn}>✏️</button>
            <button onClick={() => removeConnection(conn.id)} style={iconBtn}>🗑</button>
          </div>
        ))}
        <button
          onClick={() => { setEditing(null); setSheetOpen(true) }}
          style={{ marginTop: 8, padding: '6px', borderRadius: 'var(--radius)', border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12 }}
        >
          + New Connection
        </button>
      </aside>
      {sheetOpen && (
        <ConnectionConfigSheet
          initial={editing}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 12, opacity: 0.6
}
```

- [ ] Write `src/renderer/components/ConnectionConfigSheet.tsx`

```typescript
import React, { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useWorkspaceStore } from '../store/workspace'
import type { ConnectionConfig, Protocol, RegisterGroup } from '../../shared/types'

interface Props {
  initial: ConnectionConfig | null
  onClose: () => void
}

export default function ConnectionConfigSheet({ initial, onClose }: Props): React.JSX.Element {
  const { addConnection, updateConnection } = useWorkspaceStore()
  const [protocol, setProtocol] = useState<Protocol>(initial?.protocol ?? 'tcp')
  const [name, setName] = useState(initial?.name ?? '')
  const [host, setHost] = useState(initial?.host ?? '127.0.0.1')
  const [port, setPort] = useState(initial?.port ?? 502)
  const [unitId, setUnitId] = useState(initial?.unitId ?? 1)
  const [serialPort, setSerialPort] = useState(initial?.serialPort ?? '')
  const [baudRate, setBaudRate] = useState(initial?.baudRate ?? 9600)
  const [dataBits, setDataBits] = useState<5|6|7|8>(initial?.dataBits ?? 8)
  const [stopBits, setStopBits] = useState<1|2>(initial?.stopBits ?? 1)
  const [parity, setParity] = useState(initial?.parity ?? 'none')
  const [flowControl, setFlowControl] = useState(initial?.flowControl ?? 'none')
  const [slaveId, setSlaveId] = useState(initial?.slaveId ?? 1)
  const [pollIntervalMs, setPollIntervalMs] = useState(initial?.pollIntervalMs ?? 1000)

  const handleSave = async () => {
    const config: ConnectionConfig = {
      id: initial?.id ?? uuid(),
      name: name || (protocol === 'tcp' ? `${host}:${port}` : serialPort),
      protocol,
      host: protocol === 'tcp' ? host : undefined,
      port: protocol === 'tcp' ? port : undefined,
      unitId: protocol === 'tcp' ? unitId : undefined,
      serialPort: protocol !== 'tcp' ? serialPort : undefined,
      baudRate: protocol !== 'tcp' ? baudRate : undefined,
      dataBits: protocol !== 'tcp' ? dataBits : undefined,
      stopBits: protocol !== 'tcp' ? stopBits : undefined,
      parity: protocol !== 'tcp' ? parity as any : undefined,
      flowControl: protocol !== 'tcp' ? flowControl as any : undefined,
      slaveId: protocol !== 'tcp' ? slaveId : undefined,
      pollIntervalMs,
      registerGroups: initial?.registerGroups ?? [],
    }
    if (initial) updateConnection(initial.id, config)
    else addConnection(config)

    await window.api.connectConnection(config)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 380, background: 'var(--surface)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15 }}>{initial ? 'Edit' : 'New'} Connection</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} placeholder="PLC-01" style={inputStyle} /></Field>

        <Field label="Protocol">
          <select value={protocol} onChange={e => setProtocol(e.target.value as Protocol)} style={inputStyle}>
            <option value="tcp">Modbus TCP</option>
            <option value="rtu">Modbus RTU</option>
            <option value="ascii">Modbus ASCII</option>
          </select>
        </Field>

        {protocol === 'tcp' ? <>
          <Field label="Host"><input value={host} onChange={e => setHost(e.target.value)} style={inputStyle} /></Field>
          <Field label="Port"><input type="number" value={port} onChange={e => setPort(+e.target.value)} style={inputStyle} /></Field>
          <Field label="Unit ID"><input type="number" value={unitId} onChange={e => setUnitId(+e.target.value)} style={inputStyle} /></Field>
        </> : <>
          <Field label="Serial Port"><input value={serialPort} onChange={e => setSerialPort(e.target.value)} placeholder="/dev/ttyUSB0 or COM3" style={inputStyle} /></Field>
          <Field label="Baud Rate">
            <select value={baudRate} onChange={e => setBaudRate(+e.target.value)} style={inputStyle}>
              {[1200,2400,4800,9600,19200,38400,57600,115200].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Data Bits">
            <select value={dataBits} onChange={e => setDataBits(+e.target.value as any)} style={inputStyle}>
              {[5,6,7,8].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Stop Bits">
            <select value={stopBits} onChange={e => setStopBits(+e.target.value as any)} style={inputStyle}>
              <option value={1}>1</option><option value={2}>2</option>
            </select>
          </Field>
          <Field label="Parity">
            <select value={parity} onChange={e => setParity(e.target.value)} style={inputStyle}>
              {['none','even','odd','mark','space'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Flow Control">
            <select value={flowControl} onChange={e => setFlowControl(e.target.value)} style={inputStyle}>
              {['none','rts-cts','xon-xoff'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Slave ID"><input type="number" value={slaveId} onChange={e => setSlaveId(+e.target.value)} style={inputStyle} /></Field>
        </>}

        <Field label="Poll Interval (ms)">
          <input type="number" value={pollIntervalMs} onChange={e => setPollIntervalMs(+e.target.value)} min={50} style={inputStyle} />
        </Field>

        <button onClick={handleSave} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px', cursor: 'pointer', fontWeight: 600 }}>
          {initial ? 'Save Changes' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '6px 8px', color: 'var(--text)', fontSize: 13, width: '100%'
}
```

- [ ] Install uuid

```bash
cd /opt/grw/modbus-storm && npm install uuid && npm install --save-dev @types/uuid
```

- [ ] Commit

```bash
git add src/renderer/components && git commit -m "feat: sidebar and connection config sheet"
```

---

## Task 9: Dashboard + Connection Panels + Register Rows

**Files:**
- Create: `src/renderer/components/Dashboard.tsx`
- Create: `src/renderer/components/ConnectionPanel.tsx`
- Create: `src/renderer/components/RegisterRow.tsx`
- Create: `src/renderer/components/RegisterGroupEditor.tsx`

- [ ] Write `src/renderer/components/Dashboard.tsx`

```typescript
import React from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useWorkspaceStore } from '../store/workspace'
import ConnectionPanel from './ConnectionPanel'

export default function Dashboard(): React.JSX.Element {
  const connections = useWorkspaceStore(s => s.workspace.connections)

  const layout = connections.map((c, i) => ({
    i: c.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 8, w: 6, h: 8, minW: 3, minH: 4
  }))

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: 12 }}>
      {connections.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 32 }}>⚡</div>
          <div style={{ fontSize: 14 }}>No connections yet. Add one from the sidebar.</div>
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={40}
          width={1100}
          draggableHandle=".panel-drag-handle"
        >
          {connections.map(c => (
            <div key={c.id} style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ConnectionPanel connection={c} />
            </div>
          ))}
        </GridLayout>
      )}
    </main>
  )
}
```

- [ ] Write `src/renderer/components/ConnectionPanel.tsx`

```typescript
import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import RegisterRow from './RegisterRow'
import RegisterGroupEditor from './RegisterGroupEditor'
import RawFrameInspector from './RawFrameInspector'
import type { ConnectionConfig } from '../../shared/types'

interface Props { connection: ConnectionConfig }

export default function ConnectionPanel({ connection }: Props): React.JSX.Element {
  const status = useConnectionsStore(s => s.connections[connection.id]?.status ?? 'idle')
  const loggingActive = useConnectionsStore(s => s.connections[connection.id]?.loggingActive ?? false)
  const setLogging = useConnectionsStore(s => s.setLogging)
  const [showFrames, setShowFrames] = useState(false)
  const [showGroupEditor, setShowGroupEditor] = useState(false)

  const statusColor = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : status === 'error' ? '#ef4444' : '#94a3b8'

  const handleLogging = async () => {
    if (loggingActive) {
      await window.api.stopLogging(connection.id)
      setLogging(connection.id, false)
    } else {
      await window.api.startLogging(connection.id, connection.name)
      setLogging(connection.id, true)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Panel header */}
      <div className="panel-drag-handle" style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'grab'
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{connection.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{connection.pollIntervalMs}ms</span>
        <button onClick={() => setShowGroupEditor(!showGroupEditor)} style={panelBtn} title="Edit registers">📋</button>
        <button onClick={() => setShowFrames(!showFrames)} style={panelBtn} title="Raw frames">🔬</button>
        <button onClick={handleLogging} style={{ ...panelBtn, color: loggingActive ? '#ef4444' : undefined }} title="Toggle logging">
          {loggingActive ? '⏹' : '⏺'}
        </button>
      </div>

      {showGroupEditor && <RegisterGroupEditor connection={connection} />}

      {showFrames ? (
        <RawFrameInspector connectionId={connection.id} connection={connection} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {connection.registerGroups.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              No registers configured. Click 📋 to add register groups.
            </div>
          ) : (
            connection.registerGroups.map(group => (
              <div key={group.id}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 4px 2px', letterSpacing: 0.4 }}>
                  {group.label} (FC{String(group.functionCode).padStart(2, '0')})
                </div>
                {group.registers.map(reg => (
                  <RegisterRow
                    key={reg.address}
                    connection={connection}
                    group={group}
                    register={reg}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const panelBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2, opacity: 0.7
}
```

- [ ] Write `src/renderer/components/RegisterRow.tsx`

```typescript
import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'
import TableCell from './widgets/TableCell'
import Sparkline from './widgets/Sparkline'
import Gauge from './widgets/Gauge'
import type { ConnectionConfig, RegisterGroup, RegisterConfig, WidgetType } from '../../shared/types'

interface Props {
  connection: ConnectionConfig
  group: RegisterGroup
  register: RegisterConfig
}

export default function RegisterRow({ connection, group, register }: Props): React.JSX.Element {
  const liveValue = useConnectionsStore(s => s.connections[connection.id]?.registerValues[register.address])
  const sparkline = useConnectionsStore(s => s.connections[connection.id]?.sparklineData[String(register.address)] ?? [])
  const preferredBase = useWorkspaceStore(s => s.workspace.settings.preferredBase)
  const { updateConnection } = useWorkspaceStore()
  const [writeOpen, setWriteOpen] = useState(false)
  const [writeVal, setWriteVal] = useState('')

  const alertState = liveValue?.alertState ?? 'ok'
  const bgColor = alertState !== 'ok' ? 'rgba(245,158,11,0.1)' : undefined

  const displayBase = register.displayBase === 'inherit' ? preferredBase : register.displayBase
  const rawDisplay = liveValue
    ? (displayBase === 'hex'
        ? '0x' + liveValue.raw.toString(16).toUpperCase().padStart(4, '0')
        : String(liveValue.raw))
    : '—'

  const setWidget = (w: WidgetType) => {
    const updated = { ...connection, registerGroups: connection.registerGroups.map(g => g.id !== group.id ? g : { ...g, registers: g.registers.map(r => r.address !== register.address ? r : { ...r, widgetType: w }) }) }
    updateConnection(connection.id, updated)
  }

  const handleWrite = async () => {
    const fc = [1,2].includes(group.functionCode) ? 5 : 6
    const val = writeVal.startsWith('0x') ? parseInt(writeVal, 16) : Number(writeVal)
    await window.api.writeRegister(connection.id, fc, register.address, val)
    setWriteOpen(false)
    setWriteVal('')
  }

  return (
    <div style={{ background: bgColor, borderRadius: 4, marginBottom: 2, padding: '4px 6px', border: `1px solid ${alertState !== 'ok' ? 'rgba(245,158,11,0.4)' : 'transparent'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 50, fontFamily: 'monospace' }}>
          {displayBase === 'hex' ? '0x' + register.address.toString(16).toUpperCase().padStart(4,'0') : register.address}
        </span>
        <span style={{ fontSize: 12, flex: 1, fontWeight: 500 }}>{register.label || `Reg ${register.address}`}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{rawDisplay}</span>

        {/* Widget toggle */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['table','sparkline','gauge'] as WidgetType[]).map(w => (
            <button key={w} onClick={() => setWidget(w)} style={{ ...wBtn, background: register.widgetType === w ? 'var(--primary-light)' : undefined, color: register.widgetType === w ? 'var(--primary)' : 'var(--text-muted)' }}>
              {w === 'table' ? '⊞' : w === 'sparkline' ? '📈' : '🔵'}
            </button>
          ))}
        </div>

        <button onClick={() => setWriteOpen(!writeOpen)} style={wBtn} title="Write value">✏️</button>
        {alertState !== 'ok' && <span style={{ fontSize: 10, color: '#f59e0b' }}>⚠</span>}
      </div>

      {/* Widget display */}
      <div style={{ marginTop: 4 }}>
        {register.widgetType === 'table' && <TableCell register={register} liveValue={liveValue} />}
        {register.widgetType === 'sparkline' && <Sparkline data={sparkline} register={register} />}
        {register.widgetType === 'gauge' && <Gauge register={register} liveValue={liveValue} />}
      </div>

      {/* Write panel */}
      {writeOpen && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <input
            value={writeVal}
            onChange={e => setWriteVal(e.target.value)}
            placeholder="value (dec or 0x…)"
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text)' }}
            onKeyDown={e => e.key === 'Enter' && handleWrite()}
          />
          <button onClick={handleWrite} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
            Send
          </button>
        </div>
      )}
    </div>
  )
}

const wBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '1px 3px', borderRadius: 3 }
```

- [ ] Write `src/renderer/components/RegisterGroupEditor.tsx`

```typescript
import React, { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useWorkspaceStore } from '../store/workspace'
import type { ConnectionConfig, RegisterGroup, RegisterConfig, ReadFC, DataType, WidgetType } from '../../shared/types'

interface Props { connection: ConnectionConfig }

export default function RegisterGroupEditor({ connection }: Props): React.JSX.Element {
  const { updateConnection } = useWorkspaceStore()
  const [fc, setFc] = useState<ReadFC>(3)
  const [startAddr, setStartAddr] = useState(0)
  const [count, setCount] = useState(10)
  const [label, setLabel] = useState('')

  const addGroup = () => {
    const regs: RegisterConfig[] = Array.from({ length: count }, (_, i) => ({
      address: startAddr + i,
      label: `${label || 'Reg'} ${startAddr + i}`,
      dataType: 'uint16' as DataType,
      scale: 1, offset: 0, unit: '',
      displayBase: 'inherit',
      widgetType: 'table' as WidgetType,
      gaugeMin: 0, gaugeMax: 65535,
      sparklineWindowSecs: 60,
      alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
    }))
    const group: RegisterGroup = { id: uuid(), label: label || `Group @ ${startAddr}`, functionCode: fc, startAddress: startAddr, count, registers: regs }
    updateConnection(connection.id, {
      ...connection,
      registerGroups: [...connection.registerGroups, group]
    })
  }

  const removeGroup = (id: string) => {
    updateConnection(connection.id, {
      ...connection,
      registerGroups: connection.registerGroups.filter(g => g.id !== id)
    })
  }

  return (
    <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>REGISTER GROUPS</div>
      {connection.registerGroups.map(g => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
          <span style={{ flex: 1 }}>{g.label}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>FC{g.functionCode} [{g.startAddress}..{g.startAddress + g.count - 1}]</span>
          <button onClick={() => removeGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={fc} onChange={e => setFc(+e.target.value as ReadFC)} style={sm}>
          <option value={1}>FC01 Coils</option>
          <option value={2}>FC02 Discrete</option>
          <option value={3}>FC03 Holding</option>
          <option value={4}>FC04 Input</option>
        </select>
        <input type="number" value={startAddr} onChange={e => setStartAddr(+e.target.value)} placeholder="Start" style={{ ...sm, width: 60 }} />
        <input type="number" value={count} onChange={e => setCount(+e.target.value)} placeholder="Count" style={{ ...sm, width: 55 }} min={1} max={125} />
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" style={{ ...sm, width: 90 }} />
        <button onClick={addGroup} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>+ Add</button>
      </div>
    </div>
  )
}

const sm: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, color: 'var(--text)' }
```

- [ ] Commit

```bash
git add src/renderer/components && git commit -m "feat: dashboard, connection panels, register rows, group editor"
```

---

## Task 10: Register Widgets

**Files:**
- Create: `src/renderer/components/widgets/TableCell.tsx`
- Create: `src/renderer/components/widgets/Sparkline.tsx`
- Create: `src/renderer/components/widgets/Gauge.tsx`

- [ ] Write `src/renderer/components/widgets/TableCell.tsx`

```typescript
import React from 'react'
import type { RegisterConfig, RegisterValue } from '../../../shared/types'

interface Props { register: RegisterConfig; liveValue?: RegisterValue }

export default function TableCell({ register, liveValue }: Props): React.JSX.Element {
  const val = liveValue
    ? (typeof liveValue.decoded === 'number'
        ? `${liveValue.decoded.toFixed(register.scale !== 1 ? 2 : 0)}${register.unit ? ' ' + register.unit : ''}`
        : String(liveValue.decoded))
    : '—'

  return (
    <div style={{
      background: 'var(--primary-light)', borderRadius: 4, padding: '4px 8px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-text)', fontFamily: 'monospace' }}>{val}</span>
      {liveValue && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{register.dataType}</span>}
    </div>
  )
}
```

- [ ] Write `src/renderer/components/widgets/Sparkline.tsx`

```typescript
import React from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import type { RegisterConfig, SparklinePoint } from '../../../shared/types'

interface Props { register: RegisterConfig; data: SparklinePoint[] }

export default function Sparkline({ register, data }: Props): React.JSX.Element {
  if (data.length < 2) return <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>Collecting data…</div>

  const chartData = data.map(d => ({ value: typeof d.value === 'number' ? d.value : 0, t: d.timestamp }))

  return (
    <div style={{ height: 50 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            formatter={(v: number) => [`${v}${register.unit}`, register.label]}
            labelFormatter={(l) => new Date(l).toLocaleTimeString()}
            contentStyle={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)' }}
          />
          <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] Write `src/renderer/components/widgets/Gauge.tsx`

```typescript
import React from 'react'
import type { RegisterConfig, RegisterValue } from '../../../shared/types'

interface Props { register: RegisterConfig; liveValue?: RegisterValue }

export default function Gauge({ register, liveValue }: Props): React.JSX.Element {
  const val = typeof liveValue?.decoded === 'number' ? liveValue.decoded : 0
  const { gaugeMin, gaugeMax } = register
  const pct = Math.min(1, Math.max(0, (val - gaugeMin) / (gaugeMax - gaugeMin || 1)))
  const angle = -135 + pct * 270

  const cx = 60, cy = 60, r = 45
  const toXY = (deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180)
  })
  const start = toXY(-135)
  const end = toXY(135)
  const needle = toXY(angle - 90)

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width={120} height={80} viewBox="0 0 120 80">
        <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`}
          fill="none" stroke="var(--border)" strokeWidth={8} strokeLinecap="round" />
        <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${toXY(angle - 90).x} ${toXY(angle - 90).y}`}
          fill="none" stroke="var(--primary)" strokeWidth={8} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={3} fill="var(--text)" />
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--text)">
          {val.toFixed(register.scale !== 1 ? 1 : 0)}{register.unit}
        </text>
        <text x={20} y={75} fontSize={8} fill="var(--text-muted)">{gaugeMin}</text>
        <text x={100} y={75} fontSize={8} fill="var(--text-muted)" textAnchor="end">{gaugeMax}</text>
      </svg>
    </div>
  )
}
```

- [ ] Commit

```bash
git add src/renderer/components/widgets && git commit -m "feat: table, sparkline and gauge widgets"
```

---

## Task 11: Raw Frame Inspector

**Files:**
- Create: `src/renderer/components/RawFrameInspector.tsx`

- [ ] Write `src/renderer/components/RawFrameInspector.tsx`

```typescript
import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import type { ConnectionConfig } from '../../shared/types'

const FC_NAMES: Record<number, string> = {
  1:'Read Coils',2:'Read Discrete Inputs',3:'Read Holding Registers',
  4:'Read Input Registers',5:'Write Single Coil',6:'Write Single Register',
  8:'Diagnostics',15:'Write Multiple Coils',16:'Write Multiple Registers',
  23:'Read/Write Multiple Registers',43:'Read Device ID'
}

interface Props { connectionId: string; connection: ConnectionConfig }

export default function RawFrameInspector({ connectionId, connection }: Props): React.JSX.Element {
  const frames = useConnectionsStore(s => s.rawFrames[connectionId] ?? [])
  const [tab, setTab] = useState<'monitor'|'builder'>('monitor')
  const [builderFc, setBuilderFc] = useState(3)
  const [builderAddr, setBuilderAddr] = useState('0')
  const [builderCount, setBuilderCount] = useState('10')
  const [builderResponse, setBuilderResponse] = useState<string>('')

  const sendRaw = async () => {
    const addr = builderAddr.startsWith('0x') ? parseInt(builderAddr, 16) : parseInt(builderAddr)
    const count = parseInt(builderCount)
    await window.api.writeRegister(connectionId, builderFc, addr, count)
    setBuilderResponse('Request sent — see monitor for response')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {(['monitor','builder'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: tab === t ? 'var(--primary-light)' : 'var(--surface-2)',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent'
          }}>
            {t === 'monitor' ? '📡 Monitor' : '🔧 Builder'}
          </button>
        ))}
      </div>

      {tab === 'monitor' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
          {frames.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>No frames yet. Start polling to see traffic.</div>
          ) : (
            [...frames].reverse().map((f, i) => (
              <div key={i} style={{
                marginBottom: 6, padding: '6px 8px', borderRadius: 4,
                background: f.direction === 'tx' ? 'rgba(99,102,241,0.08)' : 'rgba(34,197,94,0.08)',
                borderLeft: `3px solid ${f.direction === 'tx' ? 'var(--primary)' : 'var(--success)'}`
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                  <span style={{ color: f.direction === 'tx' ? 'var(--primary)' : 'var(--success)', fontWeight: 700 }}>
                    {f.direction.toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{new Date(f.timestamp).toLocaleTimeString()}</span>
                  {f.bytes[1] && <span style={{ color: 'var(--text-muted)' }}>{FC_NAMES[f.bytes[1]] ?? `FC${f.bytes[1]}`}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {f.bytes.map((b, j) => (
                    <span key={j} style={{ background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>
                      {b.toString(16).toUpperCase().padStart(2,'0')}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Build and send a Modbus request manually</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={builderFc} onChange={e => setBuilderFc(+e.target.value)} style={inp}>
              {Object.entries(FC_NAMES).map(([k,v]) => <option key={k} value={k}>FC{k} — {v}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={builderAddr} onChange={e => setBuilderAddr(e.target.value)} placeholder="Address" style={{ ...inp, width: 80 }} />
              <input value={builderCount} onChange={e => setBuilderCount(e.target.value)} placeholder="Count/Val" style={{ ...inp, width: 80 }} />
            </div>
            <button onClick={sendRaw} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
              Send
            </button>
          </div>
          {builderResponse && <div style={{ fontSize: 11, color: 'var(--success)', padding: '6px 8px', background: 'rgba(34,197,94,0.08)', borderRadius: 4 }}>{builderResponse}</div>}
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text)' }
```

- [ ] Commit

```bash
git add src/renderer/components/RawFrameInspector.tsx && git commit -m "feat: raw frame inspector with monitor and builder tabs"
```

---

## Task 12: Log Drawer

**Files:**
- Create: `src/renderer/components/LogDrawer.tsx`

- [ ] Write `src/renderer/components/LogDrawer.tsx`

```typescript
import React, { useState, useRef, useEffect } from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'

export default function LogDrawer(): React.JSX.Element {
  const logDrawerOpen = useWorkspaceStore(s => s.workspace.settings.logDrawerOpen)
  const setSettings = useWorkspaceStore(s => s.setSettings)
  const logEntries = useConnectionsStore(s => s.logEntries)
  const [filter, setFilter] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries.length])

  const filtered = filter
    ? logEntries.filter(e =>
        e.connectionName.toLowerCase().includes(filter.toLowerCase()) ||
        e.message?.toLowerCase().includes(filter.toLowerCase()) ||
        String(e.address).includes(filter)
      )
    : logEntries

  const statusColor = (status: string) =>
    status === 'error' ? '#ef4444' : status === 'alert' ? '#f59e0b' : 'var(--text-muted)'

  const exportCsv = () => {
    const rows = ['timestamp,connection,fc,address,raw_hex,raw_dec,decoded,unit,status',
      ...filtered.map(e => `${new Date(e.timestamp).toISOString()},${e.connectionName},${e.fc},${e.address},${e.rawHex},${e.rawDec},${e.decodedValue},${e.unit},${e.status}`)
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `modbus-log-${Date.now()}.csv`
    a.click()
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border)', background: 'var(--surface)',
      height: logDrawerOpen ? 220 : 32, transition: 'height 0.2s ease', overflow: 'hidden', flexShrink: 0
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 32, borderBottom: logDrawerOpen ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
        onClick={() => setSettings({ logDrawerOpen: !logDrawerOpen })}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          {logDrawerOpen ? '▼' : '▲'} LOG
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{logEntries.length} entries</span>
        <div style={{ flex: 1 }} />
        {logDrawerOpen && <>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter…"
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--text)', width: 140 }}
          />
          <button onClick={(e) => { e.stopPropagation(); exportCsv() }}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text)' }}>
            Export CSV
          </button>
        </>}
      </div>

      {/* Entries */}
      {logDrawerOpen && (
        <div style={{ height: 188, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
          {filtered.slice(-500).map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 85 }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span style={{ color: 'var(--primary)', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.connectionName}</span>
              <span style={{ color: 'var(--text-muted)', minWidth: 20 }}>FC{e.fc}</span>
              <span style={{ minWidth: 50 }}>@{e.address}</span>
              <span style={{ color: 'var(--text-muted)', minWidth: 60 }}>{e.rawHex}</span>
              <span style={{ fontWeight: 600, flex: 1 }}>{e.decodedValue}{e.unit && ` ${e.unit}`}</span>
              <span style={{ color: statusColor(e.status) }}>{e.status}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
```

- [ ] Commit

```bash
git add src/renderer/components/LogDrawer.tsx && git commit -m "feat: log drawer with filter and CSV export"
```

---

## Task 13: electron-builder Config + CI

**Files:**
- Create: `electron-builder.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/ci.yml`

- [ ] Write `electron-builder.yml`

```yaml
appId: com.modbusstorm.app
productName: modbus-storm
copyright: Copyright © 2026 modbus-storm contributors
license: GPL-3.0

directories:
  buildResources: resources

files:
  - out/**/*
  - node_modules/**/*
  - package.json

extraMetadata:
  main: out/main/index.js

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true

win:
  target:
    - target: nsis
      arch: [x64, ia32]
    - target: portable
      arch: [x64]
  icon: resources/icons/icon.ico

mac:
  target:
    - target: dmg
      arch: [universal]
    - target: zip
      arch: [universal]
  icon: resources/icons/icon.icns
  category: public.app-category.developer-tools

linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
    - target: rpm
      arch: [x64]
  icon: resources/icons/
  category: Development

publish:
  provider: github
  releaseType: release
```

- [ ] Write `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Rebuild native modules
        run: npx electron-rebuild

      - name: Build
        run: npm run build

      - name: Package (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: npx electron-builder --linux --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Package (macOS)
        if: matrix.os == 'macos-latest'
        run: npx electron-builder --mac --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          CSC_LINK: ${{ secrets.MAC_CERT }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}

      - name: Package (Windows)
        if: matrix.os == 'windows-latest'
        run: npx electron-builder --win --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          WIN_CSC_LINK: ${{ secrets.WIN_CERT }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
```

- [ ] Write `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
```

- [ ] Create placeholder icon (CI needs it)

```bash
mkdir -p /opt/grw/modbus-storm/resources/icons
# Create a simple 512x512 placeholder PNG using node
node -e "
const { createCanvas } = require('canvas') || {};
// Fallback: create a 1x1 PNG buffer manually
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
require('fs').writeFileSync('resources/icons/icon.png', png);
"
cp /opt/grw/modbus-storm/resources/icons/icon.png /opt/grw/modbus-storm/resources/icons/icon.icns 2>/dev/null || true
cp /opt/grw/modbus-storm/resources/icons/icon.png /opt/grw/modbus-storm/resources/icons/icon.ico 2>/dev/null || true
```

- [ ] Commit

```bash
git add electron-builder.yml .github resources && git commit -m "feat: electron-builder config and GitHub Actions CI"
```

---

## Task 14: Wire IPC Events + Sparkline Updates in Renderer

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] Update `src/renderer/App.tsx` to push sparkline data from poll results

```typescript
import React, { useEffect } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import LogDrawer from './components/LogDrawer'
import { useWorkspaceStore } from './store/workspace'
import { useConnectionsStore } from './store/connections'
import './styles/global.css'
import './styles/theme.css'

export default function App(): React.JSX.Element {
  const theme = useWorkspaceStore(s => s.workspace.settings.theme)
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const { setStatus, setRegisterValues, appendSparkline, appendLog } = useConnectionsStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const off1 = window.api.onConnectionStatus((data: any) => {
      setStatus(data.connectionId, data.status, data.error)
    })

    const off2 = window.api.onPollResult((batch: any) => {
      for (const key of Object.keys(batch)) {
        const item = batch[key]
        if (!item?.transformed) continue
        const conn = connections.find(c => c.id === item.connectionId)
        if (!conn) continue
        const group = conn.registerGroups.find(g => g.id === item.groupId)
        if (!group) continue
        const addresses = group.registers.map(r => r.address)
        setRegisterValues(item.connectionId, item.groupId, item.transformed, addresses)

        // Push sparkline points
        item.transformed.forEach((rv: any, i: number) => {
          const reg = group.registers[i]
          if (!reg || typeof rv.decoded !== 'number') return
          const maxPts = Math.ceil(reg.sparklineWindowSecs * 1000 / conn.pollIntervalMs)
          appendSparkline(item.connectionId, reg.address, { timestamp: rv.timestamp, value: rv.decoded }, maxPts)
        })

        // Append log entries
        item.transformed.forEach((rv: any, i: number) => {
          const reg = group.registers[i]
          if (!reg) return
          appendLog({
            id: `${item.connectionId}-${item.timestamp}-${i}`,
            timestamp: rv.timestamp,
            connectionId: item.connectionId,
            connectionName: conn.name,
            direction: 'rx',
            fc: group.functionCode,
            address: reg.address,
            rawHex: '0x' + rv.raw.toString(16).toUpperCase().padStart(4, '0'),
            rawDec: String(rv.raw),
            decodedValue: String(rv.decoded),
            unit: reg.unit,
            status: rv.alertState !== 'ok' ? 'alert' : 'ok'
          })
        })
      }
    })

    return () => { off1(); off2() }
  }, [connections])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <Dashboard />
      </div>
      <LogDrawer />
    </div>
  )
}
```

- [ ] Commit

```bash
git add src/renderer/App.tsx && git commit -m "feat: wire sparkline + log updates from poll results"
```

---

## Task 15: Final Integration — Build Verification

- [ ] Install any missing deps and fix type errors

```bash
cd /opt/grw/modbus-storm
npm install
npm run build 2>&1 | head -60
```

- [ ] Run dev and verify

```bash
npm run dev
```
Expected: App opens. Sidebar shows "+ New Connection". Click it, configure a TCP connection to 127.0.0.1:502, click Connect. Status dot turns yellow (connecting) then red (error — no server running). Log drawer shows connection attempt. Frame inspector shows nothing yet.

- [ ] Commit any final fixes

```bash
git add -A && git commit -m "fix: build fixes and final integration"
```

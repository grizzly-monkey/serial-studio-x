import { utilityProcess, BrowserWindow } from 'electron'

function broadcast(channel: string, data: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  }
}
import { join } from 'path'
import { IPC } from '../shared/ipc-channels'
import { checkAlert } from './alert-engine'
import { appendLog, appendTrafficLog, isLogging } from './file-io'
import { transformPollResult } from './transform'
import type { ConnectionConfig, WorkerPollResult } from '../shared/types'

const workers = new Map<string, Electron.UtilityProcess>()
let lastPushTime = 0
const pendingUpdates: Record<string, unknown> = {}

function getWorkerPath(): string {
  return join(__dirname, 'workers/modbus-worker.js')
}

function waitForExit(child: Electron.UtilityProcess, timeoutMs = 3000): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(() => { try { child.kill() } catch { /* already gone */ } resolve() }, timeoutMs)
    child.once('exit', () => { clearTimeout(t); resolve() })
  })
}

export async function spawnWorker(config: ConnectionConfig): Promise<void> {
  if (workers.has(config.id)) {
    console.log(`[registry] waiting for existing worker to exit: ${config.id}`)
    const old = workers.get(config.id)!
    workers.delete(config.id)
    old.postMessage({ type: 'stop' })
    await waitForExit(old)
  }

  console.log(`[registry] spawning worker for "${config.name}" (${config.id})`)
  console.log(`[registry]   protocol: ${config.protocol}, groups: ${config.registerGroups.length}`)
  config.registerGroups.forEach(g => {
    console.log(`[registry]   group "${g.label}" FC${g.functionCode} addr=${g.startAddress} count=${g.count}`)
  })

  const child = utilityProcess.fork(getWorkerPath(), [], { stdio: 'inherit' })
  workers.set(config.id, child)

  // Send config as the first message; worker waits for 'init' before connecting
  child.postMessage({ type: 'init', config })

  child.on('message', (msg) => {
    if (msg.type === 'poll-result') {
      try { console.log(`[registry] poll-result from ${msg.payload.connectionId} group=${msg.payload.groupId} values=${JSON.stringify(msg.payload.values)}`) } catch { /* pipe closed */ }
      handlePollResult(msg.payload as WorkerPollResult, config)
    }
    if (msg.type === 'tx-log') {
      const p = msg.payload
      try { console.log(`[registry] tx-log: FC${p.fc} addr=${p.startAddress} count=${p.count} err=${p.isError}`) } catch { /* pipe closed */ }
      appendTrafficLog(config.id, `${new Date(p.timestamp).toISOString()} TX FC${p.fc} ${p.txHex}`)
      const isWrite = [5, 6, 15, 16].includes(p.fc)
        let decodedValue: string
        if (p.isError) {
          decodedValue = p.txHex
        } else if (isWrite) {
          const wv = p.writeValue ?? ''
          if (p.fc === 5) decodedValue = `Write Coil ${p.startAddress} = ${wv === '1' || wv === 'true' ? 'ON' : 'OFF'}`
          else if (p.fc === 6) decodedValue = `Write Register ${p.startAddress} = ${wv}`
          else if (p.fc === 15) decodedValue = `Write ${p.count} Coil${p.count !== 1 ? 's' : ''} @ ${p.startAddress} = ${wv}`
          else decodedValue = `Write ${p.count} Register${p.count !== 1 ? 's' : ''} @ ${p.startAddress} = ${wv}`
        } else {
          decodedValue = `FC${String(p.fc).padStart(2,'0')} addr ${p.startAddress}–${p.startAddress + p.count - 1} (${p.count} reg${p.count !== 1 ? 's' : ''})`
        }
        broadcast(IPC.LOG_ENTRY, {
          id: `tx-${p.connectionId}-${p.timestamp}-${p.startAddress}`,
          timestamp: p.timestamp,
          connectionId: p.connectionId,
          connectionName: config.name,
          direction: 'tx',
          fc: p.fc,
          address: p.startAddress,
          rawHex: p.isError ? '' : p.txHex,
          rawDec: '',
          decodedValue,
          unit: '',
          status: p.isError ? 'error' : 'ok'
        })
    }
    if (msg.type === 'status') {
      try { console.log(`[registry] status from ${msg.payload.connectionId}: ${msg.payload.status}${msg.payload.error ? ' — ' + msg.payload.error : ''}`) } catch { /* pipe closed */ }
      broadcast(IPC.CONNECTION_STATUS, msg.payload)
    }
    if (msg.type === 'write-ok' || msg.type === 'write-error') {
      broadcast(IPC.REGISTER_WRITE, msg)
    }
    if (msg.type === 'echo-response') {
      const p = msg.payload as { connectionId: string; bytes: number[]; timestamp: number }
      broadcast(IPC.ECHO_RESPONSE, p)
      const rxHex = p.bytes.map((b: number) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
      broadcast(IPC.LOG_ENTRY, {
        id: `echo-rx-${p.connectionId}-${p.timestamp}`,
        timestamp: p.timestamp,
        connectionId: p.connectionId,
        connectionName: config.name,
        direction: 'rx',
        fc: p.bytes[1] ?? 8,
        address: 0,
        rawHex: rxHex,
        rawDec: '',
        decodedValue: `FC08 Echo response (${p.bytes.length} bytes)`,
        unit: '',
        status: 'ok'
      })
    }
  })

  child.on('exit', (code) => {
    try { console.log(`[registry] worker exited for ${config.id} with code ${code}`) } catch { /* pipe closed during shutdown */ }
    if (workers.get(config.id) === child) {
      workers.delete(config.id)
    }
    if (code !== 0 && code !== null) {
      broadcast(IPC.CONNECTION_STATUS, {
        connectionId: config.id,
        status: 'error',
        error: `Worker exited with code ${code}`
      })
    }
  })
}

function handlePollResult(
  result: WorkerPollResult,
  config: ConnectionConfig
): void {
  const group = config.registerGroups.find(g => g.id === result.groupId)
  if (!group) {
    console.warn(`[registry] WARN: group ${result.groupId} not found in config for ${result.connectionId} (config has ${config.registerGroups.length} groups: ${config.registerGroups.map(g => g.id).join(', ')})`)
    return
  }

  const transformed = transformPollResult(result.values, group.registers, result.timestamp)
  console.log(`[registry] transformed ${transformed.length} registers for group "${group.label}"`)

  // Emit one RX log entry per group read showing the full raw RTU frame + decoded summary
  const decodedSummary = transformed
    .map((rv, i) => {
      const reg = group.registers[i]
      if (!reg) return null
      const val = typeof rv.decoded === 'number'
        ? (Number.isInteger(rv.decoded) ? String(rv.decoded) : rv.decoded.toFixed(2))
        : rv.decoded
      return reg.unit ? `${val} ${reg.unit}` : String(val)
    })
    .filter(Boolean)
    .join(' | ')

  broadcast(IPC.LOG_ENTRY, {
    id: `rx-${result.connectionId}-${result.timestamp}-${result.startAddress}`,
    timestamp: result.timestamp,
    connectionId: result.connectionId,
    connectionName: config.name,
    direction: 'rx',
    fc: group.functionCode,
    address: result.startAddress,
    rawHex: result.rxHex,
    rawDec: '',
    decodedValue: decodedSummary,
    unit: '',
    status: transformed.some(rv => rv.alertState !== 'ok') ? 'alert' : 'ok'
  })

  transformed.forEach((rv, i) => {
    const reg = group.registers[i]
    if (!reg) return
    rv.alertState = checkAlert(config.id, reg, rv.decoded)

    if (isLogging(config.id)) {
      const status = rv.alertState === 'ok' ? 'ok' : 'alert'
      const decodedStr = String(rv.decoded)
      const row = [
        new Date(rv.timestamp).toISOString(),
        config.name,
        group.functionCode,
        reg.address,
        '0x' + rv.raw.toString(16).toUpperCase().padStart(4, '0'),
        rv.raw,
        decodedStr,
        reg.unit,
        status
      ].join(',')
      appendLog(config.id, row, status, `${config.id}:${reg.address}`, decodedStr)
    }
  })

  const now = Date.now()
  Object.assign(pendingUpdates, {
    [`${config.id}:${result.groupId}`]: { ...result, transformed }
  })

  try { console.log(`[registry] pushing to renderer: ${Object.keys(pendingUpdates).length} pending update(s), dt=${now - lastPushTime}ms`) } catch { /* ignore */ }

  if (now - lastPushTime >= 16) {
    lastPushTime = now
    broadcast(IPC.POLL_RESULT, { ...pendingUpdates })
    try { console.log(`[registry] IPC POLL_RESULT sent`) } catch { /* ignore */ }
  }
}

export function killWorker(connectionId: string): void {
  const child = workers.get(connectionId)
  if (child) {
    console.log(`[registry] killing worker ${connectionId}`)
    workers.delete(connectionId)
    child.postMessage({ type: 'stop' })
    // Force-kill after 2 s if the process doesn't exit on its own
    setTimeout(() => { try { child.kill() } catch { /* already gone */ } }, 2000)
  }
}

export function pausePolling(connectionId: string): void {
  workers.get(connectionId)?.postMessage({ type: 'pause' })
}

export function resumePolling(connectionId: string): void {
  workers.get(connectionId)?.postMessage({ type: 'resume' })
}

export function sendWrite(connectionId: string, fc: number, address: number, value: unknown): void {
  workers.get(connectionId)?.postMessage({ type: 'write', payload: { fc, address, value } })
}

export function sendRawFrame(connectionId: string, bytes: number[]): void {
  workers.get(connectionId)?.postMessage({ type: 'raw-frame', payload: { bytes } })
}

export function killAll(): void {
  for (const id of [...workers.keys()]) killWorker(id)
}

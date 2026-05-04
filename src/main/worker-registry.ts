import { Worker } from 'worker_threads'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc-channels'
import { checkAlert } from './alert-engine'
import { appendLog, isLogging } from './file-io'
import { transformPollResult } from './transform'
import type { ConnectionConfig, WorkerPollResult } from '../shared/types'

const workers = new Map<string, Worker>()
let lastPushTime = 0
const pendingUpdates: Record<string, unknown> = {}

function getWorkerPath(): string {
  if (is.dev) {
    return join(__dirname, '../../src/workers/modbus-worker.js')
  }
  return join(__dirname, '../workers/modbus-worker.js')
}

export function spawnWorker(config: ConnectionConfig, win: BrowserWindow): void {
  if (workers.has(config.id)) killWorker(config.id)

  const worker = new Worker(getWorkerPath(), { workerData: config })

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

  worker.on('exit', (code) => {
    if (code !== 0) {
      win.webContents.send(IPC.CONNECTION_STATUS, {
        connectionId: config.id,
        status: 'error',
        error: `Worker exited with code ${code}`
      })
    }
    workers.delete(config.id)
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

  const now = Date.now()
  Object.assign(pendingUpdates, {
    [`${config.id}:${result.groupId}`]: { ...result, transformed }
  })
  if (now - lastPushTime >= 16) {
    lastPushTime = now
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.POLL_RESULT, { ...pendingUpdates })
    }
  }
}

export function killWorker(connectionId: string): void {
  const w = workers.get(connectionId)
  if (w) {
    w.postMessage({ type: 'stop' })
    workers.delete(connectionId)
  }
}

export function sendWrite(connectionId: string, fc: number, address: number, value: unknown): void {
  workers.get(connectionId)?.postMessage({ type: 'write', payload: { fc, address, value } })
}

export function killAll(): void {
  for (const id of [...workers.keys()]) killWorker(id)
}

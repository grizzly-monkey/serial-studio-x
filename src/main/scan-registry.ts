import { utilityProcess, BrowserWindow } from 'electron'

function broadcast(channel: string, data: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  }
}
import { join } from 'path'
import { IPC } from '../shared/ipc-channels'
import { killWorker } from './worker-registry'
import type { ConnectionConfig } from '../shared/types'

let scanProcess: Electron.UtilityProcess | null = null

function getScanWorkerPath(): string {
  return join(__dirname, 'workers/scan-worker.js')
}

export async function startScan(
  config: ConnectionConfig,
  timeoutMs: number,
  win: BrowserWindow
): Promise<void> {
  // Stop any existing scan
  await stopScan()

  // If a polling worker is running on this connection's serial port, kill it
  // so the scan process can open the port exclusively.
  if (config.id) {
    killWorker(config.id)
    // Give the OS time to release the port lock
    await new Promise(r => setTimeout(r, 600))
  }

  scanProcess = utilityProcess.fork(getScanWorkerPath(), [], { stdio: 'inherit' })
  scanProcess.postMessage({ type: 'init', config, timeoutMs })

  scanProcess.on('message', (msg) => {
    if (msg.type === 'progress') broadcast(IPC.SCAN_PROGRESS, msg.payload)
    if (msg.type === 'done') broadcast(IPC.SCAN_DONE, msg.payload)
  })

  scanProcess.on('exit', () => { scanProcess = null })
}

export async function stopScan(): Promise<void> {
  if (!scanProcess) return
  const proc = scanProcess
  scanProcess = null
  proc.postMessage({ type: 'stop' })
  // Wait for the process to release the port before returning
  await new Promise<void>(resolve => {
    const t = setTimeout(() => { try { proc.kill() } catch { /* gone */ } resolve() }, 2000)
    proc.once('exit', () => { clearTimeout(t); resolve() })
  })
}

import { BrowserWindow } from 'electron'

function broadcast(channel: string, data: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  }
}
import { IPC } from '../shared/ipc-channels'
import type { ConnectionConfig } from '../shared/types'

// Lazy import to avoid native module issues at require time
async function getSerialPort() {
  const { SerialPort } = await import('serialport')
  return SerialPort
}

type PortInstance = Awaited<ReturnType<typeof getSerialPort>>['prototype']
const openPorts = new Map<string, InstanceType<Awaited<ReturnType<typeof getSerialPort>>>>()

export async function openTerminal(config: ConnectionConfig): Promise<void> {
  await closeTerminal(config.id)

  const SerialPort = await getSerialPort()
  const port = new SerialPort({
    path: config.serialPort!,
    baudRate: config.baudRate ?? 9600,
    dataBits: config.dataBits ?? 8,
    stopBits: config.stopBits ?? 1,
    parity: (config.parity ?? 'none') as 'none' | 'even' | 'odd' | 'mark' | 'space',
    autoOpen: false,
  })

  port.on('data', (data: Buffer) => {
    broadcast(IPC.TERMINAL_DATA, { connectionId: config.id, bytes: Array.from(data as Buffer) })
  })

  port.on('error', (err: Error) => {
    broadcast(IPC.TERMINAL_STATUS, { connectionId: config.id, status: 'error', error: err.message })
  })

  port.on('close', () => {
    broadcast(IPC.TERMINAL_STATUS, { connectionId: config.id, status: 'idle' })
    openPorts.delete(config.id)
  })

  await new Promise<void>((resolve, reject) => {
    port.open((err: Error | null) => { if (err) reject(err); else resolve() })
  })

  openPorts.set(config.id, port as any)
  broadcast(IPC.TERMINAL_STATUS, { connectionId: config.id, status: 'connected' })
}

export async function closeTerminal(connectionId: string): Promise<void> {
  const port = openPorts.get(connectionId)
  if (!port) return
  openPorts.delete(connectionId)
  if ((port as any).isOpen) {
    await new Promise<void>(resolve => (port as any).close(() => resolve()))
  }
}

export function writeTerminal(connectionId: string, bytes: number[]): void {
  const port = openPorts.get(connectionId) as any
  if (port?.isOpen) port.write(Buffer.from(bytes))
}

export async function closeAllTerminals(): Promise<void> {
  for (const id of [...openPorts.keys()]) {
    await closeTerminal(id)
  }
}

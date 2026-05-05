import ModbusRTU from 'modbus-serial'
import type { ConnectionConfig } from '../shared/types'

let running = true
const client = new ModbusRTU()

function post(msg: unknown): void {
  try { process.parentPort.postMessage(msg) } catch { /* pipe closed */ }
}

// A Modbus exception response means the device IS present — it understood the
// request but rejected it (wrong FC, protected register, etc.). Only a timeout
// means no device at that address.
function devicePresent(err: unknown): boolean {
  return err !== null && typeof err === 'object' && 'modbusCode' in err
}

process.parentPort.on('message', async (event) => {
  const msg = event.data
  if (msg.type === 'stop') { running = false; return }
  if (msg.type !== 'init') return

  const config = msg.config as ConnectionConfig
  const timeoutMs: number = msg.timeoutMs ?? 200

  try {
    if (config.protocol === 'rtu') {
      await client.connectRTUBuffered(config.serialPort!, {
        baudRate: config.baudRate ?? 9600,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? 'none',
      })
    } else {
      await client.connectAsciiSerial(config.serialPort!, {
        baudRate: config.baudRate ?? 9600,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? 'none',
      })
    }

    client.setTimeout(timeoutMs)

    // Flush stale bytes after connect
    try {
      await new Promise<void>((res, rej) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const port = (client as any)._port
        if (port?.flush) port.flush((e: Error | null) => e ? rej(e) : res())
        else res()
      })
    } catch { /* adapter doesn't support flush */ }
    await new Promise(r => setTimeout(r, 150))

    const found: Array<{ address: number; responseMs: number }> = []
    const TOTAL = 247

    for (let addr = 1; addr <= TOTAL && running; addr++) {
      client.setID(addr)
      post({ type: 'progress', payload: { address: addr, total: TOTAL, status: 'scanning' } })

      const t0 = Date.now()
      try {
        await client.readHoldingRegisters(0, 1)
        // Successful read
        const responseMs = Date.now() - t0
        found.push({ address: addr, responseMs })
        post({ type: 'progress', payload: { address: addr, total: TOTAL, status: 'found', responseMs } })
      } catch (err) {
        if (devicePresent(err)) {
          // Modbus exception — device is alive, FC03@0 just isn't supported
          const responseMs = Date.now() - t0
          found.push({ address: addr, responseMs })
          post({ type: 'progress', payload: { address: addr, total: TOTAL, status: 'found', responseMs } })
        }
        // timeout / no response → skip silently
      }

      // Minimal inter-frame gap so we don't flood the bus
      if (running && addr < TOTAL) {
        await new Promise(r => setTimeout(r, 20))
      }
    }

    post({ type: 'done', payload: { found, aborted: !running } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    post({ type: 'done', payload: { found: [], error: msg, aborted: false } })
  } finally {
    try { client.close() } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 300)
  }
})

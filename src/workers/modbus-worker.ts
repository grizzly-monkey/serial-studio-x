import ModbusRTU from 'modbus-serial'
import type { ConnectionConfig, WorkerPollResult } from '../shared/types'

// Config is sent as the first 'init' message from the parent (utilityProcess).
// process.parentPort is the IPC channel to the parent Electron process.
let config: ConnectionConfig | null = null
const client = new ModbusRTU()
let pollTimer: ReturnType<typeof setInterval> | null = null
let running = true
let reconnectDelay = 250
let pollCount = 0
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5

// Serialize all port operations so writes and reads never interleave
class Mutex {
  private _locked = false
  private _queue: Array<() => void> = []
  async acquire(): Promise<() => void> {
    if (!this._locked) { this._locked = true; return () => this._release() }
    return new Promise(resolve => this._queue.push(() => resolve(() => this._release())))
  }
  private _release(): void {
    const next = this._queue.shift()
    if (next) next()
    else this._locked = false
  }
}
const portMutex = new Mutex()

function errStr(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.message === 'string') return e.message
    if (typeof e.err === 'string') return e.err
    if (typeof e.modbusCode === 'number') return `Modbus exception 0x${e.modbusCode.toString(16).toUpperCase().padStart(2, '0')}`
    try { return JSON.stringify(e) } catch { /* circular */ }
  }
  return String(err)
}

process.on('uncaughtException', (err) => {
  console.error(`[worker] uncaughtException:`, err)
  if (config) postStatus('error', `Uncaught: ${String(err)}`)
})
process.on('unhandledRejection', (reason) => {
  console.error(`[worker] unhandledRejection:`, reason)
  if (config) postStatus('error', `Unhandled rejection: ${String(reason)}`)
})

// ── CRC-16 Modbus (display only — modbus-serial computes the real CRC) ──────
function crc16(buf: number[]): [number, number] {
  let crc = 0xFFFF
  for (const b of buf) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1
  }
  return [crc & 0xFF, (crc >> 8) & 0xFF]
}

function fmtHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

function writeTxFrameHex(fc: number, addr: number, value: unknown): string {
  const id = config!.slaveId ?? config!.unitId ?? 1
  let body: number[]
  if (fc === 5) {
    const v = (value === 1 || value === true) ? 0xFF00 : 0x0000
    body = [id, 5, (addr >> 8) & 0xFF, addr & 0xFF, (v >> 8) & 0xFF, v & 0xFF]
  } else if (fc === 6) {
    const v = Number(value) & 0xFFFF
    body = [id, 6, (addr >> 8) & 0xFF, addr & 0xFF, (v >> 8) & 0xFF, v & 0xFF]
  } else if (fc === 15) {
    const vals = value as number[]
    const byteCount = Math.ceil(vals.length / 8)
    const coilBytes: number[] = []
    for (let i = 0; i < byteCount; i++) {
      let b = 0
      for (let bit = 0; bit < 8 && i * 8 + bit < vals.length; bit++) {
        if (vals[i * 8 + bit]) b |= (1 << bit)
      }
      coilBytes.push(b)
    }
    body = [id, 15, (addr >> 8) & 0xFF, addr & 0xFF, (vals.length >> 8) & 0xFF, vals.length & 0xFF, byteCount, ...coilBytes]
  } else {
    const vals = value as number[]
    const data: number[] = []
    for (const v of vals) { data.push((v >> 8) & 0xFF, v & 0xFF) }
    body = [id, 16, (addr >> 8) & 0xFF, addr & 0xFF, (vals.length >> 8) & 0xFF, vals.length & 0xFF, data.length, ...data]
  }
  const [lo, hi] = crc16(body)
  return fmtHex([...body, lo, hi])
}

function txFrameHex(fc: number, addr: number, count: number): string {
  const id = config!.slaveId ?? config!.unitId ?? 1
  const body = [id, fc, (addr >> 8) & 0xFF, addr & 0xFF, (count >> 8) & 0xFF, count & 0xFF]
  const [lo, hi] = crc16(body)
  return fmtHex([...body, lo, hi])
}

function rxFrameHex(fc: number, values: number[]): string {
  const id = config!.slaveId ?? config!.unitId ?? 1
  const data: number[] = []
  for (const v of values) { data.push((v >> 8) & 0xFF, v & 0xFF) }
  const body = [id, fc, data.length, ...data]
  const [lo, hi] = crc16(body)
  return fmtHex([...body, lo, hi])
}

function isPortError(err: unknown): boolean {
  const s = String(err).toLowerCase()
  return s.includes('port not open') || s.includes('econnreset') ||
    s.includes('disconnected') || s.includes('closed') || s.includes('not open') ||
    s.includes('access denied') || s.includes('access is denied') || s.includes('cannot open')
}

function isAccessDenied(err: unknown): boolean {
  const s = String(err).toLowerCase()
  return s.includes('access denied') || s.includes('access is denied') || s.includes('cannot open')
}

function postStatus(status: string, error?: string): void {
  try {
    process.parentPort.postMessage({ type: 'status', payload: { connectionId: config!.id, status, error } })
  } catch { /* parentPort may already be closed */ }
}

function postTxLog(
  fc: number, addr: number, count: number, timestamp: number,
  txHex: string, groupId: string | null, isError = false
): void {
  try {
    process.parentPort.postMessage({ type: 'tx-log', payload: { connectionId: config!.id, groupId, fc, startAddress: addr, count, timestamp, txHex, isError } })
  } catch { /* ignore */ }
}

async function connect(): Promise<void> {
  if (!running || !config) return
  try {
    console.log(`[worker:${config.id}] connecting (${config.protocol}) groups=${config.registerGroups.length}`)
    postStatus('connecting')

    const pollMs = Math.max(MIN_POLL_MS, Math.min(config.pollIntervalMs, MAX_POLL_MS))
    const readTimeout = Math.max(500, Math.min(pollMs - 200, 3000))

    if (config.protocol === 'tcp') {
      await client.connectTCP(config.host!, { port: config.port ?? 502 })
      client.setID(config.unitId ?? 1)
    } else if (config.protocol === 'udp') {
      await client.connectUDP(config.host!, { port: config.port ?? 502 })
      client.setID(config.unitId ?? 1)
    } else if (config.protocol === 'rtu-tcp') {
      await client.connectTcpRTUBuffered(config.host!, { port: config.port ?? 502 })
      client.setID(config.unitId ?? 1)
    } else if (config.protocol === 'rtu') {
      // connectRTUBuffered uses an inter-byte-timeout parser which correctly
      // re-assembles multi-byte RTU responses on macOS USB-serial adapters.
      const serialOpts: Record<string, unknown> = {
        baudRate: config.baudRate ?? 9600,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? 'none',
      }
      if (config.rs485Mode) serialOpts['rs485'] = { enabled: true, rtsOnSend: true, rtsAfterSend: false }
      await client.connectRTUBuffered(config.serialPort!, serialOpts)
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

    const effectiveTimeout = config.responseTimeoutMs
      ? Math.max(200, Math.min(config.responseTimeoutMs, 30000))
      : readTimeout
    client.setTimeout(effectiveTimeout)

    // For serial protocols: flush adapter buffer and allow line to settle before
    // first poll. Prevents stale bytes from a previous session causing timeouts.
    if (config.protocol !== 'tcp' && config.protocol !== 'udp' && config.protocol !== 'rtu-tcp') {
      try {
        await new Promise<void>((res, rej) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const port = (client as any)._port
          if (port?.flush) port.flush((err: Error | null) => err ? rej(err) : res())
          else res()
        })
      } catch { /* adapter doesn't support flush — continue */ }
      await new Promise(r => setTimeout(r, 200))
    }

    reconnectDelay = 250
    consecutiveErrors = 0

    console.log(`[worker:${config.id}] connected slaveId=${client.getID()} timeout=${readTimeout}ms`)
    postStatus('connected')
    startPolling()
  } catch (err) {
    console.error(`[worker:${config.id}] connect failed:`, String(err))
    const msg = isAccessDenied(err)
      ? `Port access denied — close any other application using ${config.serialPort ?? config.host}`
      : String(err)
    postStatus('error', msg)
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (!running) return
  console.log(`[worker:${config!.id}] retry in ${reconnectDelay}ms`)
  setTimeout(connect, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 30000)
}

const MIN_POLL_MS = 2_000
const MAX_POLL_MS = 3_600_000

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  let tickRunning = false

  // Clamp per-connection poll interval independently of other connections
  const pollMs = Math.max(MIN_POLL_MS, Math.min(config!.pollIntervalMs, MAX_POLL_MS))
  console.log(`[worker:${config!.id}] poll interval clamped to ${pollMs}ms`)

  if (config!.registerGroups.length === 0) {
    console.warn(`[worker:${config!.id}] WARNING: no register groups — nothing to poll`)
    postTxLog(0, 0, 0, Date.now(), 'No register groups configured — open 📋 to add groups', null, true)
  }

  pollTimer = setInterval(async () => {
    if (!running || tickRunning) return
    tickRunning = true
    pollCount++
    console.log(`[worker:${config!.id}] tick #${pollCount} (${config!.registerGroups.length} group(s))`)

    try {
      for (const group of config!.registerGroups) {
        if (!running) break

        const timestamp = Date.now()
        const { functionCode: fc, startAddress: addr, count } = group
        const tx = txFrameHex(fc, addr, count)

        console.log(`[worker:${config!.id}]  TX FC${fc} addr=${addr} count=${count} | ${tx}`)
        postTxLog(fc, addr, count, timestamp, tx, group.id)

        // Each port operation is wrapped in a mutex so writes queued via
        // parentPort messages never interleave with an in-flight read.
        // The release is always called from finally — never inside catch —
        // to prevent double-release when returning early.
        let fatalError: string | null = null
        const release = await portMutex.acquire()
        try {
          let values: number[] = []
          switch (fc) {
            case 1: values = (await client.readCoils(addr, count)).data.map(Number); break
            case 2: values = (await client.readDiscreteInputs(addr, count)).data.map(Number); break
            case 3: values = (await client.readHoldingRegisters(addr, count)).data; break
            case 4: values = (await client.readInputRegisters(addr, count)).data; break
            case 23: values = (await client.readWriteMultipleRegisters(addr, count, 0, [0])).data; break
            default: values = []
          }

          const rxHex = rxFrameHex(fc, values)
          console.log(`[worker:${config!.id}]  RX FC${fc} values=${JSON.stringify(values)} | ${rxHex}`)
          consecutiveErrors = 0
          process.parentPort.postMessage({
            type: 'poll-result',
            payload: { connectionId: config!.id, groupId: group.id, startAddress: addr, values, rxHex, timestamp } as WorkerPollResult
          })

        } catch (readErr) {
          const msg = errStr(readErr)
          const isModbusException = readErr !== null && typeof readErr === 'object' &&
            typeof (readErr as Record<string, unknown>).modbusCode === 'number'

          console.error(`[worker:${config!.id}]  READ ERR FC${fc}@${addr}: ${msg}`)
          postTxLog(fc, addr, count, timestamp, `❌ ${msg}`, group.id, true)

          if (isModbusException) {
            // Device is alive — it replied with a Modbus exception for this group.
            // Do not increment consecutiveErrors or trigger a reconnect; just log it.
          } else {
            consecutiveErrors++
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || isPortError(readErr)) {
              fatalError = msg  // signal reconnect AFTER mutex is released
            } else {
              postStatus('error', `[${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}] ${msg}`)
            }
          }
        } finally {
          release()  // always release exactly once — no explicit release in catch
        }

        // Inter-message delay (optional, helps with slow devices)
        if (running && config!.interMessageDelayMs && config!.interMessageDelayMs > 0) {
          await new Promise(r => setTimeout(r, config!.interMessageDelayMs))
        }

        // Reconnect logic runs outside the mutex scope so the port lock is freed first
        if (fatalError !== null) {
          postStatus('error', fatalError)
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
          try { client.close() } catch { /* ignore */ }
          scheduleReconnect()
          return
        }
      }
    } catch (outerErr) {
      console.error(`[worker:${config!.id}] outer poll error:`, errStr(outerErr))
      postStatus('error', errStr(outerErr))
    } finally {
      tickRunning = false
    }
  }, pollMs)
}

// Messages from parent use event.data (MessageEvent from utilityProcess)
process.parentPort.on('message', async (event) => {
  const msg = event.data

  if (msg.type === 'init') {
    config = msg.config as ConnectionConfig
    console.log(`[worker:${config.id}] initialized via utilityProcess`)
    connect()
    return
  }

  if (!config) return

  if (msg.type === 'write') {
    const { fc, address, value } = msg.payload
    const timestamp = Date.now()
    const count = Array.isArray(value) ? value.length : 1
    const txHex = writeTxFrameHex(fc, address, value)
    const writeDesc = Array.isArray(value)
      ? `[${(value as number[]).join(', ')}]`
      : String(value)

    // Log the outgoing write frame immediately
    try {
      process.parentPort.postMessage({
        type: 'tx-log',
        payload: { connectionId: config!.id, groupId: null, fc, startAddress: address, count, timestamp, txHex, isError: false, writeValue: writeDesc }
      })
    } catch { /* ignore */ }

    const release = await portMutex.acquire()
    try {
      if (fc === 5) await client.writeCoil(address, Boolean(value))
      else if (fc === 6) await client.writeRegister(address, Number(value))
      else if (fc === 15) await client.writeCoils(address, value as boolean[])
      else if (fc === 16) await client.writeRegisters(address, value as number[])
      process.parentPort.postMessage({ type: 'write-ok', payload: { address } })
    } catch (err) {
      const errMsg = errStr(err)
      process.parentPort.postMessage({ type: 'write-error', payload: { address, error: errMsg } })
      try {
        process.parentPort.postMessage({
          type: 'tx-log',
          payload: { connectionId: config!.id, groupId: null, fc, startAddress: address, count, timestamp: Date.now(), txHex: `❌ ${errMsg}`, isError: true, writeValue: '' }
        })
      } catch { /* ignore */ }
    } finally {
      release()
    }
  }

  if (msg.type === 'raw-frame') {
    const bytes: number[] = msg.payload.bytes
    const timestamp = Date.now()
    const hexStr = bytes.map((b: number) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
    try {
      process.parentPort.postMessage({
        type: 'tx-log',
        payload: { connectionId: config!.id, groupId: null, fc: bytes[1] ?? 0, startAddress: 0, count: 0, timestamp, txHex: hexStr, isError: false, writeValue: 'RAW' }
      })
    } catch { /* ignore */ }

    const release = await portMutex.acquire()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = (client as any)._port ?? (client as any)._client
      if (port?.write) {
        await new Promise<void>((res, rej) =>
          port.write(Buffer.from(bytes), (err: Error | null) => err ? rej(err) : res()))

        // Capture response bytes with 1 s timeout (mutex held — poll loop queued)
        const rxBytes = await new Promise<number[]>(resolve => {
          const collected: number[] = []
          let settleTimer: ReturnType<typeof setTimeout> | null = null
          const deadline = setTimeout(() => {
            if (settleTimer) clearTimeout(settleTimer)
            port.removeListener('data', onData)
            resolve(collected)
          }, 1000)
          const onData = (chunk: Buffer) => {
            collected.push(...Array.from(chunk as Buffer))
            // Reset settle timer — wait 40 ms after last chunk before resolving
            if (settleTimer) clearTimeout(settleTimer)
            settleTimer = setTimeout(() => {
              clearTimeout(deadline)
              port.removeListener('data', onData)
              resolve(collected)
            }, 40)
          }
          port.on('data', onData)
        })

        if (rxBytes.length > 0) {
          process.parentPort.postMessage({
            type: 'echo-response',
            payload: { connectionId: config!.id, bytes: rxBytes, timestamp: Date.now() }
          })
        }
      }
      process.parentPort.postMessage({ type: 'write-ok', payload: { address: 0 } })
    } catch (err) {
      const errMsg = errStr(err)
      process.parentPort.postMessage({ type: 'write-error', payload: { address: 0, error: errMsg } })
    } finally {
      release()
    }
  }

  if (msg.type === 'pause') {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  if (msg.type === 'resume') {
    if (!pollTimer && running) startPolling()
  }

  if (msg.type === 'stop') {
    running = false
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    postStatus('disconnecting')
    try { client.close() } catch { /* ignore */ }
    // Small delay lets the status message and close settle before process exits
    setTimeout(() => process.exit(0), 300)
  }
})

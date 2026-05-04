import { parentPort, workerData } from 'node:worker_threads'
import ModbusRTU from 'modbus-serial'
import type { ConnectionConfig, WorkerPollResult } from '../shared/types'

const config: ConnectionConfig = workerData as ConnectionConfig
const client = new ModbusRTU()
let pollTimer: ReturnType<typeof setInterval> | null = null
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
  setTimeout(connect, reconnectDelay)
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
            const r = await client.readWriteMultipleRegisters(group.startAddress, group.count, 0, [0])
            values = r.data
            break
          }
          default: values = []
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
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      try { await client.close() } catch { /* ignore */ }
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
      else if (fc === 6) await client.writeRegister(address, Number(value))
      else if (fc === 15) await client.writeCoils(address, value as boolean[])
      else if (fc === 16) await client.writeRegisters(address, value as number[])
      parentPort!.postMessage({ type: 'write-ok', payload: { address } })
    } catch (err) {
      parentPort!.postMessage({ type: 'write-error', payload: { address, error: String(err) } })
    }
  }
  if (msg.type === 'stop') {
    running = false
    if (pollTimer) clearInterval(pollTimer)
    try { await client.close() } catch { /* ignore */ }
    process.exit(0)
  }
})

connect()

import { dataTypeRegCount } from '../shared/types'
import type { RegisterConfig, RegisterValue, DataType, ByteOrder, AlertState, AlertConfig, ScalingMode } from '../shared/types'

export { dataTypeRegCount }

// Reorder two 16-bit registers according to byte order
function reorder2(hi: number, lo: number, order: ByteOrder): [number, number] {
  switch (order) {
    case 'ABCD': return [hi, lo]
    case 'CDAB': return [lo, hi]
    case 'BADC': return [((hi & 0xFF) << 8) | (hi >> 8), ((lo & 0xFF) << 8) | (lo >> 8)]
    case 'DCBA': {
      const swapHi = ((lo & 0xFF) << 8) | (lo >> 8)
      const swapLo = ((hi & 0xFF) << 8) | (hi >> 8)
      return [swapHi, swapLo]
    }
  }
}

// Reorder four 16-bit registers according to byte order
function reorder4(r: number[], order: ByteOrder): number[] {
  const [a, b, c, d] = [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 0]
  switch (order) {
    case 'ABCD': return [a, b, c, d]
    case 'CDAB': return [c, d, a, b]
    case 'BADC': return [
      ((a & 0xFF) << 8) | (a >> 8),
      ((b & 0xFF) << 8) | (b >> 8),
      ((c & 0xFF) << 8) | (c >> 8),
      ((d & 0xFF) << 8) | (d >> 8),
    ]
    case 'DCBA': return [
      ((d & 0xFF) << 8) | (d >> 8),
      ((c & 0xFF) << 8) | (c >> 8),
      ((b & 0xFF) << 8) | (b >> 8),
      ((a & 0xFF) << 8) | (a >> 8),
    ]
  }
}

function applyScale(value: number, mode: ScalingMode, scale: number, offset: number, x1: number, y1: number, x2: number, y2: number): number {
  if (mode === 'twoPoint' && x2 !== x1) {
    return y1 + (value - x1) * (y2 - y1) / (x2 - x1)
  }
  return value * scale + offset
}

export function decodeRegister(
  rawRegs: number[],
  regIndex: number,
  config: RegisterConfig
): number | string {
  const raw = rawRegs[regIndex] ?? 0
  const byteOrder: ByteOrder = config.byteOrder ?? 'ABCD'
  const scalingMode: ScalingMode = config.scalingMode ?? 'linear'

  const scale = (v: number) => applyScale(v, scalingMode, config.scale ?? 1, config.offset ?? 0, config.x1 ?? 0, config.y1 ?? 0, config.x2 ?? 1, config.y2 ?? 1)

  switch (config.dataType as DataType) {
    case 'uint16': {
      const decoded = scale(raw)
      const key = String(Math.round(decoded))
      if (config.valueNameMap?.[key]) return config.valueNameMap[key]
      return decoded
    }
    case 'int16': {
      const signed = raw > 0x7FFF ? raw - 0x10000 : raw
      const decoded = scale(signed)
      const key = String(Math.round(decoded))
      if (config.valueNameMap?.[key]) return config.valueNameMap[key]
      return decoded
    }
    case 'float32': {
      const [r0, r1] = reorder2(rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0, byteOrder)
      const buf = Buffer.alloc(4)
      buf.writeUInt16BE(r0, 0)
      buf.writeUInt16BE(r1, 2)
      return scale(buf.readFloatBE(0))
    }
    case 'uint32': {
      const [r0, r1] = reorder2(rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0, byteOrder)
      const u = (((r0 << 16) >>> 0) | r1)
      return scale(u)
    }
    case 'int32': {
      const [r0, r1] = reorder2(rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0, byteOrder)
      const u = ((r0 << 16) | r1) >>> 0
      const signed = u > 0x7FFFFFFF ? u - 0x100000000 : u
      return scale(signed)
    }
    case 'float64': {
      const ordered = reorder4([
        rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0,
        rawRegs[regIndex + 2] ?? 0, rawRegs[regIndex + 3] ?? 0,
      ], byteOrder)
      const buf = Buffer.alloc(8)
      for (let i = 0; i < 4; i++) buf.writeUInt16BE(ordered[i], i * 2)
      return scale(buf.readDoubleBE(0))
    }
    case 'uint64': {
      const ordered = reorder4([
        rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0,
        rawRegs[regIndex + 2] ?? 0, rawRegs[regIndex + 3] ?? 0,
      ], byteOrder)
      const buf = Buffer.alloc(8)
      for (let i = 0; i < 4; i++) buf.writeUInt16BE(ordered[i], i * 2)
      return Number(buf.readBigUInt64BE(0))
    }
    case 'int64': {
      const ordered = reorder4([
        rawRegs[regIndex] ?? 0, rawRegs[regIndex + 1] ?? 0,
        rawRegs[regIndex + 2] ?? 0, rawRegs[regIndex + 3] ?? 0,
      ], byteOrder)
      const buf = Buffer.alloc(8)
      for (let i = 0; i < 4; i++) buf.writeUInt16BE(ordered[i], i * 2)
      return Number(buf.readBigInt64BE(0))
    }
    case 'binary': {
      const bits = raw.toString(2).padStart(16, '0')
      if (config.bitNames && config.bitNames.some(n => n)) {
        return bits.split('').reverse().map((b, idx) => {
          const name = config.bitNames?.[idx]
          return name ? `${name}=${b}` : b
        }).reverse().join(' ')
      }
      return bits
    }
    case 'hex': return '0x' + raw.toString(16).toUpperCase().padStart(4, '0')
    case 'ascii': return String.fromCharCode((raw >> 8) & 0xFF, raw & 0xFF)
    default: return raw
  }
}

function evalAlertState(decoded: number | string, alert: AlertConfig): AlertState {
  if (!alert.enabled || typeof decoded !== 'number') return 'ok'
  if (alert.lowLimit !== null && decoded < alert.lowLimit) return 'low'
  if (alert.highLimit !== null && decoded > alert.highLimit) return 'high'
  return 'ok'
}

export function transformPollResult(
  rawValues: number[],
  registers: RegisterConfig[],
  timestamp: number
): RegisterValue[] {
  const results: RegisterValue[] = []
  let regIdx = 0
  for (const reg of registers) {
    const decoded = decodeRegister(rawValues, regIdx, reg)
    const alertState = evalAlertState(decoded, reg.alert)
    results.push({ raw: rawValues[regIdx] ?? 0, decoded, timestamp, alertState })
    regIdx += dataTypeRegCount(reg.dataType)
  }
  return results
}

import type { RegisterConfig, RegisterValue, DataType, AlertState } from '../shared/types'

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
      return (((hi << 16) >>> 0) | lo) * config.scale + config.offset
    }
    case 'int32': {
      const hi = rawRegs[regIndex] ?? 0
      const lo = rawRegs[regIndex + 1] ?? 0
      const u = ((hi << 16) | lo) >>> 0
      const signed = u > 0x7FFFFFFF ? u - 0x100000000 : u
      return signed * config.scale + config.offset
    }
    case 'binary': return raw.toString(2).padStart(16, '0')
    case 'hex': return '0x' + raw.toString(16).toUpperCase().padStart(4, '0')
    case 'ascii': return String.fromCharCode((raw >> 8) & 0xFF, raw & 0xFF)
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
      alertState: 'ok' as AlertState
    }
  })
}

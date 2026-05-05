import React, { useState } from 'react'
import { modbusRef } from './RegisterRow'
import type { ConnectionConfig, ReadFC } from '../../shared/types'

interface Props { connection: ConnectionConfig }

type WriteFc = 5 | 6 | 15 | 16

const FC_CONFIGS: { fc: WriteFc; label: string; desc: string }[] = [
  { fc: 5,  label: 'FC05', desc: 'Write Single Coil' },
  { fc: 6,  label: 'FC06', desc: 'Write Single Register' },
  { fc: 15, label: 'FC15', desc: 'Write Multiple Coils' },
  { fc: 16, label: 'FC16', desc: 'Write Multiple Registers' },
]

function crc16(buf: number[]): [number, number] {
  let crc = 0xFFFF
  for (const b of buf) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1
  }
  return [crc & 0xFF, (crc >> 8) & 0xFF]
}

function hex2(n: number) { return n.toString(16).toUpperCase().padStart(2, '0') }

interface FramePreview { bytes: number[]; hex: string; description: string }

function buildPreview(
  connection: ConnectionConfig,
  fc: WriteFc,
  addr: number,
  singleVal: string,
  coilVals: boolean[],
  multiVals: string[],
  countVals: number
): FramePreview {
  const slaveId = connection.slaveId ?? connection.unitId ?? 1
  let body: number[]
  let description: string

  if (fc === 5) {
    const isOn = singleVal === '1' || singleVal.toLowerCase() === 'on' || singleVal.toLowerCase() === 'true'
    const coilWord = isOn ? 0xFF00 : 0x0000
    body = [slaveId, 0x05, (addr >> 8) & 0xFF, addr & 0xFF, (coilWord >> 8) & 0xFF, coilWord & 0xFF]
    description = `Slave ${slaveId}  FC05  addr ${addr}  value ${isOn ? '0xFF00 (ON)' : '0x0000 (OFF)'}`
  } else if (fc === 6) {
    const v = singleVal.startsWith('0x') ? parseInt(singleVal, 16) : (parseInt(singleVal) || 0)
    const vClamped = v & 0xFFFF
    body = [slaveId, 0x06, (addr >> 8) & 0xFF, addr & 0xFF, (vClamped >> 8) & 0xFF, vClamped & 0xFF]
    description = `Slave ${slaveId}  FC06  addr ${addr}  value ${v} (0x${vClamped.toString(16).toUpperCase().padStart(4,'0')})`
  } else if (fc === 15) {
    const vals = coilVals.slice(0, countVals)
    const byteCount = Math.ceil(vals.length / 8)
    const coilBytes: number[] = []
    for (let i = 0; i < byteCount; i++) {
      let b = 0
      for (let bit = 0; bit < 8 && i * 8 + bit < vals.length; bit++) {
        if (vals[i * 8 + bit]) b |= (1 << bit)
      }
      coilBytes.push(b)
    }
    body = [slaveId, 0x0F, (addr >> 8) & 0xFF, addr & 0xFF, (vals.length >> 8) & 0xFF, vals.length & 0xFF, byteCount, ...coilBytes]
    description = `Slave ${slaveId}  FC15  addr ${addr}  ${vals.length} coils  ${vals.map(v => v ? '1' : '0').join('')}`
  } else {
    const vals = multiVals.slice(0, countVals).map(v => (v.startsWith('0x') ? parseInt(v, 16) : parseInt(v) || 0) & 0xFFFF)
    const data: number[] = []
    for (const v of vals) { data.push((v >> 8) & 0xFF, v & 0xFF) }
    body = [slaveId, 0x10, (addr >> 8) & 0xFF, addr & 0xFF, (vals.length >> 8) & 0xFF, vals.length & 0xFF, data.length, ...data]
    description = `Slave ${slaveId}  FC16  addr ${addr}  ${vals.length} regs  [${vals.join(', ')}]`
  }

  let bytes: number[]
  if (connection.protocol === 'tcp') {
    // TCP: MBAP [txnHi, txnLo, 0,0, lenHi, lenLo, unitId] + PDU
    const pdu = body.slice(1)
    const pduLen = pdu.length + 1
    bytes = [0x00, 0x01, 0x00, 0x00, (pduLen >> 8) & 0xFF, pduLen & 0xFF, slaveId, ...pdu]
  } else {
    const [lo, hi] = crc16(body)
    bytes = [...body, lo, hi]
  }

  return { bytes, hex: bytes.map(hex2).join(' '), description }
}

function parseAddr(raw: string, fc: WriteFc): number {
  const n = parseInt(raw.replace(/^0x/i, ''), raw.startsWith('0x') || raw.startsWith('0X') ? 16 : 10)
  if (isNaN(n)) return 0
  if ((fc === 5 || fc === 15) && n >= 1 && n <= 9999) return n - 1
  if ((fc === 6 || fc === 16) && n >= 40001 && n <= 49999) return n - 40001
  return Math.max(0, n)
}

function modbusRefWrite(fc: WriteFc, addr: number): string {
  const readFc: ReadFC = fc === 5 || fc === 15 ? 1 : 3
  return modbusRef(readFc, addr)
}

const inp: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '6px 10px', color: 'var(--text)', fontSize: 12, outline: 'none',
  boxSizing: 'border-box' as const
}

export default function WritePanel({ connection }: Props): React.JSX.Element {
  const [fc, setFc] = useState<WriteFc>(6)
  const [addrRaw, setAddrRaw] = useState('40001')
  const [singleVal, setSingleVal] = useState('0')
  const [multiCount, setMultiCount] = useState(4)
  const [multiVals, setMultiVals] = useState<string[]>(Array(8).fill('0'))
  const [coilVals, setCoilVals] = useState<boolean[]>(Array(8).fill(false))
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const protocolAddr = parseAddr(addrRaw, fc)
  const refLabel = modbusRefWrite(fc, protocolAddr)
  const countVals = Math.max(1, Math.min(multiCount, 125))

  const preview = buildPreview(connection, fc, protocolAddr, singleVal, coilVals, multiVals, countVals)

  const setCount = (n: number) => {
    const c = Math.max(1, Math.min(125, n))
    setMultiCount(c)
    setMultiVals(v => Array(c).fill(0).map((_, i) => v[i] ?? '0'))
    setCoilVals(v => Array(c).fill(false).map((_, i) => v[i] ?? false))
  }

  const sendWrite = async () => {
    setMsg(null)
    try {
      if (fc === 5) {
        const v = singleVal === '1' || singleVal.toLowerCase() === 'true' || singleVal.toLowerCase() === 'on'
        await window.api.writeRegister(connection.id, 5, protocolAddr, v ? 1 : 0)
      } else if (fc === 6) {
        const v = singleVal.startsWith('0x') ? parseInt(singleVal, 16) : Number(singleVal)
        await window.api.writeRegister(connection.id, 6, protocolAddr, v)
      } else if (fc === 15) {
        const vals = coilVals.slice(0, countVals).map(b => b ? 1 : 0)
        await window.api.writeRegister(connection.id, 15, protocolAddr, vals)
      } else {
        const vals = multiVals.slice(0, countVals).map(v => v.startsWith('0x') ? parseInt(v, 16) : Number(v))
        await window.api.writeRegister(connection.id, 16, protocolAddr, vals)
      }
      setMsg({ text: `Sent — check COMM LOG for response`, ok: true })
    } catch (e) {
      setMsg({ text: `Error: ${e}`, ok: false })
    }
  }

  const isCoil = fc === 5 || fc === 15
  const isMulti = fc === 15 || fc === 16

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Quick-fill from known writable groups */}
      {connection.registerGroups.filter(g => g.functionCode === 1 || g.functionCode === 3).length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Quick Fill from Register Groups
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {connection.registerGroups
              .filter(g => g.functionCode === 1 || g.functionCode === 3)
              .flatMap(g => g.registers.map(r => ({
                label: r.label || modbusRef(g.functionCode, r.address),
                fc: g.functionCode === 1 ? 5 as WriteFc : 6 as WriteFc,
                ref: modbusRef(g.functionCode, r.address)
              })))
              .map((item, i) => (
                <button key={i} onClick={() => { setFc(item.fc); setAddrRaw(item.ref); setSingleVal('0') }}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--primary)', fontFamily: 'ui-monospace, monospace' }}>
                  {item.label} ({item.ref})
                </button>
              ))
            }
          </div>
        </div>
      )}

      {/* Function code selector */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Function Code</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {FC_CONFIGS.map(cfg => (
            <button key={cfg.fc} onClick={() => { setFc(cfg.fc); setMsg(null) }}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 6, cursor: 'pointer',
                background: fc === cfg.fc ? 'var(--primary)' : 'var(--surface-2)',
                border: `1px solid ${fc === cfg.fc ? 'var(--primary)' : 'var(--border)'}`,
                color: fc === cfg.fc ? '#fff' : 'var(--text-muted)',
                fontWeight: fc === cfg.fc ? 700 : 400, textAlign: 'center' as const
              }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{cfg.label}</div>
              <div style={{ fontSize: 9, marginTop: 2, opacity: 0.85 }}>{cfg.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Address */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
          {isCoil ? 'Coil Address (e.g. 00001)' : 'Register Address (e.g. 40001)'}
        </label>
        <input value={addrRaw} onChange={e => setAddrRaw(e.target.value)} placeholder={isCoil ? '00001' : '40001'} style={{ ...inp, width: '100%' }} />
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          Protocol addr {protocolAddr} (0x{protocolAddr.toString(16).toUpperCase().padStart(4,'0')}) · Modbus ref {refLabel}
        </div>
      </div>

      {/* Multi count */}
      {isMulti && (
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
            {isCoil ? 'Coil Count' : 'Register Count'}
          </label>
          <input type="number" value={multiCount} onChange={e => setCount(Number(e.target.value))} min={1} max={125} style={{ ...inp, width: 100 }} />
        </div>
      )}

      {/* Value inputs */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
          {isMulti ? 'Values' : 'Value'}
        </label>

        {fc === 5 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {['0 — OFF', '1 — ON'].map(v => (
              <button key={v} onClick={() => setSingleVal(v[0])}
                style={{ flex: 1, padding: '10px', borderRadius: 6, cursor: 'pointer', background: singleVal === v[0] ? 'var(--primary)' : 'var(--surface-2)', border: `1px solid ${singleVal === v[0] ? 'var(--primary)' : 'var(--border)'}`, color: singleVal === v[0] ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13 }}>
                {v}
              </button>
            ))}
          </div>
        )}

        {fc === 6 && (
          <input value={singleVal} onChange={e => setSingleVal(e.target.value)} placeholder="decimal or 0x…"
            style={{ ...inp, width: '100%' }} onKeyDown={e => { if (e.key === 'Enter') sendWrite() }} />
        )}

        {fc === 15 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {coilVals.slice(0, countVals).map((v, i) => (
              <button key={i} onClick={() => setCoilVals(prev => prev.map((b, j) => j === i ? !b : b))}
                title={`Coil ${modbusRefWrite(15, protocolAddr + i)}`}
                style={{ minWidth: 52, padding: '6px 8px', borderRadius: 5, cursor: 'pointer', background: v ? 'var(--success)' : 'var(--surface-2)', border: `1px solid ${v ? 'var(--success)' : 'var(--border)'}`, color: v ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 11, textAlign: 'center' as const }}>
                <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 2 }}>{modbusRefWrite(15, protocolAddr + i)}</div>
                {v ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        )}

        {fc === 16 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {multiVals.slice(0, countVals).map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'ui-monospace, monospace', minWidth: 54 }}>
                  {modbusRefWrite(16, protocolAddr + i)}
                </span>
                <input value={v} onChange={e => setMultiVals(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  placeholder="dec or 0x…" style={{ ...inp, flex: 1 }}
                  onKeyDown={e => { if (e.key === 'Enter') sendWrite() }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Frame preview */}
      <div style={{
        padding: '10px 12px', borderRadius: 7,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 5
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
          <span>Frame Preview ({connection.protocol.toUpperCase()})</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{preview.bytes.length} bytes</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{preview.description}</div>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: 'var(--primary)', letterSpacing: 1, wordBreak: 'break-all' as const }}>
          {preview.bytes.map((b, i) => {
            // Highlight: byte 0 = slave id, byte 1 = FC, last 2 (RTU) = CRC
            const isSlaveId = connection.protocol !== 'tcp' ? i === 0 : i === 6
            const isFc = connection.protocol !== 'tcp' ? i === 1 : i === 7
            const isCrc = connection.protocol !== 'tcp' && i >= preview.bytes.length - 2
            const col = isSlaveId ? 'var(--warning)' : isFc ? 'var(--success)' : isCrc ? 'var(--text-muted)' : 'var(--primary)'
            return (
              <span key={i} style={{ color: col }} title={isSlaveId ? 'Slave ID' : isFc ? 'Function Code' : isCrc ? 'CRC' : `Byte ${i}`}>
                {hex2(b)}{i < preview.bytes.length - 1 ? ' ' : ''}
              </span>
            )
          })}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
          <span><span style={{ color: 'var(--warning)' }}>■</span> Slave ID</span>
          <span><span style={{ color: 'var(--success)' }}>■</span> FC</span>
          <span><span style={{ color: 'var(--primary)' }}>■</span> Data</span>
          {connection.protocol !== 'tcp' && <span><span style={{ color: 'var(--text-muted)' }}>■</span> CRC</span>}
        </div>
      </div>

      {/* Send button */}
      <button onClick={sendWrite}
        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '11px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
        Send — {FC_CONFIGS.find(c => c.fc === fc)?.label} to {refLabel}
      </button>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: msg.ok ? 'var(--success)' : 'var(--danger)', fontFamily: 'ui-monospace, monospace' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

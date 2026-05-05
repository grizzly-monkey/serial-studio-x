import React, { useState, useMemo, useCallback } from 'react'
import { modbusRef } from './RegisterRow'
import type { ConnectionConfig, ReadFC } from '../../shared/types'

interface Props { connection: ConnectionConfig }

type WriteFc = 5 | 6 | 15 | 16
type PanelMode = 'builder' | 'raw'

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

interface ByteSegment { bytes: number[]; label: string; color: string }

function buildSegments(
  connection: ConnectionConfig,
  fc: WriteFc,
  addr: number,
  singleVal: string,
  coilVals: boolean[],
  multiVals: string[],
  countVals: number
): { segments: ByteSegment[]; description: string } {
  const slaveId = connection.slaveId ?? connection.unitId ?? 1
  let pduBody: number[]
  let description: string

  if (fc === 5) {
    const isOn = singleVal === '1' || singleVal.toLowerCase() === 'on' || singleVal.toLowerCase() === 'true'
    const coilWord = isOn ? 0xFF00 : 0x0000
    pduBody = [0x05, (addr >> 8) & 0xFF, addr & 0xFF, (coilWord >> 8) & 0xFF, coilWord & 0xFF]
    description = `Slave ${slaveId}  FC05  addr ${addr}  ${isOn ? 'ON (0xFF00)' : 'OFF (0x0000)'}`
  } else if (fc === 6) {
    const v = singleVal.startsWith('0x') ? parseInt(singleVal, 16) : (parseInt(singleVal) || 0)
    const vClamped = v & 0xFFFF
    pduBody = [0x06, (addr >> 8) & 0xFF, addr & 0xFF, (vClamped >> 8) & 0xFF, vClamped & 0xFF]
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
    pduBody = [0x0F, (addr >> 8) & 0xFF, addr & 0xFF, (vals.length >> 8) & 0xFF, vals.length & 0xFF, byteCount, ...coilBytes]
    description = `Slave ${slaveId}  FC15  ${vals.length} coils @ addr ${addr}  ${vals.map(v => v ? '1' : '0').join('')}`
  } else {
    const vals = multiVals.slice(0, countVals).map(v => (v.startsWith('0x') ? parseInt(v, 16) : parseInt(v) || 0) & 0xFFFF)
    const data: number[] = []
    for (const v of vals) { data.push((v >> 8) & 0xFF, v & 0xFF) }
    pduBody = [0x10, (addr >> 8) & 0xFF, addr & 0xFF, (vals.length >> 8) & 0xFF, vals.length & 0xFF, data.length, ...data]
    description = `Slave ${slaveId}  FC16  ${vals.length} regs @ addr ${addr}  [${vals.join(', ')}]`
  }

  if (connection.protocol === 'tcp') {
    const pduLen = pduBody.length + 1
    return {
      segments: [
        { bytes: [0x00, 0x01], label: 'Txn ID', color: 'var(--text-muted)' },
        { bytes: [0x00, 0x00], label: 'Proto', color: 'var(--text-muted)' },
        { bytes: [(pduLen >> 8) & 0xFF, pduLen & 0xFF], label: 'Length', color: 'var(--success)' },
        { bytes: [slaveId], label: 'Unit ID', color: 'var(--warning)' },
        { bytes: pduBody.slice(0, 1), label: 'FC', color: 'var(--primary)' },
        { bytes: pduBody.slice(1, 3), label: 'Addr', color: '#38bdf8' },
        { bytes: pduBody.slice(3), label: 'Data', color: 'var(--text)' },
      ],
      description
    }
  } else {
    const body = [slaveId, ...pduBody]
    const [lo, hi] = crc16(body)
    return {
      segments: [
        { bytes: [slaveId], label: 'Slave', color: 'var(--warning)' },
        { bytes: pduBody.slice(0, 1), label: 'FC', color: 'var(--primary)' },
        { bytes: pduBody.slice(1, 3), label: 'Addr', color: '#38bdf8' },
        { bytes: pduBody.slice(3), label: 'Data', color: 'var(--text)' },
        { bytes: [lo, hi], label: 'CRC', color: 'var(--text-muted)' },
      ],
      description
    }
  }
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

function parseHexInput(raw: string): { bytes: number[]; error: string | null } {
  const clean = raw.replace(/\s+/g, ' ').trim()
  if (!clean) return { bytes: [], error: null }
  const tokens = clean.split(/[\s,]+/).filter(Boolean)
  const bytes: number[] = []
  for (const tok of tokens) {
    const v = parseInt(tok.replace(/^0x/i, ''), 16)
    if (isNaN(v) || v < 0 || v > 255) return { bytes: [], error: `Invalid byte: "${tok}"` }
    bytes.push(v)
  }
  return { bytes, error: null }
}

const inp: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '6px 10px', color: 'var(--text)', fontSize: 12, outline: 'none',
  boxSizing: 'border-box' as const
}

// ── Frame visualiser shared by both modes ────────────────────────────────────
function FrameVisualiser({ segments, protocol, totalBytes }: {
  segments: ByteSegment[]
  protocol: string
  totalBytes: number
}) {
  const [copied, setCopied] = useState(false)
  const allBytes = segments.flatMap(s => s.bytes)
  const hexStr = allBytes.map(b => `0x${hex2(b)}`).join(' ')

  const copyFrame = useCallback(() => {
    navigator.clipboard.writeText(hexStr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [hexStr])

  return (
    <div style={{ padding: '10px 12px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Frame · {protocol.toUpperCase()}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 400 }}>{totalBytes} bytes</span>
          <button
            onClick={copyFrame}
            title="Copy as 0x hex"
            style={{ background: copied ? 'var(--success)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 9, color: copied ? '#fff' : 'var(--text-muted)', fontWeight: 700 }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Byte tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {segments.map((seg, si) =>
          seg.bytes.map((b, bi) => (
            <div key={`${si}-${bi}`} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'var(--surface)', border: `1px solid ${seg.color}44`,
              borderRadius: 4, padding: '3px 5px', minWidth: 32,
            }}>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: seg.color, letterSpacing: 0.5 }}>
                {hex2(b)}
              </span>
              {bi === 0 && (
                <span style={{ fontSize: 8, color: seg.color, opacity: 0.75, marginTop: 1, letterSpacing: 0.3, textTransform: 'uppercase' }}>
                  {seg.label}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Raw hex preview */}
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5, marginBottom: 6, wordBreak: 'break-all' }}>
        {allBytes.map((b, i) => (
          <span key={i} style={{ marginRight: 4 }}>
            <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>0x</span>{hex2(b)}
          </span>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 9, color: 'var(--text-muted)' }}>
        {segments.map((seg, i) => (
          <span key={i}><span style={{ color: seg.color }}>■</span> {seg.label}</span>
        ))}
      </div>
    </div>
  )
}

// ── Raw-hex panel ─────────────────────────────────────────────────────────────
function RawHexPanel({ connection }: { connection: ConnectionConfig }) {
  const [hexInput, setHexInput] = useState('')
  const [appendCrc, setAppendCrc] = useState(true)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const parsed = useMemo(() => parseHexInput(hexInput), [hexInput])

  const finalBytes = useMemo(() => {
    if (parsed.error || parsed.bytes.length === 0) return parsed.bytes
    if (appendCrc && connection.protocol !== 'tcp') {
      const [lo, hi] = crc16(parsed.bytes)
      return [...parsed.bytes, lo, hi]
    }
    return parsed.bytes
  }, [parsed, appendCrc, connection.protocol])

  const rawSegments: ByteSegment[] = useMemo(() => {
    if (finalBytes.length === 0) return []
    const isRtu = connection.protocol !== 'tcp'
    const segs: ByteSegment[] = []
    if (isRtu && finalBytes.length >= 1)
      segs.push({ bytes: [finalBytes[0]], label: 'Slave', color: 'var(--warning)' })
    if (finalBytes.length >= 2)
      segs.push({ bytes: [finalBytes[isRtu ? 1 : 0]], label: 'FC', color: 'var(--primary)' })
    const dataStart = isRtu ? 2 : 1
    const dataEnd = isRtu && appendCrc ? finalBytes.length - 2 : finalBytes.length
    if (dataEnd > dataStart)
      segs.push({ bytes: finalBytes.slice(dataStart, dataEnd), label: 'Data', color: 'var(--text)' })
    if (isRtu && appendCrc && finalBytes.length >= 2)
      segs.push({ bytes: finalBytes.slice(-2), label: 'CRC', color: 'var(--text-muted)' })
    return segs
  }, [finalBytes, connection.protocol, appendCrc])

  const sendFrame = async () => {
    if (finalBytes.length === 0 || parsed.error) return
    setMsg(null)
    try {
      await window.api.sendRawFrame(connection.id, finalBytes)
      setMsg({ text: `Sent ${finalBytes.length} bytes`, ok: true })
    } catch (e) {
      setMsg({ text: `Error: ${e}`, ok: false })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
          Hex Bytes (space, comma, or 0x-prefixed)
        </label>
        <textarea
          value={hexInput}
          onChange={e => { setHexInput(e.target.value); setMsg(null) }}
          placeholder={'01 03 00 00 00 0A\nor: 0x01,0x03,0x00,0x00,0x00,0x0A'}
          rows={4}
          style={{
            ...inp, width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono, monospace)',
            fontSize: 13, lineHeight: 1.6, letterSpacing: 0.5
          }}
        />
        {parsed.error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{parsed.error}</div>
        )}
        {/* Live 0x-prefixed preview below the textarea */}
        {!parsed.error && parsed.bytes.length > 0 && (
          <div style={{ marginTop: 5, fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.5, wordBreak: 'break-all', lineHeight: 1.7 }}>
            {parsed.bytes.map((b, i) => (
              <span key={i} style={{ marginRight: 5 }}>
                <span style={{ opacity: 0.45 }}>0x</span>{hex2(b)}
              </span>
            ))}
            <span style={{ opacity: 0.5 }}> · {parsed.bytes.length}B</span>
          </div>
        )}
      </div>

      {connection.protocol !== 'tcp' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={appendCrc} onChange={e => setAppendCrc(e.target.checked)} />
          Auto-append CRC-16 (Modbus)
        </label>
      )}

      {finalBytes.length > 0 && !parsed.error && rawSegments.length > 0 && (
        <FrameVisualiser segments={rawSegments} protocol={connection.protocol} totalBytes={finalBytes.length} />
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={sendFrame}
          disabled={finalBytes.length === 0 || !!parsed.error}
          style={{
            flex: 1, background: finalBytes.length > 0 && !parsed.error ? 'var(--primary)' : 'var(--surface-2)',
            color: finalBytes.length > 0 && !parsed.error ? '#fff' : 'var(--text-muted)',
            border: 'none', borderRadius: 7, padding: '11px', cursor: finalBytes.length > 0 && !parsed.error ? 'pointer' : 'default',
            fontWeight: 700, fontSize: 14
          }}>
          Send {finalBytes.length > 0 ? `(${finalBytes.length} bytes)` : ''}
        </button>
        <button onClick={() => { setHexInput(''); setMsg(null) }}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '11px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
          Clear
        </button>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono, monospace)', background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

// ── Builder panel ─────────────────────────────────────────────────────────────
function BuilderPanel({ connection }: { connection: ConnectionConfig }) {
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

  const { segments, description } = useMemo(
    () => buildSegments(connection, fc, protocolAddr, singleVal, coilVals, multiVals, countVals),
    [connection, fc, protocolAddr, singleVal, coilVals, multiVals, countVals]
  )

  const totalBytes = segments.reduce((s, seg) => s + seg.bytes.length, 0)

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
        await window.api.writeRegister(connection.id, 15, protocolAddr, coilVals.slice(0, countVals).map(b => b ? 1 : 0))
      } else {
        await window.api.writeRegister(connection.id, 16, protocolAddr, multiVals.slice(0, countVals).map(v => v.startsWith('0x') ? parseInt(v, 16) : Number(v)))
      }
      setMsg({ text: 'Sent — check COMM LOG for response', ok: true })
    } catch (e) {
      setMsg({ text: `Error: ${e}`, ok: false })
    }
  }

  const isCoil = fc === 5 || fc === 15
  const isMulti = fc === 15 || fc === 16

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Quick fill */}
      {connection.registerGroups.filter(g => g.functionCode === 1 || g.functionCode === 3).length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Quick Fill</div>
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
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {item.label}
                </button>
              ))
            }
          </div>
        </div>
      )}

      {/* FC selector */}
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
          {isCoil ? 'Coil Address' : 'Register Address'} (e.g. {isCoil ? '00001' : '40001'})
        </label>
        <input value={addrRaw} onChange={e => setAddrRaw(e.target.value)} style={{ ...inp, width: '100%' }} />
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          Protocol addr {protocolAddr} (0x{protocolAddr.toString(16).toUpperCase().padStart(4,'0')}) · ref {refLabel}
        </div>
      </div>

      {isMulti && (
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>
            {isCoil ? 'Coil Count' : 'Register Count'}
          </label>
          <input type="number" value={multiCount} onChange={e => setCount(Number(e.target.value))} min={1} max={125} style={{ ...inp, width: 100 }} />
        </div>
      )}

      {/* Values */}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {coilVals.slice(0, countVals).map((v, i) => (
              <button key={i} onClick={() => setCoilVals(prev => prev.map((b, j) => j === i ? !b : b))}
                title={`Coil ${modbusRefWrite(15, protocolAddr + i)}`}
                style={{ minWidth: 48, padding: '5px 6px', borderRadius: 5, cursor: 'pointer', background: v ? 'var(--success)' : 'var(--surface-2)', border: `1px solid ${v ? 'var(--success)' : 'var(--border)'}`, color: v ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 11, textAlign: 'center' as const }}>
                <div style={{ fontSize: 8, opacity: 0.7, marginBottom: 2 }}>{modbusRefWrite(15, protocolAddr + i)}</div>
                {v ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        )}
        {fc === 16 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {multiVals.slice(0, countVals).map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--font-mono, monospace)', minWidth: 54 }}>
                  {modbusRefWrite(16, protocolAddr + i)}
                </span>
                <input value={v} onChange={e => setMultiVals(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  placeholder="dec or 0x…" style={{ ...inp, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') sendWrite() }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live frame visualiser */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Live Frame Preview</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-mono, monospace)' }}>{description}</div>
        <FrameVisualiser segments={segments} protocol={connection.protocol} totalBytes={totalBytes} />
      </div>

      <button onClick={sendWrite}
        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 7, padding: '11px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
        Send — {FC_CONFIGS.find(c => c.fc === fc)?.label} to {refLabel}
      </button>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono, monospace)', background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────
export default function WritePanel({ connection }: Props): React.JSX.Element {
  const [mode, setMode] = useState<PanelMode>('builder')

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {([['builder', 'Frame Builder'], ['raw', 'Raw Hex']] as [PanelMode, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)}
            style={{
              flex: 1, padding: '9px 0', background: mode === id ? 'var(--primary-light)' : 'none',
              border: 'none', borderBottom: `2px solid ${mode === id ? 'var(--primary)' : 'transparent'}`,
              color: mode === id ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12, fontWeight: mode === id ? 700 : 400,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {mode === 'builder'
          ? <BuilderPanel connection={connection} />
          : <RawHexPanel connection={connection} />
        }
      </div>
    </div>
  )
}

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { ConnectionConfig, ConnectionStatus } from '../../shared/types'

interface Props { connection: ConnectionConfig }

type DisplayMode = 'ascii' | 'hex' | 'mixed'
type LineEnding = 'none' | 'cr' | 'lf' | 'crlf'
type MbFc = 1 | 2 | 3 | 4 | 5 | 6 | 15 | 16

interface TermLine {
  id: number
  timestamp: number
  direction: 'rx' | 'tx'
  bytes: number[]
  label?: string  // e.g. "Modbus FC03"
}

interface HistoryEntry {
  cmd: string
  isHex: boolean
  timestamp: number
}

const MAX_LINES = 2000
const MAX_HISTORY = 50

// ── Helpers ───────────────────────────────────────────────────────────────────
function bytesToAscii(bytes: number[]): string {
  return bytes.map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '·').join('')
}

function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

function HexDump({ bytes }: { bytes: number[] }): React.JSX.Element {
  const COLS = 16
  if (bytes.length <= COLS) {
    return (
      <span style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em' }}>
        {bytesToHex(bytes)}
      </span>
    )
  }
  const rows: number[][] = []
  for (let i = 0; i < bytes.length; i += COLS) rows.push(bytes.slice(i, i + COLS))
  return (
    <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, lineHeight: 1.6 }}>
      <tbody>
        {rows.map((row, ri) => {
          const offset = ri * COLS
          const hexCells = row.map((b, ci) => (
            <td key={ci} style={{ padding: '0 3px 0 0', color: 'var(--text)', userSelect: 'text' }}>
              {b.toString(16).toUpperCase().padStart(2, '0')}
            </td>
          ))
          const padCells = Array.from({ length: COLS - row.length }, (_, i) => (
            <td key={`p${i}`} style={{ padding: '0 3px 0 0', color: 'transparent' }}>00</td>
          ))
          const ascii = row.map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '·').join('')
          return (
            <tr key={ri}>
              <td style={{ color: 'var(--text-muted)', paddingRight: 12, whiteSpace: 'nowrap' }}>
                {offset.toString(16).toUpperCase().padStart(4, '0')}
              </td>
              {hexCells}
              {padCells}
              <td style={{ paddingLeft: 8, color: 'var(--text-muted)', whiteSpace: 'pre' }}>{ascii}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function parseHexInput(s: string): number[] | null {
  const tokens = s.trim().split(/[\s,]+/).filter(Boolean)
  const bytes: number[] = []
  for (const tok of tokens) {
    const v = parseInt(tok.replace(/^0x/i, ''), 16)
    if (isNaN(v) || v < 0 || v > 255) return null
    bytes.push(v)
  }
  return bytes.length > 0 ? bytes : null
}

function crc16(buf: number[]): [number, number] {
  let crc = 0xFFFF
  for (const b of buf) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1
  }
  return [crc & 0xFF, (crc >> 8) & 0xFF]
}

function hex2(n: number) { return n.toString(16).toUpperCase().padStart(2, '0') }

function buildModbusRTUFrame(slave: number, fc: MbFc, addr: number, count: number, value: number): number[] {
  let body: number[]
  if (fc === 1 || fc === 2 || fc === 3 || fc === 4) {
    body = [slave & 0xFF, fc, (addr >> 8) & 0xFF, addr & 0xFF, (count >> 8) & 0xFF, count & 0xFF]
  } else if (fc === 5) {
    const v = value ? 0xFF00 : 0x0000
    body = [slave & 0xFF, 5, (addr >> 8) & 0xFF, addr & 0xFF, (v >> 8) & 0xFF, v & 0xFF]
  } else if (fc === 6) {
    const v = value & 0xFFFF
    body = [slave & 0xFF, 6, (addr >> 8) & 0xFF, addr & 0xFF, (v >> 8) & 0xFF, v & 0xFF]
  } else if (fc === 15) {
    const byteCount = Math.ceil(count / 8)
    const coilBytes = Array.from({ length: byteCount }, (_, i) => {
      let b = 0
      for (let bit = 0; bit < 8 && i * 8 + bit < count; bit++) if (value) b |= (1 << bit)
      return b
    })
    body = [slave & 0xFF, 15, (addr >> 8) & 0xFF, addr & 0xFF, (count >> 8) & 0xFF, count & 0xFF, byteCount, ...coilBytes]
  } else {
    const data: number[] = []
    for (let i = 0; i < count; i++) { const v = value & 0xFFFF; data.push((v >> 8) & 0xFF, v & 0xFF) }
    body = [slave & 0xFF, 16, (addr >> 8) & 0xFF, addr & 0xFF, (count >> 8) & 0xFF, count & 0xFF, data.length, ...data]
  }
  const [lo, hi] = crc16(body)
  return [...body, lo, hi]
}

const LINE_ENDINGS: Record<LineEnding, number[]> = {
  none: [], cr: [0x0d], lf: [0x0a], crlf: [0x0d, 0x0a],
}

const MB_FC_LABELS: Record<MbFc, string> = {
  1: 'FC01 Read Coils', 2: 'FC02 Read D.Inputs', 3: 'FC03 Read Hold.Regs',
  4: 'FC04 Read Inp.Regs', 5: 'FC05 Write Coil', 6: 'FC06 Write Reg',
  15: 'FC15 Write Coils', 16: 'FC16 Write Regs',
}

let lineIdCounter = 0

// ── Main component ────────────────────────────────────────────────────────────
export default function SerialTerminalPanel({ connection }: Props): React.JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<TermLine[]>([])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('ascii')
  // Default line ending to CRLF on Windows, LF everywhere else
  const [lineEnding, setLineEnding] = useState<LineEnding>(
    () => (window.api.getPlatform() === 'win32' ? 'crlf' : 'lf')
  )
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [hexInput, setHexInput] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Modbus builder mode
  const [modbusMode, setModbusMode] = useState(false)
  const [mbSlave, setMbSlave] = useState(1)
  const [mbFc, setMbFc] = useState<MbFc>(3)
  const [mbAddr, setMbAddr] = useState(0)
  const [mbCount, setMbCount] = useState(10)
  const [mbValue, setMbValue] = useState(0)

  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Subscribe to terminal data and status
  useEffect(() => {
    const unsubData = window.api.onTerminalData(({ connectionId, bytes }) => {
      if (connectionId !== connection.id) return
      setLines(prev => {
        const next = [...prev, { id: lineIdCounter++, timestamp: Date.now(), direction: 'rx' as const, bytes }]
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
      })
    })
    const unsubStatus = window.api.onTerminalStatus(({ connectionId, status: s, error: e }) => {
      if (connectionId !== connection.id) return
      setStatus(s as ConnectionStatus)
      setError(e ?? null)
    })
    setStatus('connecting')
    setError(null)
    window.api.connectConnection(connection).catch(e => {
      const msg = String(e).replace(/^Error invoking remote method '[^']+': /, '')
      setError(msg)
      setStatus('error')
    })
    return () => { unsubData(); unsubStatus() }
  }, [connection.id])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const pushHistory = useCallback((cmd: string, isHex: boolean) => {
    if (!cmd.trim()) return
    setHistory(prev => {
      // deduplicate consecutive identical entries
      if (prev.length > 0 && prev[0].cmd === cmd && prev[0].isHex === isHex) return prev
      const next = [{ cmd, isHex, timestamp: Date.now() }, ...prev]
      return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next
    })
  }, [])

  const doSend = useCallback((bytes: number[], label?: string) => {
    if (status !== 'connected') return
    window.api.writeTerminal(connection.id, bytes).catch(e => setInputError(String(e)))
    setLines(prev => {
      const next = [...prev, { id: lineIdCounter++, timestamp: Date.now(), direction: 'tx' as const, bytes, label }]
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
    })
  }, [status, connection.id])

  const sendFromInput = useCallback(() => {
    if (status !== 'connected' || !inputVal.trim()) return
    setInputError(null)
    let bytes: number[]
    if (hexInput) {
      const parsed = parseHexInput(inputVal)
      if (!parsed) { setInputError('Invalid hex'); return }
      bytes = parsed
    } else {
      bytes = Array.from(new TextEncoder().encode(inputVal))
    }
    const withEnding = hexInput ? bytes : [...bytes, ...LINE_ENDINGS[lineEnding]]
    doSend(withEnding)
    pushHistory(inputVal, hexInput)
    setInputVal('')
  }, [status, hexInput, inputVal, lineEnding, doSend, pushHistory])

  const sendModbusFrame = useCallback(() => {
    const frame = buildModbusRTUFrame(mbSlave, mbFc, mbAddr, mbCount, mbValue)
    const label = `${MB_FC_LABELS[mbFc]} slave=${mbSlave} addr=${mbAddr}`
    doSend(frame, label)
    pushHistory(bytesToHex(frame), true)
  }, [mbSlave, mbFc, mbAddr, mbCount, mbValue, doSend, pushHistory])

  const reconnect = () => {
    setStatus('connecting'); setError(null)
    window.api.connectConnection(connection).catch(e => {
      const msg = String(e).replace(/^Error invoking remote method '[^']+': /, '')
      setError(msg); setStatus('error')
    })
  }

  const disconnect = async () => { await window.api.disconnectConnection(connection.id); setStatus('idle') }

  const statusColor = {
    connected: 'var(--success)', connecting: 'var(--warning)',
    disconnecting: 'var(--warning)', error: 'var(--danger)', idle: 'var(--text-muted)'
  }[status] ?? 'var(--text-muted)'

  // Precomputed Modbus frame preview
  const mbFramePreview = useMemo(
    () => buildModbusRTUFrame(mbSlave, mbFc, mbAddr, mbCount, mbValue),
    [mbSlave, mbFc, mbAddr, mbCount, mbValue]
  )

  const renderLine = (line: TermLine) => {
    let content: React.ReactNode
    if (displayMode === 'hex') {
      content = <HexDump bytes={line.bytes} />
    } else if (displayMode === 'ascii') {
      content = (
        <span style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' }}>
          {bytesToAscii(line.bytes)}
        </span>
      )
    } else {
      // mixed: hex on top, printable ASCII summary below
      content = (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <HexDump bytes={line.bytes} />
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            {bytesToAscii(line.bytes)}
          </span>
        </span>
      )
    }
    return (
      <div key={line.id} style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 6px',
        background: line.direction === 'tx' ? 'rgba(99,102,241,0.06)' : 'transparent',
        borderLeft: `2px solid ${line.direction === 'tx' ? 'var(--primary)' : 'var(--success)'}`,
        marginBottom: 2,
      }}>
        {showTimestamps && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>
            {new Date(line.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, color: line.direction === 'tx' ? 'var(--primary)' : 'var(--success)', flexShrink: 0, paddingTop: 2, minWidth: 18 }}>
          {line.direction === 'tx' ? 'TX' : 'RX'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {line.label && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2, fontFamily: 'var(--font-mono, monospace)' }}>{line.label}</div>
          )}
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{content}</div>
        </div>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>{line.bytes.length}B</span>
      </div>
    )
  }

  const isReadFc = mbFc === 1 || mbFc === 2 || mbFc === 3 || mbFc === 4
  const isCoilFc = mbFc === 1 || mbFc === 2 || mbFc === 5 || mbFc === 15
  const isMultiWrite = mbFc === 15 || mbFc === 16

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Header ── */}
      <div className="panel-drag-handle" style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: 'grab', userSelect: 'none', flexShrink: 0
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: `0 0 0 3px ${statusColor}30` }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{connection.name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border)', padding: '2px 6px', borderRadius: 10 }}>
          TERM · {connection.serialPort} · {connection.baudRate ?? 9600}
        </span>
        {status === 'connected'
          ? <button onClick={disconnect} style={hBtn} title="Disconnect">⏹</button>
          : <button onClick={reconnect} style={hBtn} title="Connect">▶</button>
        }
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 6, padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <ToolGroup label="Display">
          {(['ascii', 'hex', 'mixed'] as DisplayMode[]).map(m => (
            <ToolBtn key={m} active={displayMode === m} onClick={() => setDisplayMode(m)}>{m.toUpperCase()}</ToolBtn>
          ))}
        </ToolGroup>
        <ToolGroup label="End">
          {(['none', 'cr', 'lf', 'crlf'] as LineEnding[]).map(e => (
            <ToolBtn key={e} active={lineEnding === e} onClick={() => setLineEnding(e)}>{e.toUpperCase()}</ToolBtn>
          ))}
        </ToolGroup>
        <ToolGroup label="Mode">
          <ToolBtn active={hexInput && !modbusMode} onClick={() => { setHexInput(v => !v); setModbusMode(false); setInputVal(''); setInputError(null) }}>HEX</ToolBtn>
          <ToolBtn active={modbusMode} onClick={() => {
            const enabling = !modbusMode
            setModbusMode(enabling)
            if (enabling) { setHexInput(true); setDisplayMode('hex') }
            else { setDisplayMode('ascii') }
          }}>
            MODBUS
          </ToolBtn>
        </ToolGroup>
        <ToolGroup label="View">
          <ToolBtn active={showTimestamps} onClick={() => setShowTimestamps(v => !v)}>TIME</ToolBtn>
          <ToolBtn active={autoScroll} onClick={() => setAutoScroll(v => !v)}>AUTO</ToolBtn>
          <ToolBtn active={showHistory} onClick={() => setShowHistory(v => !v)}>
            HIST{history.length > 0 ? ` (${history.length})` : ''}
          </ToolBtn>
        </ToolGroup>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lines.length} lines</span>
        <button onClick={() => setLines([])} style={{ ...hBtn, fontSize: 11, color: 'var(--danger)' }}>CLR</button>
      </div>

      {/* ── Modbus Builder ── */}
      {modbusMode && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            Modbus RTU Builder
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', fontSize: 9 }}>— CRC appended automatically</span>
          </div>

          {/* FC row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {([1, 2, 3, 4, 5, 6, 15, 16] as MbFc[]).map(fc => (
              <button key={fc} onClick={() => setMbFc(fc)} style={{
                fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 3, cursor: 'pointer',
                background: mbFc === fc ? 'var(--primary)' : 'var(--surface-2)',
                color: mbFc === fc ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${mbFc === fc ? 'var(--primary)' : 'var(--border)'}`,
                whiteSpace: 'nowrap',
              }}>
                FC{String(fc).padStart(2, '0')} {fc === 1 ? 'R-Coil' : fc === 2 ? 'R-DI' : fc === 3 ? 'R-HR' : fc === 4 ? 'R-IR' : fc === 5 ? 'W-Coil' : fc === 6 ? 'W-Reg' : fc === 15 ? 'W-Coils' : 'W-Regs'}
              </button>
            ))}
          </div>

          {/* Fields row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <MbField label="Slave ID">
              <input type="number" value={mbSlave} onChange={e => setMbSlave(Math.max(1, Math.min(247, +e.target.value)))} min={1} max={247} style={mbInp} />
            </MbField>
            <MbField label={isCoilFc ? 'Coil Addr' : 'Reg Addr'}>
              <input type="number" value={mbAddr} onChange={e => setMbAddr(Math.max(0, +e.target.value))} min={0} style={mbInp} />
            </MbField>
            {(isReadFc || isMultiWrite) && (
              <MbField label={isMultiWrite ? 'Count' : 'Count'}>
                <input type="number" value={mbCount} onChange={e => setMbCount(Math.max(1, Math.min(125, +e.target.value)))} min={1} max={125} style={mbInp} />
              </MbField>
            )}
            {!isReadFc && (
              <MbField label={mbFc === 5 ? 'Value (0/1)' : 'Value'}>
                <input type="number" value={mbValue} onChange={e => setMbValue(+e.target.value)} style={mbInp} />
              </MbField>
            )}
          </div>

          {/* Frame preview + send */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', letterSpacing: 0.5 }}>
              {mbFramePreview.map((b, i) => {
                const isSlaveOrFc = i < 2
                const isCrc = i >= mbFramePreview.length - 2
                const color = isSlaveOrFc ? 'var(--warning)' : isCrc ? 'var(--text-muted)' : 'var(--text)'
                return (
                  <span key={i} style={{ color, marginRight: 4 }}>
                    {i === 0 && <span style={{ opacity: 0.4, fontSize: 8 }}>SLAVE </span>}
                    {i === 1 && <span style={{ opacity: 0.4, fontSize: 8 }}>FC </span>}
                    {i === mbFramePreview.length - 2 && <span style={{ opacity: 0.4, fontSize: 8 }}>CRC </span>}
                    {hex2(b)}
                  </span>
                )
              })}
              <span style={{ opacity: 0.4, fontSize: 9, marginLeft: 4 }}>{mbFramePreview.length}B</span>
            </div>
            <button
              onClick={sendModbusFrame}
              disabled={status !== 'connected'}
              style={{ background: status === 'connected' ? 'var(--primary)' : 'var(--surface-2)', color: status === 'connected' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 5, padding: '6px 14px', cursor: status === 'connected' ? 'pointer' : 'default', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}
            >
              Send Frame
            </button>
            <button
              onClick={() => { setHexInput(true); setInputVal(bytesToHex(mbFramePreview.slice(0, -2))); inputRef.current?.focus() }}
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}
              title="Copy frame to hex input for manual edit"
            >
              Edit→
            </button>
          </div>
        </div>
      )}

      {/* ── Terminal output ── */}
      <div
        ref={outputRef}
        onScroll={e => {
          const el = e.currentTarget
          setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 20)
        }}
        style={{ flex: 1, overflowY: 'auto', padding: '6px 4px', background: 'var(--bg)', fontFamily: 'var(--font-mono, monospace)' }}
      >
        {lines.length === 0 && (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {status === 'error' ? (
              <>
                <span style={{ fontSize: 24 }}>⚠</span>
                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Could not open port</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', maxWidth: 280, wordBreak: 'break-all' }}>{error}</span>
                {error?.includes('busy') && (
                  <span style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2 }}>Port is in use — disconnect the other connection first.</span>
                )}
                <button onClick={reconnect} style={{ marginTop: 4, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>
              </>
            ) : status === 'connecting' ? 'Opening port…'
              : status === 'connected' ? 'Waiting for data…'
              : 'Not connected — press ▶ to connect'
            }
          </div>
        )}
        {lines.map(renderLine)}
      </div>

      {error && status !== 'error' && (
        <div style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.1)', borderTop: '1px solid var(--danger)', fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--font-mono, monospace)' }}>
          {error}
        </div>
      )}

      {/* ── History Drawer ── */}
      {showHistory && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)', maxHeight: 140, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px 3px', background: 'var(--surface-2)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Command History ({history.length})</span>
            <button onClick={() => setHistory([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: 'var(--danger)', padding: '0 2px' }}>Clear</button>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>No history yet — send a command.</div>
          ) : (
            <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {history.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono, monospace)' }}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 8, background: entry.isHex ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.1)', color: entry.isHex ? 'var(--primary)' : 'var(--success)', padding: '0 4px', borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>
                    {entry.isHex ? 'HEX' : 'ASCII'}
                  </span>
                  <button
                    onClick={() => { setHexInput(entry.isHex); setInputVal(entry.cmd); setModbusMode(false); inputRef.current?.focus() }}
                    style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: 'var(--text)', fontFamily: entry.isHex ? 'var(--font-mono, monospace)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 4px', borderRadius: 3 }}
                    title="Click to fill input"
                  >
                    {entry.cmd}
                  </button>
                  <button
                    onClick={() => {
                      if (status !== 'connected') return
                      if (entry.isHex) {
                        const parsed = parseHexInput(entry.cmd)
                        if (parsed) doSend(parsed)
                      } else {
                        const bytes = [...Array.from(new TextEncoder().encode(entry.cmd)), ...LINE_ENDINGS[lineEnding]]
                        doSend(bytes)
                      }
                    }}
                    disabled={status !== 'connected'}
                    style={{ background: status === 'connected' ? 'var(--primary-light)' : 'transparent', border: 'none', cursor: status === 'connected' ? 'pointer' : 'default', fontSize: 9, color: status === 'connected' ? 'var(--primary)' : 'var(--text-muted)', borderRadius: 3, padding: '2px 6px', fontWeight: 700, flexShrink: 0 }}
                    title="Resend immediately"
                  >
                    ↑ Send
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Input bar ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', gap: 6, background: 'var(--surface-2)', alignItems: 'center' }}>
        {/* History up arrow — navigate on ↑/↓ */}
        <button
          onClick={() => setShowHistory(v => !v)}
          title="Toggle history"
          style={{ ...hBtn, fontSize: 12, color: showHistory ? 'var(--primary)' : 'var(--text-muted)', opacity: 1 }}
        >
          ⏲
        </button>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setInputError(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); sendFromInput() }
            if (e.key === 'ArrowUp' && history.length > 0) {
              e.preventDefault()
              const idx = history.findIndex(h => h.cmd === inputVal && h.isHex === hexInput)
              const next = idx < 0 ? 0 : Math.min(idx + 1, history.length - 1)
              setInputVal(history[next].cmd)
              setHexInput(history[next].isHex)
            }
            if (e.key === 'ArrowDown' && history.length > 0) {
              e.preventDefault()
              const idx = history.findIndex(h => h.cmd === inputVal && h.isHex === hexInput)
              const next = idx <= 0 ? 0 : idx - 1
              setInputVal(history[next].cmd)
              setHexInput(history[next].isHex)
            }
          }}
          placeholder={hexInput ? '01 03 00 00 00 0A  (hex bytes, no CRC)' : 'Type command…  ↑↓ for history'}
          disabled={status !== 'connected'}
          style={{
            flex: 1, background: 'var(--surface)', border: `1px solid ${inputError ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 5, padding: '7px 10px', color: 'var(--text)', fontSize: 12,
            fontFamily: hexInput ? 'var(--font-mono, monospace)' : undefined, outline: 'none',
          }}
        />
        <button
          onClick={sendFromInput}
          disabled={status !== 'connected' || !inputVal.trim()}
          style={{
            background: status === 'connected' && inputVal.trim() ? 'var(--primary)' : 'var(--surface)',
            color: status === 'connected' && inputVal.trim() ? '#fff' : 'var(--text-muted)',
            border: 'none', borderRadius: 5, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12,
          }}
        >
          Send
        </button>
      </div>
      {inputError && (
        <div style={{ padding: '2px 10px 6px', fontSize: 10, color: 'var(--danger)', background: 'var(--surface-2)' }}>{inputError}</div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function MbField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      {children}
    </div>
  )
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 2 }}>{label}</span>
      {children}
    </div>
  )
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
      background: active ? 'var(--primary)' : 'var(--surface)',
      color: active ? '#fff' : 'var(--text-muted)',
      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    }}>
      {children}
    </button>
  )
}

const hBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 3px', opacity: 0.7, borderRadius: 3
}

const mbInp: React.CSSProperties = {
  width: 70, background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 4, padding: '4px 6px', color: 'var(--text)', fontSize: 12, outline: 'none',
  fontFamily: 'var(--font-mono, monospace)'
}

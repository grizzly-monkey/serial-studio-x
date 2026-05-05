import React, { useState, useEffect, useRef } from 'react'
import type { ConnectionConfig } from '../../shared/types'

interface ScanResult {
  address: number
  responseMs: number
}

interface ScanProgress {
  address: number
  total: number
  status: 'scanning' | 'found'
  responseMs?: number
}

interface ScanDone {
  found: ScanResult[]
  aborted?: boolean
  error?: string
}

interface Props {
  config: ConnectionConfig        // current form values (port, baud, etc.)
  onUse: (slaveId: number) => void
  onClose: () => void
}

const TIMEOUT_OPTIONS = [
  { label: '100 ms  (fast, may miss slow devices)', value: 100 },
  { label: '200 ms  (recommended)', value: 200 },
  { label: '500 ms  (thorough, ~2 min)', value: 500 },
  { label: '1000 ms (slow devices)', value: 1000 },
]

export default function SlaveScanner({ config, onUse, onClose }: Props): React.JSX.Element {
  const [timeoutMs, setTimeoutMs] = useState(200)
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [currentAddr, setCurrentAddr] = useState(0)
  const [found, setFound] = useState<ScanResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aborted, setAborted] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)

  const totalAddrs = 247
  const progress = phase === 'scanning' ? Math.round((currentAddr / totalAddrs) * 100) : phase === 'done' ? 100 : 0
  const estSecs = Math.round((totalAddrs * (timeoutMs + 20)) / 1000)

  useEffect(() => {
    const offProgress = window.api.onScanProgress((raw) => {
      const d = raw as ScanProgress
      setCurrentAddr(d.address)
      if (d.status === 'found' && d.responseMs !== undefined) {
        setFound(prev => [...prev, { address: d.address, responseMs: d.responseMs! }])
        // Auto-scroll results
        setTimeout(() => resultsRef.current?.scrollTo({ top: resultsRef.current.scrollHeight, behavior: 'smooth' }), 50)
      }
    })
    const offDone = window.api.onScanDone((raw) => {
      const d = raw as ScanDone
      setPhase('done')
      setFound(d.found ?? [])
      setAborted(d.aborted ?? false)
      if (d.error) setError(d.error)
    })
    return () => { offProgress(); offDone() }
  }, [])

  const handleStart = async () => {
    setPhase('scanning')
    setFound([])
    setCurrentAddr(0)
    setError(null)
    setAborted(false)
    await window.api.scanStart(config, timeoutMs)
  }

  const handleStop = async () => {
    await window.api.scanStop()
    // done event will follow from the worker
  }

  const handleUse = (addr: number) => {
    onUse(addr)
    onClose()
  }

  const canClose = phase !== 'scanning'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && canClose) onClose() }}
    >
      <div style={{
        width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)', overflow: 'hidden',
        border: '1px solid var(--border)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)', flexShrink: 0
        }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Modbus Slave Scanner</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {config.serialPort} · {config.baudRate} baud · {config.parity} parity
            </div>
          </div>
          {canClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, padding: 18 }}>

          {/* Timeout selector — only when idle */}
          {phase === 'idle' && (
            <div>
              <label style={labelStyle}>Timeout per address</label>
              <select
                value={timeoutMs}
                onChange={e => setTimeoutMs(+e.target.value)}
                style={selectStyle}
              >
                {TIMEOUT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                Estimated scan time: ~{estSecs < 60 ? `${estSecs}s` : `${Math.ceil(estSecs / 60)}m`} for all 247 addresses
              </div>
            </div>
          )}

          {/* Progress bar */}
          {phase !== 'idle' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {phase === 'scanning'
                    ? `Scanning address ${currentAddr} / ${totalAddrs}…`
                    : aborted ? 'Scan stopped'
                    : error ? `Error: ${error}`
                    : `Scan complete — ${found.length} device${found.length !== 1 ? 's' : ''} found`
                  }
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${progress}%`,
                  background: error ? 'var(--danger)' : phase === 'done' ? 'var(--success)' : 'var(--primary)',
                  transition: 'width 0.15s ease'
                }} />
              </div>
            </div>
          )}

          {/* Results list */}
          {found.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Responding Devices
              </div>
              <div ref={resultsRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {found.map(r => (
                  <div key={r.address} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 6,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 700, minWidth: 20 }}>✓</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Slave #{r.address}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                        FC03 · responded in {r.responseMs}ms
                      </span>
                    </div>
                    <button
                      onClick={() => handleUse(r.address)}
                      style={{
                        background: 'var(--primary)', color: '#fff', border: 'none',
                        borderRadius: 5, padding: '4px 12px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, flexShrink: 0
                      }}
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No devices found after done */}
          {phase === 'done' && found.length === 0 && !error && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No responding devices found. Check wiring, baud rate, and parity settings.
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: 6, fontSize: 12, color: 'var(--danger)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 18px',
          borderTop: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0
        }}>
          {phase === 'idle' && (
            <>
              <button onClick={handleStart} style={primaryBtn}>Start Scan</button>
              <button onClick={onClose} style={ghostBtn}>Cancel</button>
            </>
          )}
          {phase === 'scanning' && (
            <button onClick={handleStop} style={{ ...primaryBtn, background: 'var(--danger)' }}>
              Stop Scan
            </button>
          )}
          {phase === 'done' && (
            <>
              <button onClick={() => { setPhase('idle'); setFound([]); setError(null) }} style={ghostBtn}>
                Scan Again
              </button>
              <button onClick={onClose} style={primaryBtn}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5
}
const selectStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 10px', color: 'var(--text)', fontSize: 13, width: '100%', outline: 'none'
}
const primaryBtn: React.CSSProperties = {
  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6,
  padding: '8px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13, flex: 1
}
const ghostBtn: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 20px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', flex: 1
}

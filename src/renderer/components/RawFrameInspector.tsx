import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import type { ConnectionConfig } from '../../shared/types'

const FC_NAMES: Record<number, string> = {
  1: 'Read Coils',
  2: 'Read Discrete Inputs',
  3: 'Read Holding Registers',
  4: 'Read Input Registers',
  5: 'Write Single Coil',
  6: 'Write Single Register',
  8: 'Diagnostics',
  15: 'Write Multiple Coils',
  16: 'Write Multiple Registers',
  23: 'Read/Write Multiple Regs',
  43: 'Read Device ID (MEI)'
}

interface Props {
  connectionId: string
  connection: ConnectionConfig
}

export default function RawFrameInspector({ connectionId, connection }: Props): React.JSX.Element {
  const frames = useConnectionsStore(s => s.rawFrames[connectionId]) ?? []
  const [tab, setTab] = useState<'monitor' | 'builder'>('monitor')
  const [builderFc, setBuilderFc] = useState(3)
  const [builderAddr, setBuilderAddr] = useState('0')
  const [builderCount, setBuilderCount] = useState('10')
  const [builderMsg, setBuilderMsg] = useState('')

  const sendRaw = async () => {
    const addr = builderAddr.startsWith('0x') ? parseInt(builderAddr, 16) : parseInt(builderAddr, 10)
    const val = builderCount.startsWith('0x') ? parseInt(builderCount, 16) : parseInt(builderCount, 10)
    try {
      await window.api.writeRegister(connectionId, builderFc, addr, val)
      setBuilderMsg('✅ Request sent — watch monitor for response')
    } catch (e) {
      setBuilderMsg(`❌ Error: ${e}`)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['monitor', 'builder'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: tab === t ? 'var(--primary-light)' : 'var(--surface-2)',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`
          }}>
            {t === 'monitor' ? '📡 Monitor' : '🔧 Builder'}
          </button>
        ))}
      </div>

      {tab === 'monitor' ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
          {frames.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
              No frames captured yet.<br />
              <span style={{ fontSize: 10 }}>Start polling or send a write to see traffic.</span>
            </div>
          ) : (
            [...frames].reverse().map((f, i) => (
              <div key={i} style={{
                marginBottom: 6, padding: '6px 8px', borderRadius: 4,
                background: f.direction === 'tx' ? 'rgba(99,102,241,0.08)' : 'rgba(34,197,94,0.06)',
                borderLeft: `3px solid ${f.direction === 'tx' ? 'var(--primary)' : 'var(--success)'}`
              }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 3, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: f.direction === 'tx' ? 'var(--primary)' : 'var(--success)', minWidth: 24 }}>
                    {f.direction.toUpperCase()}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    {new Date(f.timestamp).toLocaleTimeString()}
                  </span>
                  {f.bytes[1] !== undefined && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {FC_NAMES[f.bytes[1]] ?? `FC${f.bytes[1]}`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {f.bytes.map((b, j) => (
                    <span key={j} style={{
                      background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3,
                      color: j === 1 ? 'var(--primary)' : 'var(--text)'
                    }}>
                      {b.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Build and send a Modbus request manually to {connection.name}
          </div>
          <Field label="Function Code">
            <select value={builderFc} onChange={e => setBuilderFc(+e.target.value)} style={inp}>
              {Object.entries(FC_NAMES).map(([k, v]) => (
                <option key={k} value={k}>FC{k.padStart(2,'0')} — {v}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Address (dec or 0x…)">
              <input value={builderAddr} onChange={e => setBuilderAddr(e.target.value)} style={inp} placeholder="0" />
            </Field>
            <Field label="Count / Value">
              <input value={builderCount} onChange={e => setBuilderCount(e.target.value)} style={inp} placeholder="10" />
            </Field>
          </div>
          <button onClick={sendRaw} style={{
            background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
            padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 600
          }}>
            Send Frame
          </button>
          {builderMsg && (
            <div style={{ fontSize: 11, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 4, color: 'var(--text)' }}>
              {builderMsg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '5px 8px', fontSize: 12, color: 'var(--text)', width: '100%'
}

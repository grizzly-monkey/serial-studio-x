import React, { useState, useEffect } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { useConnectionsStore } from '../store/connections'
import type { ConnectionConfig, ConnectionStatus } from '../../shared/types'

interface Props { onClose: () => void }

function crc16(buf: number[]): [number, number] {
  let crc = 0xFFFF
  for (const b of buf) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1
  }
  return [crc & 0xFF, (crc >> 8) & 0xFF]
}

function buildEchoFrame(conn: ConnectionConfig): number[] {
  const id = conn.slaveId ?? conn.unitId ?? 1
  if (conn.protocol === 'tcp' || conn.protocol === 'udp' || conn.protocol === 'rtu-tcp') {
    return [0x00, 0x01, 0x00, 0x00, 0x00, 0x06, id, 0x08, 0x00, 0x00, 0x00, 0x00]
  }
  const body = [id, 0x08, 0x00, 0x00, 0x00, 0x00]
  const [lo, hi] = crc16(body)
  return [...body, lo, hi]
}

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  idle: 'var(--text-muted)',
  connecting: 'var(--warning)',
  connected: 'var(--success)',
  disconnecting: 'var(--warning)',
  error: 'var(--danger)',
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Idle',
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnecting: 'Disconnecting…',
  error: 'Error',
}

interface EchoResult { status: 'pending' | 'sent' | 'error'; ms?: number; err?: string; rxBytes?: number[] }

export default function DiagnosticsModal({ onClose }: Props): React.JSX.Element {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const liveConns = useConnectionsStore(s => s.connections)
  const logEntries = useConnectionsStore(s => s.logEntries)

  const [echoResults, setEchoResults] = useState<Record<string, EchoResult>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  // Auto-refresh every 2s while open
  useEffect(() => {
    const t = setInterval(() => setRefreshKey(k => k + 1), 2000)
    return () => clearInterval(t)
  }, [])

  // Listen for echo responses from main process
  useEffect(() => {
    const unsub = window.api.onEchoResponse(({ connectionId, bytes }) => {
      setEchoResults(r => {
        const prev = r[connectionId]
        if (!prev || prev.status !== 'sent') return r
        return { ...r, [connectionId]: { ...prev, rxBytes: bytes } }
      })
    })
    return unsub
  }, [])

  const sendEcho = async (conn: ConnectionConfig) => {
    setEchoResults(r => ({ ...r, [conn.id]: { status: 'pending' } }))
    const t0 = Date.now()
    try {
      const bytes = buildEchoFrame(conn)
      await window.api.sendRawFrame(conn.id, bytes)
      setEchoResults(r => ({ ...r, [conn.id]: { status: 'sent', ms: Date.now() - t0 } }))
    } catch (e) {
      setEchoResults(r => ({ ...r, [conn.id]: { status: 'error', err: String(e) } }))
    }
  }

  const totalEntries = logEntries.length
  const errorEntries = logEntries.filter(e => e.status === 'error').length
  const alertEntries = logEntries.filter(e => e.status === 'alert').length

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: 600, maxHeight: '80vh', background: 'var(--surface)',
        borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Diagnostics</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Connection health · auto-refreshes every 2 s
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Log summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Log Entries', value: totalEntries, color: 'var(--primary)' },
              { label: 'Errors',      value: errorEntries, color: 'var(--danger)' },
              { label: 'Alerts',      value: alertEntries, color: 'var(--warning)' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono, monospace)' }}>
                  {stat.value.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Per-connection table */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Connections ({connections.length})
            </div>

            {connections.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
                No connections configured
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {connections.map(conn => {
                const live = liveConns[conn.id]
                const status: ConnectionStatus = live?.status ?? 'idle'
                const connErrors = logEntries.filter(e => e.connectionId === conn.id && e.status === 'error').length
                const connAlerts = logEntries.filter(e => e.connectionId === conn.id && e.status === 'alert').length
                const lastPoll = logEntries.filter(e => e.connectionId === conn.id && e.direction === 'rx').at(-1)
                const echo = echoResults[conn.id]

                return (
                  <div key={conn.id} style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '12px 14px',
                  }}>
                    {/* Row 1: name + status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: STATUS_COLOR[status],
                        boxShadow: status === 'connected' ? `0 0 6px ${STATUS_COLOR[status]}` : undefined,
                        flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{conn.name}</span>
                      <span style={{ fontSize: 11, color: STATUS_COLOR[status], fontWeight: 600 }}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>

                    {/* Row 2: meta */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, flexWrap: 'wrap' }}>
                      <span><strong style={{ color: 'var(--text)' }}>Protocol</strong> {conn.protocol.toUpperCase()}</span>
                      <span><strong style={{ color: 'var(--text)' }}>Address</strong> {conn.host ?? conn.serialPort ?? '—'}{conn.port ? `:${conn.port}` : ''}</span>
                      <span><strong style={{ color: 'var(--text)' }}>Slave</strong> {conn.slaveId ?? conn.unitId ?? 1}</span>
                      <span><strong style={{ color: 'var(--text)' }}>Poll</strong> {conn.pollIntervalMs / 1000}s</span>
                      <span><strong style={{ color: 'var(--text)' }}>Groups</strong> {conn.registerGroups.length}</span>
                    </div>

                    {/* Row 3: counts + last poll */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginBottom: live?.error ? 8 : 0, flexWrap: 'wrap' }}>
                      <span style={{ color: connErrors > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {connErrors} error{connErrors !== 1 ? 's' : ''}
                      </span>
                      <span style={{ color: connAlerts > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {connAlerts} alert{connAlerts !== 1 ? 's' : ''}
                      </span>
                      {lastPoll && (
                        <span>
                          Last RX: {new Date(lastPoll.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    {/* Error message */}
                    {live?.error && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>
                        {live.error}
                      </div>
                    )}

                    {/* FC08 Echo button */}
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => sendEcho(conn)}
                        disabled={status !== 'connected' || echo?.status === 'pending'}
                        style={{
                          background: status === 'connected' ? 'var(--primary)' : 'var(--surface)',
                          border: `1px solid ${status === 'connected' ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius: 5, padding: '4px 12px', cursor: status === 'connected' ? 'pointer' : 'default',
                          fontSize: 12, color: status === 'connected' ? '#fff' : 'var(--text-muted)',
                          fontWeight: 600, opacity: echo?.status === 'pending' ? 0.6 : 1,
                        }}>
                        {echo?.status === 'pending' ? 'Sending…' : 'Send FC08 Echo'}
                      </button>
                      {echo && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 11, color: echo.status === 'error' ? 'var(--danger)' : 'var(--success)' }}>
                            {echo.status === 'sent' ? `✓ Sent in ${echo.ms}ms` : echo.status === 'error' ? `✗ ${echo.err}` : ''}
                          </span>
                          {echo.rxBytes && echo.rxBytes.length > 0 && (
                            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--success)', background: 'rgba(34,197,94,0.08)', borderRadius: 4, padding: '3px 7px', letterSpacing: 0.5 }}>
                              RX: {echo.rxBytes.map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' ')}
                            </div>
                          )}
                          {echo.status === 'sent' && !echo.rxBytes && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Waiting for RX…</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

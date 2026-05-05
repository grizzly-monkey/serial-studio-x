import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'
import RegisterRow, { modbusRef } from './RegisterRow'
import RegisterGroupEditor from './RegisterGroupEditor'
import RawFrameInspector from './RawFrameInspector'
import WritePanel from './WritePanel'
import ConnectionLog from './ConnectionLog'
import ErrorBoundary from './ErrorBoundary'
import type { ConnectionConfig } from '../../shared/types'

interface Props { connection: ConnectionConfig }

type Tab = 'registers' | 'write' | 'frames'

const LOG_OPEN_HEIGHT = 200

function fmtInterval(ms: number): string {
  if (ms >= 1000 && ms % 1000 === 0) return `${ms / 1000}s`
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

export default function ConnectionPanel({ connection }: Props): React.JSX.Element {
  const status = useConnectionsStore(s => s.connections[connection.id]?.status ?? 'idle')
  const pollingPaused = useConnectionsStore(s => s.connections[connection.id]?.pollingPaused ?? false)
  const loggingActive = useConnectionsStore(s => s.connections[connection.id]?.loggingActive ?? false)
  const connLogCount = useConnectionsStore(s => s.logEntries.filter(e => e.connectionId === connection.id).length)
  const connErrorCount = useConnectionsStore(s => s.logEntries.filter(e => e.connectionId === connection.id && e.status === 'error').length)

  const { setPollPaused, setLogging } = useConnectionsStore()
  const { updateConnection } = useWorkspaceStore()

  const [tab, setTab] = useState<Tab>('registers')
  const [logOpen, setLogOpen] = useState(false)
  const [showGroupEditor, setShowGroupEditor] = useState(false)
  const [editingInterval, setEditingInterval] = useState(false)
  const [intervalDraft, setIntervalDraft] = useState(connection.pollIntervalMs)
  const intervalInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingInterval) intervalInputRef.current?.select()
  }, [editingInterval])

  const statusColor = {
    connected: 'var(--success)', connecting: 'var(--warning)', error: 'var(--danger)', idle: 'var(--text-muted)'
  }[status] ?? 'var(--text-muted)'

  const totalAlerts = useConnectionsStore(s => {
    const regs = s.connections[connection.id]?.registerValues ?? {}
    return Object.values(regs).filter(r => r.alertState !== 'ok').length
  })

  const handleLogging = async () => {
    if (loggingActive) {
      await window.api.stopLogging(connection.id)
      setLogging(connection.id, false)
    } else {
      await window.api.startLogging(connection.id, connection.name)
      setLogging(connection.id, true)
    }
  }

  const handlePauseResume = async () => {
    if (pollingPaused) {
      await window.api.resumePolling(connection.id)
      setPollPaused(connection.id, false)
    } else {
      await window.api.pausePolling(connection.id)
      setPollPaused(connection.id, true)
    }
  }

  const applyInterval = (ms: number) => {
    const clamped = Math.max(100, Math.round(ms))
    setIntervalDraft(clamped)
    setEditingInterval(false)
    updateConnection(connection.id, { pollIntervalMs: clamped })
    window.api.connectConnection({ ...connection, pollIntervalMs: clamped })
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'registers', label: 'Registers' },
    { id: 'write', label: 'Write' },
    { id: 'frames', label: 'Frames' },
  ]

  const drawerHeight = logOpen ? LOG_OPEN_HEIGHT + 28 : 28

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Panel header */}
      <div className="panel-drag-handle" style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: 'grab', userSelect: 'none', flexShrink: 0
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: pollingPaused ? 'var(--text-muted)' : statusColor, flexShrink: 0,
          boxShadow: `0 0 0 3px ${pollingPaused ? 'var(--text-muted)' : statusColor}30`
        }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{connection.name}</span>

        {totalAlerts > 0 && (
          <span style={{ background: 'var(--warning)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
            ⚠ {totalAlerts}
          </span>
        )}

        <span
          style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border)', padding: '2px 6px', borderRadius: 10, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => { setIntervalDraft(connection.pollIntervalMs); setEditingInterval(true) }}
          title="Click to change poll interval"
        >
          {connection.protocol.toUpperCase()} · {pollingPaused ? 'paused' : fmtInterval(connection.pollIntervalMs)}
        </span>

        <button
          onClick={e => { e.stopPropagation(); handlePauseResume() }}
          style={{ ...hBtn, opacity: status === 'connected' ? 0.85 : 0.35, fontSize: 13 }}
          title={pollingPaused ? 'Resume polling' : 'Pause polling'}
          disabled={status !== 'connected'}
        >
          {pollingPaused ? '▶' : '⏸'}
        </button>
        <button onClick={() => setShowGroupEditor(e => !e)} style={hBtn} title="Register groups">📋</button>
        <button
          onClick={handleLogging}
          style={{ ...hBtn, color: loggingActive ? 'var(--danger)' : undefined }}
          title={loggingActive ? 'Stop logging to file' : 'Start logging to file'}
        >
          {loggingActive ? '⏹' : '⏺'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '6px 4px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: tab === t.id ? 'var(--surface)' : 'transparent',
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Interval editor modal */}
      {editingInterval && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setEditingInterval(false)}
        >
          <div
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 14 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>Poll Interval</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[500, 1000, 2000, 5000, 10000, 30000].map(ms => (
                <button key={ms} onClick={() => applyInterval(ms)} style={{ ...presetBtn, background: intervalDraft === ms ? 'var(--primary)' : 'var(--surface-2)', color: intervalDraft === ms ? '#fff' : 'var(--text)' }}>
                  {fmtInterval(ms)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={intervalInputRef}
                type="number"
                value={intervalDraft}
                min={100}
                step={100}
                onChange={e => setIntervalDraft(Math.max(100, +e.target.value))}
                onKeyDown={e => { if (e.key === 'Enter') applyInterval(intervalDraft) }}
                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ms</span>
              <button onClick={() => applyInterval(intervalDraft)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>Apply</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Min 100 ms · Connection will restart</div>
          </div>
        </div>,
        document.body
      )}

      {showGroupEditor && createPortal(
        <ErrorBoundary>
          <RegisterGroupEditor connection={connection} onClose={() => setShowGroupEditor(false)} />
        </ErrorBoundary>,
        document.body
      )}

      {/* Tab content — shrinks when log drawer is open */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'registers' && (
          <>
            {(status === 'connecting' || status === 'idle') ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 22, animation: 'spin 1s linear infinite' }}>⟳</div>
                <span style={{ fontSize: 12 }}>Connecting…</span>
                <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
              </div>
            ) : status === 'error' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 28 }}>⚠</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>Connection failed</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reconnecting automatically…</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {connection.registerGroups.length === 0 ? (
                  <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
                    No registers configured.<br />Click 📋 to add register groups.
                  </div>
                ) : (
                  connection.registerGroups.map(group => (
                    <div key={group.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 4px 3px', letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span>{group.label}</span>
                        <span style={{ opacity: 0.5 }}>·</span>
                        <span>FC{String(group.functionCode).padStart(2,'0')}</span>
                        <span style={{ opacity: 0.5 }}>·</span>
                        <span style={{ color: 'var(--primary)', fontFamily: 'ui-monospace, monospace' }}>
                          {modbusRef(group.functionCode, group.startAddress)}–{modbusRef(group.functionCode, group.startAddress + group.count - 1)}
                        </span>
                        <span style={{ opacity: 0.5 }}>·</span>
                        <span>{group.count * 2} bytes</span>
                      </div>
                      {group.registers.map(reg => (
                        <RegisterRow key={reg.address} connection={connection} group={group} register={reg} />
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {tab === 'write' && <WritePanel connection={connection} />}
        {tab === 'frames' && <RawFrameInspector connectionId={connection.id} connection={connection} />}
      </div>

      {/* Connection comm log drawer — collapsible at bottom, same pattern as APP LOG */}
      <div style={{
        flexShrink: 0,
        height: drawerHeight,
        transition: 'height 0.2s ease',
        overflow: 'hidden',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Drawer header */}
        <div
          onClick={() => setLogOpen(o => !o)}
          style={{ height: 28, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', cursor: 'pointer', background: 'var(--surface-2)', flexShrink: 0 }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
            {logOpen ? '▼' : '▲'} COMM LOG
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{connLogCount.toLocaleString()} frames</span>
          {connErrorCount > 0 && (
            <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>
              {connErrorCount} errors
            </span>
          )}
        </div>

        {/* Drawer content */}
        {logOpen && (
          <div style={{ height: LOG_OPEN_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ConnectionLog connectionId={connection.id} />
          </div>
        )}
      </div>
    </div>
  )
}

const hBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 3px', opacity: 0.7, borderRadius: 3
}

const presetBtn: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px',
  cursor: 'pointer', fontSize: 12, fontWeight: 600
}

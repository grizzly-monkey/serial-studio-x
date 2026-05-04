import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import RegisterRow from './RegisterRow'
import RegisterGroupEditor from './RegisterGroupEditor'
import RawFrameInspector from './RawFrameInspector'
import type { ConnectionConfig } from '../../shared/types'

interface Props { connection: ConnectionConfig }

export default function ConnectionPanel({ connection }: Props): React.JSX.Element {
  const status = useConnectionsStore(s => s.connections[connection.id]?.status ?? 'idle')
  const loggingActive = useConnectionsStore(s => s.connections[connection.id]?.loggingActive ?? false)
  const setLogging = useConnectionsStore(s => s.setLogging)
  const [showFrames, setShowFrames] = useState(false)
  const [showGroupEditor, setShowGroupEditor] = useState(false)

  const statusColor = {
    connected: 'var(--success)', connecting: 'var(--warning)', error: 'var(--danger)', idle: 'var(--text-muted)'
  }[status] ?? 'var(--text-muted)'

  const handleLogging = async () => {
    if (loggingActive) {
      await window.api.stopLogging(connection.id)
      setLogging(connection.id, false)
    } else {
      await window.api.startLogging(connection.id, connection.name)
      setLogging(connection.id, true)
    }
  }

  const totalAlerts = useConnectionsStore(s => {
    const regs = s.connections[connection.id]?.registerValues ?? {}
    return Object.values(regs).filter(r => r.alertState !== 'ok').length
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Panel header — drag handle */}
      <div className="panel-drag-handle" style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: 'grab', userSelect: 'none', flexShrink: 0
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0,
          boxShadow: `0 0 0 3px ${statusColor}30`
        }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{connection.name}</span>

        {totalAlerts > 0 && (
          <span style={{ background: 'var(--warning)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
            ⚠ {totalAlerts}
          </span>
        )}

        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border)', padding: '2px 6px', borderRadius: 10 }}>
          {connection.protocol.toUpperCase()} · {connection.pollIntervalMs}ms
        </span>

        <button onClick={() => setShowGroupEditor(e => !e)} style={hBtn} title="Register groups" aria-label="Edit register groups">
          📋
        </button>
        <button onClick={() => setShowFrames(e => !e)} style={hBtn} title="Raw frame inspector" aria-label="Raw frames">
          🔬
        </button>
        <button
          onClick={handleLogging}
          style={{ ...hBtn, color: loggingActive ? 'var(--danger)' : undefined }}
          title={loggingActive ? 'Stop logging' : 'Start logging'}
          aria-label="Toggle logging"
        >
          {loggingActive ? '⏹' : '⏺'}
        </button>
      </div>

      {showGroupEditor && (
        <div style={{ flexShrink: 0 }}>
          <RegisterGroupEditor connection={connection} />
        </div>
      )}

      {showFrames ? (
        <RawFrameInspector connectionId={connection.id} connection={connection} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {connection.registerGroups.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              No registers configured.<br />
              Click 📋 to add register groups.
            </div>
          ) : (
            connection.registerGroups.map(group => (
              <div key={group.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 4px 3px', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {group.label} · FC{String(group.functionCode).padStart(2,'0')} · {group.count} regs
                </div>
                {group.registers.map(reg => (
                  <RegisterRow
                    key={reg.address}
                    connection={connection}
                    group={group}
                    register={reg}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const hBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
  padding: '2px 3px', opacity: 0.7, borderRadius: 3
}

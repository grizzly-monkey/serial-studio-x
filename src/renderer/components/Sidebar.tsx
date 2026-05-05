import React, { useState } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { useConnectionsStore } from '../store/connections'
import ConnectionConfigSheet from './ConnectionConfigSheet'
import type { ConnectionConfig } from '../../shared/types'

export default function Sidebar(): React.JSX.Element {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const { removeConnection } = useWorkspaceStore()
  const statuses = useConnectionsStore(s => s.connections)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)

  const statusColor = (id: string) => {
    const s = statuses[id]?.status ?? 'idle'
    if (s === 'connected') return 'var(--success)'
    if (s === 'connecting') return 'var(--warning)'
    if (s === 'disconnecting') return 'var(--warning)'
    if (s === 'error') return 'var(--danger)'
    return 'var(--text-muted)'
  }

  const statusLabel = (id: string) => statuses[id]?.status ?? 'idle'

  const handleDisconnect = async (id: string) => {
    await window.api.disconnectConnection(id)
    removeConnection(id)
  }

  return (
    <>
      <aside style={{
        width: 230, background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: 8, gap: 2, overflowY: 'auto', flexShrink: 0
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '6px 8px 4px', letterSpacing: 1 }}>
          CONNECTIONS
        </div>

        {connections.map(conn => (
          <div key={conn.id} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px',
            borderRadius: 'var(--radius)', background: 'var(--surface-2)',
            border: '1px solid transparent', transition: 'border-color 0.15s'
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor(conn.id), flexShrink: 0,
              boxShadow: `0 0 0 2px ${statusColor(conn.id)}33`
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conn.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 4, marginTop: 1 }}>
                <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '0px 4px', borderRadius: 3, fontWeight: 600 }}>
                  {conn.protocol.toUpperCase()}
                </span>
                <span>{statusLabel(conn.id)}</span>
                <span>·</span>
                <span>{conn.pollIntervalMs >= 1000 ? `${conn.pollIntervalMs / 1000}s` : `${conn.pollIntervalMs}ms`}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => { setEditing(conn); setSheetOpen(true) }} style={iconBtn} title="Edit">✏️</button>
              <button onClick={() => handleDisconnect(conn.id)} style={iconBtn} title="Remove">🗑</button>
            </div>
          </div>
        ))}

        {connections.length < 10 ? (
          <button
            onClick={() => { setEditing(null); setSheetOpen(true) }}
            style={{
              marginTop: 6, padding: '8px 10px', borderRadius: 'var(--radius)',
              border: '1px dashed var(--border)', background: 'none', cursor: 'pointer',
              color: 'var(--primary)', fontSize: 12, fontWeight: 600, textAlign: 'left'
            }}
          >
            + New Connection
          </button>
        ) : (
          <div style={{
            marginTop: 6, padding: '8px 10px', borderRadius: 'var(--radius)',
            border: '1px dashed var(--border)', fontSize: 11, color: 'var(--text-muted)',
            textAlign: 'center', lineHeight: 1.5
          }}>
            Max 10 connections reached
          </div>
        )}
      </aside>

      {sheetOpen && (
        <ConnectionConfigSheet
          initial={editing}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px',
  fontSize: 12, opacity: 0.6, borderRadius: 3, lineHeight: 1
}

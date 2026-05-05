import React, { useCallback } from 'react'
import { ResponsiveGridLayout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useWorkspaceStore } from '../store/workspace'
import ConnectionPanel from './ConnectionPanel'

export default function Dashboard(): React.JSX.Element {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const { updateConnection } = useWorkspaceStore()

  if (connections.length === 0) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>⚡</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)' }}>No connections yet</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add a connection from the sidebar to get started</div>
      </main>
    )
  }

  // Single connection: fill the entire content area (no grid overhead)
  if (connections.length === 1) {
    return (
      <main style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 0, margin: 0
        }}>
          <ConnectionPanel connection={connections[0]} />
        </div>
      </main>
    )
  }

  // Multiple connections: grid layout
  const layouts = {
    lg: connections.map((c, i) => ({
      i: c.id,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 10,
      w: 6,
      h: 10,
      minW: 3,
      minH: 5
    }))
  }

  const handleLayoutChange = useCallback((layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    layout.forEach(item => {
      const conn = connections.find(c => c.id === item.i)
      if (conn) updateConnection(conn.id, { panelLayout: item })
    })
  }, [connections, updateConnection])

  return (
    <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: 8 }}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={38}
        width={1200}
        draggableHandle=".panel-drag-handle"
        onLayoutChange={handleLayoutChange}
        margin={[8, 8]}
      >
        {connections.map(c => (
          <div key={c.id} style={{
            background: 'var(--surface)', borderRadius: 8,
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column'
          }}>
            <ConnectionPanel connection={c} />
          </div>
        ))}
      </ResponsiveGridLayout>
    </main>
  )
}

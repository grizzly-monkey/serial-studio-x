import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Responsive as ResponsiveGrid } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useWorkspaceStore } from '../store/workspace'
import { useConnectionsStore } from '../store/connections'
import ConnectionPanel from './ConnectionPanel'
import SerialTerminalPanel from './SerialTerminalPanel'
import ErrorBoundary from './ErrorBoundary'
import type { ConnectionConfig } from '../../shared/types'

// Pop-out button rendered as a small overlay on each grid cell
function PopOutBtn({ connectionId }: { connectionId: string }) {
  return (
    <button
      title="Pop out to separate window"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); window.api.popOutConnection(connectionId) }}
      style={{
        position: 'absolute', top: 6, right: 6, zIndex: 10,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 4, width: 22, height: 22, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'var(--text-muted)', opacity: 0,
        transition: 'opacity 0.15s',
      }}
      className="popout-btn"
    >
      ⊞
    </button>
  )
}

function PanelFor({ connection }: { connection: ConnectionConfig }) {
  return (
    <ErrorBoundary inline>
      {connection.protocol === 'serial-terminal'
        ? <SerialTerminalPanel connection={connection} />
        : <ConnectionPanel connection={connection} />
      }
    </ErrorBoundary>
  )
}

export default function Dashboard(): React.JSX.Element {
  const allConnections = useWorkspaceStore(s => s.workspace.connections)
  const poppedOutIds = useConnectionsStore(s => s.poppedOutIds)
  const connections = allConnections.filter(c => !poppedOutIds.has(c.id))
  const { updateConnection } = useWorkspaceStore()

  // Measure the container width so react-grid-layout fills the actual space
  const containerRef = useRef<HTMLElement>(null)
  const [gridWidth, setGridWidth] = useState(1200)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setGridWidth(w)
    })
    ro.observe(el)
    // Set initial width
    setGridWidth(el.getBoundingClientRect().width || 1200)
    return () => ro.disconnect()
  }, [])

  const handleLayoutChange = useCallback((layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    layout.forEach(item => {
      const conn = connections.find(c => c.id === item.i)
      if (conn) updateConnection(conn.id, { panelLayout: { x: item.x, y: item.y, w: item.w, h: item.h } })
    })
  }, [connections, updateConnection])

  if (connections.length === 0) {
    return (
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>⚡</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)' }}>No connections yet</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add a connection from the sidebar to get started</div>
      </main>
    )
  }

  if (connections.length === 1) {
    return (
      <main style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <style>{`.popout-btn { opacity: 0 } main:hover .popout-btn { opacity: 1 }`}</style>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', position: 'relative' }}>
          <PopOutBtn connectionId={connections[0].id} />
          <PanelFor connection={connections[0]} />
        </div>
      </main>
    )
  }

  // Build layouts — use saved panelLayout when available, otherwise default grid positions
  const lgLayout = connections.map((c, i) => {
    const saved = c.panelLayout
    return {
      i: c.id,
      x: saved?.x ?? (i % 2) * 6,
      y: saved?.y ?? Math.floor(i / 2) * 10,
      w: saved?.w ?? 6,
      h: saved?.h ?? 10,
      minW: 3,
      minH: 5,
    }
  })

  return (
    <main ref={containerRef} style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: 8, boxSizing: 'border-box' }}>
      <style>{`
        .react-grid-item { transition: none !important; }
        .react-grid-item.react-grid-placeholder { background: var(--primary); opacity: 0.15; border-radius: 8px; }
        .react-resizable-handle { opacity: 0.4; }
        .react-resizable-handle:hover { opacity: 1; }
        .grid-cell:hover .popout-btn { opacity: 1 !important; }
      `}</style>
      <ResponsiveGrid
        layouts={{ lg: lgLayout, md: lgLayout, sm: lgLayout }}
        breakpoints={{ lg: 1200, md: 768, sm: 480 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={38}
        width={gridWidth}
        draggableHandle=".panel-drag-handle"
        onLayoutChange={handleLayoutChange}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        isResizable
        isDraggable
      >
        {connections.map(c => (
          <div key={c.id} className="grid-cell" style={{
            background: 'var(--surface)', borderRadius: 8,
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            position: 'relative',
          }}>
            <PopOutBtn connectionId={c.id} />
            <PanelFor connection={c} />
          </div>
        ))}
      </ResponsiveGrid>
    </main>
  )
}

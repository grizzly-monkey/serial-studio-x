import React, { useRef, useEffect, useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'

export default function LogDrawer(): React.JSX.Element {
  const logDrawerOpen = useWorkspaceStore(s => s.workspace.settings.logDrawerOpen)
  const setSettings = useWorkspaceStore(s => s.setSettings)
  const logEntries = useConnectionsStore(s => s.logEntries)
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && logDrawerOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [logEntries.length, autoScroll, logDrawerOpen])

  const filtered = filter
    ? logEntries.filter(e =>
        e.connectionName.toLowerCase().includes(filter.toLowerCase()) ||
        (e.message ?? '').toLowerCase().includes(filter.toLowerCase()) ||
        String(e.address).includes(filter) ||
        e.decodedValue.includes(filter)
      )
    : logEntries

  const errorCount = logEntries.filter(e => e.status === 'error').length
  const alertCount = logEntries.filter(e => e.status === 'alert').length

  const exportCsv = () => {
    const header = 'timestamp,connection,direction,fc,address,raw_hex,raw_dec,decoded,unit,status'
    const rows = filtered.map(e =>
      `${new Date(e.timestamp).toISOString()},${e.connectionName},${e.direction},${e.fc},${e.address},${e.rawHex},${e.rawDec},"${e.decodedValue}",${e.unit},${e.status}`
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `modbus-log-${Date.now()}.csv`
    a.click()
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `modbus-log-${Date.now()}.json`
    a.click()
  }

  const statusColor = (s: string) =>
    s === 'error' ? 'var(--danger)' : s === 'alert' ? 'var(--warning)' : 'var(--text-muted)'

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      height: logDrawerOpen ? 220 : 32,
      transition: 'height 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0
    }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 32, cursor: 'pointer' }}
        onClick={() => setSettings({ logDrawerOpen: !logDrawerOpen })}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
          {logDrawerOpen ? '▼' : '▲'} LOG
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{logEntries.length.toLocaleString()} entries</span>

        {errorCount > 0 && (
          <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
            {errorCount} errors
          </span>
        )}
        {alertCount > 0 && (
          <span style={{ background: 'var(--warning)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>
            {alertCount} alerts
          </span>
        )}

        <div style={{ flex: 1 }} />

        {logDrawerOpen && (
          <>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by connection, address, value…"
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '2px 8px', fontSize: 11, color: 'var(--text)', width: 200
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); setAutoScroll(a => !a) }}
              style={{ ...xBtn, color: autoScroll ? 'var(--primary)' : 'var(--text-muted)' }}
              title="Auto-scroll"
            >
              ⬇
            </button>
            <button onClick={(e) => { e.stopPropagation(); exportCsv() }} style={xBtn}>CSV</button>
            <button onClick={(e) => { e.stopPropagation(); exportJson() }} style={xBtn}>JSON</button>
          </>
        )}
      </div>

      {/* Entries */}
      {logDrawerOpen && (
        <div style={{ height: 188, overflowY: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>
              {filter ? 'No entries match filter' : 'No log entries yet — connect and start polling'}
            </div>
          ) : (
            filtered.slice(-1000).map((e, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, padding: '2px 12px',
                borderBottom: '1px solid var(--border)', alignItems: 'center',
                background: e.status === 'error' ? 'rgba(239,68,68,0.05)' : e.status === 'alert' ? 'rgba(245,158,11,0.05)' : undefined
              }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 80, flexShrink: 0 }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ color: 'var(--primary)', minWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {e.connectionName}
                </span>
                <span style={{ color: 'var(--text-muted)', minWidth: 28, flexShrink: 0 }}>
                  FC{e.fc}
                </span>
                <span style={{ minWidth: 44, flexShrink: 0 }}>@{e.address}</span>
                <span style={{ color: 'var(--text-muted)', minWidth: 58, flexShrink: 0 }}>{e.rawHex}</span>
                <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.decodedValue}{e.unit && ` ${e.unit}`}
                </span>
                <span style={{ color: statusColor(e.status), flexShrink: 0 }}>{e.status}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

const xBtn: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text)'
}

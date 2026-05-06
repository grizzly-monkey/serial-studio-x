import React, { useRef, useEffect, useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'
import { modbusRef } from './RegisterRow'

export default function LogDrawer(): React.JSX.Element {
  const logDrawerOpen = useWorkspaceStore(s => s.workspace.settings.logDrawerOpen)
  const setSettings = useWorkspaceStore(s => s.setSettings)
  const { logEntries, clearLog } = useConnectionsStore()
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
        String(e.address).includes(filter) ||
        e.decodedValue.toLowerCase().includes(filter.toLowerCase()) ||
        e.rawHex.toLowerCase().includes(filter.toLowerCase())
      )
    : logEntries

  const errorCount = logEntries.filter(e => e.status === 'error').length
  const alertCount = logEntries.filter(e => e.status === 'alert').length

  const exportCsv = () => {
    const header = 'timestamp,connection,direction,fc,address,raw_hex,decoded,status'
    const rows = filtered.map(e =>
      `${new Date(e.timestamp).toISOString()},${e.connectionName},${e.direction},${e.fc},${e.address},${e.rawHex},"${e.decodedValue}",${e.status}`
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `app-log-${Date.now()}.csv`
    a.click()
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `app-log-${Date.now()}.json`
    a.click()
  }

  const statusColor = (s: string) =>
    s === 'error' ? 'var(--danger)' : s === 'alert' ? 'var(--warning)' : 'var(--text-muted)'

  function addrLabel(fc: number, addr: number): string {
    if (fc === 0) return ''
    if (fc === 5 || fc === 15) return modbusRef(1, addr)
    if (fc === 6 || fc === 16) return modbusRef(3, addr)
    return modbusRef(fc, addr)
  }

  const CAL_IDS = new Set(['phg206a-default', 'ddm206a-default'])

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      height: logDrawerOpen ? 220 : 32,
      transition: 'height 0.2s ease',
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10001,
    }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 32, cursor: 'pointer' }}
        onClick={() => setSettings({ logDrawerOpen: !logDrawerOpen })}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
          {logDrawerOpen ? '▼' : '▲'} APP LOG
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 6px', borderRadius: 8 }}>
          all connections + console
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
              placeholder="Filter…"
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '2px 8px', fontSize: 11, color: 'var(--text)', width: 180
              }}
            />
            <button onClick={e => { e.stopPropagation(); setAutoScroll(a => !a) }} style={{ ...xBtn, color: autoScroll ? 'var(--primary)' : 'var(--text-muted)' }} title="Auto-scroll">⬇</button>
            <button onClick={e => { e.stopPropagation(); exportCsv() }} style={xBtn}>CSV</button>
            <button onClick={e => { e.stopPropagation(); exportJson() }} style={xBtn}>JSON</button>
            <button onClick={e => { e.stopPropagation(); clearLog() }} style={{ ...xBtn, color: 'var(--danger)' }} title="Clear all">Clear</button>
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
            filtered.slice(-2000).map((e, i) => {
              const isSys = e.connectionId === '__system__'
              const isTx = e.direction === 'tx'
              const isCal = isTx && e.fc === 6 && CAL_IDS.has(e.connectionId)
              const isError = e.status === 'error'
              const ref = (!isSys && e.fc > 0) ? addrLabel(e.fc, e.address) : ''

              return (
                <div key={i} style={{
                  display: 'flex', gap: 6, padding: '2px 12px',
                  borderBottom: '1px solid var(--border)', alignItems: 'center',
                  background: isSys
                    ? 'rgba(148,163,184,0.04)'
                    : isCal ? 'rgba(34,197,94,0.05)'
                    : isTx ? 'rgba(129,140,248,0.04)'
                    : isError ? 'rgba(239,68,68,0.05)'
                    : e.status === 'alert' ? 'rgba(245,158,11,0.05)'
                    : undefined
                }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: 72, flexShrink: 0 }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>

                  <span style={{
                    color: isSys ? 'var(--text-muted)' : isCal ? 'var(--success)' : isTx ? 'var(--warning)' : 'var(--success)',
                    minWidth: 28, flexShrink: 0, fontWeight: 700, fontSize: 10
                  }}>
                    {isSys ? 'SYS' : isCal ? 'CAL' : isTx ? 'TX→' : '←RX'}
                  </span>

                  {/* Connection name — skip for system entries */}
                  {!isSys && (
                    <span style={{ color: 'var(--primary)', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {e.connectionName}
                    </span>
                  )}

                  {!isSys && (
                    <span style={{ color: 'var(--text-muted)', minWidth: 28, flexShrink: 0 }}>
                      FC{String(e.fc).padStart(2,'0')}
                    </span>
                  )}

                  {/* Address column — always present for Modbus entries so hex bytes align */}
                  {!isSys && e.fc > 0 && (
                    <span style={{ minWidth: 54, flexShrink: 0, color: isTx ? 'var(--text-muted)' : 'var(--primary)' }}>{ref}</span>
                  )}

                  {!isSys && e.rawHex && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.rawHex}
                    </span>
                  )}

                  <span style={{
                    fontWeight: (!isTx && !isSys) ? 700 : 400,
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isError ? 'var(--danger)' : (isTx || isSys) ? 'var(--text-muted)' : 'var(--text)',
                    fontSize: isSys ? 10 : 11
                  }}>
                    {e.decodedValue}
                  </span>

                  {!isTx && !isSys && (
                    <span style={{ color: statusColor(e.status), flexShrink: 0 }}>{e.status}</span>
                  )}
                </div>
              )
            })
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

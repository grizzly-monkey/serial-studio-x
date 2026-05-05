import React, { useRef, useEffect, useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import { modbusRef } from './RegisterRow'

interface Props { connectionId: string }

const statusColor = (s: string) =>
  s === 'error' ? 'var(--danger)' : s === 'alert' ? 'var(--warning)' : 'var(--text-muted)'

function addrLabel(fc: number, addr: number): string {
  if (fc === 0) return ''
  // Map write FCs to their corresponding read-address space
  if (fc === 5 || fc === 15) return modbusRef(1, addr)
  if (fc === 6 || fc === 16) return modbusRef(3, addr)
  return modbusRef(fc, addr)
}

export default function ConnectionLog({ connectionId }: Props): React.JSX.Element {
  const allEntries = useConnectionsStore(s => s.logEntries)
  const clearLog = useConnectionsStore(s => s.clearConnectionLog)
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Only communication frames for this connection — system/app logs go to the global App Log drawer
  const entries = allEntries.filter(e => e.connectionId === connectionId)

  const filtered = filter
    ? entries.filter(e =>
        e.connectionName.toLowerCase().includes(filter.toLowerCase()) ||
        String(e.address).includes(filter) ||
        e.decodedValue.toLowerCase().includes(filter.toLowerCase()) ||
        e.rawHex.toLowerCase().includes(filter.toLowerCase())
      )
    : entries

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [filtered.length, autoScroll])

  const exportCsv = () => {
    const header = 'timestamp,connection,direction,fc,address,raw_hex,decoded,status'
    const rows = filtered.map(e =>
      `${new Date(e.timestamp).toISOString()},${e.connectionName},${e.direction},${e.fc},${e.address},${e.rawHex},"${e.decodedValue}",${e.status}`
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `log-${connectionId}-${Date.now()}.csv`; a.click()
  }

  const errorCount = entries.filter(e => e.status === 'error').length
  const alertCount = entries.filter(e => e.status === 'alert').length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', flexShrink: 0
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{entries.length.toLocaleString()} entries</span>
        {errorCount > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{errorCount} err</span>}
        {alertCount > 0 && <span style={{ background: 'var(--warning)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{alertCount} alert</span>}
        <div style={{ flex: 1 }} />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter…"
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
            padding: '2px 7px', fontSize: 11, color: 'var(--text)', width: 140
          }}
        />
        <button
          onClick={() => setAutoScroll(a => !a)}
          style={{ ...xBtn, color: autoScroll ? 'var(--primary)' : 'var(--text-muted)' }}
          title="Auto-scroll"
        >⬇</button>
        <button onClick={exportCsv} style={xBtn}>CSV</button>
        <button
          onClick={() => clearLog(connectionId)}
          style={{ ...xBtn, color: 'var(--danger)' }}
          title="Clear this connection's log"
        >Clear</button>
      </div>

      {/* Entries */}
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
            {filter ? 'No entries match filter' : 'No log entries yet'}
          </div>
        ) : (
          filtered.slice(-2000).map((e, i) => {
            const isTx = e.direction === 'tx'
            const isSys = e.connectionId === '__system__'
            const isError = e.status === 'error'
            const ref = addrLabel(e.fc, e.address)

            return (
              <div key={i} style={{
                display: 'flex', gap: 5, padding: '2px 10px',
                borderBottom: '1px solid var(--border)', alignItems: 'baseline',
                background: isSys
                  ? 'rgba(148,163,184,0.04)'
                  : isTx ? 'rgba(129,140,248,0.04)'
                  : isError ? 'rgba(239,68,68,0.05)'
                  : e.status === 'alert' ? 'rgba(245,158,11,0.05)'
                  : undefined
              }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 70, flexShrink: 0, fontSize: 10 }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span style={{
                  color: isSys ? 'var(--text-muted)' : isTx ? 'var(--warning)' : 'var(--success)',
                  minWidth: 28, flexShrink: 0, fontWeight: 700, fontSize: 10
                }}>
                  {isSys ? 'SYS' : isTx ? 'TX→' : '←RX'}
                </span>
                {!isSys && (
                  <span style={{ color: 'var(--text-muted)', minWidth: 26, flexShrink: 0, fontSize: 10 }}>
                    FC{String(e.fc).padStart(2,'0')}
                  </span>
                )}
                {/* Address column — always present for Modbus entries so hex bytes align */}
                {!isSys && e.fc > 0 && (
                  <span style={{ minWidth: 52, flexShrink: 0, color: isTx ? 'var(--text-muted)' : 'var(--primary)', fontSize: 10 }}>
                    {ref}
                  </span>
                )}
                {!isSys && e.rawHex && (
                  <span style={{
                    color: 'var(--text-muted)', fontSize: 10, flexShrink: 0,
                    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {e.rawHex}
                  </span>
                )}
                <span style={{
                  fontWeight: (!isTx && !isSys) ? 700 : 400,
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: isError ? 'var(--danger)' : isSys ? 'var(--text-muted)' : isTx ? 'var(--text-muted)' : 'var(--text)',
                  fontSize: isSys ? 10 : 11
                }}>
                  {e.decodedValue}
                </span>
                {!isTx && !isSys && (
                  <span style={{ color: statusColor(e.status), flexShrink: 0, fontSize: 10 }}>{e.status}</span>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

const xBtn: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '2px 7px', fontSize: 10, cursor: 'pointer', color: 'var(--text)'
}

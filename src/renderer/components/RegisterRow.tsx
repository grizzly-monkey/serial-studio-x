import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'
import TableCell from './widgets/TableCell'
import Sparkline from './widgets/Sparkline'
import Gauge from './widgets/Gauge'
import type { ConnectionConfig, RegisterGroup, RegisterConfig, WidgetType } from '../../shared/types'

interface Props {
  connection: ConnectionConfig
  group: RegisterGroup
  register: RegisterConfig
}

export default function RegisterRow({ connection, group, register }: Props): React.JSX.Element {
  const liveValue = useConnectionsStore(s => s.connections[connection.id]?.registerValues[register.address])
  const sparkline = useConnectionsStore(s => s.connections[connection.id]?.sparklineData[register.address] ?? [])
  const preferredBase = useWorkspaceStore(s => s.workspace.settings.preferredBase)
  const { updateConnection } = useWorkspaceStore()
  const [writeOpen, setWriteOpen] = useState(false)
  const [writeVal, setWriteVal] = useState('')

  const alertState = liveValue?.alertState ?? 'ok'
  const displayBase = register.displayBase === 'inherit' ? preferredBase : register.displayBase

  const rawDisplay = liveValue
    ? (displayBase === 'hex'
        ? '0x' + liveValue.raw.toString(16).toUpperCase().padStart(4, '0')
        : String(liveValue.raw))
    : '—'

  const addrDisplay = displayBase === 'hex'
    ? '0x' + register.address.toString(16).toUpperCase().padStart(4, '0')
    : String(register.address)

  const setWidget = (w: WidgetType) => {
    const updated: ConnectionConfig = {
      ...connection,
      registerGroups: connection.registerGroups.map(g =>
        g.id !== group.id ? g : {
          ...g,
          registers: g.registers.map(r =>
            r.address !== register.address ? r : { ...r, widgetType: w }
          )
        }
      )
    }
    updateConnection(connection.id, updated)
  }

  const handleWrite = async () => {
    if (!writeVal.trim()) return
    const fc = [1, 2].includes(group.functionCode) ? 5 : 6
    const val = writeVal.startsWith('0x') ? parseInt(writeVal, 16) : Number(writeVal)
    await window.api.writeRegister(connection.id, fc, register.address, val)
    setWriteOpen(false)
    setWriteVal('')
  }

  return (
    <div style={{
      marginBottom: 3, padding: '5px 6px', borderRadius: 5,
      background: alertState !== 'ok' ? 'rgba(245,158,11,0.07)' : undefined,
      border: `1px solid ${alertState !== 'ok' ? 'rgba(245,158,11,0.35)' : 'transparent'}`
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 52, fontFamily: 'ui-monospace, monospace' }}>
          {addrDisplay}
        </span>
        <span style={{ fontSize: 12, flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {register.label || `Register ${register.address}`}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', minWidth: 52, textAlign: 'right' }}>
          {rawDisplay}
        </span>

        {/* Widget toggle */}
        <div style={{ display: 'flex', gap: 1 }}>
          {(['table', 'sparkline', 'gauge'] as WidgetType[]).map(w => (
            <button
              key={w}
              onClick={() => setWidget(w)}
              title={w}
              style={{
                background: register.widgetType === w ? 'var(--primary-light)' : 'none',
                border: `1px solid ${register.widgetType === w ? 'var(--primary)' : 'transparent'}`,
                color: register.widgetType === w ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer', padding: '1px 4px', borderRadius: 3, fontSize: 11
              }}
            >
              {w === 'table' ? '⊞' : w === 'sparkline' ? '📈' : '🔵'}
            </button>
          ))}
        </div>

        <button onClick={() => setWriteOpen(o => !o)} title="Write value" style={{
          background: writeOpen ? 'var(--primary-light)' : 'none',
          border: 'none', cursor: 'pointer', fontSize: 12, padding: '1px 4px', borderRadius: 3,
          color: writeOpen ? 'var(--primary)' : 'var(--text-muted)'
        }}>✏️</button>

        {alertState !== 'ok' && (
          <span style={{ fontSize: 11 }} title={`Alert: value is ${alertState}`}>⚠️</span>
        )}
      </div>

      {/* Widget */}
      {register.widgetType === 'table' && <TableCell register={register} liveValue={liveValue} />}
      {register.widgetType === 'sparkline' && <Sparkline data={sparkline} register={register} />}
      {register.widgetType === 'gauge' && <Gauge register={register} liveValue={liveValue} />}

      {/* Write panel */}
      {writeOpen && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <input
            autoFocus
            value={writeVal}
            onChange={e => setWriteVal(e.target.value)}
            placeholder="value — dec or 0x…"
            onKeyDown={e => { if (e.key === 'Enter') handleWrite(); if (e.key === 'Escape') setWriteOpen(false) }}
            style={{
              flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text)'
            }}
          />
          <button onClick={handleWrite} style={{
            background: 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600
          }}>
            Send
          </button>
        </div>
      )}
    </div>
  )
}

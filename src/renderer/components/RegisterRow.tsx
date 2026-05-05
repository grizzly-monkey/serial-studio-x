import React from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore } from '../store/workspace'
import TableCell from './widgets/TableCell'
import Sparkline from './widgets/Sparkline'
import Gauge from './widgets/Gauge'
import type { ConnectionConfig, RegisterGroup, RegisterConfig, WidgetType, DataType, ColorRule } from '../../shared/types'

interface Props {
  connection: ConnectionConfig
  group: RegisterGroup
  register: RegisterConfig
}

export function modbusRef(fc: number, addr: number): string {
  if (fc === 1) return (addr + 1).toString().padStart(5, '0')
  if (fc === 2) return (10001 + addr).toString()
  if (fc === 3) return (40001 + addr).toString()
  if (fc === 4) return (30001 + addr).toString()
  return addr.toString()
}

function dataTypeBytes(dt: DataType): number {
  if (['float64', 'int64', 'uint64'].includes(dt)) return 8
  if (['float32', 'uint32', 'int32'].includes(dt)) return 4
  return 2
}

function evalColorRules(rules: ColorRule[], value: number | string): { fg?: string; bg?: string } | null {
  if (typeof value !== 'number' || !rules?.length) return null
  for (const rule of rules) {
    let match = false
    switch (rule.op) {
      case '<':  match = value < rule.value; break
      case '<=': match = value <= rule.value; break
      case '>':  match = value > rule.value; break
      case '>=': match = value >= rule.value; break
      case '==': match = value === rule.value; break
      case '!=': match = value !== rule.value; break
    }
    if (match) return { fg: rule.fg, bg: rule.bg }
  }
  return null
}

export default function RegisterRow({ connection, group, register }: Props): React.JSX.Element {
  const liveValue = useConnectionsStore(s => s.connections[connection.id]?.registerValues[register.address])
  const sparkline = useConnectionsStore(s => s.connections[connection.id]?.sparklineData[register.address]) ?? []
  const preferredBase = useWorkspaceStore(s => s.workspace.settings.preferredBase)
  const { updateConnection } = useWorkspaceStore()

  const alertState = liveValue?.alertState ?? 'ok'
  const colorMatch = liveValue ? evalColorRules(register.colorRules ?? [], liveValue.decoded) : null
  const displayBase = register.displayBase === 'inherit' ? preferredBase : register.displayBase

  const rawDisplay = liveValue
    ? (displayBase === 'hex'
        ? '0x' + liveValue.raw.toString(16).toUpperCase().padStart(4, '0')
        : String(liveValue.raw))
    : '—'

  const refAddr = modbusRef(group.functionCode, register.address)
  const bytes = dataTypeBytes(register.dataType)

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

  return (
    <div style={{
      marginBottom: 3, padding: '5px 6px', borderRadius: 5,
      background: colorMatch?.bg ?? (alertState !== 'ok' ? 'rgba(245,158,11,0.07)' : undefined),
      border: `1px solid ${alertState !== 'ok' ? 'rgba(245,158,11,0.35)' : 'transparent'}`,
      color: colorMatch?.fg ?? undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{ fontSize: 10, color: 'var(--primary)', minWidth: 60, fontFamily: 'ui-monospace, monospace', cursor: 'default' }}
          title={`Protocol addr ${register.address} (0x${register.address.toString(16).toUpperCase().padStart(4, '0')}) · ${bytes} bytes`}
        >
          {refAddr}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
          {bytes}B
        </span>
        <span style={{ fontSize: 12, flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {register.label || `Register ${register.address}`}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', minWidth: 52, textAlign: 'right' }}>
          {rawDisplay}
        </span>
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
        {alertState !== 'ok' && (
          <span style={{ fontSize: 11 }} title={`Alert: value is ${alertState}`}>⚠️</span>
        )}
      </div>

      {register.widgetType === 'table' && <TableCell register={register} liveValue={liveValue} />}
      {register.widgetType === 'sparkline' && <Sparkline data={sparkline} register={register} />}
      {register.widgetType === 'gauge' && <Gauge register={register} liveValue={liveValue} />}
    </div>
  )
}

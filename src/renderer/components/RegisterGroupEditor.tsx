import React, { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useWorkspaceStore } from '../store/workspace'
import type { ConnectionConfig, RegisterGroup, RegisterConfig, ReadFC, DataType, WidgetType } from '../../shared/types'

interface Props { connection: ConnectionConfig }

export default function RegisterGroupEditor({ connection }: Props): React.JSX.Element {
  const { updateConnection } = useWorkspaceStore()
  const [fc, setFc] = useState<ReadFC>(3)
  const [startAddr, setStartAddr] = useState(0)
  const [count, setCount] = useState(10)
  const [label, setLabel] = useState('')

  const addGroup = () => {
    const regs: RegisterConfig[] = Array.from({ length: count }, (_, i) => ({
      address: startAddr + i,
      label: `${label || 'Reg'} ${startAddr + i}`,
      dataType: 'uint16' as DataType,
      scale: 1,
      offset: 0,
      unit: '',
      displayBase: 'inherit',
      widgetType: 'table' as WidgetType,
      gaugeMin: 0,
      gaugeMax: 65535,
      sparklineWindowSecs: 60,
      alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
    }))

    const group: RegisterGroup = {
      id: uuid(),
      label: label.trim() || `Group @ ${startAddr}`,
      functionCode: fc,
      startAddress: startAddr,
      count,
      registers: regs
    }

    updateConnection(connection.id, {
      ...connection,
      registerGroups: [...connection.registerGroups, group]
    })
    setLabel('')
  }

  const removeGroup = (id: string) => {
    updateConnection(connection.id, {
      ...connection,
      registerGroups: connection.registerGroups.filter(g => g.id !== id)
    })
  }

  return (
    <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: 0.5 }}>
        REGISTER GROUPS
      </div>

      {connection.registerGroups.map(g => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ flex: 1, fontWeight: 500 }}>{g.label}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            FC{String(g.functionCode).padStart(2,'0')} [{g.startAddress}…{g.startAddress + g.count - 1}]
          </span>
          <button onClick={() => removeGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 13, padding: '0 2px' }}>✕</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={lbl}>FC</label>
          <select value={fc} onChange={e => setFc(+e.target.value as ReadFC)} style={sm}>
            <option value={1}>FC01 Coils</option>
            <option value={2}>FC02 Discrete</option>
            <option value={3}>FC03 Holding</option>
            <option value={4}>FC04 Input</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={lbl}>Start</label>
          <input type="number" value={startAddr} onChange={e => setStartAddr(+e.target.value)} min={0} style={{ ...sm, width: 60 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={lbl}>Count</label>
          <input type="number" value={count} onChange={e => setCount(Math.max(1, Math.min(125, +e.target.value)))} min={1} max={125} style={{ ...sm, width: 55 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={lbl}>Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="optional" style={{ ...sm, width: 100 }} />
        </div>
        <button onClick={addGroup} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          + Add
        </button>
      </div>
    </div>
  )
}

const sm: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '3px 6px', fontSize: 11, color: 'var(--text)'
}

const lbl: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4
}

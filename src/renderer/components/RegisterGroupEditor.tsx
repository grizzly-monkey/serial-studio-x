import React, { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useWorkspaceStore } from '../store/workspace'
import { modbusRef } from './RegisterRow'
import type { ConnectionConfig, RegisterGroup, RegisterConfig, ReadFC, DataType, WidgetType } from '../../shared/types'

interface Props {
  connection: ConnectionConfig
  onClose: () => void
}

const FC_OPTIONS: { value: ReadFC; label: string }[] = [
  { value: 1, label: 'FC01 — Read Coils' },
  { value: 2, label: 'FC02 — Read Discrete Inputs (read-only)' },
  { value: 3, label: 'FC03 — Read Holding Registers' },
  { value: 4, label: 'FC04 — Read Input Registers (read-only)' },
]
const DATA_TYPES: DataType[] = ['uint16', 'int16', 'uint32', 'int32', 'float32', 'binary', 'hex', 'ascii']
const WIDGET_TYPES: WidgetType[] = ['table', 'sparkline', 'gauge']

function parseStartAddr(raw: string, fc: ReadFC): number {
  const n = parseInt(raw, 10)
  if (isNaN(n)) return 0
  if (fc === 3 && n >= 40001 && n <= 49999) return n - 40001
  if (fc === 4 && n >= 30001 && n <= 39999) return n - 30001
  if (fc === 2 && n >= 10001 && n <= 19999) return n - 10001
  if (fc === 1 && n >= 1 && n <= 9999) return n - 1
  return Math.max(0, n)
}

function crc16(buf: number[]): [number, number] {
  let crc = 0xFFFF
  for (const b of buf) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1
  }
  return [crc & 0xFF, (crc >> 8) & 0xFF]
}

function hex2(n: number) { return n.toString(16).toUpperCase().padStart(2, '0') }

function groupTxFrame(connection: ConnectionConfig, fc: number, addr: number, count: number): string {
  const id = connection.slaveId ?? connection.unitId ?? 1
  if (connection.protocol === 'tcp') {
    const pdu = [fc, (addr >> 8) & 0xFF, addr & 0xFF, (count >> 8) & 0xFF, count & 0xFF]
    const len = pdu.length + 1
    const mbap = [0x00, 0x01, 0x00, 0x00, (len >> 8) & 0xFF, len & 0xFF]
    return [...mbap, id, ...pdu].map(hex2).join(' ')
  }
  const body = [id, fc, (addr >> 8) & 0xFF, addr & 0xFF, (count >> 8) & 0xFF, count & 0xFF]
  const [lo, hi] = crc16(body)
  return [...body, lo, hi].map(hex2).join(' ')
}

function sampleDecode(dataType: DataType, scale: number, offset: number, unit: string): string {
  const SAMPLE = 1234
  let val: string
  switch (dataType) {
    case 'float32': val = (12.34 * scale + offset).toFixed(2); break
    case 'uint32': val = String(1234567 * scale + offset); break
    case 'int16': val = String(-1234 * scale + offset); break
    case 'binary': val = SAMPLE.toString(2).padStart(16, '0'); break
    case 'hex': val = '0x' + SAMPLE.toString(16).toUpperCase().padStart(4, '0'); break
    case 'ascii': val = 'AB'; break
    default: {
      const n = SAMPLE * scale + offset
      val = Number.isInteger(n) ? String(n) : n.toFixed(scale < 1 ? 2 : 1)
    }
  }
  return unit ? `${val} ${unit}` : val
}

export default function RegisterGroupEditor({ connection, onClose }: Props): React.JSX.Element {
  const { updateConnection } = useWorkspaceStore()

  // Add-group form state
  const [fc, setFc] = useState<ReadFC>(3)
  const [startAddrRaw, setStartAddrRaw] = useState('0')
  const [count, setCount] = useState(2)
  const [label, setLabel] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)

  // Register template (applied to all regs when group is created)
  const [regDataType, setRegDataType] = useState<DataType>('uint16')
  const [regScale, setRegScale] = useState(1)
  const [regOffset, setRegOffset] = useState(0)
  const [regUnit, setRegUnit] = useState('')
  const [regWidget, setRegWidget] = useState<WidgetType>('table')

  // Per-group editing state
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [regEdits, setRegEdits] = useState<RegisterConfig[]>([])

  const startAddr = parseStartAddr(startAddrRaw, fc)
  const endAddr = startAddr + count - 1
  const totalBytes = count * 2
  const refStart = modbusRef(fc, startAddr)
  const refEnd = modbusRef(fc, endAddr)
  const fcLabel = FC_OPTIONS.find(o => o.value === fc)?.label ?? ''
  const txFrame = groupTxFrame(connection, fc, startAddr, count)

  const reconnect = (updatedGroups: RegisterGroup[]) => {
    setReconnecting(true)
    const updatedConfig = { ...connection, registerGroups: updatedGroups }
    window.api.connectConnection(updatedConfig).finally(() => setReconnecting(false))
  }

  const addGroup = () => {
    const groupLabel = label.trim() || `Group @ ${refStart}`
    const regs: RegisterConfig[] = Array.from({ length: count }, (_, i) => ({
      address: startAddr + i,
      label: `${label.trim() || 'Reg'} ${modbusRef(fc, startAddr + i)}`,
      dataType: regDataType,
      scale: regScale,
      offset: regOffset,
      unit: regUnit,
      displayBase: 'inherit',
      widgetType: regWidget,
      gaugeMin: 0,
      gaugeMax: 65535,
      sparklineWindowSecs: 60,
      alert: { enabled: false, lowLimit: null, highLimit: null, notifyOS: false }
    }))

    const group: RegisterGroup = {
      id: uuid(),
      label: groupLabel,
      functionCode: fc,
      startAddress: startAddr,
      count,
      registers: regs
    }

    const updatedGroups = [...connection.registerGroups, group]
    updateConnection(connection.id, { registerGroups: updatedGroups })
    reconnect(updatedGroups)
    setAdded(groupLabel)
    setLabel('')
    setStartAddrRaw(String(startAddr + count))
  }

  const removeGroup = (id: string) => {
    const updatedGroups = connection.registerGroups.filter(g => g.id !== id)
    updateConnection(connection.id, { registerGroups: updatedGroups })
    reconnect(updatedGroups)
    if (editingGroupId === id) setEditingGroupId(null)
  }

  const startEdit = (g: RegisterGroup) => {
    setEditingGroupId(g.id)
    setRegEdits(g.registers.map(r => ({ ...r })))
  }

  const saveEdits = () => {
    const updatedGroups = connection.registerGroups.map(g =>
      g.id === editingGroupId ? { ...g, registers: regEdits } : g
    )
    updateConnection(connection.id, { registerGroups: updatedGroups })
    reconnect(updatedGroups)
    setEditingGroupId(null)
  }

  const updateRegEdit = (index: number, patch: Partial<RegisterConfig>) =>
    setRegEdits(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: 500, background: 'var(--surface)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Register Groups</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{connection.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
        </div>

        {reconnecting && (
          <div style={{ padding: '6px 20px', background: 'rgba(129,140,248,0.12)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
            Reconnecting worker with updated register groups…
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Existing groups ── */}
          {connection.registerGroups.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Active Groups ({connection.registerGroups.length})
              </div>
              {connection.registerGroups.map(g => {
                const isEditing = editingGroupId === g.id
                const gTx = groupTxFrame(connection, g.functionCode, g.startAddress, g.count)

                return (
                  <div key={g.id} style={{ borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{g.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                          FC{String(g.functionCode).padStart(2,'0')} &nbsp;·&nbsp;
                          <span style={{ color: 'var(--primary)' }}>
                            {modbusRef(g.functionCode, g.startAddress)}–{modbusRef(g.functionCode, g.startAddress + g.count - 1)}
                          </span>
                          &nbsp;·&nbsp; {g.count} reg{g.count !== 1 ? 's' : ''} &nbsp;·&nbsp; {g.count * 2} bytes
                        </div>
                        {/* TX frame for this group's read command */}
                        <div style={{ marginTop: 5, fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--warning)', background: 'rgba(245,158,11,0.07)', borderRadius: 4, padding: '3px 7px', display: 'inline-block' }}>
                          TX: {gTx}
                        </div>
                      </div>
                      <button
                        onClick={() => isEditing ? setEditingGroupId(null) : startEdit(g)}
                        style={{ background: isEditing ? 'var(--primary-light)' : 'var(--surface)', border: `1px solid ${isEditing ? 'var(--primary)' : 'var(--border)'}`, color: isEditing ? 'var(--primary)' : 'var(--text-muted)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                      <button onClick={() => removeGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>✕</button>
                    </div>

                    {/* Per-register edit form */}
                    {isEditing && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '12px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Edit Registers</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {regEdits.map((reg, i) => (
                            <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'ui-monospace, monospace', marginBottom: 8, fontWeight: 600 }}>
                                {modbusRef(g.functionCode, reg.address)}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <RegField label="Label">
                                  <input value={reg.label} onChange={e => updateRegEdit(i, { label: e.target.value })} style={inp} placeholder="Register label" />
                                </RegField>
                                <RegField label="Unit">
                                  <input value={reg.unit} onChange={e => updateRegEdit(i, { unit: e.target.value })} style={inp} placeholder="e.g. °C, pH" />
                                </RegField>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <RegField label="Data Type">
                                  <select value={reg.dataType} onChange={e => updateRegEdit(i, { dataType: e.target.value as DataType })} style={inp}>
                                    {DATA_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                                  </select>
                                </RegField>
                                <RegField label="Scale">
                                  <input type="number" value={reg.scale} onChange={e => updateRegEdit(i, { scale: parseFloat(e.target.value) || 1 })} style={inp} step="any" />
                                </RegField>
                                <RegField label="Offset">
                                  <input type="number" value={reg.offset} onChange={e => updateRegEdit(i, { offset: parseFloat(e.target.value) || 0 })} style={inp} step="any" />
                                </RegField>
                                <RegField label="Widget">
                                  <select value={reg.widgetType} onChange={e => updateRegEdit(i, { widgetType: e.target.value as WidgetType })} style={inp}>
                                    {WIDGET_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                                  </select>
                                </RegField>
                              </div>
                              {/* Sample for this register */}
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '5px 8px', background: 'var(--surface-2)', borderRadius: 4, fontFamily: 'ui-monospace, monospace' }}>
                                Sample (raw=1234): <strong style={{ color: 'var(--text)' }}>{sampleDecode(reg.dataType, reg.scale, reg.offset, reg.unit)}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={saveEdits} style={{ marginTop: 12, width: '100%', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '9px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                          Save & Reconnect
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Add group form ── */}
          <div style={{ padding: '16px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Add New Group</div>

            <Field label="Label (optional)">
              <input value={label} onChange={e => { setLabel(e.target.value); setAdded(null) }} placeholder="e.g. Temperatures, Alarms, Motor Status" style={inputStyle} onKeyDown={e => { if (e.key === 'Enter') addGroup() }} />
            </Field>

            <Field label="Function Code">
              <select value={fc} onChange={e => { setFc(+e.target.value as ReadFC); setAdded(null) }} style={inputStyle}>
                {FC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={`Start Address (e.g. ${modbusRef(fc, 0)})`}>
                <input type="text" value={startAddrRaw} onChange={e => { setStartAddrRaw(e.target.value); setAdded(null) }} placeholder={modbusRef(fc, 0)} style={inputStyle} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  protocol addr {startAddr} (0x{startAddr.toString(16).toUpperCase().padStart(4,'0')})
                </span>
              </Field>
              <Field label="Registers to read (max 125)">
                <input type="number" value={count} onChange={e => { setCount(Math.max(1, Math.min(125, +e.target.value))); setAdded(null) }} min={1} max={125} style={inputStyle} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>= {totalBytes} bytes read from bus</span>
              </Field>
            </div>

            {/* Register template config */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Register Template (applied to all registers)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <RegField label="Label prefix">
                  <input value={label} onChange={e => { setLabel(e.target.value); setAdded(null) }} placeholder="Reg" style={inp} />
                </RegField>
                <RegField label="Unit">
                  <input value={regUnit} onChange={e => setRegUnit(e.target.value)} placeholder="e.g. °C, pH, rpm" style={inp} />
                </RegField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                <RegField label="Data Type">
                  <select value={regDataType} onChange={e => setRegDataType(e.target.value as DataType)} style={inp}>
                    {DATA_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                  </select>
                </RegField>
                <RegField label="Scale">
                  <input type="number" value={regScale} onChange={e => setRegScale(parseFloat(e.target.value) || 1)} step="any" style={inp} />
                </RegField>
                <RegField label="Offset">
                  <input type="number" value={regOffset} onChange={e => setRegOffset(parseFloat(e.target.value) || 0)} step="any" style={inp} />
                </RegField>
                <RegField label="Widget">
                  <select value={regWidget} onChange={e => setRegWidget(e.target.value as WidgetType)} style={inp}>
                    {WIDGET_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </RegField>
              </div>
            </div>

            {/* Preview block: TX frame + sample register display */}
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* TX frame */}
              <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                  TX Frame ({connection.protocol.toUpperCase()}) · {totalBytes + 8} bytes total
                </div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'var(--warning)', letterSpacing: 0.5 }}>
                  {txFrame.split(' ').map((byteStr, i) => {
                    const isId = connection.protocol !== 'tcp' ? i === 0 : i === 6
                    const isFc = connection.protocol !== 'tcp' ? i === 1 : i === 7
                    const isCrc = connection.protocol !== 'tcp' && i >= txFrame.split(' ').length - 2
                    return (
                      <span key={i} title={isId ? 'Slave ID' : isFc ? 'FC' : isCrc ? 'CRC' : `Byte ${i}`}
                        style={{ color: isId ? 'var(--warning)' : isFc ? 'var(--success)' : isCrc ? 'var(--text-muted)' : 'var(--primary)' }}>
                        {byteStr}{i < txFrame.split(' ').length - 1 ? ' ' : ''}
                      </span>
                    )
                  })}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 8 }}>
                  <span><strong style={{ color: 'var(--text)' }}>{fcLabel}</strong></span>
                  <span>·</span>
                  <span style={{ color: 'var(--primary)' }}>{refStart}–{refEnd}</span>
                  <span>·</span>
                  <span>{count} reg{count !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Sample register display */}
              <div style={{ padding: '8px 12px', background: 'var(--surface)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Sample Display (raw = 1234)
                </div>
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: i < Math.min(count, 3) - 1 ? '1px solid var(--border)' : undefined }}>
                    <span style={{ fontSize: 10, color: 'var(--primary)', minWidth: 54, fontFamily: 'ui-monospace, monospace' }}>
                      {modbusRef(fc, startAddr + i)}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 16 }}>2B</span>
                    <span style={{ fontSize: 12, flex: 1, color: 'var(--text)', fontWeight: 500 }}>
                      {label || 'Reg'} {modbusRef(fc, startAddr + i)}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                      {sampleDecode(regDataType, regScale, regOffset, regUnit)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>{regWidget}</span>
                  </div>
                ))}
                {count > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingTop: 4 }}>+ {count - 3} more register{count - 3 !== 1 ? 's' : ''}…</div>
                )}
              </div>
            </div>

            <button onClick={addGroup} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              + Add Group
            </button>

            {added && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', fontSize: 12, color: 'var(--success)' }}>
                <span>✓</span>
                <span><strong>"{added}"</strong> added — next start: {modbusRef(fc, startAddr)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  )
}

function RegField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
  padding: '8px 10px', color: 'var(--text)', fontSize: 13, width: '100%',
  outline: 'none', boxSizing: 'border-box'
}

const inp: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '5px 7px', color: 'var(--text)', fontSize: 12, width: '100%',
  outline: 'none', boxSizing: 'border-box'
}

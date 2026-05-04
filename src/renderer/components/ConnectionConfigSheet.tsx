import React, { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useWorkspaceStore } from '../store/workspace'
import type { ConnectionConfig, Protocol } from '../../shared/types'

interface Props {
  initial: ConnectionConfig | null
  onClose: () => void
}

export default function ConnectionConfigSheet({ initial, onClose }: Props): React.JSX.Element {
  const { addConnection, updateConnection } = useWorkspaceStore()
  const [protocol, setProtocol] = useState<Protocol>(initial?.protocol ?? 'tcp')
  const [name, setName] = useState(initial?.name ?? '')
  const [host, setHost] = useState(initial?.host ?? '127.0.0.1')
  const [port, setPort] = useState(initial?.port ?? 502)
  const [unitId, setUnitId] = useState(initial?.unitId ?? 1)
  const [serialPort, setSerialPort] = useState(initial?.serialPort ?? '')
  const [baudRate, setBaudRate] = useState(initial?.baudRate ?? 9600)
  const [dataBits, setDataBits] = useState<5|6|7|8>(initial?.dataBits ?? 8)
  const [stopBits, setStopBits] = useState<1|2>(initial?.stopBits ?? 1)
  const [parity, setParity] = useState(initial?.parity ?? 'none')
  const [flowControl, setFlowControl] = useState(initial?.flowControl ?? 'none')
  const [slaveId, setSlaveId] = useState(initial?.slaveId ?? 1)
  const [pollIntervalMs, setPollIntervalMs] = useState(initial?.pollIntervalMs ?? 1000)

  const handleSave = async () => {
    const config: ConnectionConfig = {
      id: initial?.id ?? uuid(),
      name: name.trim() || (protocol === 'tcp' ? `${host}:${port}` : serialPort || 'New Connection'),
      protocol,
      ...(protocol === 'tcp' ? { host, port, unitId } : { serialPort, baudRate, dataBits, stopBits, parity: parity as any, flowControl: flowControl as any, slaveId }),
      pollIntervalMs,
      registerGroups: initial?.registerGroups ?? [],
    }
    if (initial) updateConnection(initial.id, config)
    else addConnection(config)
    await window.api.connectConnection(config)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 400, background: 'var(--surface)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{initial ? 'Edit' : 'New'} Connection</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
        </div>

        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My PLC" style={inputStyle} />
        </Field>

        <Field label="Protocol">
          <select value={protocol} onChange={e => setProtocol(e.target.value as Protocol)} style={inputStyle}>
            <option value="tcp">Modbus TCP/IP</option>
            <option value="rtu">Modbus RTU (Serial)</option>
            <option value="ascii">Modbus ASCII (Serial)</option>
          </select>
        </Field>

        {protocol === 'tcp' ? (
          <>
            <Field label="Host / IP">
              <input value={host} onChange={e => setHost(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Port">
              <input type="number" value={port} onChange={e => setPort(+e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Unit ID (Slave Address)">
              <input type="number" value={unitId} onChange={e => setUnitId(+e.target.value)} min={0} max={247} style={inputStyle} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Serial Port">
              <input value={serialPort} onChange={e => setSerialPort(e.target.value)} placeholder="/dev/ttyUSB0 or COM3" style={inputStyle} />
            </Field>
            <Field label="Baud Rate">
              <select value={baudRate} onChange={e => setBaudRate(+e.target.value)} style={inputStyle}>
                {[1200,2400,4800,9600,19200,38400,57600,115200].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Data Bits">
                <select value={dataBits} onChange={e => setDataBits(+e.target.value as 5|6|7|8)} style={inputStyle}>
                  {[5,6,7,8].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Stop Bits">
                <select value={stopBits} onChange={e => setStopBits(+e.target.value as 1|2)} style={inputStyle}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </Field>
            </div>
            <Field label="Parity">
              <select value={parity} onChange={e => setParity(e.target.value)} style={inputStyle}>
                {['none','even','odd','mark','space'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Flow Control">
              <select value={flowControl} onChange={e => setFlowControl(e.target.value)} style={inputStyle}>
                {['none','rts-cts','xon-xoff'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Slave ID">
              <input type="number" value={slaveId} onChange={e => setSlaveId(+e.target.value)} min={1} max={247} style={inputStyle} />
            </Field>
          </>
        )}

        <Field label="Poll Interval (ms)">
          <input type="number" value={pollIntervalMs} onChange={e => setPollIntervalMs(Math.max(50, +e.target.value))} min={50} style={inputStyle} />
        </Field>

        <button onClick={handleSave} style={{
          background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)',
          padding: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14, marginTop: 4
        }}>
          {initial ? 'Save Changes' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '7px 10px', color: 'var(--text)', fontSize: 13, width: '100%',
  outline: 'none'
}

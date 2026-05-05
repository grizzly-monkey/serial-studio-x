import React, { useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import { useWorkspaceStore } from '../store/workspace'
import SlaveScanner from './SlaveScanner'
import type { ConnectionConfig, Protocol } from '../../shared/types'

interface Props {
  initial: ConnectionConfig | null
  onClose: () => void
}

const COMMON_BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

function pollLabel(ms: number): string {
  if (ms >= 3600000) return '1h'
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`
}

export default function ConnectionConfigSheet({ initial, onClose }: Props): React.JSX.Element {
  const { addConnection, updateConnection, workspace } = useWorkspaceStore()

  // Ports already assigned to other connections (can't share a serial port)
  const usedPorts = new Set(
    workspace.connections
      .filter(c => c.id !== initial?.id && c.serialPort)
      .map(c => c.serialPort!)
  )
  const [protocol, setProtocol] = useState<Protocol>(initial?.protocol ?? 'tcp')
  const [name, setName] = useState(initial?.name ?? '')
  const [host, setHost] = useState(initial?.host ?? '127.0.0.1')
  const [port, setPort] = useState(initial?.port ?? 502)
  const [unitId, setUnitId] = useState(initial?.unitId ?? 1)
  const [serialPort, setSerialPort] = useState(initial?.serialPort ?? '')
  const [availablePorts, setAvailablePorts] = useState<Array<{ path: string; label: string }>>([])
  const [portsLoading, setPortsLoading] = useState(false)
  const [baudRateStr, setBaudRateStr] = useState(String(initial?.baudRate ?? 9600))
  const [dataBits, setDataBits] = useState<5|6|7|8>(initial?.dataBits ?? 8)
  const [stopBits, setStopBits] = useState<1|2>(initial?.stopBits ?? 1)
  const [parity, setParity] = useState(initial?.parity ?? 'none')
  const [flowControl, setFlowControl] = useState(initial?.flowControl ?? 'none')
  const [slaveId, setSlaveId] = useState(initial?.slaveId ?? 1)
  const [rs485Mode, setRs485Mode] = useState(initial?.rs485Mode ?? false)
  const [echoRemoval, setEchoRemoval] = useState(initial?.echoRemoval ?? false)
  const [responseTimeoutMs, setResponseTimeoutMs] = useState(initial?.responseTimeoutMs ?? '')
  const [interMessageDelayMs, setInterMessageDelayMs] = useState(initial?.interMessageDelayMs ?? '')
  const [pollIntervalMs, setPollIntervalMs] = useState(initial?.pollIntervalMs ?? 5000)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const isSerial = protocol === 'rtu' || protocol === 'ascii'
  const isNetwork = protocol === 'tcp' || protocol === 'udp' || protocol === 'rtu-tcp'
  const isTerminal = protocol === 'serial-terminal'

  const loadPorts = async () => {
    setPortsLoading(true)
    try {
      const ports = await window.api.listSerialPorts()
      setAvailablePorts(ports)
      if (ports.length > 0 && !serialPort) setSerialPort(ports[0].path)
    } finally {
      setPortsLoading(false)
    }
  }

  useEffect(() => {
    if (isSerial || isTerminal) loadPorts()
  }, [protocol])

  const handleSave = async () => {
    const baudRate = parseInt(baudRateStr) || 9600
    const config: ConnectionConfig = {
      id: initial?.id ?? uuid(),
      name: name.trim() || (isNetwork ? `${host}:${port}` : serialPort || 'New Connection'),
      protocol,
      ...(isNetwork
        ? { host, port, unitId }
        : { serialPort, baudRate, dataBits, stopBits, parity: parity as ConnectionConfig['parity'], flowControl: flowControl as ConnectionConfig['flowControl'], slaveId, rs485Mode, echoRemoval }
      ),
      pollIntervalMs: isTerminal ? 0 : pollIntervalMs,
      ...(responseTimeoutMs !== '' && !isTerminal ? { responseTimeoutMs: Number(responseTimeoutMs) } : {}),
      ...(interMessageDelayMs !== '' && !isTerminal ? { interMessageDelayMs: Number(interMessageDelayMs) } : {}),
      registerGroups: initial?.registerGroups ?? [],
    }
    if (initial) {
      updateConnection(initial.id, config)
    } else {
      addConnection(config)
    }
    await window.api.connectConnection(config)
    onClose()
  }

  const scanConfig: ConnectionConfig = {
    id: initial?.id ?? '',
    name: name.trim() || serialPort,
    protocol,
    serialPort, baudRate: parseInt(baudRateStr) || 9600, dataBits, stopBits,
    parity: parity as ConnectionConfig['parity'],
    flowControl: flowControl as ConnectionConfig['flowControl'],
    slaveId,
    pollIntervalMs,
    registerGroups: [],
  }

  return (
    <>
    {scannerOpen && (
      <SlaveScanner
        config={scanConfig}
        onUse={(id) => setSlaveId(id)}
        onClose={() => setScannerOpen(false)}
      />
    )}
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 420, background: 'var(--surface)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{initial ? 'Edit' : 'New'} Connection</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
        </div>

        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My PLC" style={inputStyle} />
        </Field>

        <Field label="Protocol">
          <select value={protocol} onChange={e => setProtocol(e.target.value as Protocol)} style={inputStyle}>
            <optgroup label="Modbus">
              <option value="tcp">Modbus TCP/IP</option>
              <option value="udp">Modbus UDP</option>
              <option value="rtu-tcp">Modbus RTU over TCP</option>
              <option value="rtu">Modbus RTU (Serial)</option>
              <option value="ascii">Modbus ASCII (Serial)</option>
            </optgroup>
            <optgroup label="Serial Terminal">
              <option value="serial-terminal">USB/Serial Terminal (raw)</option>
            </optgroup>
          </select>
        </Field>

        {isNetwork ? (
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
        ) : isTerminal ? (
          <>
            {/* Serial Terminal — no Slave ID, no poll interval */}
            <Field label="Serial Port">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={serialPort} onChange={e => setSerialPort(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {availablePorts.length === 0 && <option value="">{portsLoading ? 'Scanning…' : 'No ports found'}</option>}
                  {availablePorts.map(p => (
                    <option key={p.path} value={p.path} disabled={usedPorts.has(p.path)}>
                      {usedPorts.has(p.path) ? `${p.label} (in use)` : p.label}
                    </option>
                  ))}
                  {serialPort && !availablePorts.some(p => p.path === serialPort) && <option value={serialPort}>{serialPort}</option>}
                </select>
                <button onClick={loadPorts} disabled={portsLoading} title="Refresh"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 13, flexShrink: 0, opacity: portsLoading ? 0.5 : 1 }}>↺</button>
              </div>
            </Field>
            <Field label="Baud Rate">
              <input list="baud-options-term" value={baudRateStr} onChange={e => setBaudRateStr(e.target.value)} placeholder="9600" style={inputStyle} />
              <datalist id="baud-options-term">{COMMON_BAUDS.map(b => <option key={b} value={b} />)}</datalist>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Data Bits">
                <select value={dataBits} onChange={e => setDataBits(+e.target.value as 5|6|7|8)} style={inputStyle}>
                  {[5,6,7,8].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Stop Bits">
                <select value={stopBits} onChange={e => setStopBits(+e.target.value as 1|2)} style={inputStyle}>
                  <option value={1}>1</option><option value={2}>2</option>
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
          </>
        ) : (
          <>
            <Field label="Serial Port">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={serialPort} onChange={e => setSerialPort(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {availablePorts.length === 0 && (
                    <option value="">{portsLoading ? 'Scanning…' : 'No ports found'}</option>
                  )}
                  {availablePorts.map(p => (
                    <option key={p.path} value={p.path} disabled={usedPorts.has(p.path)}>
                      {usedPorts.has(p.path) ? `${p.label} (in use)` : p.label}
                    </option>
                  ))}
                  {serialPort && !availablePorts.some(p => p.path === serialPort) && (
                    <option value={serialPort}>{serialPort}</option>
                  )}
                </select>
                <button onClick={loadPorts} disabled={portsLoading} title="Refresh port list"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 13, flexShrink: 0, opacity: portsLoading ? 0.5 : 1 }}>
                  ↺
                </button>
              </div>
            </Field>
            <Field label="Baud Rate">
              <div style={{ position: 'relative' }}>
                <input
                  list="baud-options"
                  value={baudRateStr}
                  onChange={e => setBaudRateStr(e.target.value)}
                  placeholder="9600"
                  style={inputStyle}
                />
                <datalist id="baud-options">
                  {COMMON_BAUDS.map(b => <option key={b} value={b} />)}
                </datalist>
              </div>
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
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" value={slaveId} onChange={e => setSlaveId(+e.target.value)} min={0} max={247} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setScannerOpen(true)} title="Scan for slave addresses"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', cursor: 'pointer', color: 'var(--primary)', fontSize: 13, flexShrink: 0, fontWeight: 600 }}>
                  🔍 Scan
                </button>
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={rs485Mode} onChange={e => setRs485Mode(e.target.checked)} />
                RS-485 Mode (RTS)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={echoRemoval} onChange={e => setEchoRemoval(e.target.checked)} />
                Echo Removal
              </label>
            </div>
          </>
        )}

        {!isTerminal && (
          <>
            <Field label={`Poll Interval · ${pollLabel(pollIntervalMs)}`}>
              <input
                type="number"
                value={pollIntervalMs}
                onChange={e => setPollIntervalMs(Math.max(2000, Math.min(3_600_000, +e.target.value)))}
                min={2000} max={3600000} step={1000}
                style={inputStyle}
              />
            </Field>

            <button
              onClick={() => setShowAdvanced(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, textAlign: 'left', padding: 0 }}>
              {showAdvanced ? '▼' : '▶'} Advanced Timing
            </button>

            {showAdvanced && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Response Timeout (ms)">
                  <input type="number" value={responseTimeoutMs} onChange={e => setResponseTimeoutMs(e.target.value)}
                    placeholder="auto" min={200} max={30000} style={inputStyle} />
                </Field>
                <Field label="Inter-Message Delay (ms)">
                  <input type="number" value={interMessageDelayMs} onChange={e => setInterMessageDelayMs(e.target.value)}
                    placeholder="0" min={0} max={5000} style={inputStyle} />
                </Field>
              </div>
            )}
          </>
        )}

        <button onClick={handleSave} style={{
          background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)',
          padding: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14, marginTop: 4
        }}>
          {initial ? 'Save Changes' : 'Connect'}
        </button>
      </div>
    </div>
    </>
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
  outline: 'none', boxSizing: 'border-box'
}

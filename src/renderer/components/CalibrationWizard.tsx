import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'

// Modbus protocol addresses (0-indexed: ref - 40001)
const PH_ADDR = {
  zeroCal:    4096, // 44097 – place in pH 6.86, write 0
  slopeAcid:  4098, // 44099 – place in pH 4.00, write 0
  slopeAlk:   4100, // 44101 – place in pH 9.18, write 0
  tempCal:    4112, // 44113 – write actual_temp × 10
  reset:      8224, // 48225 – factory reset, write 0
}
const EC_ADDR = {
  zeroCal:  4096, // 44097 – in air or dilute solution, write 0
  slopeCal: 4100, // 44101 – in standard solution, write actual μS/cm value
  tempCal:  4112, // 44113 – write actual_temp × 10
  reset:    8224, // 48225 – factory reset, write 0
}

const PH_ID = 'phg206a-default'
const EC_ID = 'ddm206a-default'

type StepStatus = 'idle' | 'running' | 'ok' | 'error'

interface StepState { status: StepStatus; msg: string }
type Steps<K extends string> = Record<K, StepState>

const idle = (): StepState => ({ status: 'idle', msg: '' })

type PhStep = 'zeroCal' | 'slopeAcid' | 'slopeAlk' | 'tempCal' | 'reset'
type EcStep = 'zeroCal' | 'slopeCal' | 'tempCal' | 'reset'

async function applyWrite(
  connectionId: string,
  address: number,
  value: number
): Promise<void> {
  await window.api.writeRegister(connectionId, 6, address, value)
  await new Promise(r => setTimeout(r, 600))
}

const step: React.CSSProperties = {
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '14px 16px', marginBottom: 10,
  display: 'flex', flexDirection: 'column', gap: 8,
}

function StepCard({
  number, title, instruction, note, status, onApply, extra,
}: {
  number: number
  title: string
  instruction: string
  note?: string
  status: StepStatus
  onApply: () => void
  extra?: React.ReactNode
}) {
  const borderColor =
    status === 'ok' ? 'var(--success, #22c55e)' :
    status === 'error' ? 'var(--danger, #ef4444)' :
    status === 'running' ? 'var(--primary)' :
    'var(--border)'

  return (
    <div style={{ ...step, borderLeft: `3px solid ${borderColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: 'var(--primary)', color: '#fff', borderRadius: '50%',
          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{number}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</span>
        {status === 'ok' && <span style={{ marginLeft: 'auto', color: 'var(--success, #22c55e)', fontSize: 12, fontWeight: 700 }}>Applied</span>}
        {status === 'error' && <span style={{ marginLeft: 'auto', color: 'var(--danger, #ef4444)', fontSize: 12, fontWeight: 700 }}>Failed</span>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{instruction}</p>
      {note && <p style={{ margin: 0, fontSize: 11, color: 'var(--primary)', lineHeight: 1.4 }}>{note}</p>}
      {extra}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onApply}
          disabled={status === 'running'}
          style={{
            background: status === 'ok' ? 'var(--surface)' : 'var(--primary)',
            color: status === 'ok' ? 'var(--text-muted)' : '#fff',
            border: `1px solid ${status === 'ok' ? 'var(--border)' : 'var(--primary)'}`,
            borderRadius: 6, padding: '6px 16px', cursor: status === 'running' ? 'wait' : 'pointer',
            fontWeight: 700, fontSize: 12,
          }}
        >
          {status === 'running' ? 'Applying...' : status === 'ok' ? 'Re-apply' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

function LiveReading({ connectionId, addr, label, unit }: {
  connectionId: string; addr: number; label: string; unit: string
}) {
  const val = useConnectionsStore(s => s.connections[connectionId]?.registerValues[addr]?.decoded)
  if (val === undefined) return null
  const display = typeof val === 'number' ? val.toFixed(2) : String(val)
  return (
    <span style={{
      fontSize: 11, background: 'var(--primary-light)', color: 'var(--primary)',
      border: '1px solid var(--primary)44', borderRadius: 4, padding: '2px 8px',
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      {label}: {display} {unit}
    </span>
  )
}

function PhCalibration({ onReset }: { onReset: () => void }) {
  const connStatus = useConnectionsStore(s => s.connections[PH_ID]?.status ?? 'idle')
  const connected = connStatus === 'connected'

  const [steps, setSteps] = useState<Steps<PhStep>>({
    zeroCal:   idle(), slopeAcid: idle(), slopeAlk: idle(), tempCal: idle(), reset: idle(),
  })
  const [tempInput, setTempInput] = useState('25.0')
  const [showReset, setShowReset] = useState(false)

  function setStep(key: PhStep, s: Partial<StepState>) {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...s } }))
  }

  async function run(key: PhStep, address: number, value: number) {
    if (!connected) { setStep(key, { status: 'error', msg: 'Sensor not connected' }); return }
    setStep(key, { status: 'running', msg: '' })
    try {
      await applyWrite(PH_ID, address, value)
      setStep(key, { status: 'ok', msg: '' })
    } catch (e) {
      setStep(key, { status: 'error', msg: String(e) })
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
          background: connected ? '#16a34a22' : '#dc262622',
          color: connected ? '#16a34a' : '#dc2626',
          border: `1px solid ${connected ? '#16a34a' : '#dc2626'}44`,
        }}>
          {connected ? 'Connected' : connStatus.toUpperCase()}
        </span>
        <LiveReading connectionId={PH_ID} addr={0} label="pH" unit="pH" />
        <LiveReading connectionId={PH_ID} addr={2} label="Temp" unit="°C" />
      </div>

      <StepCard
        number={1} title="Zero Calibration — pH 6.86"
        instruction="Prepare a pH 6.86 buffer solution (250 mL distilled water + calibration powder). Submerge the sensor so at least 1/3 is in solution. Wait 3–5 minutes until the live reading is stable, then apply."
        note="Writes 0 to reg 44097 (0x1000)"
        status={steps.zeroCal.status}
        onApply={() => run('zeroCal', PH_ADDR.zeroCal, 0)}
      />
      <StepCard
        number={2} title="Slope — Acid (pH 4.00)"
        instruction="Rinse sensor with distilled water and blot dry. Prepare a pH 4.00 buffer solution. Submerge the sensor, wait 3–5 minutes until stable, then apply."
        note="Writes 0 to reg 44099 (0x1002)"
        status={steps.slopeAcid.status}
        onApply={() => run('slopeAcid', PH_ADDR.slopeAcid, 0)}
      />
      <StepCard
        number={3} title="Slope — Alkali (pH 9.18)"
        instruction="Rinse sensor with distilled water and blot dry. Prepare a pH 9.18 buffer solution. Submerge the sensor, wait 3–5 minutes until stable, then apply. (Do acid OR alkali slope — or both for full 2-point calibration.)"
        note="Writes 0 to reg 44101 (0x1004)"
        status={steps.slopeAlk.status}
        onApply={() => run('slopeAlk', PH_ADDR.slopeAlk, 0)}
      />
      <StepCard
        number={4} title="Temperature Calibration (optional)"
        instruction="If the live temperature reading differs from a trusted thermometer, enter the actual temperature and apply to correct the offset."
        status={steps.tempCal.status}
        onApply={() => run('tempCal', PH_ADDR.tempCal, Math.round(parseFloat(tempInput) * 10))}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Actual temp (°C):</label>
            <input
              type="number" step="0.1" value={tempInput}
              onChange={e => setTempInput(e.target.value)}
              style={{
                width: 80, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              → writes {Math.round(parseFloat(tempInput || '0') * 10)} to reg 44113
            </span>
          </div>
        }
      />

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
        <button
          onClick={() => setShowReset(r => !r)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600,
          }}
        >
          {showReset ? '▾' : '▸'} Factory Reset (danger zone)
        </button>
        {showReset && (
          <div style={{ marginTop: 10, padding: 12, background: '#ef444411', border: '1px solid #ef444444', borderRadius: 6 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              Restores all calibration values to factory defaults. The sensor must be recalibrated afterwards.
              Writes 0 to reg 48225 (0x2020).
            </p>
            <button
              onClick={async () => {
                if (!connected) return
                setStep('reset', { status: 'running' })
                await applyWrite(PH_ID, PH_ADDR.reset, 0)
                setStep('reset', { status: 'ok' })
                onReset()
              }}
              style={{
                background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              }}
            >
              {steps.reset.status === 'running' ? 'Resetting...' : 'Factory Reset'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EcCalibration({ onReset }: { onReset: () => void }) {
  const connStatus = useConnectionsStore(s => s.connections[EC_ID]?.status ?? 'idle')
  const connected = connStatus === 'connected'

  const [steps, setSteps] = useState<Steps<EcStep>>({
    zeroCal: idle(), slopeCal: idle(), tempCal: idle(), reset: idle(),
  })
  const [slopeInput, setSlopeInput] = useState('1413')
  const [tempInput, setTempInput] = useState('25.0')
  const [showReset, setShowReset] = useState(false)

  function setStep(key: EcStep, s: Partial<StepState>) {
    setSteps(prev => ({ ...prev, [key]: { ...prev[key], ...s } }))
  }

  async function run(key: EcStep, address: number, value: number) {
    if (!connected) { setStep(key, { status: 'error', msg: 'Sensor not connected' }); return }
    setStep(key, { status: 'running', msg: '' })
    try {
      await applyWrite(EC_ID, address, value)
      setStep(key, { status: 'ok', msg: '' })
    } catch (e) {
      setStep(key, { status: 'error', msg: String(e) })
    }
  }

  const slopeWriteValue = parseInt(slopeInput) || 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
          background: connected ? '#16a34a22' : '#dc262622',
          color: connected ? '#16a34a' : '#dc2626',
          border: `1px solid ${connected ? '#16a34a' : '#dc2626'}44`,
        }}>
          {connected ? 'Connected' : connStatus.toUpperCase()}
        </span>
        <LiveReading connectionId={EC_ID} addr={0} label="EC" unit="μS/cm" />
        <LiveReading connectionId={EC_ID} addr={2} label="Temp" unit="°C" />
      </div>

      <StepCard
        number={1} title="Zero Calibration — In Air"
        instruction="Rinse the sensor with distilled water and blot dry with filter paper. Power on the sensor and hold it in open air for ~3 minutes until the reading stabilises, then apply."
        note="Writes 0 to reg 44097 (0x1000). Valid for 0–200 μS/cm and 0–5000 μS/cm ranges."
        status={steps.zeroCal.status}
        onApply={() => run('zeroCal', EC_ADDR.zeroCal, 0)}
      />
      <StepCard
        number={2} title="Slope Calibration — Standard Solution"
        instruction="Place the electrode vertically in a known standard solution (between 10% full-scale and full-scale). Keep the electrode at least 2 cm from the bottom and side walls. Wait until the reading is stable, enter the exact conductivity of your standard solution below, then apply."
        note="For 0–5000 μS/cm range: writes the μS/cm value directly to reg 44101 (0x1004)."
        status={steps.slopeCal.status}
        onApply={() => run('slopeCal', EC_ADDR.slopeCal, slopeWriteValue)}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Standard solution (μS/cm):</label>
            <input
              type="number" step="1" value={slopeInput}
              onChange={e => setSlopeInput(e.target.value)}
              style={{
                width: 90, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              → writes {slopeWriteValue} to reg 44101
            </span>
          </div>
        }
      />
      <StepCard
        number={3} title="Temperature Calibration (optional)"
        instruction="If the live temperature reading differs from a trusted thermometer, enter the actual temperature and apply to correct the offset."
        status={steps.tempCal.status}
        onApply={() => run('tempCal', EC_ADDR.tempCal, Math.round(parseFloat(tempInput) * 10))}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Actual temp (°C):</label>
            <input
              type="number" step="0.1" value={tempInput}
              onChange={e => setTempInput(e.target.value)}
              style={{
                width: 80, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              → writes {Math.round(parseFloat(tempInput || '0') * 10)} to reg 44113
            </span>
          </div>
        }
      />

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
        <button
          onClick={() => setShowReset(r => !r)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600,
          }}
        >
          {showReset ? '▾' : '▸'} Factory Reset (danger zone)
        </button>
        {showReset && (
          <div style={{ marginTop: 10, padding: 12, background: '#ef444411', border: '1px solid #ef444444', borderRadius: 6 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              Restores all calibration values to factory defaults. The sensor must be recalibrated afterwards.
              Writes 0 to reg 48225 (0x2020).
            </p>
            <button
              onClick={async () => {
                if (!connected) return
                setStep('reset', { status: 'running' })
                await applyWrite(EC_ID, EC_ADDR.reset, 0)
                setStep('reset', { status: 'ok' })
                onReset()
              }}
              style={{
                background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              }}
            >
              {steps.reset.status === 'running' ? 'Resetting...' : 'Factory Reset'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  onBack: () => void
  onClose: () => void
}

export default function CalibrationWizard({ onBack, onClose }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'ph' | 'ec'>('ph')

  const tab_btn = (active: boolean): React.CSSProperties => ({
    padding: '7px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
    background: active ? 'var(--primary)' : 'var(--surface-2)',
    color: active ? '#fff' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    borderRadius: 6,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 6,
          padding: '4px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
        }}>
          ← Back
        </button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--primary)' }}>CALIBRATION WIZARD</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Sensor calibration requires the sensor to be connected and polling
          </div>
        </div>
        <button onClick={onClose} style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0', flexShrink: 0 }}>
        <button style={tab_btn(tab === 'ph')} onClick={() => setTab('ph')}>
          pH — PHG-206A
        </button>
        <button style={tab_btn(tab === 'ec')} onClick={() => setTab('ec')}>
          EC — DDM-206A
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
        {tab === 'ph'
          ? <PhCalibration onReset={() => {}} />
          : <EcCalibration onReset={() => {}} />
        }
      </div>
    </div>
  )
}

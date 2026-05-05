import React, { useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import GuidedStep from './GuidedStep'

// Modbus protocol addresses (0-indexed: ref − 40001)
const PH_ADDR = {
  zeroCal:   4096, // 44097 – place in pH 6.86, write 0
  slopeAcid: 4098, // 44099 – place in pH 4.00, write 0
  slopeAlk:  4100, // 44101 – place in pH 9.18, write 0
  tempCal:   4112, // 44113 – write actual_temp × 10
  reset:     8224, // 48225 – factory reset, write 0
}
const EC_ADDR = {
  zeroCal:  4096, // 44097 – in air, write 0
  slopeCal: 4100, // 44101 – in standard solution, write μS/cm value
  tempCal:  4112, // 44113 – write actual_temp × 10
  reset:    8224, // 48225 – factory reset, write 0
}

const PH_ID = 'phg206a-default'
const EC_ID = 'ddm206a-default'

async function applyWrite(connectionId: string, address: number, value: number): Promise<void> {
  await window.api.writeRegister(connectionId, 6, address, value)
  await new Promise(r => setTimeout(r, 600))
}

type Outcome = 'pending' | 'done' | 'skipped'

interface StepConfig {
  stepperTitle: string
  title: string
  instruction: string
  timerSeconds: number
  isOptional: boolean
  onCalibrate: (input?: number) => Promise<void>
  hasInput?: boolean
  inputLabel?: string
  inputStep?: number
  inputInitial?: string   // static default for the input field
  useTempReading?: boolean  // show addr-2 (temp) as the live value instead of addr-0
}

// ── StepperBar ────────────────────────────────────────────────────────

function StepperBar({ steps, currentIndex, outcomes }: {
  steps: Array<{ title: string; optional?: boolean }>
  currentIndex: number
  outcomes: Outcome[]
}) {
  const SUCCESS = '#22c55e'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      padding: '10px 24px', background: 'var(--surface-2)',
      borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 64 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: outcomes[i] === 'done' ? SUCCESS : i === currentIndex ? 'var(--primary)' : 'transparent',
              border: outcomes[i] === 'done' || i === currentIndex ? 'none' : '1px solid var(--border)',
              color: outcomes[i] === 'done' || i === currentIndex ? '#fff' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {outcomes[i] === 'done' ? '✓' : outcomes[i] === 'skipped' ? '—' : i + 1}
            </div>
            <div style={{
              fontSize: 9, textAlign: 'center', maxWidth: 58,
              color: i === currentIndex ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: i === currentIndex ? 700 : 400, lineHeight: 1.3,
            }}>
              {step.title}
            </div>
            {step.optional && (
              <span style={{
                fontSize: 8, color: '#d29922', background: '#d2992211',
                border: '1px solid #d2992244', borderRadius: 3, padding: '1px 4px',
              }}>optional</span>
            )}
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2, marginTop: 11,
              background: outcomes[i] === 'done' ? SUCCESS : 'var(--border)',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ── PhCalibration ────────────────────────────────────────────────────

const PH_STEPS: StepConfig[] = [
  {
    stepperTitle: 'Zero Cal',
    title: 'Zero Calibration — pH 6.86',
    instruction: 'Prepare a pH 6.86 buffer solution and submerge the sensor so at least 1/3 is in solution. Wait for the live reading to stabilise before calibrating.',
    timerSeconds: 300,
    isOptional: false,
    onCalibrate: async () => { await applyWrite(PH_ID, PH_ADDR.zeroCal, 0) },
  },
  {
    stepperTitle: 'Acid',
    title: 'Acid Slope — pH 4.00',
    instruction: 'Rinse sensor with distilled water and blot dry. Submerge in pH 4.00 buffer solution. Wait for the reading to stabilise.',
    timerSeconds: 300,
    isOptional: false,
    onCalibrate: async () => { await applyWrite(PH_ID, PH_ADDR.slopeAcid, 0) },
  },
  {
    stepperTitle: 'Alkali',
    title: 'Alkali Slope — pH 9.18',
    instruction: 'Rinse sensor with distilled water and blot dry. Submerge in pH 9.18 buffer solution. Wait for the reading to stabilise. Skip to omit — acid slope alone is sufficient for most use cases.',
    timerSeconds: 300,
    isOptional: true,
    onCalibrate: async () => { await applyWrite(PH_ID, PH_ADDR.slopeAlk, 0) },
  },
  {
    stepperTitle: 'Temp',
    title: 'Temperature Calibration',
    instruction: 'Compare the live temperature reading against a reference thermometer. After the 30-second wait, enter the actual temperature below and calibrate.',
    timerSeconds: 30,
    isOptional: true,
    hasInput: true,
    inputLabel: 'Actual temp (°C)',
    inputStep: 0.1,
    inputInitial: '25.0',
    useTempReading: true,
    onCalibrate: async (t) => { await applyWrite(PH_ID, PH_ADDR.tempCal, Math.round((t ?? 0) * 10)) },
  },
]

function PhCalibration({ onReset }: { onReset: () => void }) {
  const connStatus = useConnectionsStore(s => s.connections[PH_ID]?.status ?? 'idle')
  const rawPh = useConnectionsStore(s => s.connections[PH_ID]?.registerValues[0]?.decoded)
  const rawTemp = useConnectionsStore(s => s.connections[PH_ID]?.registerValues[2]?.decoded)
  const isConnected = connStatus === 'connected'
  const phValue = typeof rawPh === 'number' ? rawPh : undefined
  const tempValue = typeof rawTemp === 'number' ? rawTemp : undefined

  const [currentStep, setCurrentStep] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>(Array(PH_STEPS.length).fill('pending'))
  const [doneLabels, setDoneLabels] = useState<Array<string | undefined>>(Array(PH_STEPS.length).fill(undefined))
  const [showReset, setShowReset] = useState(false)

  function handleComplete(i: number, reading: number) {
    const isTempStep = PH_STEPS[i].useTempReading
    const label = `Calibrated at ${reading.toFixed(isTempStep ? 1 : 2)} ${isTempStep ? '°C' : 'pH'}`
    setDoneLabels(prev => { const n = [...prev]; n[i] = label; return n })
    setOutcomes(prev => { const n = [...prev]; n[i] = 'done'; return n })
    setCurrentStep(i + 1)
  }

  function handleSkip(i: number) {
    setOutcomes(prev => { const n = [...prev]; n[i] = 'skipped'; return n })
    setCurrentStep(i + 1)
  }

  const allDone = currentStep >= PH_STEPS.length

  return (
    <div>
      <StepperBar
        steps={PH_STEPS.map(s => ({ title: s.stepperTitle, optional: s.isOptional }))}
        currentIndex={Math.min(currentStep, PH_STEPS.length - 1)}
        outcomes={outcomes}
      />

      {/* Connection status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: isConnected ? '#22c55e' : '#ef4444' }}>
          PHG-206A {isConnected ? 'Connected' : connStatus.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Slave ID 2 · polling every 5s
        </span>
      </div>

      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allDone ? (
          <div style={{
            border: '1px solid #22c55e44', borderLeft: '3px solid #22c55e',
            borderRadius: 8, padding: '16px 20px', background: '#22c55e11', textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e', marginBottom: 4 }}>
              pH Calibration Complete
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              All calibration values have been saved to the sensor.
            </div>
          </div>
        ) : (
          PH_STEPS.map((step, i) => (
            <GuidedStep
              key={i}
              stepNumber={i + 1}
              title={step.title}
              instruction={step.instruction}
              timerSeconds={step.timerSeconds}
              isOptional={step.isOptional}
              isLocked={i > currentStep}
              isDone={outcomes[i] === 'done'}
              doneLabel={doneLabels[i]}
              isSkipped={outcomes[i] === 'skipped'}
              liveValue={step.useTempReading ? tempValue : phValue}
              liveUnit={step.useTempReading ? '°C' : 'pH'}
              tempValue={step.useTempReading ? undefined : tempValue}
              isConnected={isConnected}
              onCalibrate={step.onCalibrate}
              onComplete={reading => handleComplete(i, reading)}
              onSkip={step.isOptional ? () => handleSkip(i) : undefined}
              hasInput={step.hasInput}
              inputLabel={step.inputLabel}
              inputStep={step.inputStep}
              inputInitial={step.inputInitial}
            />
          ))
        )}
      </div>

      {/* Factory reset */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '0 24px', paddingTop: 12, paddingBottom: 20 }}>
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
          <div style={{
            marginTop: 10, padding: 12,
            background: '#ef444411', border: '1px solid #ef444444', borderRadius: 6,
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              Restores all calibration values to factory defaults. The sensor must be recalibrated afterwards.
              Writes 0 to reg 48225 (0x2020).
            </p>
            <button
              onClick={async () => {
                if (!isConnected) return
                await applyWrite(PH_ID, PH_ADDR.reset, 0)
                onReset()
              }}
              style={{
                background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              }}
            >Factory Reset</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── EcCalibration ────────────────────────────────────────────────────

const EC_STEPS: StepConfig[] = [
  {
    stepperTitle: 'Zero Cal',
    title: 'Zero Calibration — In Air',
    instruction: 'Rinse the sensor with distilled water and blot dry. Hold the sensor in open air and wait for the reading to stabilise.',
    timerSeconds: 180,
    isOptional: false,
    onCalibrate: async () => { await applyWrite(EC_ID, EC_ADDR.zeroCal, 0) },
  },
  {
    stepperTitle: 'Slope',
    title: 'Slope Calibration — Standard Solution',
    instruction: 'Place the electrode vertically in a known standard solution (10%–100% of full scale). Keep at least 2 cm from the bottom and walls. Wait for the reading to stabilise, then enter the exact conductivity of your standard solution below.',
    timerSeconds: 300,
    isOptional: false,
    hasInput: true,
    inputLabel: 'Standard solution (μS/cm)',
    inputStep: 1,
    inputInitial: '1413',
    onCalibrate: async (conductivity) => { await applyWrite(EC_ID, EC_ADDR.slopeCal, Math.round(conductivity ?? 0)) },
  },
  {
    stepperTitle: 'Temp',
    title: 'Temperature Calibration',
    instruction: 'Compare the live temperature reading against a reference thermometer. After the 30-second wait, enter the actual temperature below and calibrate.',
    timerSeconds: 30,
    isOptional: true,
    hasInput: true,
    inputLabel: 'Actual temp (°C)',
    inputStep: 0.1,
    inputInitial: '25.0',
    useTempReading: true,
    onCalibrate: async (t) => { await applyWrite(EC_ID, EC_ADDR.tempCal, Math.round((t ?? 0) * 10)) },
  },
]

function EcCalibration({ onReset }: { onReset: () => void }) {
  const connStatus = useConnectionsStore(s => s.connections[EC_ID]?.status ?? 'idle')
  const rawEc = useConnectionsStore(s => s.connections[EC_ID]?.registerValues[0]?.decoded)
  const rawTemp = useConnectionsStore(s => s.connections[EC_ID]?.registerValues[2]?.decoded)
  const isConnected = connStatus === 'connected'
  const ecValue = typeof rawEc === 'number' ? rawEc : undefined
  const tempValue = typeof rawTemp === 'number' ? rawTemp : undefined

  const [currentStep, setCurrentStep] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>(Array(EC_STEPS.length).fill('pending'))
  const [doneLabels, setDoneLabels] = useState<Array<string | undefined>>(Array(EC_STEPS.length).fill(undefined))
  const [showReset, setShowReset] = useState(false)

  function handleComplete(i: number, reading: number) {
    const isTempStep = EC_STEPS[i].useTempReading
    const label = `Calibrated at ${reading.toFixed(isTempStep ? 1 : 0)} ${isTempStep ? '°C' : 'μS/cm'}`
    setDoneLabels(prev => { const n = [...prev]; n[i] = label; return n })
    setOutcomes(prev => { const n = [...prev]; n[i] = 'done'; return n })
    setCurrentStep(i + 1)
  }

  function handleSkip(i: number) {
    setOutcomes(prev => { const n = [...prev]; n[i] = 'skipped'; return n })
    setCurrentStep(i + 1)
  }

  const allDone = currentStep >= EC_STEPS.length

  return (
    <div>
      <StepperBar
        steps={EC_STEPS.map(s => ({ title: s.stepperTitle, optional: s.isOptional }))}
        currentIndex={Math.min(currentStep, EC_STEPS.length - 1)}
        outcomes={outcomes}
      />

      {/* Connection status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: isConnected ? '#22c55e' : '#ef4444' }}>
          DDM-206A {isConnected ? 'Connected' : connStatus.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Slave ID 1 · polling every 5s
        </span>
      </div>

      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allDone ? (
          <div style={{
            border: '1px solid #22c55e44', borderLeft: '3px solid #22c55e',
            borderRadius: 8, padding: '16px 20px', background: '#22c55e11', textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e', marginBottom: 4 }}>
              EC Calibration Complete
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              All calibration values have been saved to the sensor.
            </div>
          </div>
        ) : (
          EC_STEPS.map((step, i) => (
            <GuidedStep
              key={i}
              stepNumber={i + 1}
              title={step.title}
              instruction={step.instruction}
              timerSeconds={step.timerSeconds}
              isOptional={step.isOptional}
              isLocked={i > currentStep}
              isDone={outcomes[i] === 'done'}
              doneLabel={doneLabels[i]}
              isSkipped={outcomes[i] === 'skipped'}
              liveValue={step.useTempReading ? tempValue : ecValue}
              liveUnit={step.useTempReading ? '°C' : 'μS/cm'}
              tempValue={step.useTempReading ? undefined : tempValue}
              isConnected={isConnected}
              onCalibrate={step.onCalibrate}
              onComplete={reading => handleComplete(i, reading)}
              onSkip={step.isOptional ? () => handleSkip(i) : undefined}
              hasInput={step.hasInput}
              inputLabel={step.inputLabel}
              inputStep={step.inputStep}
              inputInitial={step.inputInitial}
            />
          ))
        )}
      </div>

      {/* Factory reset */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '0 24px', paddingTop: 12, paddingBottom: 20 }}>
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
          <div style={{
            marginTop: 10, padding: 12,
            background: '#ef444411', border: '1px solid #ef444444', borderRadius: 6,
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              Restores all calibration values to factory defaults. The sensor must be recalibrated afterwards.
              Writes 0 to reg 48225 (0x2020).
            </p>
            <button
              onClick={async () => {
                if (!isConnected) return
                await applyWrite(EC_ID, EC_ADDR.reset, 0)
                onReset()
              }}
              style={{
                background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              }}
            >Factory Reset</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CalibrationWizard (main export) ──────────────────────────────────

interface Props {
  onBack: () => void
  onClose: () => void
}

export default function CalibrationWizard({ onBack, onClose }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'ph' | 'ec'>('ph')

  const tabBtn = (active: boolean): React.CSSProperties => ({
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
            Sensor must be connected and polling before calibrating
          </div>
        </div>
        <button onClick={onClose} style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0', flexShrink: 0 }}>
        <button style={tabBtn(tab === 'ph')} onClick={() => setTab('ph')}>pH — PHG-206A</button>
        <button style={tabBtn(tab === 'ec')} onClick={() => setTab('ec')}>EC — DDM-206A</button>
      </div>

      {/* Body — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'ph'
          ? <PhCalibration key="ph" onReset={() => {}} />
          : <EcCalibration key="ec" onReset={() => {}} />
        }
      </div>
    </div>
  )
}

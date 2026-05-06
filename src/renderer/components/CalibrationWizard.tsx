import React, { useEffect, useMemo, useState } from 'react'
import { useConnectionsStore } from '../store/connections'
import { useWorkspaceStore, GROWLOC_CONNECTIONS } from '../store/workspace'
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

// ── FactoryResetSection ───────────────────────────────────────────────

const DANGER = '#ef4444'

function FactoryResetSection({ connectionId, address, isConnected }: {
  connectionId: string
  address: number
  isConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | 'error' | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleReset() {
    setBusy(true)
    setResult(null)
    setErrMsg(null)
    try {
      await applyWrite(connectionId, address, 0)
      setResult('ok')
      setConfirming(false)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setResult('error')
    } finally {
      setBusy(false)
    }
  }

  function handleOpen() {
    setOpen(o => !o)
    setConfirming(false)
    setResult(null)
    setErrMsg(null)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', margin: '0 24px', paddingTop: 12, paddingBottom: 20 }}>
      <button
        onClick={handleOpen}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600,
        }}
      >
        {open ? '▾' : '▸'} Factory Reset (danger zone)
      </button>

      {open && (
        <div style={{
          marginTop: 10, padding: 12,
          background: `${DANGER}11`, border: `1px solid ${DANGER}44`, borderRadius: 6,
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
            Restores all calibration values to factory defaults. The sensor must be fully recalibrated
            afterwards. Writes 0 to reg 48225 (0x2020).
          </p>

          {result === 'ok' && (
            <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 8, fontWeight: 600 }}>
              ✓ Factory reset sent successfully.
            </div>
          )}
          {result === 'error' && (
            <div style={{ fontSize: 11, color: DANGER, marginBottom: 8 }}>
              ✗ Reset failed: {errMsg}
            </div>
          )}

          {!isConnected && (
            <div style={{ fontSize: 11, color: DANGER, marginBottom: 8 }}>
              Sensor not connected — connect before resetting.
            </div>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!isConnected || busy}
              style={{
                background: DANGER, color: '#fff', border: 'none', borderRadius: 6,
                padding: '6px 16px', cursor: (!isConnected || busy) ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 12, opacity: (!isConnected || busy) ? 0.5 : 1,
              }}
            >Factory Reset</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                background: `${DANGER}22`, border: `1px solid ${DANGER}66`,
                borderRadius: 5, padding: '8px 10px',
                fontSize: 11, color: DANGER, fontWeight: 600,
              }}>
                ⚠ This will erase all calibration data on the sensor. Are you sure?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  style={{
                    background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                  }}
                >Cancel</button>
                <button
                  onClick={handleReset}
                  disabled={busy}
                  style={{
                    background: DANGER, color: '#fff', border: 'none', borderRadius: 6,
                    padding: '6px 16px', cursor: busy ? 'wait' : 'pointer',
                    fontWeight: 700, fontSize: 12, opacity: busy ? 0.7 : 1,
                  }}
                >{busy ? 'Resetting…' : 'Yes, reset now'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
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

// ── Step factories ───────────────────────────────────────────────────

function makePHSteps(connId: string): StepConfig[] {
  return [
    {
      stepperTitle: 'Zero Cal',
      title: 'Zero Calibration — pH 6.86',
      instruction: 'Prepare a pH 6.86 buffer solution and submerge the sensor so at least 1/3 is in solution. Wait for the live reading to stabilise before calibrating.',
      timerSeconds: 300, isOptional: false,
      onCalibrate: async () => { await applyWrite(connId, PH_ADDR.zeroCal, 0) },
    },
    {
      stepperTitle: 'Acid',
      title: 'Acid Slope — pH 4.00',
      instruction: 'Rinse sensor with distilled water and blot dry. Submerge in pH 4.00 buffer solution. Wait for the reading to stabilise.',
      timerSeconds: 300, isOptional: false,
      onCalibrate: async () => { await applyWrite(connId, PH_ADDR.slopeAcid, 0) },
    },
    {
      stepperTitle: 'Alkali',
      title: 'Alkali Slope — pH 9.18',
      instruction: 'Rinse sensor with distilled water and blot dry. Submerge in pH 9.18 buffer solution. Wait for the reading to stabilise. Skip to omit — acid slope alone is sufficient for most use cases.',
      timerSeconds: 300, isOptional: true,
      onCalibrate: async () => { await applyWrite(connId, PH_ADDR.slopeAlk, 0) },
    },
    {
      stepperTitle: 'Temp',
      title: 'Temperature Calibration',
      instruction: 'Compare the live temperature reading against a reference thermometer. After the 30-second wait, enter the actual temperature below and calibrate.',
      timerSeconds: 30, isOptional: true,
      hasInput: true, inputLabel: 'Actual temp (°C)', inputStep: 0.1, inputInitial: '25.0',
      useTempReading: true,
      onCalibrate: async (t) => { await applyWrite(connId, PH_ADDR.tempCal, Math.round((t ?? 0) * 10)) },
    },
  ]
}

function makeECSteps(connId: string): StepConfig[] {
  return [
    {
      stepperTitle: 'Zero Cal',
      title: 'Zero Calibration — In Air',
      instruction: 'Rinse the sensor with distilled water and blot dry. Hold the sensor in open air and wait for the reading to stabilise.',
      timerSeconds: 180, isOptional: false,
      onCalibrate: async () => { await applyWrite(connId, EC_ADDR.zeroCal, 0) },
    },
    {
      stepperTitle: 'Slope',
      title: 'Slope Calibration — Standard Solution',
      instruction: 'Place the electrode vertically in a known standard solution (10%–100% of full scale). Keep at least 2 cm from the bottom and walls. Wait for the reading to stabilise, then enter the exact conductivity of your standard solution below.',
      timerSeconds: 300, isOptional: false,
      hasInput: true, inputLabel: 'Standard solution (μS/cm)', inputStep: 1, inputInitial: '1413',
      onCalibrate: async (c) => { await applyWrite(connId, EC_ADDR.slopeCal, Math.round(c ?? 0)) },
    },
    {
      stepperTitle: 'Temp',
      title: 'Temperature Calibration',
      instruction: 'Compare the live temperature reading against a reference thermometer. After the 30-second wait, enter the actual temperature below and calibrate.',
      timerSeconds: 30, isOptional: true,
      hasInput: true, inputLabel: 'Actual temp (°C)', inputStep: 0.1, inputInitial: '25.0',
      useTempReading: true,
      onCalibrate: async (t) => { await applyWrite(connId, EC_ADDR.tempCal, Math.round((t ?? 0) * 10)) },
    },
  ]
}

// ── ConnSelector ─────────────────────────────────────────────────────

function ConnSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  if (connections.length <= 1) return null
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: 'var(--text)', borderRadius: 4,
        padding: '2px 6px', fontSize: 10, cursor: 'pointer',
      }}
    >
      {connections.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

// ── PhCalibration ────────────────────────────────────────────────────

function PhCalibration() {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const defaultId = connections.find(c => c.id === PH_ID)?.id ?? connections[0]?.id ?? PH_ID
  const [connId, setConnId] = useState(defaultId)

  const connStatus = useConnectionsStore(s => s.connections[connId]?.status ?? 'idle')
  const rawPh = useConnectionsStore(s => s.connections[connId]?.registerValues[0]?.decoded)
  const rawTemp = useConnectionsStore(s => s.connections[connId]?.registerValues[2]?.decoded)
  const isConnected = connStatus === 'connected'
  const phValue = typeof rawPh === 'number' ? rawPh : undefined
  const tempValue = typeof rawTemp === 'number' ? rawTemp : undefined

  const steps = useMemo(() => makePHSteps(connId), [connId])
  const [currentStep, setCurrentStep] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>(Array(steps.length).fill('pending'))
  const [doneLabels, setDoneLabels] = useState<Array<string | undefined>>(Array(steps.length).fill(undefined))

  // Reset wizard when connection changes
  useEffect(() => {
    setCurrentStep(0)
    setOutcomes(Array(steps.length).fill('pending'))
    setDoneLabels(Array(steps.length).fill(undefined))
  }, [connId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnChange(id: string) {
    setConnId(id)
  }

  function handleRetry() {
    const config = connections.find(c => c.id === connId)
    if (!config) return
    window.api.disconnectConnection(connId).catch(() => {})
      .finally(() => window.api.connectConnection(config).catch(() => {}))
  }

  function handleComplete(i: number, reading: number) {
    const isTempStep = steps[i].useTempReading
    const label = `Calibrated at ${reading.toFixed(isTempStep ? 1 : 2)} ${isTempStep ? '°C' : 'pH'}`
    setDoneLabels(prev => { const n = [...prev]; n[i] = label; return n })
    setOutcomes(prev => { const n = [...prev]; n[i] = 'done'; return n })
    setCurrentStep(i + 1)
  }

  function handleSkip(i: number) {
    setOutcomes(prev => { const n = [...prev]; n[i] = 'skipped'; return n })
    setCurrentStep(i + 1)
  }

  const allDone = currentStep >= steps.length
  const selectedConn = connections.find(c => c.id === connId)

  return (
    <div>
      <StepperBar
        steps={steps.map(s => ({ title: s.stepperTitle, optional: s.isOptional }))}
        currentIndex={Math.min(currentStep, steps.length - 1)}
        outcomes={outcomes}
      />

      {/* Connection status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: isConnected ? '#22c55e' : DANGER, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: isConnected ? '#22c55e' : DANGER }}>
          {selectedConn?.name ?? connId} {isConnected ? 'Connected' : connStatus.toUpperCase()}
        </span>
        <ConnSelector value={connId} onChange={handleConnChange} />
        {selectedConn && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            ID {selectedConn.slaveId} · {selectedConn.pollIntervalMs / 1000}s poll
          </span>
        )}
      </div>

      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allDone ? (
          <div style={{
            border: '1px solid #22c55e44', borderLeft: '3px solid #22c55e',
            borderRadius: 8, padding: '16px 20px', background: '#22c55e11', textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e', marginBottom: 4 }}>pH Calibration Complete</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>All calibration values have been saved to the sensor.</div>
          </div>
        ) : (
          steps.map((step, i) => (
            <GuidedStep
              key={`${i}-${connId}`}
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
              onRetry={handleRetry}
              hasInput={step.hasInput}
              inputLabel={step.inputLabel}
              inputStep={step.inputStep}
              inputInitial={step.inputInitial}
            />
          ))
        )}
      </div>

      <FactoryResetSection connectionId={connId} address={PH_ADDR.reset} isConnected={isConnected} />
    </div>
  )
}

// ── EcCalibration ────────────────────────────────────────────────────

function EcCalibration() {
  const connections = useWorkspaceStore(s => s.workspace.connections)
  const defaultId = connections.find(c => c.id === EC_ID)?.id ?? connections[0]?.id ?? EC_ID
  const [connId, setConnId] = useState(defaultId)

  const connStatus = useConnectionsStore(s => s.connections[connId]?.status ?? 'idle')
  const rawEc = useConnectionsStore(s => s.connections[connId]?.registerValues[0]?.decoded)
  const rawTemp = useConnectionsStore(s => s.connections[connId]?.registerValues[2]?.decoded)
  const isConnected = connStatus === 'connected'
  const ecValue = typeof rawEc === 'number' ? rawEc : undefined
  const tempValue = typeof rawTemp === 'number' ? rawTemp : undefined

  const steps = useMemo(() => makeECSteps(connId), [connId])
  const [currentStep, setCurrentStep] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>(Array(steps.length).fill('pending'))
  const [doneLabels, setDoneLabels] = useState<Array<string | undefined>>(Array(steps.length).fill(undefined))

  useEffect(() => {
    setCurrentStep(0)
    setOutcomes(Array(steps.length).fill('pending'))
    setDoneLabels(Array(steps.length).fill(undefined))
  }, [connId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRetry() {
    const config = connections.find(c => c.id === connId)
    if (!config) return
    window.api.disconnectConnection(connId).catch(() => {})
      .finally(() => window.api.connectConnection(config).catch(() => {}))
  }

  function handleComplete(i: number, reading: number) {
    const isTempStep = steps[i].useTempReading
    const label = `Calibrated at ${reading.toFixed(isTempStep ? 1 : 0)} ${isTempStep ? '°C' : 'μS/cm'}`
    setDoneLabels(prev => { const n = [...prev]; n[i] = label; return n })
    setOutcomes(prev => { const n = [...prev]; n[i] = 'done'; return n })
    setCurrentStep(i + 1)
  }

  function handleSkip(i: number) {
    setOutcomes(prev => { const n = [...prev]; n[i] = 'skipped'; return n })
    setCurrentStep(i + 1)
  }

  const allDone = currentStep >= steps.length
  const selectedConn = connections.find(c => c.id === connId)

  return (
    <div>
      <StepperBar
        steps={steps.map(s => ({ title: s.stepperTitle, optional: s.isOptional }))}
        currentIndex={Math.min(currentStep, steps.length - 1)}
        outcomes={outcomes}
      />

      {/* Connection status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: isConnected ? '#22c55e' : DANGER, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: isConnected ? '#22c55e' : DANGER }}>
          {selectedConn?.name ?? connId} {isConnected ? 'Connected' : connStatus.toUpperCase()}
        </span>
        <ConnSelector value={connId} onChange={id => setConnId(id)} />
        {selectedConn && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            ID {selectedConn.slaveId} · {selectedConn.pollIntervalMs / 1000}s poll
          </span>
        )}
      </div>

      <div style={{ padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allDone ? (
          <div style={{
            border: '1px solid #22c55e44', borderLeft: '3px solid #22c55e',
            borderRadius: 8, padding: '16px 20px', background: '#22c55e11', textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#22c55e', marginBottom: 4 }}>EC Calibration Complete</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>All calibration values have been saved to the sensor.</div>
          </div>
        ) : (
          steps.map((step, i) => (
            <GuidedStep
              key={`${i}-${connId}`}
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
              onRetry={handleRetry}
              hasInput={step.hasInput}
              inputLabel={step.inputLabel}
              inputStep={step.inputStep}
              inputInitial={step.inputInitial}
            />
          ))
        )}
      </div>

      <FactoryResetSection connectionId={connId} address={EC_ADDR.reset} isConnected={isConnected} />
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
  // Auto-add Growloc default connections if not already in workspace.
  // Reads current Zustand state via getState() to avoid stale-closure duplicates in StrictMode.
  useEffect(() => {
    const { workspace: ws, addConnection } = useWorkspaceStore.getState()
    const existingIds = new Set(ws.connections.map(c => c.id))
    for (const conn of GROWLOC_CONNECTIONS) {
      if (!existingIds.has(conn.id)) addConnection(conn)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          ? <PhCalibration key="ph" />
          : <EcCalibration key="ec" />
        }
      </div>
    </div>
  )
}

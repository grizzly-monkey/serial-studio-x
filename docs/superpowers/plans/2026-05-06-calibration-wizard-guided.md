# Calibration Wizard — Guided Step-by-Step UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Apply-whenever wizard with a sequential guided flow: one step at a time, mandatory countdown timer, live sensor readings throughout, "Calibrate" button only after valid reading confirmed.

**Architecture:** A new `GuidedStep` component owns the per-step state machine (`counting → valid/invalid`) and fires `onCalibrate` / `onComplete` / `onSkip` callbacks. `PhCalibration` and `EcCalibration` become thin orchestrators holding a `currentStep` index and passing the right props down. `StepperBar` renders the horizontal step indicator. `GuidedStep` is extracted to its own file; `CalibrationWizard.tsx` is completely rewritten.

**Tech Stack:** React 18, TypeScript, Zustand (`useConnectionsStore`), existing `applyWrite` helper, inline CSS (matches existing codebase style)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/components/GuidedStep.tsx` | **CREATE** | Timer countdown, live reading display, phase state machine, Calibrate/Retry/Skip buttons |
| `src/renderer/components/CalibrationWizard.tsx` | **REWRITE** | `StepperBar`, `PhCalibration`, `EcCalibration`, main export, factory reset |

---

## Task 1: Create `GuidedStep.tsx`

**Files:**
- Create: `src/renderer/components/GuidedStep.tsx`

- [ ] **Step 1: Create the file with props interface, helper components, and static display states**

Create `src/renderer/components/GuidedStep.tsx` with this complete content:

```tsx
import React, { useEffect, useRef, useState } from 'react'

type Phase = 'counting' | 'valid' | 'invalid'

export interface GuidedStepProps {
  stepNumber: number
  title: string
  instruction: string
  timerSeconds: number
  isOptional?: boolean
  isLocked: boolean
  isDone: boolean
  doneLabel?: string
  isSkipped?: boolean
  liveValue: number | undefined
  liveUnit: string
  tempValue?: number | undefined
  isConnected: boolean
  onCalibrate: (inputValue?: number) => Promise<void>
  onComplete: (readingValue: number) => void
  onSkip?: () => void
  hasInput?: boolean
  inputLabel?: string
  inputStep?: number
  inputInitial?: string  // static default shown in the input field (e.g. '1413' for EC slope, '25.0' for temp)
}

const SUCCESS = '#22c55e'
const DANGER = '#ef4444'
const AMBER = '#d29922'

function Circle({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      background: color ?? 'transparent',
      border: color ? 'none' : '1px solid var(--border)',
      color: color ? '#fff' : 'var(--text-muted)',
      fontSize: 10, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </div>
  )
}

function OptBadge() {
  return (
    <span style={{
      fontSize: 8, color: AMBER, background: `${AMBER}11`,
      border: `1px solid ${AMBER}44`, borderRadius: 3, padding: '1px 4px',
    }}>optional</span>
  )
}

export default function GuidedStep({
  stepNumber, title, instruction, timerSeconds,
  isOptional, isLocked, isDone, doneLabel, isSkipped,
  liveValue, liveUnit, tempValue, isConnected,
  onCalibrate, onComplete, onSkip,
  hasInput, inputLabel, inputStep = 1, inputInitial,
}: GuidedStepProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('counting')
  const [remaining, setRemaining] = useState(timerSeconds)
  const [inputValue, setInputValue] = useState(inputInitial ?? '')
  const [writeError, setWriteError] = useState<string | null>(null)
  const [isWriting, setIsWriting] = useState(false)

  const isValidReading = isConnected && typeof liveValue === 'number' && isFinite(liveValue)
  const isValidRef = useRef(isValidReading)
  isValidRef.current = isValidReading

  // Reset countdown when step becomes active (isLocked flips to false)
  useEffect(() => {
    if (!isLocked && !isDone && !isSkipped) {
      setPhase('counting')
      setRemaining(timerSeconds)
      setInputValue(inputInitial ?? '')
      setWriteError(null)
    }
  }, [isLocked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown tick — transitions to valid/invalid at zero
  useEffect(() => {
    if (phase !== 'counting') return
    if (remaining <= 0) {
      setPhase(isValidRef.current ? 'valid' : 'invalid')
      return
    }
    const id = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, remaining])

  async function handleCalibrate() {
    if (!isConnected || typeof liveValue !== 'number' || !isFinite(liveValue)) {
      setWriteError('Reading lost — check connection before saving.')
      return
    }
    setWriteError(null)
    setIsWriting(true)
    try {
      await onCalibrate(hasInput ? parseFloat(inputValue) : undefined)
      onComplete(liveValue)
    } catch (e) {
      setWriteError(String(e))
    } finally {
      setIsWriting(false)
    }
  }

  function handleRetry() {
    setPhase('counting')
    setRemaining(timerSeconds)
    setInputValue(inputInitial ?? '')
    setWriteError(null)
  }

  // ── Locked ──────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div style={{
        border: '1px solid var(--border)', borderRadius: 6,
        padding: '10px 12px', opacity: 0.4,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Circle>{stepNumber}</Circle>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' }}>{title}</span>
        {isOptional && <OptBadge />}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>🔒</span>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────
  if (isDone) {
    return (
      <div style={{
        border: `1px solid ${SUCCESS}33`, borderLeft: `3px solid ${SUCCESS}`,
        borderRadius: 6, padding: '8px 12px', background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', gap: 8, opacity: 0.75,
      }}>
        <Circle color={SUCCESS}>✓</Circle>
        <div>
          <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text)' }}>{title}</div>
          {doneLabel && <div style={{ fontSize: 10, color: SUCCESS }}>{doneLabel}</div>}
        </div>
      </div>
    )
  }

  // ── Skipped ──────────────────────────────────────────────────────────
  if (isSkipped) {
    return (
      <div style={{
        border: '1px solid var(--border)', borderLeft: '3px solid var(--text-muted)',
        borderRadius: 6, padding: '8px 12px', background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', gap: 8, opacity: 0.65,
      }}>
        <Circle color="var(--text-muted)">—</Circle>
        <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>{title}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>Skipped</span>
      </div>
    )
  }

  // ── Active ───────────────────────────────────────────────────────────
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`
  const progress = Math.max(0, 1 - remaining / timerSeconds)
  const totalStr = timerSeconds >= 60
    ? `${Math.floor(timerSeconds / 60)}:${(timerSeconds % 60).toString().padStart(2, '0')}`
    : `0:${timerSeconds.toString().padStart(2, '0')}`
  const borderColor =
    phase === 'invalid' ? DANGER :
    phase === 'valid' ? SUCCESS :
    'var(--primary)'

  return (
    <div style={{
      border: `1px solid ${borderColor}44`, borderLeft: `3px solid ${borderColor}`,
      borderRadius: 6, padding: 12, background: 'var(--surface-2)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Circle color="var(--primary)">{stepNumber}</Circle>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{title}</span>
        {isOptional && <OptBadge />}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {isOptional && onSkip && (
            <button
              onClick={onSkip}
              style={{
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--text-muted)', borderRadius: 5,
                padding: '3px 10px', fontSize: 10, cursor: 'pointer',
              }}
            >Skip</button>
          )}
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4,
            background: phase === 'invalid' ? `${DANGER}11` : phase === 'valid' ? `${SUCCESS}11` : 'var(--primary-light)',
            color: phase === 'invalid' ? DANGER : phase === 'valid' ? SUCCESS : 'var(--primary)',
            border: `1px solid ${(phase === 'invalid' ? DANGER : phase === 'valid' ? SUCCESS : 'var(--primary)')}33`,
          }}>
            {phase === 'counting' ? 'Running' : phase === 'valid' ? 'Ready' : 'Error'}
          </span>
        </div>
      </div>

      {/* Instruction */}
      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {instruction}
      </p>

      {/* Countdown (counting phase only) */}
      {phase === 'counting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 20, fontWeight: 700, color: 'var(--text)',
            fontVariantNumeric: 'tabular-nums', minWidth: 44,
          }}>{timeStr}</span>
          <div style={{ flex: 1, height: 4, background: 'var(--surface)', borderRadius: 2 }}>
            <div style={{
              width: `${progress * 100}%`, height: '100%',
              background: 'var(--primary)', borderRadius: 2, transition: 'width 1s linear',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
            {totalStr}
          </span>
        </div>
      )}

      {/* Live reading (counting + valid phases) */}
      {(phase === 'counting' || phase === 'valid') && (
        <div style={{
          background: 'var(--surface)', border: `1px solid ${SUCCESS}33`,
          borderRadius: 5, padding: '7px 10px',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: phase === 'valid' ? 10 : 0,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isValidReading ? SUCCESS : DANGER }} />
          {isValidReading ? (
            <>
              <span style={{ color: SUCCESS, fontWeight: 700, fontSize: 13 }}>
                {(liveValue as number).toFixed(2)} {liveUnit}
              </span>
              {tempValue !== undefined && (
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  · Temp: {tempValue.toFixed(1)} °C
                </span>
              )}
            </>
          ) : (
            <span style={{ color: DANGER, fontSize: 11 }}>No reading — check connection</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>polling every 5s</span>
        </div>
      )}

      {/* Valid phase: input field + Calibrate button */}
      {phase === 'valid' && (
        <>
          {hasInput && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inputLabel}:</label>
              <input
                type="number"
                step={inputStep}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                style={{
                  width: 100, background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12,
                }}
              />
            </div>
          )}
          {writeError && (
            <p style={{ margin: '0 0 8px', fontSize: 11, color: DANGER }}>{writeError}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleCalibrate}
              disabled={isWriting}
              style={{
                background: SUCCESS, color: '#fff', border: 'none', borderRadius: 6,
                padding: '7px 20px', fontWeight: 700, fontSize: 12,
                cursor: isWriting ? 'wait' : 'pointer', opacity: isWriting ? 0.7 : 1,
              }}
            >{isWriting ? 'Saving...' : 'Calibrate'}</button>
          </div>
        </>
      )}

      {/* Invalid phase: error message + Retry button */}
      {phase === 'invalid' && (
        <>
          <div style={{
            background: `${DANGER}11`, border: `1px solid ${DANGER}44`,
            borderRadius: 6, padding: 10, marginBottom: 10,
          }}>
            <div style={{ color: DANGER, fontWeight: 700, fontSize: 11 }}>⚠ Probe not connected or timed out</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>
              Check cable, slave ID, and that the sensor is polling before retrying.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleRetry}
              style={{
                background: 'var(--surface)', color: DANGER, border: `1px solid ${DANGER}44`,
                borderRadius: 6, padding: '7px 20px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >↺ Retry This Step</button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /opt/grw/modbus-storm && npm run build 2>&1 | grep -E "error|GuidedStep" | head -20
```

Expected: no TypeScript errors involving `GuidedStep.tsx`. If errors appear, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/GuidedStep.tsx
git commit -m "feat: add GuidedStep component with timer, phases, and calibrate flow"
```

---

## Task 2: Rewrite `CalibrationWizard.tsx`

**Files:**
- Modify: `src/renderer/components/CalibrationWizard.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file content**

Replace `src/renderer/components/CalibrationWizard.tsx` with:

```tsx
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
```

- [ ] **Step 2: Build and check for TypeScript errors**

```bash
cd /opt/grw/modbus-storm && npm run build 2>&1 | grep -E "error TS|ERROR" | head -30
```

Expected: clean build with no TypeScript errors. Common fix: if `window.api.writeRegister` type mismatch, check `src/preload/index.ts` for the exact signature and adjust the `applyWrite` call accordingly.

- [ ] **Step 3: Start the app and smoke-test the wizard**

```bash
npm run dev
```

Open the app, press G four times to open the Growloc menu, click "Calibration Wizard". Verify:
1. pH tab opens with StepperBar showing 4 steps (Alkali + Temp marked "optional")
2. Step 1 starts counting down from 5:00 immediately
3. Connection status bar shows sensor status correctly
4. Steps 2–4 are dimmed with lock icons
5. Switch to EC tab — step progress resets, new 3-step stepper shows, step 1 starts at 3:00
6. Switch back to pH — step progress resets again (tab switching remounts)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/CalibrationWizard.tsx
git commit -m "feat: rewrite CalibrationWizard with guided sequential step flow"
```

---

## Task 3: Update `.gitignore` for brainstorm artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `.superpowers/` to `.gitignore` if not present**

```bash
grep -q '\.superpowers' /opt/grw/modbus-storm/.gitignore || echo '.superpowers/' >> /opt/grw/modbus-storm/.gitignore
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm artifacts"
```

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
    if (hasInput) {
      const parsed = parseFloat(inputValue)
      if (isNaN(parsed)) {
        setWriteError('Enter a valid numeric value.')
        return
      }
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

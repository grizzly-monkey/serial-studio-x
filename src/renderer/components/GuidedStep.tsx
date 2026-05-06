import React, { useEffect, useState } from 'react'

type Phase = 'idle' | 'counting' | 'valid' | 'invalid'

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
  inputInitial?: string
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
  const [phase, setPhase] = useState<Phase>('idle')
  const [remaining, setRemaining] = useState(timerSeconds)
  const [inputValue, setInputValue] = useState(inputInitial ?? '')
  const [writeError, setWriteError] = useState<string | null>(null)
  const [isWriting, setIsWriting] = useState(false)

  const isValidReading = isConnected && typeof liveValue === 'number' && isFinite(liveValue)

  // Reset to idle when step becomes active (isLocked flips to false)
  useEffect(() => {
    if (!isLocked && !isDone && !isSkipped) {
      setPhase('idle')
      setRemaining(timerSeconds)
      setInputValue(inputInitial ?? '')
      setWriteError(null)
    }
  }, [isLocked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown tick — pauses while probe is disconnected, resumes on reconnect
  useEffect(() => {
    if (phase !== 'counting') return
    if (!isValidReading) return
    if (remaining <= 0) {
      setPhase('valid')
      return
    }
    const id = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, remaining, isValidReading])

  function handleStart() {
    setPhase('counting')
    setRemaining(timerSeconds)
    setWriteError(null)
  }

  async function handleNext() {
    if (!isConnected || typeof liveValue !== 'number' || !isFinite(liveValue)) {
      setWriteError('Reading lost — check connection before saving.')
      return
    }
    const reading = liveValue
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
      onComplete(reading)
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsWriting(false)
    }
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

  // ── Active — derived display values ─────────────────────────────────
  const elapsed = timerSeconds - remaining
  const pollCycle = 5 - (elapsed % 5)   // 5→4→3→2→1→5→... per polling interval
  const progress = Math.max(0, 1 - remaining / timerSeconds)
  const totalStr = timerSeconds >= 60
    ? `${Math.floor(timerSeconds / 60)}:${(timerSeconds % 60).toString().padStart(2, '0')}`
    : `0:${timerSeconds.toString().padStart(2, '0')}`
  const remainMins = Math.floor(remaining / 60)
  const remainSecs = remaining % 60
  const remainStr = `${remainMins}:${remainSecs.toString().padStart(2, '0')}`

  const paused = phase === 'counting' && !isValidReading
  const borderColor =
    phase === 'invalid' ? DANGER :
    phase === 'valid' ? SUCCESS :
    paused ? AMBER :
    'var(--primary)'

  const badgeColor = phase === 'invalid' ? DANGER : phase === 'valid' ? SUCCESS : paused ? AMBER : 'var(--primary)'
  const badgeLabel = phase === 'valid' ? 'Ready' : phase === 'invalid' ? 'Error' : paused ? 'Paused' : 'Running'

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
          {isOptional && onSkip && phase !== 'valid' && (
            <button
              onClick={onSkip}
              style={{
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--text-muted)', borderRadius: 5,
                padding: '3px 10px', fontSize: 10, cursor: 'pointer',
              }}
            >Skip</button>
          )}
          {phase !== 'idle' && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${badgeColor}11`, color: badgeColor,
              border: `1px solid ${badgeColor}33`,
            }}>{badgeLabel}</span>
          )}
        </div>
      </div>

      {/* Instruction */}
      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {instruction}
      </p>

      {/* Idle phase: live reading + Start Calibration */}
      {phase === 'idle' && (
        <>
          <LiveReadingBox
            isValidReading={isValidReading}
            liveValue={liveValue}
            liveUnit={liveUnit}
            tempValue={tempValue}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={handleStart}
              style={{
                background: 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '7px 20px', fontWeight: 700,
                fontSize: 12, cursor: 'pointer',
              }}
            >Start Calibration</button>
          </div>
        </>
      )}

      {/* Counting phase: polling cycle + progress bar + live reading */}
      {phase === 'counting' && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
            background: 'var(--surface)', borderRadius: 6, padding: '8px 12px',
          }}>
            <div style={{ textAlign: 'center', minWidth: 36 }}>
              <div style={{
                fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                color: paused ? AMBER : 'var(--primary)', lineHeight: 1,
              }}>{paused ? '—' : pollCycle}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                {paused ? 'waiting' : 'next poll'}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {paused ? 'Waiting for connection…' : `Stabilising · ${remainStr} left`}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{totalStr}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                <div style={{
                  width: `${progress * 100}%`, height: '100%',
                  background: paused ? AMBER : 'var(--primary)',
                  borderRadius: 2, transition: 'width 1s linear',
                }} />
              </div>
            </div>
          </div>
          <LiveReadingBox
            isValidReading={isValidReading}
            liveValue={liveValue}
            liveUnit={liveUnit}
            tempValue={tempValue}
          />
        </>
      )}

      {/* Valid phase: live reading + optional input + Next button */}
      {phase === 'valid' && (
        <>
          <LiveReadingBox
            isValidReading={isValidReading}
            liveValue={liveValue}
            liveUnit={liveUnit}
            tempValue={tempValue}
            style={{ marginBottom: 10 }}
          />
          {hasInput && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
              onClick={handleNext}
              disabled={isWriting}
              style={{
                background: SUCCESS, color: '#fff', border: 'none', borderRadius: 6,
                padding: '7px 20px', fontWeight: 700, fontSize: 12,
                cursor: isWriting ? 'wait' : 'pointer', opacity: isWriting ? 0.7 : 1,
              }}
            >{isWriting ? 'Saving…' : 'Next →'}</button>
          </div>
        </>
      )}

      {/* Invalid phase: error + Start Calibration */}
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
              onClick={handleStart}
              style={{
                background: 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: 6, padding: '7px 20px', fontWeight: 700,
                fontSize: 12, cursor: 'pointer',
              }}
            >Start Calibration</button>
          </div>
        </>
      )}
    </div>
  )
}

function LiveReadingBox({
  isValidReading, liveValue, liveUnit, tempValue, style,
}: {
  isValidReading: boolean
  liveValue: number | undefined
  liveUnit: string
  tempValue?: number | undefined
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${SUCCESS}33`,
      borderRadius: 5, padding: '7px 10px',
      display: 'flex', alignItems: 'center', gap: 10,
      ...style,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isValidReading ? SUCCESS : DANGER, flexShrink: 0 }} />
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
  )
}

import React from 'react'
import type { RegisterConfig, RegisterValue } from '../../../shared/types'

interface Props {
  register: RegisterConfig
  liveValue?: RegisterValue
}

export default function Gauge({ register, liveValue }: Props): React.JSX.Element {
  const val = typeof liveValue?.decoded === 'number' ? liveValue.decoded : 0
  const { gaugeMin, gaugeMax } = register
  const range = gaugeMax - gaugeMin || 1
  const pct = Math.min(1, Math.max(0, (val - gaugeMin) / range))
  const alertState = liveValue?.alertState ?? 'ok'

  const SWEEP = 270
  const START_ANGLE = 135
  const cx = 60, cy = 55, r = 42

  const polarToXY = (angleDeg: number) => ({
    x: cx + r * Math.cos((angleDeg * Math.PI) / 180),
    y: cy + r * Math.sin((angleDeg * Math.PI) / 180)
  })

  const arcPath = (startDeg: number, endDeg: number) => {
    const s = polarToXY(startDeg)
    const e = polarToXY(endDeg)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const trackEnd = START_ANGLE + SWEEP
  const fillEnd = START_ANGLE + pct * SWEEP
  const needle = polarToXY(START_ANGLE + pct * SWEEP)
  const strokeColor = alertState !== 'ok' ? 'var(--warning)' : 'var(--primary)'

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4px 0' }}>
      <svg width={120} height={80} viewBox="0 0 120 80">
        {/* Track */}
        <path d={arcPath(START_ANGLE, trackEnd)}
          fill="none" stroke="var(--border)" strokeWidth={8} strokeLinecap="round" />
        {/* Fill */}
        {pct > 0 && (
          <path d={arcPath(START_ANGLE, fillEnd)}
            fill="none" stroke={strokeColor} strokeWidth={8} strokeLinecap="round" />
        )}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={3.5} fill="var(--text)" />
        {/* Value */}
        <text x={cx} y={cy + 17} textAnchor="middle" fontSize={12} fontWeight="700" fill="var(--text)" fontFamily="ui-monospace, monospace">
          {val.toFixed(register.scale !== 1 ? 1 : 0)}{register.unit}
        </text>
        {/* Min/Max labels */}
        <text x={12} y={74} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{gaugeMin}</text>
        <text x={108} y={74} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{gaugeMax}</text>
      </svg>
    </div>
  )
}

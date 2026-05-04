import React from 'react'
import type { RegisterConfig, RegisterValue } from '../../../shared/types'

interface Props {
  register: RegisterConfig
  liveValue?: RegisterValue
}

export default function TableCell({ register, liveValue }: Props): React.JSX.Element {
  const val = liveValue
    ? (typeof liveValue.decoded === 'number'
        ? `${Number(liveValue.decoded.toFixed(register.scale !== 1 ? 3 : 0))}${register.unit ? ' ' + register.unit : ''}`
        : String(liveValue.decoded))
    : '—'

  const alertState = liveValue?.alertState ?? 'ok'

  return (
    <div style={{
      background: alertState !== 'ok' ? 'rgba(245,158,11,0.15)' : 'var(--primary-light)',
      borderRadius: 4, padding: '5px 10px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      border: `1px solid ${alertState !== 'ok' ? 'rgba(245,158,11,0.4)' : 'transparent'}`
    }}>
      <span style={{
        fontSize: 14, fontWeight: 700,
        color: alertState !== 'ok' ? 'var(--warning)' : 'var(--primary-text)',
        fontFamily: 'ui-monospace, monospace'
      }}>
        {val}
      </span>
      {liveValue && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {register.dataType}
        </span>
      )}
    </div>
  )
}

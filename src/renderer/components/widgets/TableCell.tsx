import React from 'react'
import type { RegisterConfig, RegisterValue, ColorRule } from '../../../shared/types'

interface Props {
  register: RegisterConfig
  liveValue?: RegisterValue
}

function evalColorRules(rules: ColorRule[], value: number | string): { fg?: string; bg?: string } | null {
  if (typeof value !== 'number' || !rules?.length) return null
  for (const rule of rules) {
    let match = false
    switch (rule.op) {
      case '<':  match = value < rule.value; break
      case '<=': match = value <= rule.value; break
      case '>':  match = value > rule.value; break
      case '>=': match = value >= rule.value; break
      case '==': match = value === rule.value; break
      case '!=': match = value !== rule.value; break
    }
    if (match) return { fg: rule.fg, bg: rule.bg }
  }
  return null
}

export default function TableCell({ register, liveValue }: Props): React.JSX.Element {
  const decoded = liveValue?.decoded
  const colorMatch = decoded !== undefined ? evalColorRules(register.colorRules ?? [], decoded) : null
  const alertState = liveValue?.alertState ?? 'ok'

  let displayVal: string
  if (decoded === undefined) {
    displayVal = '—'
  } else if (typeof decoded === 'number') {
    const formatted = Number.isInteger(decoded) ? String(decoded) : decoded.toFixed(register.scale !== 1 ? 3 : 0)
    displayVal = register.unit ? `${formatted} ${register.unit}` : formatted
  } else {
    displayVal = String(decoded)
  }

  const bg = colorMatch?.bg ?? (alertState !== 'ok' ? 'rgba(245,158,11,0.15)' : 'var(--primary-light)')
  const fg = colorMatch?.fg ?? (alertState !== 'ok' ? 'var(--warning)' : 'var(--primary-text)')

  return (
    <div style={{
      background: bg,
      borderRadius: 4, padding: '5px 10px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      border: `1px solid ${alertState !== 'ok' ? 'rgba(245,158,11,0.4)' : 'transparent'}`
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: fg, fontFamily: 'ui-monospace, monospace' }}>
        {displayVal}
      </span>
      {liveValue && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {register.dataType}
        </span>
      )}
    </div>
  )
}

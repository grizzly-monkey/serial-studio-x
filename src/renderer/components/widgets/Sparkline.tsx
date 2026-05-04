import React from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis, ReferenceLine } from 'recharts'
import type { RegisterConfig, SparklinePoint } from '../../../shared/types'

interface Props {
  register: RegisterConfig
  data: SparklinePoint[]
}

export default function Sparkline({ register, data }: Props): React.JSX.Element {
  if (data.length < 2) {
    return (
      <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, background: 'var(--surface-2)', borderRadius: 4 }}>
        Collecting data…
      </div>
    )
  }

  const chartData = data.map(d => ({ value: typeof d.value === 'number' ? d.value : 0, t: d.timestamp }))
  const latest = chartData[chartData.length - 1]?.value

  return (
    <div style={{ position: 'relative', height: 52 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <YAxis domain={['auto', 'auto']} hide />
          {register.alert.enabled && register.alert.highLimit !== null && (
            <ReferenceLine y={register.alert.highLimit} stroke="var(--warning)" strokeDasharray="3 3" />
          )}
          {register.alert.enabled && register.alert.lowLimit !== null && (
            <ReferenceLine y={register.alert.lowLimit} stroke="var(--warning)" strokeDasharray="3 3" />
          )}
          <Tooltip
            formatter={(v: number) => [`${v}${register.unit ? ' ' + register.unit : ''}`, register.label || `@${register.address}`]}
            labelFormatter={(l: number) => new Date(l).toLocaleTimeString()}
            contentStyle={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}
          />
          <Line
            type="monotone" dataKey="value"
            stroke="var(--primary)" strokeWidth={1.5}
            dot={false} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      {latest !== undefined && (
        <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
          {latest.toFixed(register.scale !== 1 ? 2 : 0)}{register.unit}
        </div>
      )}
    </div>
  )
}

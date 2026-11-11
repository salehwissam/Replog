import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatNumber } from '@/lib/format'

import { ChartTooltip, compact } from './BarChartCard'

export interface LineDatum {
  label: string
  value: number | null
  detail?: string
}

export function SimpleLineChart({
  data,
  unit,
  height = 240,
  ariaLabel,
  color = 'var(--anilha-azul)',
}: {
  data: LineDatum[]
  unit?: string
  height?: number
  ariaLabel: string
  color?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const wash = `veu-${uid}`
  let lastIndex = -1
  data.forEach((d, i) => {
    if (d.value != null) lastIndex = i
  })

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 26, right: 18, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={wash} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.28} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--linha)" strokeOpacity={0.7} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--linha)' }}
            tick={{ fill: 'var(--giz-suave)', fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--giz-suave)', fontSize: 12 }}
            tickFormatter={(v: number) => compact(v)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--giz-suave)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as LineDatum | undefined
              if (!active || !d || d.value == null) return null
              return <ChartTooltip label={d.detail ?? d.label} value={d.value} unit={unit} />
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${wash})`}
            dot={(props: { cx?: number; cy?: number; index?: number; value?: unknown }) => {
              const { cx, cy, index } = props
              if (cx == null || cy == null || props.value == null) return <g key={`d-${index}`} />
              const last = index === lastIndex
              const d = data[index ?? 0]
              return (
                <g key={`d-${index}`}>
                  <circle cx={cx} cy={cy} r={last ? 6 : 4} fill={color} stroke="var(--superficie)" strokeWidth={2} />
                  {last && d?.value != null ? (
                    <text
                      x={cx}
                      y={cy - 14}
                      textAnchor="end"
                      fill="var(--giz)"
                      fontFamily="Big Shoulders Display, sans-serif"
                      fontWeight={900}
                      fontSize={18}
                    >
                      {formatNumber(d.value)}
                      {unit ? ` ${unit}` : ''}
                    </text>
                  ) : null}
                </g>
              )
            }}
            activeDot={{ r: 7, stroke: 'var(--superficie)', strokeWidth: 2, fill: color }}
            connectNulls
            isAnimationActive
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

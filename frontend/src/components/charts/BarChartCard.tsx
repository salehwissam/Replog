import { useId } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatNumber } from '@/lib/format'

import { DataTable } from './DataTable'

export interface BarDatum {
  label: string
  value: number
  detail?: string
}

export function ChartTooltip({ label, value, unit, detail }: { label: string; value: number; unit?: string; detail?: string }) {
  return (
    <div className="min-w-32 rounded-2xl border border-linha bg-superficie/95 px-3.5 py-2.5 shadow-[var(--sombra)] backdrop-blur">
      <p className="text-xs text-giz-suave">{label}</p>
      <p className="placar mt-0.5 text-3xl leading-none">
        {formatNumber(value)}
        {unit ? <span className="ml-1 font-corpo text-sm font-semibold text-giz-suave">{unit}</span> : null}
      </p>
      {detail ? <p className="mt-1 text-xs text-giz-suave">{detail}</p> : null}
    </div>
  )
}

export function SimpleBarChart({
  data,
  unit,
  height = 220,
  ariaLabel,
  valueLabel = 'Valor',
  highlightLast = true,
}: {
  data: BarDatum[]
  unit?: string
  height?: number
  ariaLabel: string
  valueLabel?: string
  highlightLast?: boolean
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const strong = `barra-forte-${uid}`
  const soft = `barra-suave-${uid}`
  const allZero = data.every((d) => d.value === 0)

  return (
    <div>
      <div role="img" aria-label={ariaLabel} style={{ height }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <defs>
              <linearGradient id={strong} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--anilha-azul)" />
                <stop offset="1" stopColor="var(--anilha-azul-forte)" />
              </linearGradient>
              <linearGradient id={soft} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--anilha-azul)" stopOpacity={0.55} />
                <stop offset="1" stopColor="var(--anilha-azul)" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--linha)" strokeOpacity={0.7} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--linha)' }}
              tick={{ fill: 'var(--giz-suave)', fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--giz-suave)', fontSize: 12 }}
              tickFormatter={(v: number) => compact(v)}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--superficie-2)', opacity: 0.6, radius: 8 } as object}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as BarDatum | undefined
                if (!active || !d) return null
                return <ChartTooltip label={d.label} value={d.value} unit={unit} detail={d.detail} />
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={`url(#${highlightLast && i < data.length - 1 ? soft : strong})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {allZero ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-giz-suave">
            Nenhum registro no período ainda.
          </p>
        ) : null}
      </div>
      <DataTable
        caption={ariaLabel}
        columns={['Período', valueLabel]}
        rows={data.map((d) => [d.label, `${formatNumber(d.value)}${unit ? ` ${unit}` : ''}`])}
      />
    </div>
  )
}

export function compact(v: number): string {
  if (Math.abs(v) >= 1000) return `${formatNumber(Math.round(v / 100) / 10)} mil`
  return formatNumber(v)
}

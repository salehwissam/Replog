import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import type { HeatmapDay } from '@/api/analytics'
import { formatInt, formatLocalDate, plural } from '@/lib/format'
import { molaAnilha } from '@/lib/motion'

import { DataTable } from './DataTable'
import { dataVars, HEAT_STEPS } from './palette'

const STEP = 14
const RADIUS = [0, 3.3, 4.4, 5.4, 6.4]
const WEEKDAYS = ['Seg', '', 'Qua', '', 'Sex', '', 'Dom']
const MIN_CEL = 18
const MAX_CEL = 40

function dow(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7
}

const daySets = (d: HeatmapDay) => d.sets ?? 0

export function heatTiers(days: HeatmapDay[]): (day: HeatmapDay) => number {
  const vols = days.filter((d) => d.workouts > 0 && daySets(d) > 0).map(daySets).sort((a, b) => a - b)
  const q = (p: number) => vols[Math.min(vols.length - 1, Math.floor(p * (vols.length - 1)))] ?? 0
  const cuts = [q(0.25), q(0.5), q(0.75)]
  return (d) => {
    if (d.workouts <= 0) return 0
    if (daySets(d) <= 0 || vols.length < 2) return vols.length < 2 && daySets(d) > 0 ? 3 : 1
    return 1 + cuts.filter((c) => daySets(d) > c).length
  }
}

function describe(d: HeatmapDay): string {
  const date = formatLocalDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })
  if (d.workouts === 0) return `${date}: sem treino`
  return `${date}: ${plural(d.workouts, 'treino', 'treinos')}, ${plural(daySets(d), 'série', 'séries')}`
}

export function PlateHeatmap({ days: allDays }: { days: HeatmapDay[] }) {
  const days = useMemo(() => {
    const firstMonday = allDays.findIndex((d) => dow(d.date) === 0)
    return firstMonday > 0 ? allDays.slice(firstMonday) : allDays
  }, [allDays])
  const trained = days.some((d) => d.workouts > 0)
  const [active, setActive] = useState<number | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  const readoutId = useId()
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [days.length])
  const { cols, offset, tier, months, weeks } = useMemo(() => {
    const offset = days.length ? dow(days[0]!.date) : 0
    const cols = Math.ceil((days.length + offset) / 7)
    const tier = heatTiers(days)
    const months: { col: number; label: string }[] = []
    days.forEach((d, i) => {
      if (d.date.endsWith('-01') || i === 0) {
        const col = Math.floor((i + offset) / 7)
        const label = formatLocalDate(d.date, { month: 'short' }).replace('.', '')
        if (i === 0 && days.length > 7 && Number(d.date.slice(8)) > 20) return
        months.push({ col, label })
      }
    })
    const weeks: { start: string; workouts: number; sets: number }[] = []
    days.forEach((d, i) => {
      const col = Math.floor((i + offset) / 7)
      weeks[col] ??= { start: d.date, workouts: 0, sets: 0 }
      weeks[col].workouts += d.workouts
      weeks[col].sets += daySets(d)
    })
    return { cols, offset, tier, months, weeks }
  }, [days])

  const [cel, setCel] = useState<number | null>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const width = el.clientWidth
      if (width > 0) setCel(Math.max(MIN_CEL, Math.min(MAX_CEL, Math.floor(width / cols))))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cols])

  useEffect(() => {
    const el = scroller.current
    if (!el || active == null || el.scrollWidth <= el.clientWidth) return
    const cell = el.scrollWidth / cols
    const x = Math.floor((active + offset) / 7) * cell
    if (x < el.scrollLeft) el.scrollLeft = x - cell
    else if (x + cell > el.scrollLeft + el.clientWidth) el.scrollLeft = x + 2 * cell - el.clientWidth
  }, [active, cols, offset])

  const W = cols * STEP
  const H = 7 * STEP
  const last = days.length - 1
  const shown = active ?? null

  function onKey(e: KeyboardEvent) {
    const moves: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }
    let next: number | null = null
    if (e.key in moves) next = (active ?? last) + moves[e.key]!
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else if (e.key === 'Escape') {
      setActive(null)
      return
    }
    if (next == null) return
    e.preventDefault()
    setKeyboard(true)
    setActive(Math.max(0, Math.min(last, next)))
  }

  return (
    <div
      className={clsx(dataVars, '[--cel:18px] sm:[--cel:22px] lg:[--cel:28px]')}
      style={cel ? ({ '--cel': `${cel}px` } as CSSProperties) : undefined}
    >
      <div className="relative flex gap-2">
        <div
          className="grid shrink-0 pt-6 text-[11px] leading-none text-giz-suave"
          style={{ gridTemplateRows: 'repeat(7, var(--cel))' }}
          aria-hidden="true"
        >
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="flex items-center">
              {w}
            </span>
          ))}
        </div>
        <div
          ref={scroller}
          tabIndex={0}
          role="group"
          aria-label="Mapa de treinos dos últimos 6 meses. Use as setas para percorrer os dias."
          aria-describedby={readoutId}
          onKeyDown={onKey}
          onPointerDown={() => setKeyboard(false)}
          onBlur={() => {
            setActive(null)
            setKeyboard(false)
          }}
          onPointerLeave={() => setActive(null)}
          className={clsx(
            'sem-barra-rolagem min-w-0 flex-1 overflow-x-auto rounded-lg',
            keyboard ? 'focus-visible:outline-offset-4' : 'outline-none focus-visible:outline-none',
          )}
        >
          <div className="relative" style={{ width: `calc(var(--cel) * ${cols})` }}>
            <div className="relative h-6 text-[11px] text-giz-suave" aria-hidden="true">
              {months.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="absolute top-0"
                  style={{ left: `calc(var(--cel) * ${m.col})` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block touch-manipulation"
              style={{ width: `calc(var(--cel) * ${cols})`, height: 'calc(var(--cel) * 7)' }}
              aria-hidden="true"
            >
              {Array.from({ length: cols }, (_, col) => (
                <motion.g
                  key={col}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...molaAnilha, delay: 0.15 + col * 0.028 }}
                >
                  {Array.from({ length: 7 }, (_, row) => {
                    const i = col * 7 + row - offset
                    const d = days[i]
                    if (!d) {
                      if (i <= last) return null
                      return (
                        <circle
                          key={`futuro-${row}`}
                          cx={col * STEP + STEP / 2}
                          cy={row * STEP + STEP / 2}
                          r={1.6}
                          fill="none"
                          stroke="var(--linha)"
                          strokeWidth={0.6}
                        />
                      )
                    }
                    const t = tier(d)
                    const cx = col * STEP + STEP / 2
                    const cy = row * STEP + STEP / 2
                    const isActive = shown === i
                    return (
                      <g key={d.date} onPointerEnter={() => setActive(i)} onClick={() => setActive(i)}>
                        <rect x={col * STEP} y={row * STEP} width={STEP} height={STEP} fill="transparent" />
                        {t === 0 ? (
                          <circle cx={cx} cy={cy} r={1.6} fill="var(--linha)" />
                        ) : (
                          <>
                            <circle cx={cx} cy={cy} r={RADIUS[t]} fill={HEAT_STEPS[t - 1]} />
                            <circle cx={cx} cy={cy} r={RADIUS[t]! * 0.62} fill="none" stroke="rgb(0 0 0 / 0.22)" strokeWidth={0.6} />
                            <circle cx={cx} cy={cy} r={1.1} fill="var(--superficie)" />
                          </>
                        )}
                        {i === last ? (
                          <circle cx={cx} cy={cy} r={6.6} fill="none" stroke="var(--giz-suave)" strokeWidth={1} strokeDasharray="2 1.6" />
                        ) : null}
                        {isActive ? <circle cx={cx} cy={cy} r={6.9} fill="none" stroke="var(--giz)" strokeWidth={1.4} /> : null}
                      </g>
                    )
                  })}
                </motion.g>
              ))}
            </svg>
          </div>
        </div>
        {!trained ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-6 flex items-center justify-center px-2">
            <p className="max-w-sm rounded-2xl border border-linha bg-superficie/95 px-4 py-2 text-center text-sm text-giz-suave shadow-lg">
              Nenhum treino nos últimos 6 meses. Cada treino vira uma anilha aqui.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p id={readoutId} aria-live="polite" className={clsx('min-h-6 text-sm', shown == null ? 'text-giz-suave' : 'font-medium text-giz')}>
          {shown == null ? 'Toque ou passe o mouse em um dia para ver as séries.' : describe(days[shown]!)}
        </p>
        <HeatLegend />
      </div>

      <DataTable
        caption="Treinos e séries por semana"
        columns={['Semana de', 'Treinos', 'Séries']}
        rows={weeks
          .filter(Boolean)
          .map((w) => [formatLocalDate(w.start), formatInt(w.workouts), formatInt(w.sets)])}
      />
    </div>
  )
}

function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-giz-suave">
      <span className="mr-2 flex items-center gap-1.5">
        <svg viewBox={`0 0 ${STEP} ${STEP}`} className="size-4" aria-hidden="true">
          <circle cx={STEP / 2} cy={STEP / 2} r={6} fill="none" stroke="var(--giz-suave)" strokeWidth={1} strokeDasharray="2 1.6" />
        </svg>
        Hoje
      </span>
      <span>Menos séries</span>
      <svg viewBox={`0 0 ${STEP * 5} ${STEP}`} className="h-4 w-auto" aria-hidden="true">
        <circle cx={STEP / 2} cy={STEP / 2} r={1.6} fill="var(--linha)" />
        {[1, 2, 3, 4].map((t) => (
          <g key={t}>
            <circle cx={t * STEP + STEP / 2} cy={STEP / 2} r={RADIUS[t]} fill={HEAT_STEPS[t - 1]} />
            <circle cx={t * STEP + STEP / 2} cy={STEP / 2} r={1.1} fill="var(--superficie)" />
          </g>
        ))}
      </svg>
      <span>Mais séries</span>
    </div>
  )
}

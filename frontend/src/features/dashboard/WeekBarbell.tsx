import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

import { analyticsApi, analyticsKeys, HEATMAP_DAYS, optionalQuery } from '@/api/analytics'
import type { Dashboard } from '@/api/workouts'
import { Barbell } from '@/components/brand/Barbell'
import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { plural } from '@/lib/format'
import { letterColor } from '@/lib/motion'

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7
}

export function WeekBarbell({ dash }: { dash: Dashboard }) {
  const sessions = dash.week_sessions ?? []
  const todayIdx = (new Date().getDay() + 6) % 7
  const heat = useQuery({ queryKey: analyticsKeys.heatmap(HEATMAP_DAYS), queryFn: () => analyticsApi.heatmap(), ...optionalQuery })
  const reduce = useReducedMotion()
  const [lifted, setLifted] = useState(false)

  const setsByDate = new Map((heat.data ?? []).map((d) => [d.date, d.sets ?? 0]))
  const daySets = sessions.map((s) => setsByDate.get(s.local_date) ?? 0)
  const maxSets = Math.max(0, ...daySets)

  const byDay = new Map<number, string | null>()
  for (const s of sessions) byDay.set(weekdayIndex(s.local_date), s.split_letter)

  useEffect(() => {
    if (reduce || sessions.length === 0) return
    const up = setTimeout(() => setLifted(true), 650 + sessions.length * 60)
    const down = setTimeout(() => setLifted(false), 1250 + sessions.length * 60)
    return () => {
      clearTimeout(up)
      clearTimeout(down)
    }
  }, [reduce, sessions.length])

  return (
    <section
      aria-labelledby="semana"
      className="knurl relative -mx-4 overflow-hidden border-y border-linha bg-aco-2 px-4 pb-6 pt-5 sm:mx-0 sm:rounded-[32px] sm:border"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-40 max-w-md rounded-full bg-azul/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex items-baseline justify-between gap-3">
        <h2 id="semana" className="text-lg font-semibold">
          Sua semana
        </h2>
        <p className="text-sm text-giz-suave">
          {sessions.length === 0 ? 'Cada treino carrega uma anilha' : `${plural(sessions.length, 'anilha', 'anilhas')} na barra`}
        </p>
      </div>

      <div className="relative -mx-2 mt-2">
        <Barbell
          height={130}
          lifted={lifted}
          title={`Barra da semana com ${plural(sessions.length, 'treino', 'treinos')}`}
          plates={sessions.map((s, i) => ({
            id: String(s.id),
            color: letterColor(s.split_letter),
            height: maxSets > 0 ? 0.55 + 0.45 * (daySets[i]! / maxSets) : 1 - Math.min(i, 5) * 0.05,
            thickness: 1.2,
          }))}
        />
      </div>

      <ol className="relative mt-3 grid grid-cols-7 gap-1 text-center">
        {DAYS.map((label, i) => {
          const trained = byDay.has(i)
          const letter = byDay.get(i)
          const dayCount = sessions
            .filter((s) => weekdayIndex(s.local_date) === i)
            .reduce((sum, s) => sum + (setsByDate.get(s.local_date) ?? 0), 0)
          return (
            <li key={label} className="flex flex-col items-center gap-1.5">
              <span className={clsx('text-xs', i === todayIdx ? 'font-semibold text-giz' : 'text-giz-suave')} aria-hidden="true">
                {label}
              </span>
              {trained ? (
                <motion.span
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.4 + i * 0.05 }}
                >
                  <Plate color={letterColor(letter)} letter={letter ?? undefined} className="size-8" />
                </motion.span>
              ) : (
                <span
                  className={clsx('size-8 rounded-full border-2 border-dashed', i === todayIdx ? 'border-azul/70' : 'border-linha')}
                  aria-hidden="true"
                />
              )}
              <span className="sr-only">
                {DAY_NAMES[i]}
                {i === todayIdx ? ' (hoje)' : ''}: {trained ? `com treino${dayCount > 0 ? `, ${plural(dayCount, 'série', 'séries')}` : ''}` : 'sem treino'}
              </span>
            </li>
          )
        })}
      </ol>

      <dl className="relative mt-6 grid grid-cols-3 gap-x-6 gap-y-4">
        <Stat label="Treinos" value={dash.week_workouts} big />
        <Stat label="Séries" value={dash.week_sets} />
        <Stat label="Sequência" value={dash.streak_weeks} unit={dash.streak_weeks === 1 ? 'semana' : 'semanas'} />
      </dl>
    </section>
  )
}

function Stat({ label, value, unit, big = false }: { label: string; value: number; unit?: string; big?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-giz-suave">{label}</dt>
      <dd className={clsx('placar text-5xl', big && 'text-azul')}>
        <AnimatedNumber value={value} />
        {unit ? <span className="ml-1 font-corpo text-base font-medium text-giz-suave">{unit}</span> : null}
      </dd>
    </div>
  )
}

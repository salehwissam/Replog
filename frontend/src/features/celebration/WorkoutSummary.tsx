import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Trophy } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

import { queryKeys, workoutsApi, type SessionSummary, type WorkoutSession } from '@/api/workouts'
import { Barbell, type BarbellPlate } from '@/components/brand/Barbell'
import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Button } from '@/components/ui/Button'
import { useExerciseMeta } from '@/components/workout/ExercisePicker'
import { capitalizeFirst, formatInt, formatLocalDate, plural } from '@/lib/format'
import { letterColor } from '@/lib/motion'

export const SUMMARY_AUTO_CLOSE_MS = 9000

const NIGHT_TOKENS = {
  '--aco': '#0b1020',
  '--aco-2': '#0f1528',
  '--superficie': '#141b2e',
  '--superficie-2': '#1c2541',
  '--linha': '#2a3557',
  '--giz': '#eef1f6',
  '--giz-suave': '#9aa6c2',
  '--anilha-azul': '#3b74ff',
  '--anilha-amarela': '#ffc93c',
  '--anilha-verde': '#22c47a',
  '--anilha-vermelha': '#f0453a',
  '--anilha-branca': '#e7ebf3',
  '--knurl': 'rgb(255 255 255 / 0.045)',
  colorScheme: 'dark',
} as CSSProperties

const GROUP_PLATES = [
  { color: 'var(--anilha-vermelha)', height: 1 },
  { color: 'var(--anilha-azul)', height: 1 },
  { color: 'var(--anilha-amarela)', height: 0.9 },
  { color: 'var(--anilha-verde)', height: 0.78 },
  { color: 'var(--anilha-branca)', height: 0.62 },
]

export function localSummary(session: WorkoutSession, labels?: Record<string, string>): SessionSummary {
  const groups = new Map<string, number>()
  for (const block of session.exercises) {
    const counted = block.sets.filter((s) => s.set_type !== 'aquecimento').length
    if (counted === 0) continue
    const key = block.exercise.muscle_group
    groups.set(key, (groups.get(key) ?? 0) + counted)
  }
  const duration =
    session.duration_seconds ??
    (session.finished_at
      ? Math.max(0, (new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000)
      : null)
  return {
    session_id: session.id,
    volume_kg: session.volume_kg,
    sets: session.total_sets,
    reps: session.total_reps,
    duration_seconds: duration,
    records_beaten: session.records.filter((r) => r.previous_value != null).length,
    muscle_groups: [...groups.entries()]
      .map(([muscle_group, sets]) => ({ muscle_group, sets, label: labels?.[muscle_group] ?? capitalizeFirst(muscle_group) }))
      .sort((a, b) => b.sets - a.sets),
    previous_same_split: null,
    delta_volume_kg: null,
  }
}

export function shortDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

function chalk(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.PI + (i / (count - 1)) * Math.PI + (Math.random() - 0.5) * 0.3
    const dist = 50 + Math.random() * 90
    return { id: i, x: Math.cos(angle) * dist * 1.6, y: Math.sin(angle) * dist, size: 3 + Math.random() * 6, delay: Math.random() * 0.12 }
  })
}

export function WorkoutSummaryOverlay({ session, onClose }: { session: WorkoutSession; onClose: () => void }) {
  const reduce = useReducedMotion()
  const titleId = useId()
  const meta = useExerciseMeta()
  const remote = useQuery({
    queryKey: queryKeys.sessionSummary(session.id),
    queryFn: () => workoutsApi.sessionSummary(session.id),
    retry: false,
    staleTime: Infinity,
  })
  const data = remote.data ?? localSummary(session, meta.data?.muscle_groups)
  const [locked, setLocked] = useState(Boolean(reduce))
  const [engaged, setEngaged] = useState(false)
  const [dust] = useState(() => chalk(reduce ? 0 : 16))
  const actions = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reduce) return
    const id = window.setTimeout(() => {
      setLocked(true)
      try {
        navigator.vibrate?.([30, 40, 90])
      } catch {
      }
    }, 950)
    return () => window.clearTimeout(id)
  }, [reduce])

  useEffect(() => {
    if (engaged) return
    const id = window.setTimeout(onClose, SUMMARY_AUTO_CLOSE_MS)
    return () => window.clearTimeout(id)
  }, [engaged, onClose])

  useEffect(() => {
    actions.current?.querySelector('button')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else setEngaged(true)
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const groups = data.muscle_groups.slice(0, GROUP_PLATES.length)
  const plates: BarbellPlate[] = (groups.length ? groups : [{ muscle_group: 'barra', label: '', sets: 0 }]).map((g, i) => ({
    id: g.muscle_group,
    color: groups.length ? GROUP_PLATES[i]!.color : 'var(--anilha-azul)',
    height: GROUP_PLATES[i]!.height,
  }))
  const prev = data.previous_same_split
  const delta = prev ? data.sets - prev.sets : null
  const maxSets = Math.max(data.sets, prev?.sets ?? 0, 1)
  const exercises = session.exercises.filter((b) => b.summary.sets > 0).length
  const letter = session.split?.letter

  const cascade = (i: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 30, delay: reduce ? 0 : 1.05 + i * 0.07 },
  })

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain"
      data-theme="escuro"
      style={NIGHT_TOKENS}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="knurl pointer-events-none fixed inset-0 bg-[#05070f]/95 backdrop-blur-md" aria-hidden="true" />
      <motion.div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 26%, rgb(59 116 255 / 0.28), transparent 62%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: locked ? 1 : 0.4 }}
        transition={{ duration: 0.6 }}
        aria-hidden="true"
      />

      {!engaged ? (
        <motion.div
          className="fixed inset-x-0 top-0 z-10 h-1 origin-left bg-azul"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: SUMMARY_AUTO_CLOSE_MS / 1000, ease: 'linear' }}
          aria-hidden="true"
        />
      ) : null}

      <div
        className="relative mx-auto flex min-h-full max-w-md flex-col gap-4 px-5 pb-0 pt-[max(1.75rem,env(safe-area-inset-top))] text-giz"
        onPointerDown={() => setEngaged(true)}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <header className="flex items-center gap-4">
          <motion.span
            className="block size-14 shrink-0"
            initial={{ scale: 0, rotate: -220 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.05 }}
          >
            <Plate color={letterColor(letter)} letter={letter ?? undefined} className="size-full drop-shadow-[0_8px_24px_rgb(0_0_0/0.5)]" />
          </motion.span>
          <div className="min-w-0">
            <motion.h2
              id={titleId}
              className="placar text-[2.75rem] leading-[0.85]"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28, delay: 0.12 }}
            >
              Treino concluído
            </motion.h2>
            <p className="mt-1 truncate text-sm text-giz-suave">
              {session.split?.name ?? 'Treino livre'}, em {formatLocalDate(session.local_date, { day: '2-digit', month: '2-digit' })}
            </p>
          </div>
        </header>

        <div className="relative -mx-2 h-[104px]" aria-hidden="true">
          <motion.div
            className="absolute inset-x-0 top-2"
            animate={locked && !reduce ? { y: [0, -30, -22] } : { y: 0 }}
            transition={{ duration: 0.55, times: [0, 0.6, 1], ease: [0.2, 0.9, 0.3, 1] }}
          >
            <Barbell plates={plates} height={88} />
          </motion.div>
          <div className="absolute left-1/2 top-1/2">
            {locked
              ? dust.map((p) => (
                  <motion.span
                    key={p.id}
                    className="absolute rounded-full bg-white/70"
                    style={{ width: p.size, height: p.size }}
                    initial={{ x: 0, y: -10, opacity: 0.9, scale: 0.6 }}
                    animate={{ x: p.x, y: p.y - 10, opacity: 0, scale: 1.6 }}
                    transition={{ duration: 1.1, delay: p.delay, ease: [0.1, 0.8, 0.3, 1] }}
                  />
                ))
              : null}
          </div>
        </div>

        <motion.div {...cascade(0)} className="-mt-2">
          <p className="placar flex items-baseline gap-2 text-[4.75rem] leading-none">
            <AnimatedNumber value={locked ? data.sets : 0} duration={1.3} />
            <span className="text-3xl text-giz-suave">{data.sets === 1 ? 'série' : 'séries'}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-giz-suave">
            de trabalho (aquecimento não conta)
            {delta != null && prev ? (
              <span
                className={clsx(
                  'num rounded-full px-2 py-0.5 text-base font-bold',
                  delta > 0 ? 'bg-verde/15 text-verde' : 'bg-superficie-2 text-giz-suave',
                )}
              >
                {delta > 0 ? '+' : delta < 0 ? '−' : ''}
                {Math.abs(delta)} {Math.abs(delta) === 1 ? 'série' : 'séries'}
              </span>
            ) : null}
          </p>
        </motion.div>

        <motion.dl {...cascade(1)} className="grid grid-cols-3 divide-x divide-linha rounded-[22px] border border-linha bg-superficie/70">
          {[
            { label: 'Exercícios', value: formatInt(exercises) },
            { label: 'Repetições', value: formatInt(data.reps) },
            { label: 'Duração', value: data.duration_seconds != null ? shortDuration(data.duration_seconds) : '—' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col-reverse px-3 py-2.5">
              <dt className="text-xs text-giz-suave">{s.label}</dt>
              <dd className="placar whitespace-nowrap text-[2.1rem]">{s.value}</dd>
            </div>
          ))}
        </motion.dl>

        {data.records_beaten > 0 ? (
          <motion.p
            {...cascade(2)}
            className="flex items-center gap-3 rounded-[22px] border border-amarela/45 bg-amarela/10 px-4 py-3 text-amarela shadow-[0_0_40px_-12px_var(--anilha-amarela)]"
          >
            <Trophy className="size-6 shrink-0" aria-hidden="true" />
            <span className="text-base">
              <strong className="placar mr-1.5 text-3xl">{data.records_beaten}</strong>
              {data.records_beaten === 1 ? 'recorde batido hoje' : 'recordes batidos hoje'}
            </span>
          </motion.p>
        ) : null}

        {prev ? (
          <motion.section {...cascade(3)} aria-label="Comparação com o último treino desta divisão" className="flex flex-col gap-2">
            <p className="text-sm text-giz-suave">
              Contra o último {letter ? `Treino ${letter}` : 'treino desta divisão'}, de{' '}
              {formatLocalDate(prev.local_date, { day: '2-digit', month: '2-digit' })}
            </p>
            {[
              { label: 'Hoje', sets: data.sets, tone: delta != null && delta > 0 ? 'bg-verde' : 'bg-azul' },
              { label: formatLocalDate(prev.local_date, { day: '2-digit', month: '2-digit' }), sets: prev.sets, tone: 'bg-linha' },
            ].map((row, i) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm text-giz-suave">{row.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-superficie">
                  <motion.div
                    className={clsx('h-full origin-left rounded-full', row.tone)}
                    style={{ width: `${(row.sets / maxSets) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20, delay: reduce ? 0 : 1.35 + i * 0.12 }}
                  />
                </div>
                <span className="num w-24 shrink-0 text-right text-lg">
                  {formatInt(row.sets)} {row.sets === 1 ? 'série' : 'séries'}
                </span>
              </div>
            ))}
          </motion.section>
        ) : null}

        {groups.length > 0 ? (
          <motion.section {...cascade(4)} aria-label="Grupos musculares trabalhados" className="flex flex-col gap-1.5">
            {groups.map((g, i) => (
              <div key={g.muscle_group} className="flex items-center gap-3">
                <span className="flex w-28 shrink-0 items-center gap-2 truncate text-sm">
                  <Plate color={GROUP_PLATES[i]!.color} className="size-4 shrink-0" />
                  {g.label}
                </span>
                <span className="flex flex-1 flex-wrap gap-1" aria-hidden="true">
                  {Array.from({ length: Math.min(g.sets, 12) }, (_, k) => (
                    <motion.span
                      key={k}
                      className="block h-3.5 w-1.5 rounded-sm"
                      style={{ background: GROUP_PLATES[i]!.color }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22, delay: reduce ? 0 : 1.45 + i * 0.08 + k * 0.03 }}
                    />
                  ))}
                </span>
                <span className="num w-16 shrink-0 text-right text-base text-giz-suave">{plural(g.sets, 'série', 'séries')}</span>
              </div>
            ))}
          </motion.section>
        ) : null}

        <motion.div ref={actions} {...cascade(5)} className="sticky bottom-0 mt-auto -mx-5 bg-gradient-to-t from-[#05070f] from-60% to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
          <Button size="lg" className="w-full" onClick={onClose}>
            Ver detalhes do treino
          </Button>
        </motion.div>
      </div>
    </motion.div>
  )
}

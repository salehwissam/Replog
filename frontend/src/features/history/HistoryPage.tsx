import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { queryKeys, workoutsApi, type SessionListItem } from '@/api/workouts'
import { IntensityBadge } from '@/components/workout/IntensityPicker'
import { Plate } from '@/components/brand/Plate'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { capitalizeFirst, formatDuration, formatLocalDate, formatTime } from '@/lib/format'
import { letterColor } from '@/lib/motion'

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const PAGE_SIZE = 15

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y!, m! - 1 + delta, 1))
}

export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return date.toISOString().slice(0, 10)
}

export function weekTitle(start: string, todayIso: string): string {
  const current = weekStart(todayIso)
  if (start === current) return 'Esta semana'
  if (start === shiftDays(current, -7)) return 'Semana passada'
  return `Semana de ${formatLocalDate(start, { day: 'numeric', month: 'short' }).replace('.', '')}`
}

function MonthCalendar({ selected, onSelect }: { selected: string | null; onSelect: (d: string | null) => void }) {
  const [month, setMonth] = useState(() => (selected ? selected.slice(0, 7) : monthKey(new Date())))
  const range = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const last = new Date(y!, m!, 0).getDate()
    return { date_from: `${month}-01`, date_to: `${month}-${String(last).padStart(2, '0')}`, page_size: 100 }
  }, [month])
  const monthData = useQuery({
    queryKey: queryKeys.history({ ...range, calendario: true }),
    queryFn: () => workoutsApi.history(range),
    placeholderData: keepPreviousData,
  })

  const byDay = useMemo(() => {
    const map = new Map<string, { letter: string | null; records: number }>()
    for (const s of monthData.data?.items ?? []) {
      const prev = map.get(s.local_date)
      map.set(s.local_date, {
        letter: prev?.letter ?? s.split_letter,
        records: (prev?.records ?? 0) + s.records_count,
      })
    }
    return map
  }, [monthData.data])

  const totals = useMemo(() => {
    const items = monthData.data?.items ?? []
    return {
      workouts: items.length,
      sets: items.reduce((acc, s) => acc + s.total_sets, 0),
      records: items.reduce((acc, s) => acc + s.records_count, 0),
    }
  }, [monthData.data])

  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y!, m! - 1, 1)
    const offset = (first.getDay() + 6) % 7
    const days = new Date(y!, m!, 0).getDate()
    return [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  }, [month])

  const title = capitalizeFirst(
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
      new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1),
    ),
  )
  const [direction, setDirection] = useState(0)
  const go = (delta: number) => {
    setDirection(delta)
    setMonth(shiftMonth(month, delta))
  }
  const todayIso = new Date().toLocaleDateString('sv-SE')

  return (
    <section aria-label="Calendário de treinos" className="knurl overflow-hidden rounded-[28px] border border-linha bg-aco-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} className="flex size-11 items-center justify-center rounded-full transition hover:bg-superficie active:scale-90" aria-label="Mês anterior">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="placar text-3xl" aria-live="polite">
          {title}
        </h2>
        <button type="button" onClick={() => go(1)} className="flex size-11 items-center justify-center rounded-full transition hover:bg-superficie active:scale-90" aria-label="Próximo mês">
          <ChevronRight className="size-5" />
        </button>
      </div>

      <dl className="mb-4 grid grid-cols-3 divide-x divide-linha rounded-2xl border border-linha bg-superficie/60 py-2 text-center">
        <div>
          <dt className="text-xs text-giz-suave">Treinos</dt>
          <dd className="placar text-3xl">
            <AnimatedNumber value={totals.workouts} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-giz-suave">Séries</dt>
          <dd className="placar text-3xl">
            <AnimatedNumber value={totals.sets} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-giz-suave">Recordes</dt>
          <dd className={clsx('placar text-3xl', totals.records > 0 && 'text-amarela')}>
            <AnimatedNumber value={totals.records} />
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-giz-suave" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <motion.div
        key={month}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="mt-1 grid grid-cols-7 gap-1"
      >
        {cells.map((day, i) => {
          if (day == null) return <span key={`v${i}`} />
          const iso = `${month}-${String(day).padStart(2, '0')}`
          const info = byDay.get(iso)
          const has = Boolean(info)
          const isSel = selected === iso
          const isToday = iso === todayIso
          return (
            <button
              key={iso}
              type="button"
              disabled={!has}
              onClick={() => onSelect(isSel ? null : iso)}
              aria-pressed={isSel}
              aria-label={`${day}${has ? `, treino ${info!.letter ?? 'livre'}` : ''}${info?.records ? `, ${info.records} ${info.records === 1 ? 'recorde' : 'recordes'}` : ''}`}
              className="relative flex aspect-square items-center justify-center transition active:scale-90"
            >
              {isSel ? (
                <motion.span
                  layoutId="dia-selecionado"
                  className="absolute inset-0 rounded-full ring-2 ring-giz"
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                />
              ) : null}
              {has ? (
                <motion.span
                  className="absolute inset-[3px]"
                  initial={{ scale: 0, rotate: -120 }}
                  animate={{ scale: isSel ? 1.06 : 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 18, delay: day * 0.012 }}
                >
                  <Plate color={info!.letter ? letterColor(info!.letter) : 'var(--anilha-azul)'} className="size-full" />
                </motion.span>
              ) : null}
              <span
                className={clsx(
                  'placar relative text-xl',
                  has ? 'text-white' : isToday ? 'text-azul' : iso > todayIso ? 'text-giz-suave/25' : 'text-giz-suave/60',
                )}
              >
                {day}
              </span>
              {info?.records ? (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amarela text-[#1b1400] shadow" aria-hidden="true">
                  <Trophy className="size-2.5" strokeWidth={3} />
                </span>
              ) : null}
              {isToday && !has ? <span className="absolute bottom-1 size-1 rounded-full bg-azul" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </motion.div>
    </section>
  )
}

function SessionCard({ s, index }: { s: SessionListItem; index: number }) {
  return (
    <motion.li
      className="relative pl-14"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28, delay: Math.min(index, 8) * 0.04 }}
    >
      <motion.span
        className="absolute left-0 top-4 block size-11"
        initial={{ scale: 0, rotate: -150 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 16, delay: 0.05 + Math.min(index, 8) * 0.04 }}
      >
        <Plate color={letterColor(s.split_letter)} letter={s.split_letter ?? undefined} className="size-full" />
      </motion.span>
      <Link
        to={`/historico/${s.id}`}
        className={clsx(
          'block rounded-[24px] border bg-superficie p-4 transition hover:border-azul/60 active:scale-[0.99]',
          s.records_count > 0 ? 'border-amarela/40' : 'border-linha',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-giz-suave">
            {capitalizeFirst(formatLocalDate(s.local_date, { weekday: 'long', day: 'numeric', month: 'long' }))},{' '}
            {formatTime(s.started_at, s.timezone)}
          </p>
          {s.records_count > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amarela px-2 py-0.5 text-xs font-bold text-[#1b1400]">
              <Trophy className="size-3.5" aria-hidden="true" />
              {s.records_count} {s.records_count === 1 ? 'recorde' : 'recordes'}
            </span>
          ) : null}
        </div>
        <p className="placar mt-0.5 text-[1.75rem]">
          {s.split_letter ? `Treino ${s.split_letter} — ${s.split_name}` : 'Treino livre'}
        </p>
        <IntensityBadge intensity={s.intensity} className="mt-1" />
        <p className="mt-0.5 truncate text-sm text-giz-suave">{s.exercise_names.join(', ') || 'Sem séries'}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-giz-suave">
          <span>
            <span className="num text-lg text-giz">{s.total_sets}</span> {s.total_sets === 1 ? 'série' : 'séries'}
          </span>
          <span className="num text-lg text-giz">
            {s.duration_seconds != null ? formatDuration(s.duration_seconds) : 'em andamento'}
          </span>
        </p>
      </Link>
    </motion.li>
  )
}

export default function HistoryPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('pagina')) || 1)
  const day = params.get('dia')
  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null

  const query = { page, page_size: PAGE_SIZE, date_from: validDay ?? undefined, date_to: validDay ?? undefined }
  const history = useQuery({
    queryKey: queryKeys.history(query),
    queryFn: () => workoutsApi.history(query),
    placeholderData: keepPreviousData,
  })

  const setDay = (d: string | null) => {
    const next = new URLSearchParams()
    if (d) next.set('dia', d)
    setParams(next)
  }
  const setPage = (p: number) => {
    const next = new URLSearchParams(params)
    next.set('pagina', String(p))
    setParams(next)
  }

  const totalPages = history.data ? Math.max(1, Math.ceil(history.data.total / PAGE_SIZE)) : 1
  const todayIso = new Date().toLocaleDateString('sv-SE')

  const weeks = useMemo(() => {
    const groups: { start: string; items: SessionListItem[]; sets: number }[] = []
    for (const s of history.data?.items ?? []) {
      const start = weekStart(s.local_date)
      let g = groups[groups.length - 1]
      if (!g || g.start !== start) {
        g = { start, items: [], sets: 0 }
        groups.push(g)
      }
      g.items.push(s)
      g.sets += s.total_sets
    }
    return groups
  }, [history.data])

  return (
    <div>
      <PageHeader title="Histórico" subtitle="Tudo o que você treinou, semana a semana." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        <div className="lg:sticky lg:top-6">
          <MonthCalendar selected={validDay} onSelect={setDay} />
          {validDay ? (
            <button type="button" onClick={() => setDay(null)} className="mt-2 min-h-11 text-sm font-semibold text-azul hover:underline">
              Mostrar todos os dias
            </button>
          ) : null}
        </div>

        <section aria-label="Lista de treinos" aria-busy={history.isFetching}>
          {history.isPending ? (
            <Spinner label="Carregando histórico…" />
          ) : history.isError ? (
            <Alert tone="erro">{history.error.message}</Alert>
          ) : history.data.items.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-linha p-6">
              <p className="mb-3 text-giz-suave">
                {validDay ? 'Nenhum treino neste dia.' : 'Seu histórico está vazio. Registre o primeiro treino!'}
              </p>
              <Link to="/treino" className="font-semibold text-azul hover:underline">
                Ir para Treinar
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-7">
                {weeks.map((w, wi) => (
                  <section key={w.start} aria-labelledby={`semana-${w.start}`}>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h2 id={`semana-${w.start}`} className="placar text-3xl">
                        {validDay ? capitalizeFirst(formatLocalDate(validDay, { weekday: 'long', day: 'numeric', month: 'long' })) : weekTitle(w.start, todayIso)}
                      </h2>
                      <p className="shrink-0 text-sm text-giz-suave">
                        <span className="num text-lg text-giz">{w.items.length}</span> {w.items.length === 1 ? 'treino' : 'treinos'},{' '}
                        <span className="num text-lg text-giz">{w.sets}</span> {w.sets === 1 ? 'série' : 'séries'}
                      </p>
                    </div>
                    <div className="relative">
                      <motion.span
                        className="absolute bottom-6 left-[19px] top-6 w-[6px] rounded-full bg-linha"
                        style={{
                          originY: 0,
                          backgroundImage:
                            'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.08) 0 1px, transparent 1px 4px)',
                        }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ type: 'spring', stiffness: 120, damping: 22, delay: wi * 0.08 }}
                        aria-hidden="true"
                      />
                      <ul className="relative flex flex-col gap-3">
                        {w.items.map((s, i) => (
                          <SessionCard key={s.id} s={s} index={i + wi * 2} />
                        ))}
                      </ul>
                    </div>
                  </section>
                ))}
              </div>
              {totalPages > 1 ? (
                <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-2">
                  <Button variant="secundario" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Anterior
                  </Button>
                  <span className="text-sm text-giz-suave">
                    Página {page} de {totalPages}
                  </span>
                  <Button variant="secundario" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Próxima
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

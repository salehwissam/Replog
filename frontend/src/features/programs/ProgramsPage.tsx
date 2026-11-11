import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { CalendarDays, Check, GitCompareArrows, Target, X } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { queryKeys, workoutsApi, type Program } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { letterColor, molaToque } from '@/lib/motion'

import { ApplyProgramActions, LevelMeter, MuscleBar, ProgramBarbell, WeekStrip } from './ProgramParts'
import { levelLabel, LEVELS, muscleColor, muscleLabel, muscleShares, parseDays, programStats } from './programUtils'

export { ProgramBarbell } from './ProgramParts'

type LevelFilter = 'todos' | (typeof LEVELS)[number]
type DaysFilter = 0 | 3 | 4 | 5 | 6

function FilterPills<T extends string | number>({
  label,
  options,
  value,
  onChange,
  id,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  id: string
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-32 shrink-0 text-sm text-giz-suave" id={`${id}-rotulo`}>
        {label}
      </span>
      <LayoutGroup id={id}>
        <div role="group" aria-labelledby={`${id}-rotulo`} className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                key={String(o.value)}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(o.value)}
                className={clsx(
                  'relative min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors',
                  active ? 'border-transparent text-white' : 'border-linha text-giz-suave hover:text-giz',
                )}
              >
                {active ? (
                  <motion.span layoutId="pilula" className="absolute inset-0 rounded-full bg-azul" transition={molaToque} />
                ) : null}
                <span className="relative">{o.label}</span>
              </button>
            )
          })}
        </div>
      </LayoutGroup>
    </div>
  )
}

export default function ProgramsPage() {
  const programs = useQuery({ queryKey: queryKeys.programs, queryFn: workoutsApi.programs, staleTime: Infinity })
  const [open, setOpen] = useState<Program | null>(null)
  const [level, setLevel] = useState<LevelFilter>('todos')
  const [days, setDays] = useState<DaysFilter>(0)
  const [compare, setCompare] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)

  const filtered = useMemo(
    () =>
      (programs.data ?? []).filter(
        (p) => (level === 'todos' || p.level === level) && (days === 0 || parseDays(p.days_per_week).includes(days)),
      ),
    [programs.data, level, days],
  )
  const byKey = new Map((programs.data ?? []).map((p) => [p.key, p]))
  const compared = compare.map((k) => byKey.get(k)).filter((p): p is Program => Boolean(p))

  const toggleCompare = (key: string) =>
    setCompare((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev.slice(-1), key]))

  return (
    <div>
      <PageHeader
        title="Programas prontos"
        subtitle="Escolha um programa e suas divisões A, B, C… ficam montadas na hora. Depois é só ajustar."
      />
      {programs.isPending ? (
        <PageLoader label="Carregando programas…" />
      ) : programs.isError ? (
        <Alert tone="erro">{programs.error.message}</Alert>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 rounded-[24px] border border-linha bg-aco-2 p-4">
            <FilterPills
              id="nivel"
              label="Nível"
              value={level}
              onChange={setLevel}
              options={[{ value: 'todos', label: 'Todos' }, ...LEVELS.map((l) => ({ value: l, label: levelLabel(l) }))]}
            />
            <FilterPills
              id="dias"
              label="Dias por semana"
              value={days}
              onChange={setDays}
              options={[
                { value: 0 as DaysFilter, label: 'Qualquer' },
                ...([3, 4, 5, 6] as const).map((d) => ({ value: d as DaysFilter, label: `${d} dias` })),
              ]}
            />
          </div>
          <p className="mb-3 text-sm text-giz-suave" aria-live="polite">
            {filtered.length === 1 ? '1 programa' : `${filtered.length} programas`}. Marque dois para comparar.
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-linha p-6">
              <p className="text-giz-suave">Nenhum programa com esses filtros.</p>
              <Button
                variant="secundario"
                className="mt-3"
                onClick={() => {
                  setLevel('todos')
                  setDays(0)
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : null}

          <motion.ul layout className="grid gap-4 md:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((p, i) => (
                <ProgramCard
                  key={p.key}
                  program={p}
                  index={i}
                  selected={compare.includes(p.key)}
                  onOpen={() => setOpen(p)}
                  onToggleCompare={() => toggleCompare(p.key)}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        </>
      )}

      <CompareTray
        programs={compared}
        onClear={() => setCompare([])}
        onRemove={(key) => setCompare((prev) => prev.filter((k) => k !== key))}
        onCompare={() => setComparing(true)}
      />
      <CompareDialog
        open={comparing && compared.length === 2}
        programs={compared}
        onClose={() => setComparing(false)}
        onPick={(p) => {
          setComparing(false)
          setOpen(p)
        }}
      />
      {open ? <ProgramSheet program={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function ProgramCard({
  program: p,
  index,
  selected,
  onOpen,
  onToggleCompare,
}: {
  program: Program
  index: number
  selected: boolean
  onOpen: () => void
  onToggleCompare: () => void
}) {
  const titleId = useId()
  const stats = programStats(p)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: Math.min(index, 6) * 0.05 }}
      className={clsx(
        'relative overflow-hidden rounded-[28px] border bg-superficie transition-colors',
        selected ? 'border-azul shadow-[0_0_0_1px_var(--anilha-azul)]' : 'border-linha hover:border-azul/60',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="group relative w-full p-5 pb-4 text-left transition active:scale-[0.99]"
      >
        <div className="knurl pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" aria-hidden="true" />
        <div className="relative -mx-2 -mt-1">
          <ProgramBarbell letters={p.splits.map((s) => s.letter)} />
        </div>
        <div className="relative mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <LevelMeter level={p.level} />
          <span className="flex items-center gap-1.5 text-sm text-giz-suave">
            <CalendarDays className="size-4" aria-hidden="true" /> {p.days_per_week}
          </span>
        </div>
        <h2 id={titleId} className="placar relative mt-2 text-4xl">
          {p.name}
        </h2>
        <p className="relative mt-1 flex items-start gap-2 text-sm text-giz-suave">
          <Target className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {p.goal}
        </p>
        <dl className="relative mt-4 grid grid-cols-3 gap-2 border-y border-linha/70 py-3">
          {(
            [
              ['Treinos', stats.workouts],
              ['Exercícios', stats.exercises],
              ['Séries no ciclo', stats.sets],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-giz-suave">{label}</dt>
              <dd className="placar text-3xl">{value}</dd>
            </div>
          ))}
        </dl>
        <MuscleBar muscles={stats.muscles} legend={3} className="relative mt-3" delay={0.2 + index * 0.05} />
        <div className="relative mt-4 flex flex-wrap gap-2">
          {p.splits.map((s) => (
            <span key={s.letter} className="flex items-center gap-1.5 rounded-full bg-superficie-2 py-1 pl-1 pr-3 text-sm">
              <Plate color={letterColor(s.letter)} letter={s.letter} className="size-6" />
              {s.name}
            </span>
          ))}
        </div>
      </button>
      <div className="flex items-center justify-between gap-3 border-t border-linha/70 bg-aco-2/60 px-5 py-2">
      <button
        type="button"
        onClick={onToggleCompare}
        aria-pressed={selected}
        aria-describedby={titleId}
        className={clsx(
          'flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition active:scale-95',
          selected ? 'border-azul bg-azul text-white' : 'border-linha text-giz-suave hover:text-giz',
        )}
      >
        <span
          className={clsx(
            'flex size-4 items-center justify-center rounded border',
            selected ? 'border-white bg-white text-azul' : 'border-giz-suave',
          )}
          aria-hidden="true"
        >
          {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        Comparar
      </button>
      <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true" className="text-sm font-semibold text-azul hover:underline">
        Ver treinos
      </button>
      </div>
    </motion.li>
  )
}

function CompareTray({
  programs,
  onClear,
  onRemove,
  onCompare,
}: {
  programs: Program[]
  onClear: () => void
  onRemove: (key: string) => void
  onCompare: () => void
}) {
  return createPortal(
    <AnimatePresence>
      {programs.length > 0 ? (
        <motion.div
          role="region"
          aria-label="Comparação de programas"
          className="fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.5rem)] z-30 mx-auto max-w-md rounded-[24px] border border-azul/50 bg-superficie/95 p-3 shadow-[var(--sombra)] backdrop-blur-xl lg:bottom-6 lg:left-[calc(18rem+1.5rem)] lg:max-w-lg"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ul className="flex min-w-0 flex-1 gap-1.5">
              <AnimatePresence initial={false} mode="popLayout">
                {programs.map((p) => (
                  <motion.li
                    key={p.key}
                    layout
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-superficie-2 py-1 pl-3 pr-1 text-sm"
                  >
                    <span className="truncate">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(p.key)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-giz-suave hover:bg-linha hover:text-giz"
                      aria-label="Tirar da comparação"
                    >
                      <X className="size-3.5" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              {programs.length < 2 ? (
                <li className="flex flex-1 items-center justify-center rounded-full border border-dashed border-linha px-3 text-xs text-giz-suave">
                  Escolha mais um
                </li>
              ) : null}
            </ul>
            {programs.length === 2 ? (
              <Button icon={<GitCompareArrows className="size-4" />} onClick={onCompare} className="w-full sm:w-auto">
                Comparar
              </Button>
            ) : (
              <button type="button" onClick={onClear} className="min-h-10 self-end px-2 text-sm text-giz-suave hover:text-giz sm:self-auto">
                Limpar
              </button>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

function CompareDialog({
  open,
  programs,
  onClose,
  onPick,
}: {
  open: boolean
  programs: Program[]
  onClose: () => void
  onPick: (p: Program) => void
}) {
  const [a, b] = programs
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Comparação"
      footer={
        a && b ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secundario" onClick={() => onPick(a)}>
              Ver {a.name}
            </Button>
            <Button variant="secundario" onClick={() => onPick(b)}>
              Ver {b.name}
            </Button>
          </div>
        ) : null
      }
    >
      {a && b ? <CompareBody a={a} b={b} /> : null}
    </Dialog>
  )
}

function CompareBody({ a, b }: { a: Program; b: Program }) {
  const sa = programStats(a)
  const sb = programStats(b)
  const rows: [string, string | number, string | number][] = [
    ['Nível', levelLabel(a.level), levelLabel(b.level)],
    ['Dias por semana', a.days_per_week, b.days_per_week],
    ['Treinos no ciclo', sa.workouts, sb.workouts],
    ['Exercícios', sa.exercises, sb.exercises],
    ['Séries no ciclo', sa.sets, sb.sets],
    ['Séries por treino', Math.round(sa.sets / sa.workouts), Math.round(sb.sets / sb.workouts)],
  ]
  const keys = Array.from(new Set([...sa.muscles.map((m) => m.key), ...sb.muscles.map((m) => m.key)]))
  const setsOf = (s: typeof sa, key: string) => s.muscles.find((m) => m.key === key)?.sets ?? 0
  const max = Math.max(1, ...keys.map((k) => Math.max(setsOf(sa, k), setsOf(sb, k))))
  keys.sort((x, y) => setsOf(sa, y) + setsOf(sb, y) - (setsOf(sa, x) + setsOf(sb, x)))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((p) => (
          <div key={p.key} className="min-w-0">
            <ProgramBarbell letters={p.splits.map((s) => s.letter)} height={44} />
            <p className="placar mt-1 text-2xl">{p.name}</p>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">
          {a.name} comparado a {b.name}
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Item</th>
            <th scope="col">{a.name}</th>
            <th scope="col">{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, va, vb]) => (
            <tr key={label} className="border-b border-linha/60 last:border-b-0">
              <th scope="row" className="py-2 pr-2 text-left font-normal text-giz-suave">
                {label}
              </th>
              <td className={clsx('py-2 text-right', typeof va === 'number' ? 'num text-xl' : 'font-medium')}>{va}</td>
              <td className={clsx('py-2 pl-4 text-right', typeof vb === 'number' ? 'num text-xl' : 'font-medium')}>{vb}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section aria-labelledby="cmp-musculos">
        <h3 id="cmp-musculos" className="mb-3 font-semibold">
          Séries por grupo muscular
        </h3>
        <ul className="flex flex-col gap-2">
          {keys.map((k, i) => {
            const va = setsOf(sa, k)
            const vb = setsOf(sb, k)
            return (
              <li key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="flex items-center justify-end gap-2">
                  <span className="num text-base text-giz-suave">{va || ''}</span>
                  <motion.span
                    className="h-3 rounded-l-full"
                    style={{ background: muscleColor(k) }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(va / max) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 170, damping: 24, delay: i * 0.03 }}
                  />
                </span>
                <span className="w-24 text-center text-xs">{muscleLabel(k === 'outros' ? null : k)}</span>
                <span className="flex items-center gap-2">
                  <motion.span
                    className="h-3 rounded-r-full"
                    style={{ background: muscleColor(k), opacity: 0.75 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(vb / max) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 170, damping: 24, delay: i * 0.03 }}
                  />
                  <span className="num text-base text-giz-suave">{vb || ''}</span>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 grid grid-cols-[1fr_auto_1fr] text-xs text-giz-suave" aria-hidden="true">
          <span className="truncate text-right">{a.name}</span>
          <span className="w-24" />
          <span className="truncate">{b.name}</span>
        </p>
      </section>
    </div>
  )
}

function ProgramSheet({ program, onClose }: { program: Program; onClose: () => void }) {
  const dayOptions = parseDays(program.days_per_week)
  const [days, setDays] = useState(dayOptions[0] ?? program.splits.length)
  const stats = programStats(program)

  return (
    <Dialog open onClose={onClose} title={program.name} footer={<ApplyProgramActions program={program} />}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LevelMeter level={program.level} />
        <span className="flex items-center gap-1.5 text-sm text-giz-suave">
          <CalendarDays className="size-4" aria-hidden="true" /> {program.days_per_week}
        </span>
      </div>
      <p className="mt-3 text-giz-suave">{program.description}</p>

      <section aria-labelledby="semana-programa" className="mt-5 rounded-[22px] border border-linha bg-aco-2 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="semana-programa" className="font-semibold">
            Sua semana
          </h3>
          {dayOptions.length > 1 ? (
            <div className="flex gap-1" role="group" aria-label="Dias por semana">
              {dayOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={d === days}
                  onClick={() => setDays(d)}
                  className={clsx(
                    'min-h-9 rounded-full px-3 text-sm font-semibold transition',
                    d === days ? 'bg-azul text-white' : 'text-giz-suave hover:bg-superficie-2',
                  )}
                >
                  {d} dias
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <WeekStrip days={days} letters={program.splits.map((s) => s.letter)} />
      </section>

      <section aria-labelledby="musculos-programa" className="mt-5">
        <h3 id="musculos-programa" className="mb-2 font-semibold">
          Séries por grupo muscular no ciclo
        </h3>
        <MuscleBar muscles={stats.muscles} legend={6} />
      </section>

      <div className="mt-6 flex flex-col gap-6">
        {program.splits.map((split, si) => {
          const muscles = muscleShares(split.exercises)
          return (
            <motion.section
              key={split.letter}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.1 + si * 0.08 }}
            >
              <h3 className="flex items-center gap-3">
                <Plate color={letterColor(split.letter)} letter={split.letter} className="size-10" />
                <span className="placar text-2xl">{split.name}</span>
              </h3>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Grupos musculares do treino ${split.letter}`}>
                {muscles.map((m) => (
                  <li key={m.key} className="flex items-center gap-1.5 rounded-full border border-linha px-2.5 py-0.5 text-xs">
                    <span className="size-2 rounded-full" style={{ background: muscleColor(m.key) }} aria-hidden="true" />
                    {m.label}
                    <span className="num text-sm text-giz-suave">{m.sets}</span>
                  </li>
                ))}
              </ul>
              <ol className="mt-2 divide-y divide-linha/70 rounded-2xl border border-linha bg-superficie-2/40">
                {split.exercises.map((e) => (
                  <li key={e.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block">{e.name}</span>
                      <span className="block text-xs text-giz-suave">
                        {muscleLabel(e.muscle_group)}, descanso de {e.rest_seconds}s
                      </span>
                    </span>
                    <span className="num shrink-0 text-lg text-giz-suave">
                      {e.target_sets}×{e.target_reps}
                    </span>
                  </li>
                ))}
              </ol>
            </motion.section>
          )
        })}
      </div>
    </Dialog>
  )
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useState } from 'react'

import { analyticsApi, analyticsKeys, HEATMAP_DAYS, optionalQuery } from '@/api/analytics'
import { queryKeys, workoutsApi, type VolumeBucket } from '@/api/workouts'
import { SimpleBarChart } from '@/components/charts/BarChartCard'
import { MuscleBars } from '@/components/charts/MuscleBars'
import { PlateHeatmap } from '@/components/charts/PlateHeatmap'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Spinner } from '@/components/ui/Spinner'
import { ExerciseProgress } from '@/features/records/ExerciseProgress'
import { plural } from '@/lib/format'

function ChartSection({
  id,
  title,
  description,
  aside,
  children,
  className,
}: {
  id: string
  title: string
  description: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={clsx('rounded-[28px] border border-linha bg-superficie p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="text-sm text-giz-suave">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function useBuckets(period: 'week' | 'month', count: number) {
  return useQuery({ queryKey: queryKeys.volume(period, count), queryFn: () => workoutsApi.volume(period, count) })
}

function renderBuckets(
  q: { isPending: boolean; isError: boolean; error: Error | null; data?: VolumeBucket[] },
  render: (data: VolumeBucket[]) => React.ReactNode,
) {
  if (q.isPending) return <Spinner />
  if (q.isError || !q.data) return <Alert tone="erro">{q.error?.message ?? 'Erro ao carregar.'}</Alert>
  return render(q.data)
}

function TrainingMap() {
  const q = useQuery({ queryKey: analyticsKeys.heatmap(HEATMAP_DAYS), queryFn: () => analyticsApi.heatmap(), ...optionalQuery })
  if (!q.data || q.data.length === 0) return null
  const trainedDays = q.data.filter((d) => d.workouts > 0).length
  const sets = q.data.reduce((s, d) => s + (d.sets ?? 0), 0)

  return (
    <ChartSection
      id="mapa-treinos"
      title="Mapa de treinos"
      description="Últimos 6 meses. Cada dia treinado é uma anilha: quanto maior, mais séries."
      className="faixa-aco"
    >
      <div className={trainedDays === 0 ? 'hidden' : 'mb-5 flex flex-wrap gap-x-10 gap-y-2'}>
        <p>
          <span className="placar text-6xl">
            <AnimatedNumber value={trainedDays} />
          </span>
          <span className="ml-2 text-giz-suave">{trainedDays === 1 ? 'dia de treino' : 'dias de treino'}</span>
        </p>
        <p>
          <span className="placar text-6xl">
            <AnimatedNumber value={sets} />
          </span>
          <span className="ml-2 text-giz-suave">{sets === 1 ? 'série no período' : 'séries no período'}</span>
        </p>
      </div>
      <PlateHeatmap days={q.data} />
    </ChartSection>
  )
}

const PERIODS = [
  { weeks: 4, label: '4 semanas' },
  { weeks: 12, label: '3 meses' },
  { weeks: 26, label: '6 meses' },
]

function MuscleSection() {
  const [weeks, setWeeks] = useState(4)
  const q = useQuery({
    queryKey: analyticsKeys.muscles(weeks),
    queryFn: () => analyticsApi.muscles(weeks),
    placeholderData: keepPreviousData,
    ...optionalQuery,
  })
  if (q.isError || !q.data) return null
  const label = PERIODS.find((p) => p.weeks === weeks)!.label

  return (
    <ChartSection
      id="grupos-musculares"
      title="Grupos musculares"
      description="Séries que contam (sem aquecimento) por grupo."
      aside={
        <div role="radiogroup" aria-label="Período dos grupos musculares" className="flex rounded-full border border-linha p-1">
          {PERIODS.map((p) => (
            <button
              key={p.weeks}
              type="button"
              role="radio"
              aria-checked={weeks === p.weeks}
              onClick={() => setWeeks(p.weeks)}
              className={clsx(
                'min-h-9 rounded-full px-3 text-sm font-medium transition',
                weeks === p.weeks ? 'bg-azul text-white' : 'text-giz-suave hover:text-giz',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      <div className={clsx('transition-opacity', q.isPlaceholderData && 'opacity-50')}>
        {q.data.length === 0 ? (
          <p className="text-giz-suave">Nenhuma série registrada nas últimas {label}.</p>
        ) : (
          <MuscleBars key={weeks} data={q.data} caption={`Séries por grupo muscular nas últimas ${label}`} />
        )}
      </div>
    </ChartSection>
  )
}

export default function StatsPage() {
  const weekly = useBuckets('week', 12)
  const monthly = useBuckets('month', 12)
  const prs = useQuery({ queryKey: ['records', 'per-month'], queryFn: () => workoutsApi.recordsPerMonth(12) })
  const records = useQuery({ queryKey: queryKeys.records, queryFn: workoutsApi.records })
  const [exerciseId, setExerciseId] = useState<number | null>(null)
  const selected = exerciseId ?? records.data?.[0]?.exercise.id ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Estatísticas" subtitle="Sua evolução em números." />

      <TrainingMap />
      <MuscleSection />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSection id="series-semana" title="Séries por semana" description="Séries de trabalho por semana (12 semanas)">
          {renderBuckets(weekly, (data) => (
            <SimpleBarChart
              unit="séries"
              valueLabel="Séries"
              ariaLabel="Séries por semana nas últimas 12 semanas"
              data={data.map((b) => ({ label: b.label, value: b.sets, detail: plural(b.workouts, 'treino', 'treinos') }))}
            />
          ))}
        </ChartSection>

        <ChartSection id="frequencia" title="Frequência de treinos" description="Treinos por semana (12 semanas)">
          {renderBuckets(weekly, (data) => (
            <SimpleBarChart
              unit="treinos"
              valueLabel="Treinos"
              ariaLabel="Frequência de treinos por semana"
              data={data.map((b) => ({ label: b.label, value: b.workouts }))}
            />
          ))}
        </ChartSection>

        <ChartSection id="series-mes" title="Séries por mês" description="Séries de trabalho por mês (12 meses)">
          {renderBuckets(monthly, (data) => (
            <SimpleBarChart
              unit="séries"
              valueLabel="Séries"
              ariaLabel="Séries por mês nos últimos 12 meses"
              data={data.map((b) => ({ label: b.label, value: b.sets, detail: plural(b.workouts, 'treino', 'treinos') }))}
            />
          ))}
        </ChartSection>

        <ChartSection id="recordes-mes" title="Recordes pessoais" description="Marcas superadas por mês (12 meses)">
          {renderBuckets(prs, (data) => (
            <SimpleBarChart
              unit="recordes"
              valueLabel="Recordes"
              ariaLabel="Recordes superados por mês"
              data={data.map((b) => ({ label: b.label, value: b.workouts }))}
            />
          ))}
        </ChartSection>
      </div>

      <ChartSection
        id="desempenho"
        title="Desempenho por exercício"
        description="Escolha um exercício para ver a evolução das cargas."
      >
        {records.isPending ? (
          <Spinner />
        ) : records.isError ? (
          <Alert tone="erro">{records.error.message}</Alert>
        ) : records.data.length === 0 ? (
          <p className="text-giz-suave">Registre séries para acompanhar a evolução de cada exercício.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex max-w-sm flex-col gap-1.5 text-sm font-medium">
              Exercício
              <select
                value={selected ?? ''}
                onChange={(e) => setExerciseId(Number(e.target.value))}
                className="min-h-12 rounded-2xl border border-linha bg-superficie-2 px-3 text-base"
              >
                {records.data.map((r) => (
                  <option key={r.exercise.id} value={r.exercise.id}>
                    {r.exercise.name}
                  </option>
                ))}
              </select>
            </label>
            {selected ? <ExerciseProgress key={selected} exerciseId={selected} /> : null}
          </div>
        )}
      </ChartSection>
    </div>
  )
}

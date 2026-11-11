import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useState } from 'react'

import { queryKeys, workoutsApi, type ProgressPoint } from '@/api/workouts'
import { DataTable } from '@/components/charts/DataTable'
import { SimpleLineChart } from '@/components/charts/LineChartCard'
import { Alert } from '@/components/ui/Alert'
import { Spinner } from '@/components/ui/Spinner'
import { formatLocalDate, formatNumber } from '@/lib/format'

type Metric = 'top_weight_kg' | 'best_est_1rm' | 'total_reps'

const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'top_weight_kg', label: 'Carga máxima', unit: 'kg' },
  { key: 'best_est_1rm', label: '1RM estimado', unit: 'kg' },
  { key: 'total_reps', label: 'Repetições', unit: 'reps' },
]

export function ExerciseProgress({ exerciseId }: { exerciseId: number }) {
  const [metric, setMetric] = useState<Metric>('top_weight_kg')
  const progress = useQuery({
    queryKey: queryKeys.progress(exerciseId),
    queryFn: () => workoutsApi.exerciseProgress(exerciseId),
  })
  const current = METRICS.find((m) => m.key === metric)!

  if (progress.isPending) return <Spinner label="Carregando evolução…" />
  if (progress.isError) return <Alert tone="erro">{progress.error.message}</Alert>
  if (progress.data.length === 0) {
    return <p className="text-giz-suave">Ainda não há séries registradas para este exercício.</p>
  }

  const data = progress.data.map((p: ProgressPoint) => ({
    label: formatLocalDate(p.local_date, { day: '2-digit', month: '2-digit' }),
    value: p[metric],
    detail: formatLocalDate(p.local_date),
  }))
  const values = data.map((d) => d.value).filter((v): v is number => v != null)
  const first = values[0]
  const last = values.at(-1)

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Métrica do gráfico" className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={metric === m.key}
            onClick={() => setMetric(m.key)}
            className={clsx(
              'min-h-9 rounded-full border px-3 text-sm',
              metric === m.key ? 'border-azul bg-azul text-white' : 'border-linha text-giz-suave hover:text-giz',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {first != null && last != null && values.length > 1 ? (
        <p className="text-sm text-giz-suave">
          De <span className="num text-base text-giz">{formatNumber(first)}</span> para{' '}
          <span className="num text-base text-giz">{formatNumber(last)}</span> {current.unit} em {values.length} sessões
        </p>
      ) : null}
      {values.length === 0 ? (
        <p className="text-giz-suave">Sem dados para esta métrica (o 1RM só é estimado com até 12 repetições e carga acima de zero).</p>
      ) : (
        <SimpleLineChart data={data} unit={current.unit} ariaLabel={`Evolução: ${current.label}`} />
      )}
      <DataTable
        caption={`Evolução: ${current.label}`}
        columns={['Data', current.label]}
        rows={data.map((d) => [d.detail, d.value != null ? `${formatNumber(d.value)} ${current.unit}` : '—'])}
      />
    </div>
  )
}

import { clsx } from 'clsx'

import type { ExerciseComparison } from '@/api/workouts'
import { formatLocalDate, formatNumber, plural } from '@/lib/format'

function Delta({ value, unit, label }: { value: number; unit?: string; label: string }) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <div className="flex flex-col">
      <span className="text-xs text-giz-suave">{label}</span>
      <span
        className={clsx(
          'num text-lg font-bold',
          value > 0 && 'text-verde',
          value < 0 && 'text-vermelha',
          value === 0 && 'text-giz-suave',
        )}
      >
        {sign}
        {formatNumber(Math.abs(value))}
        {unit ? <span className="ml-0.5 text-xs">{unit}</span> : null}
      </span>
    </div>
  )
}

export function Comparison({ comparison }: { comparison: ExerciseComparison | null }) {
  if (!comparison) {
    return <p className="text-xs text-giz-suave">Primeira vez registrando este exercício.</p>
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-giz-suave">
        Comparado a {formatLocalDate(comparison.previous_date)} (
        {plural(comparison.previous.sets, 'série', 'séries')}, máx. {formatNumber(comparison.previous.top_weight_kg)} kg)
      </p>
      <div className="flex gap-6">
        <Delta label="Carga máxima" value={comparison.delta_top_weight_kg} unit="kg" />
        <Delta label="Repetições" value={comparison.delta_total_reps} />
      </div>
    </div>
  )
}

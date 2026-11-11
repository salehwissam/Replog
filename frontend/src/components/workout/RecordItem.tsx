import { Trophy } from 'lucide-react'

import { RECORD_LABELS, type PersonalRecord } from '@/api/workouts'
import { formatNumber } from '@/lib/format'

export function recordUnit(r: Pick<PersonalRecord, 'record_type'>): string {
  return r.record_type === 'max_reps' ? 'reps' : 'kg'
}

export function RecordItem({ record, showExercise = true }: { record: PersonalRecord; showExercise?: boolean }) {
  const unit = recordUnit(record)
  const gain = record.previous_value != null ? record.value - record.previous_value : null
  return (
    <li className="flex items-center gap-3 py-2">
      <Trophy className="size-5 shrink-0 text-amarela" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {showExercise ? <p className="truncate font-medium">{record.exercise_name}</p> : null}
        <p className="text-sm text-giz-suave">{RECORD_LABELS[record.record_type]}</p>
      </div>
      <div className="text-right">
        <p className="num text-xl font-bold">
          {formatNumber(record.value)} <span className="text-sm text-giz-suave">{unit}</span>
        </p>
        {gain != null ? (
          <p className="text-xs text-verde">
            +{formatNumber(gain)} {unit}
          </p>
        ) : (
          <p className="text-xs text-giz-suave">primeira marca</p>
        )}
      </div>
    </li>
  )
}

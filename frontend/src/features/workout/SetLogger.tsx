import { clsx } from 'clsx'
import { Repeat2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { ApiError } from '@/api/client'
import type { Exercise, ExerciseSuggestion, SetType, SetValues } from '@/api/workouts'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { BarbellLoad } from '@/components/workout/BarbellLoad'
import { RpePicker } from '@/components/workout/RpePicker'
import { SetTypePicker } from '@/components/workout/SetTypePicker'
import { SuggestionCard } from '@/components/workout/SuggestionCard'
import { formatNumber } from '@/lib/format'

export function parseDecimal(value: string): number {
  return Number(value.trim().replace(',', '.'))
}

export function validateSet(weight: string, reps: string): { weight?: string; reps?: string } {
  const errors: { weight?: string; reps?: string } = {}
  const w = parseDecimal(weight)
  const r = Number(reps)
  if (weight.trim() === '' || !Number.isFinite(w)) errors.weight = 'Informe a carga.'
  else if (w < 0 || w > 1500) errors.weight = 'A carga deve estar entre 0 e 1500 kg.'
  else if (Math.round(w * 100) !== w * 100) errors.weight = 'Use no máximo 2 casas decimais.'
  if (!Number.isInteger(r) || r < 1) errors.reps = 'Informe ao menos 1 repetição.'
  else if (r > 1000) errors.reps = 'Repetições demais.'
  return errors
}

const BARBELL_EQUIPMENT = new Set(['barra', 'smith'])

const toText = (n: number) => String(n).replace('.', ',')

export interface RepeatableSet {
  reps: number
  weight_kg: number
  set_type?: SetType
}

export function SetLogger({
  exercise,
  defaultReps,
  defaultWeight,
  defaultType = 'normal',
  pending,
  error,
  lifted = false,
  suggestion,
  lastSet,
  onSubmit,
}: {
  exercise: Exercise
  defaultReps: number
  defaultWeight: number
  defaultType?: SetType
  pending: boolean
  error: Error | null
  lifted?: boolean
  suggestion?: ExerciseSuggestion | null
  lastSet?: RepeatableSet | null
  onSubmit: (v: SetValues) => void
}) {
  const [weight, setWeight] = useState(toText(defaultWeight))
  const [reps, setReps] = useState(String(defaultReps))
  const [type, setType] = useState<SetType>(defaultType)
  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [errors, setErrors] = useState<{ weight?: string; reps?: string }>({})

  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let io: IntersectionObserver
    try {
      io = new IntersectionObserver(
        ([entry]) => setStuck(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top > 0)),
        { rootMargin: '0px 0px -112px 0px' },
      )
    } catch {
      return
    }
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const serverFields = error instanceof ApiError ? error.fields : {}
  const weightLabel = exercise.is_bodyweight ? 'Carga extra' : 'Carga'
  const warmup = type === 'aquecimento'
  const target = suggestion?.suggestion
  const applied = target != null && parseDecimal(weight) === target.weight_kg && Number(reps) === target.reps

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const found = validateSet(weight, reps)
        setErrors(found)
        if (found.weight || found.reps) return
        onSubmit({ reps: Number(reps), weight_kg: parseDecimal(weight), notes: notes.trim() || null, set_type: type, rpe })
      }}
    >
      {error && !serverFields.weight_kg && !serverFields.reps ? <Alert tone="erro">{error.message}</Alert> : null}

      {suggestion ? (
        <SuggestionCard
          data={suggestion}
          applied={applied}
          onUse={() => {
            if (!target) return
            setWeight(toText(target.weight_kg))
            setReps(String(target.reps))
            setErrors({})
          }}
        />
      ) : null}

      {BARBELL_EQUIPMENT.has(exercise.equipment) ? <BarbellLoad totalKg={parseDecimal(weight)} lifted={lifted} /> : null}

      <SetTypePicker value={type} onChange={setType} />

      <div
        className={clsx(
          'grid grid-cols-1 gap-3 rounded-[26px] transition-[outline-color,padding] sm:grid-cols-2',
          warmup ? 'p-2 outline-2 outline-dashed outline-giz-suave/45' : 'outline-transparent',
        )}
      >
        <AnimatePresence initial={false}>
          {warmup ? (
            <motion.p
              key="aviso"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-1 text-sm text-giz-suave sm:col-span-2"
            >
              Aquecimento: aparece no treino, mas não conta para recordes nem para as séries.
            </motion.p>
          ) : null}
        </AnimatePresence>
        <Stepper
          label={weightLabel}
          value={weight}
          onChange={setWeight}
          step={exercise.equipment === 'halter' ? 1 : 2.5}
          max={1500}
          unit="kg"
          decimals={2}
          error={errors.weight ?? serverFields.weight_kg}
        />
        <Stepper
          label="Repetições"
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          max={1000}
          unit="reps"
          error={errors.reps ?? serverFields.reps}
        />
      </div>

      <RpePicker value={rpe} onChange={setRpe} />

      {showNotes ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Observação da série
          <input
            value={notes}
            maxLength={280}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: falhei na última, pegada fechada…"
            className="min-h-12 rounded-2xl border border-linha bg-superficie-2 px-4 text-base font-normal focus:border-azul focus:outline-none focus:ring-4 focus:ring-azul/25"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="min-h-11 self-start text-sm font-medium text-azul hover:underline"
        >
          Adicionar observação
        </button>
      )}

      <div
        className={clsx(
          'sticky bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+6.6rem)] z-20 -mx-2 flex gap-2 rounded-[26px] bg-superficie/90 p-2 backdrop-blur-xl lg:bottom-4',
          'before:pointer-events-none before:absolute before:inset-x-0 before:top-[calc(100%-1.5rem)] before:-z-10 before:h-32 before:bg-superficie before:transition-opacity before:duration-200 lg:before:hidden',
          stuck ? 'before:opacity-100' : 'before:opacity-0',
        )}
      >
        {lastSet ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              onSubmit({
                reps: lastSet.reps,
                weight_kg: lastSet.weight_kg,
                notes: null,
                set_type: lastSet.set_type ?? 'normal',
                rpe: null,
              })
            }
            aria-label={`Repetir última série: ${lastSet.reps} × ${formatNumber(lastSet.weight_kg)} kg`}
            className="flex min-h-16 w-[38%] shrink-0 touch-manipulation flex-col items-center justify-center rounded-2xl border border-linha bg-aco-2 px-2 leading-tight text-giz transition active:scale-[0.96] disabled:opacity-60"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Repeat2 className="size-4 text-azul" aria-hidden="true" /> Repetir
            </span>
            <span className="num text-xl">
              {lastSet.reps} × {formatNumber(lastSet.weight_kg)}
            </span>
          </button>
        ) : null}
        <Button type="submit" size="lg" loading={pending} className="min-h-16 flex-1 text-xl">
          Registrar série
        </Button>
      </div>
      <div ref={sentinel} aria-hidden="true" className="-mt-4 h-px" />
    </form>
  )
}

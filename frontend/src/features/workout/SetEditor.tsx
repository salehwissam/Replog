import { useState } from 'react'

import { ApiError } from '@/api/client'
import type { SetType, SetValues, WorkoutSet } from '@/api/workouts'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Stepper } from '@/components/ui/Stepper'
import { RpePicker } from '@/components/workout/RpePicker'
import { SetTypePicker } from '@/components/workout/SetTypePicker'

import { parseDecimal, validateSet } from './SetLogger'

type SaveFn = (v: SetValues) => void

export function SetEditor({
  set,
  pending,
  error,
  onClose,
  onSave,
}: {
  set: WorkoutSet | null
  pending: boolean
  error: Error | null
  onClose: () => void
  onSave: SaveFn
}) {
  return (
    <Dialog open={set != null} onClose={onClose} title={set ? `Editar série ${set.set_number}` : 'Editar série'}>
      {set ? <EditorForm key={set.id} set={set} pending={pending} error={error} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  )
}

function EditorForm({
  set,
  pending,
  error,
  onClose,
  onSave,
}: {
  set: WorkoutSet
  pending: boolean
  error: Error | null
  onClose: () => void
  onSave: SaveFn
}) {
  const [weight, setWeight] = useState(() => String(set.weight_kg).replace('.', ','))
  const [reps, setReps] = useState(() => String(set.reps))
  const [notes, setNotes] = useState(() => set.notes ?? '')
  const [type, setType] = useState<SetType>(() => set.set_type ?? 'normal')
  const [rpe, setRpe] = useState<number | null>(() => set.rpe ?? null)
  const [errors, setErrors] = useState<{ weight?: string; reps?: string }>({})
  const serverFields = error instanceof ApiError ? error.fields : {}

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const found = validateSet(weight, reps)
        setErrors(found)
        if (found.weight || found.reps) return
        onSave({ reps: Number(reps), weight_kg: parseDecimal(weight), notes: notes.trim() || null, set_type: type, rpe })
      }}
    >
      {error && !serverFields.weight_kg && !serverFields.reps ? <Alert tone="erro">{error.message}</Alert> : null}
      <SetTypePicker value={type} onChange={setType} />
      <Stepper label="Carga" value={weight} onChange={setWeight} step={2.5} max={1500} unit="kg" decimals={2} error={errors.weight ?? serverFields.weight_kg} />
      <Stepper label="Repetições" value={reps} onChange={setReps} step={1} min={1} max={1000} unit="reps" error={errors.reps ?? serverFields.reps} />
      <RpePicker value={rpe} onChange={setRpe} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Observação
        <input
          value={notes}
          maxLength={280}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-11 rounded-lg border border-linha bg-superficie-2 px-3 text-base font-normal focus:outline-none focus:ring-2 focus:ring-azul"
        />
      </label>
      <div className="flex gap-2">
        <Button variant="fantasma" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          Salvar série
        </Button>
      </div>
    </form>
  )
}

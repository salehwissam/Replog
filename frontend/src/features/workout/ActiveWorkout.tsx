import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Check, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { invalidateTrainingData } from '@/api/invalidate'
import {
  queryKeys,
  setPayload,
  validTargetReps,
  workoutsApi,
  type Exercise,
  type Intensity,
  type SetValues,
  type WorkoutSession,
  type WorkoutSet,
} from '@/api/workouts'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Comparison } from '@/components/workout/Comparison'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import { IntensityPicker } from '@/components/workout/IntensityPicker'
import { RestTimer, type RestTimerHandle } from '@/components/workout/RestTimer'
import { SetPlates } from '@/components/workout/SetPlates'
import { SetRow } from '@/components/workout/SetRow'
import { formatDuration, formatNumber, plural } from '@/lib/format'

import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { useCelebration } from '@/features/celebration/Celebration'
import { letterColor, molaToque } from '@/lib/motion'

import { SetEditor } from './SetEditor'
import { SetLogger } from './SetLogger'
import { useWakeLock } from './useWakeLock'

function countedSets(session: WorkoutSession, exerciseId: number): number {
  return (
    session.exercises
      .find((b) => b.exercise.id === exerciseId)
      ?.sets.filter((s) => s.set_type !== 'aquecimento').length ?? 0
  )
}

function restSinceLastSet(session: WorkoutSession): number | null {
  const last = session.exercises
    .flatMap((b) => b.sets)
    .reduce<string | null>((acc, s) => (acc && acc > s.performed_at ? acc : s.performed_at), null)
  if (!last) return null
  return Math.min(3600, Math.max(0, Math.round((Date.now() - new Date(last).getTime()) / 1000)))
}

function useElapsed(startedAt: string): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000)
}

export function ActiveWorkout({ session }: { session: WorkoutSession }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const elapsed = useElapsed(session.started_at)
  useWakeLock()

  const queue = useMemo(() => {
    const items: { exercise: Exercise; restSeconds: number; targetReps: string | null; targetSets: number | null }[] = []
    const seen = new Set<number>()
    for (const se of session.split?.exercises ?? []) {
      items.push({ exercise: se.exercise, restSeconds: se.rest_seconds, targetReps: se.target_reps, targetSets: se.target_sets })
      seen.add(se.exercise.id)
    }
    for (const block of session.exercises) {
      if (!seen.has(block.exercise.id)) {
        items.push({ exercise: block.exercise, restSeconds: 90, targetReps: null, targetSets: null })
        seen.add(block.exercise.id)
      }
    }
    return items
  }, [session])

  const [currentId, setCurrentId] = useState<number | null>(
    () => session.exercises.at(-1)?.exercise.id ?? queue[0]?.exercise.id ?? null,
  )
  const [extra, setExtra] = useState<Exercise | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState<WorkoutSet | null>(null)
  const [deleting, setDeleting] = useState<WorkoutSet | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const timerRef = useRef<RestTimerHandle>(null)
  const [lifted, setLifted] = useState(false)
  const { celebrate, showSummary } = useCelebration()
  const sectionRef = useRef<HTMLElement>(null)

  const fullQueue = extra && !queue.some((q) => q.exercise.id === extra.id)
    ? [...queue, { exercise: extra, restSeconds: 90, targetReps: null, targetSets: null }]
    : queue
  const current = fullQueue.find((q) => q.exercise.id === currentId) ?? null
  const block = session.exercises.find((b) => b.exercise.id === currentId) ?? null
  const recordSetIds = new Set(session.records.filter((r) => r.previous_value != null).map((r) => r.set_id))

  const refresh = (data?: WorkoutSession) => {
    if (data) queryClient.setQueryData(queryKeys.active, data)
    else queryClient.invalidateQueries({ queryKey: queryKeys.active })
    void invalidateTrainingData(queryClient)
  }

  const progress = useQuery({
    queryKey: queryKeys.progress(currentId ?? 0),
    queryFn: () => workoutsApi.exerciseProgress(currentId!),
    enabled: currentId != null,
    staleTime: 60_000,
  })

  const targetReps = validTargetReps(current?.targetReps)
  const suggestion = useQuery({
    queryKey: queryKeys.suggestion(currentId ?? 0, targetReps),
    queryFn: () => workoutsApi.suggestion(currentId!, targetReps),
    enabled: currentId != null,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const addSet = useMutation({
    mutationFn: (input: SetValues) => {
      const rest = restSinceLastSet(session)
      return workoutsApi.addSet(session.id, { exercise_id: currentId!, ...setPayload(input), rest_seconds: rest })
    },
    onSuccess: (res) => {
      refresh()
      setLifted(true)
      window.setTimeout(() => setLifted(false), 420)
      const beaten = res.new_records.filter((r) => r.previous_value != null)
      if (beaten.length > 0) celebrate(beaten)
      timerRef.current?.start(current?.restSeconds ?? 90)
    },
  })

  const updateSet = useMutation({
    mutationFn: ({ id, known, rest_seconds, ...values }: SetValues & { id: number; known: boolean; rest_seconds: number | null }) =>
      workoutsApi.updateSet(session.id, id, { ...setPayload(values, known), rest_seconds }),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })

  const deleteSet = useMutation({
    mutationFn: (id: number) => workoutsApi.deleteSet(session.id, id),
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
  })

  const intensity = useMutation({
    mutationFn: (v: Intensity) => workoutsApi.updateIntensity(session.id, v),
    onSuccess: (data) => refresh(data),
  })

  const finish = useMutation({
    mutationFn: () => workoutsApi.finish(session.id),
    onSuccess: (done) => {
      queryClient.setQueryData(queryKeys.active, null)
      void invalidateTrainingData(queryClient)
      try {
        sessionStorage.removeItem('replog_descanso')
      } catch {
      }
      navigate(`/historico/${done.id}`, { replace: true })
      showSummary(done)
    },
  })

  const discard = useMutation({
    mutationFn: () => workoutsApi.deleteSession(session.id),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.active, null)
      void invalidateTrainingData(queryClient)
      navigate('/', { replace: true })
    },
  })

  const lastSet = block?.sets.at(-1)
  const lastProgress = progress.data?.filter((p) => p.session_id !== session.id).at(-1)
  const targetLow = Number(current?.targetReps?.split('-')[0])
  const defaultReps = lastSet?.reps ?? (Number.isFinite(targetLow) && targetLow > 0 ? targetLow : 10)
  const defaultWeight = lastSet?.weight_kg ?? lastProgress?.top_weight_kg ?? 0
  const suggestionData = suggestion.data ?? null
  const doneHere = currentId != null ? countedSets(session, currentId) : 0
  const currentComplete = current?.targetSets != null && doneHere >= current.targetSets
  const currentIndex = fullQueue.findIndex((q) => q.exercise.id === currentId)
  const nextUp =
    currentIndex < 0
      ? null
      : ([...fullQueue.slice(currentIndex + 1), ...fullQueue.slice(0, currentIndex)].find((q) => {
          const done = countedSets(session, q.exercise.id)
          return q.targetSets != null ? done < q.targetSets : done === 0
        }) ?? null)

  const goTo = (id: number) => {
    setCurrentId(id)
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => sectionRef.current?.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }))
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="faixa-aco -mx-4 flex items-start justify-between gap-3 px-4 pt-1 sm:-mx-6 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {session.split ? (
            <motion.span
              className="mt-1 block size-14 shrink-0"
              initial={{ scale: 0, rotate: -200 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              <Plate color={letterColor(session.split.letter)} letter={session.split.letter} className="size-full" />
            </motion.span>
          ) : null}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm text-giz-suave">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-verde opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-verde" />
              </span>
              Treino em andamento <span className="num text-base text-giz">{formatDuration(elapsed)}</span>
            </p>
            <h1 className="placar mt-1 break-words text-[1.85rem] sm:text-5xl">
              {session.split ? (
                <>
                  <span className="sr-only">Treino {session.split.letter} — </span>
                  {session.split.name}
                </>
              ) : (
                'Treino livre'
              )}
            </h1>
            <p className="mt-1 text-sm text-giz-suave">
              <AnimatedNumber value={session.total_sets} duration={0.6} className="num text-base text-giz" />{' '}
              {session.total_sets === 1 ? 'série' : 'séries'} ·{' '}
              <AnimatedNumber value={session.total_reps} duration={0.6} className="num text-base text-giz" />{' '}
              {session.total_reps === 1 ? 'repetição' : 'repetições'}
            </p>
          </div>
        </div>
        <Button variant="primario" icon={<Check className="size-5" />} onClick={() => setConfirmFinish(true)}>
          Finalizar
        </Button>
      </header>

      <IntensityPicker
        value={intensity.isPending && intensity.variables ? intensity.variables : session.intensity}
        onChange={(v) => {
          if (v !== session.intensity) intensity.mutate(v)
        }}
      />

      <nav aria-label="Exercícios do treino" className="sem-barra-rolagem -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {fullQueue.map(({ exercise, targetSets }) => {
          const done = countedSets(session, exercise.id)
          const isCurrent = exercise.id === currentId
          const complete = targetSets != null && done >= targetSets
          return (
            <button
              key={exercise.id}
              type="button"
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => setCurrentId(exercise.id)}
              className={clsx(
                'relative flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors active:scale-95',
                isCurrent ? 'border-transparent text-white' : 'border-linha bg-superficie text-giz',
              )}
            >
              {isCurrent ? (
                <motion.span layoutId="exercicio-atual-pill" className="absolute inset-0 rounded-full bg-azul" transition={molaToque} />
              ) : null}
              <span className="relative">{exercise.name}</span>
              <span
                className={clsx(
                  'num relative text-base',
                  isCurrent ? 'text-white/85' : complete ? 'text-verde' : 'text-giz-suave',
                )}
              >
                {done}
                {targetSets ? `/${targetSets}` : ''}
              </span>
              {complete ? <Check className="relative size-4 text-verde" aria-label="concluído" /> : null}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex min-h-12 shrink-0 items-center gap-1 rounded-full border border-dashed border-linha px-4 text-sm text-giz-suave transition hover:text-giz active:scale-95"
        >
          <Plus className="size-4" aria-hidden="true" /> Exercício
        </button>
      </nav>

      {current ? (
        <motion.section
          ref={sectionRef}
          key={current.exercise.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          aria-labelledby="exercicio-atual"
          className="flex scroll-mt-4 flex-col gap-5 rounded-[28px] border border-linha bg-superficie p-4 sm:p-5"
        >
          <div className="flex flex-col gap-2">
            <h2 id="exercicio-atual" className="placar text-[2.4rem] sm:text-4xl">
              {current.exercise.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <SetPlates done={doneHere} target={current.targetSets} />
              {current.targetReps || current.targetSets ? (
                <p className="text-sm text-giz-suave">
                  {current.targetSets ? `${doneHere} de ${current.targetSets} séries` : 'Meta'}
                  {current.targetReps ? `, ${current.targetReps} repetições` : ''}
                </p>
              ) : null}
            </div>
            {lastProgress && !block && !suggestionData?.last_sets.length ? (
              <p className="text-sm text-giz-suave">
                Última vez: máx. {formatNumber(lastProgress.top_weight_kg)} kg, {lastProgress.total_reps} repetições no total
              </p>
            ) : null}
          </div>

          <RestTimer ref={timerRef} planned={current.restSeconds} />

          <SetLogger
            key={`${current.exercise.id}-${block?.sets.length ?? 0}`}
            exercise={current.exercise}
            defaultReps={Number.isFinite(defaultReps) && defaultReps > 0 ? defaultReps : 10}
            defaultWeight={defaultWeight}
            defaultType={lastSet?.set_type === 'aquecimento' ? 'aquecimento' : 'normal'}
            pending={addSet.isPending}
            error={addSet.error}
            lifted={lifted}
            suggestion={suggestionData}
            lastSet={lastSet ?? null}
            onSubmit={(v) => addSet.mutate(v)}
          />

          {block ? (
            <>
              <ul aria-label={`Séries de ${current.exercise.name}`} className="rounded-2xl border border-linha bg-aco-2/60 px-3">
                <AnimatePresence initial={false}>
                  {block.sets.map((s) => (
                    <SetRow
                      key={s.id}
                      set={s}
                      timeZone={session.timezone}
                      isRecord={recordSetIds.has(s.id)}
                      onEdit={() => setEditing(s)}
                      onDelete={() => setDeleting(s)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
              <p className="-mt-3 text-xs text-giz-suave">Deslize a série: para a direita edita, para a esquerda apaga.</p>
              <Comparison comparison={block.comparison} />
            </>
          ) : null}

          {nextUp ? (
            currentComplete ? (
              <motion.button
                type="button"
                onClick={() => goTo(nextUp.exercise.id)}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                className="flex min-h-16 items-center gap-3 rounded-[22px] border border-verde/50 bg-verde/10 px-4 py-3 text-left transition active:scale-[0.98]"
              >
                <Check className="size-6 shrink-0 text-verde" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-verde">Meta batida. Próximo exercício:</span>{' '}
                  <span className="placar block text-2xl leading-none">{nextUp.exercise.name}</span>
                </span>
                <ChevronRight className="size-6 shrink-0 text-giz" aria-hidden="true" />
              </motion.button>
            ) : (
              <button
                type="button"
                onClick={() => goTo(nextUp.exercise.id)}
                className="flex min-h-12 items-center gap-2 self-start rounded-xl text-sm text-giz-suave transition hover:text-giz"
              >
                Depois: <span className="font-semibold text-giz">{nextUp.exercise.name}</span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            )
          ) : null}
        </motion.section>
      ) : (
        <div className="rounded-2xl border border-dashed border-linha p-6 text-center">
          <p className="mb-4 text-giz-suave">Escolha o primeiro exercício para começar a registrar.</p>
          <Button icon={<Plus className="size-5" />} onClick={() => setPickerOpen(true)}>
            Adicionar exercício
          </Button>
        </div>
      )}

      <SessionNotes session={session} onSaved={(s) => refresh(s)} />

      <button
        type="button"
        onClick={() => setConfirmDiscard(true)}
        className="flex min-h-11 items-center gap-2 self-start text-sm text-giz-suave hover:text-vermelha"
      >
        <Trash2 className="size-4" aria-hidden="true" /> Descartar este treino
      </button>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={fullQueue.map((q) => q.exercise.id)}
        onPick={(ex) => {
          setExtra(ex)
          setCurrentId(ex.id)
          setPickerOpen(false)
        }}
      />

      <SetEditor
        set={editing}
        pending={updateSet.isPending}
        error={updateSet.error}
        onClose={() => setEditing(null)}
        onSave={(v) =>
          editing &&
          updateSet.mutate({ ...v, id: editing.id, rest_seconds: editing.rest_seconds, known: editing.set_type !== undefined })
        }
      />

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Apagar série?"
        footer={
          <div className="flex gap-2">
            <Button variant="fantasma" className="flex-1" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="perigo" className="flex-1" loading={deleteSet.isPending} onClick={() => deleting && deleteSet.mutate(deleting.id)}>
              Apagar série
            </Button>
          </div>
        }
      >
        {deleting ? (
          <p>
            A série {deleting.set_number} ({deleting.reps} × {formatNumber(deleting.weight_kg)} kg) será removida e os
            recordes serão recalculados.
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="Finalizar treino?"
        footer={
          <div className="flex gap-2">
            <Button variant="fantasma" className="flex-1" onClick={() => setConfirmFinish(false)}>
              Continuar treinando
            </Button>
            <Button className="flex-1" loading={finish.isPending} onClick={() => finish.mutate()}>
              Finalizar treino
            </Button>
          </div>
        }
      >
        <p>
          {plural(session.total_sets, 'série', 'séries')} em {formatDuration(elapsed)}. Você poderá editar as séries depois pelo histórico.
        </p>
        {finish.isError ? <Alert tone="erro">{finish.error.message}</Alert> : null}
      </Dialog>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Descartar treino?"
        footer={
          <div className="flex gap-2">
            <Button variant="fantasma" className="flex-1" onClick={() => setConfirmDiscard(false)}>
              Manter treino
            </Button>
            <Button variant="perigo" className="flex-1" loading={discard.isPending} onClick={() => discard.mutate()}>
              Descartar treino
            </Button>
          </div>
        }
      >
        <p>Todas as {session.total_sets} séries deste treino serão apagadas. Essa ação não pode ser desfeita.</p>
      </Dialog>
    </div>
  )
}

function SessionNotes({ session, onSaved }: { session: WorkoutSession; onSaved: (s: WorkoutSession) => void }) {
  const [notes, setNotes] = useState(session.notes ?? '')
  const save = useMutation({
    mutationFn: () => workoutsApi.updateNotes(session.id, notes.trim() || null),
    onSuccess: onSaved,
  })
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      Observações do treino
      <textarea
        value={notes}
        maxLength={1000}
        rows={2}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if ((session.notes ?? '') !== notes.trim()) save.mutate()
        }}
        placeholder="Como foi o treino? Dor, energia, ajustes…"
        className="rounded-lg border border-linha bg-superficie px-3 py-2 text-base font-normal text-giz focus:outline-none focus:ring-2 focus:ring-azul"
      />
      <span className="text-xs font-normal text-giz-suave" aria-live="polite">
        {save.isPending ? 'Salvando…' : save.isSuccess ? 'Observações salvas.' : save.isError ? save.error.message : ''}
      </span>
    </label>
  )
}

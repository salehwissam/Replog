import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Library, Plus, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '@/api/client'
import { queryKeys, SPLIT_LETTERS, workoutsApi, type Exercise, type Split, type SplitLetter } from '@/api/workouts'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { ExercisePicker } from '@/components/workout/ExercisePicker'
import { Plate } from '@/components/brand/Plate'
import { letterColor } from '@/lib/motion'
import { muscleLabel, muscleShares, muscleColor } from '@/features/programs/programUtils'
import { ProgramBarbell } from '@/features/programs/ProgramParts'

interface DraftItem {
  exercise: Exercise
  target_sets: number
  target_reps: string
  rest_seconds: number
}

export default function SplitsPage() {
  const splits = useQuery({ queryKey: queryKeys.splits, queryFn: workoutsApi.splits })
  const [editing, setEditing] = useState<SplitLetter | null>(null)

  if (splits.isPending) return <PageLoader />
  if (splits.isError) return <Alert tone="erro">{splits.error.message}</Alert>

  const byLetter = new Map(splits.data.map((s) => [s.letter, s]))

  return (
    <div>
      <PageHeader title="Divisões de treino" subtitle="Monte até cinco treinos (A a E) com seus exercícios." />
      <Link
        to="/programas"
        className="mb-4 flex items-center gap-3 rounded-[24px] border border-amarela/40 bg-amarela/10 p-4 transition hover:border-amarela active:scale-[0.99]"
      >
        <Library className="size-6 shrink-0 text-amarela" aria-hidden="true" />
        <span className="flex-1 text-sm">
          <span className="block font-semibold text-giz">Sem tempo para montar?</span>
          Use um programa pronto e ajuste depois.
        </span>
        <ChevronRight className="size-5 text-amarela" aria-hidden="true" />
      </Link>
      {splits.data.length > 0 ? (
        <section aria-label="Sua barra" className="knurl mb-4 rounded-[24px] border border-linha bg-aco-2 px-3 pb-3 pt-2">
          <ProgramBarbell letters={[...splits.data].sort((a, b) => a.letter.localeCompare(b.letter)).map((s) => s.letter)} height={64} />
          <p className="text-center text-sm text-giz-suave">
            {splits.data.length === 1 ? '1 divisão montada' : `${splits.data.length} divisões montadas`}, em rotação{' '}
            {[...splits.data].sort((a, b) => a.letter.localeCompare(b.letter)).map((s) => s.letter).join(', ')}.
          </p>
        </section>
      ) : null}
      <ul className="flex flex-col gap-3">
        {SPLIT_LETTERS.map((letter, i) => {
          const split = byLetter.get(letter)
          const muscles = split
            ? muscleShares(split.exercises.map((e) => ({ muscle_group: e.exercise.muscle_group, target_sets: e.target_sets })))
            : []
          return (
            <motion.li
              key={letter}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30, delay: i * 0.04 }}
            >
              <button
                type="button"
                onClick={() => setEditing(letter)}
                className={
                  split
                    ? 'flex w-full items-center gap-4 rounded-[24px] border border-linha bg-superficie p-4 text-left transition hover:border-azul/60 active:scale-[0.99]'
                    : 'flex w-full items-center gap-4 rounded-[24px] border border-dashed border-linha p-4 text-left transition hover:border-azul/60 hover:bg-superficie active:scale-[0.99]'
                }
              >
                {split ? (
                  <Plate color={letterColor(letter)} letter={letter} className="size-16 shrink-0" />
                ) : (
                  <span className="placar flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-linha text-3xl text-giz-suave">
                    {letter}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={split ? 'placar block text-3xl' : 'block text-lg font-semibold'}>
                    {split ? split.name : `Criar Treino ${letter}`}
                  </span>
                  <span className="block truncate text-sm text-giz-suave">
                    {split
                      ? split.exercises.length
                        ? `${split.exercises.length} ${split.exercises.length === 1 ? 'exercício' : 'exercícios'}: ${split.exercises.map((e) => e.exercise.name).join(', ')}`
                        : 'Nenhum exercício ainda'
                      : 'Toque para montar esta divisão'}
                  </span>
                  {muscles.length ? (
                    <span className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
                      {muscles.slice(0, 4).map((m) => (
                        <span key={m.key} className="flex items-center gap-1 rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-giz-suave">
                          <span className="size-1.5 rounded-full" style={{ background: muscleColor(m.key) }} />
                          {m.label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="size-5 shrink-0 text-giz-suave" aria-hidden="true" />
              </button>
            </motion.li>
          )
        })}
      </ul>
      {editing ? <SplitEditor letter={editing} split={byLetter.get(editing) ?? null} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function SplitEditor({ letter, split, onClose }: { letter: SplitLetter; split: Split | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(split?.name ?? '')
  const [description, setDescription] = useState(split?.description ?? '')
  const [items, setItems] = useState<DraftItem[]>(
    () =>
      split?.exercises.map((e) => ({
        exercise: e.exercise,
        target_sets: e.target_sets,
        target_reps: e.target_reps ?? '',
        rest_seconds: e.rest_seconds,
      })) ?? [],
  )
  const [picker, setPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const done = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.splits })
    onClose()
  }

  const save = useMutation({
    mutationFn: () =>
      workoutsApi.saveSplit(letter, {
        name: name.trim(),
        description: description.trim() || null,
        exercises: items.map((i) => ({
          exercise_id: i.exercise.id,
          target_sets: i.target_sets,
          target_reps: i.target_reps.trim() || null,
          rest_seconds: i.rest_seconds,
        })),
      }),
    onSuccess: () => {
      toast.show({ tone: 'sucesso', title: `Treino ${letter} salvo` })
      done()
    },
  })
  const remove = useMutation({ mutationFn: () => workoutsApi.deleteSplit(letter), onSuccess: done })

  const move = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(index + delta, 0, item!)
      return next
    })
  }
  const patch = (index: number, change: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...change } : it)))

  const fields = save.error instanceof ApiError ? save.error.fields : {}

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Treino ${letter}`}
      footer={
        <div className="flex gap-2">
          {split ? (
            <Button variant="fantasma" className="text-vermelha" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
              Excluir
            </Button>
          ) : null}
          <Button
            className="flex-1"
            loading={save.isPending}
            onClick={() => {
              if (!name.trim()) {
                setLocalError('Dê um nome para a divisão.')
                return
              }
              if (items.some((i) => i.target_reps && !/^\d{1,3}(-\d{1,3})?$/.test(i.target_reps.trim()))) {
                setLocalError('Use repetições como "10" ou "8-12".')
                return
              }
              setLocalError(null)
              save.mutate()
            }}
          >
            Salvar divisão
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {localError ? <Alert tone="erro">{localError}</Alert> : null}
        {save.isError && !fields.name ? <Alert tone="erro">{save.error.message}</Alert> : null}
        {confirmDelete ? (
          <Alert tone="erro">
            <p>Excluir o Treino {letter}? Os treinos já registrados continuam no histórico.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="perigo" loading={remove.isPending} onClick={() => remove.mutate()}>
                Excluir divisão
              </Button>
              <Button variant="fantasma" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          </Alert>
        ) : null}
        <Field label="Nome" placeholder="Ex.: Peito e tríceps" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={fields.name} />
        <Field label="Descrição (opcional)" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} />

        <div>
          <h3 className="mb-2 font-semibold">Exercícios</h3>
          {items.length === 0 ? <p className="mb-2 text-sm text-giz-suave">Adicione os exercícios na ordem em que você costuma fazer.</p> : null}
          {items.length > 1 ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-giz-suave">
              <GripVertical className="size-3.5" aria-hidden="true" /> Arraste pela alça ou use as setas para mudar a ordem.
            </p>
          ) : null}
          <Reorder.Group axis="y" values={items} onReorder={setItems} className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <DraftRow
                  key={item.exercise.id}
                  item={item}
                  index={index}
                  count={items.length}
                  onMove={(delta) => move(index, delta)}
                  onRemove={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  onPatch={(change) => patch(index, change)}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
          <Button variant="secundario" className="mt-2 w-full" icon={<Plus className="size-5" />} disabled={items.length >= 30} onClick={() => setPicker(true)}>
            Adicionar exercício
          </Button>
        </div>
      </div>
      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        excludeIds={items.map((i) => i.exercise.id)}
        onPick={(exercise) => {
          setItems((prev) => [...prev, { exercise, target_sets: 3, target_reps: '8-12', rest_seconds: 90 }])
          setPicker(false)
        }}
      />
    </Dialog>
  )
}

function DraftRow({
  item,
  index,
  count,
  onMove,
  onRemove,
  onPatch,
}: {
  item: DraftItem
  index: number
  count: number
  onMove: (delta: number) => void
  onRemove: () => void
  onPatch: (change: Partial<DraftItem>) => void
}) {
  const controls = useDragControls()
  const name = item.exercise.name
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.18 } }}
      whileDrag={{ scale: 1.03, boxShadow: '0 24px 50px -20px rgb(0 0 0 / 0.75)', zIndex: 10 }}
      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
      className="relative rounded-[20px] border border-linha bg-superficie-2 p-3"
    >
      <div className="flex gap-2">
        <div className="-ml-1 flex flex-col items-center">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              controls.start(e)
            }}
            className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-giz-suave hover:bg-linha hover:text-giz active:cursor-grabbing"
            aria-label={`Arrastar ${name}`}
            tabIndex={-1}
          >
            <GripVertical className="size-5" />
          </button>
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="flex size-11 items-center justify-center rounded-lg hover:bg-linha disabled:opacity-30" aria-label={`Mover ${name} para cima`}>
            <ArrowUp className="size-4" />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="flex size-11 items-center justify-center rounded-lg hover:bg-linha disabled:opacity-30" aria-label={`Mover ${name} para baixo`}>
            <ArrowDown className="size-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="placar mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-superficie text-lg text-giz-suave">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block font-semibold leading-tight">{name}</span>
              <span className="block text-xs text-giz-suave">{muscleLabel(item.exercise.muscle_group)}</span>
            </span>
            <button type="button" onClick={onRemove} className="-mr-1 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-giz-suave hover:bg-vermelha/10 hover:text-vermelha" aria-label={`Remover ${name}`}>
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-giz-suave">
              Séries
              <input type="number" min={1} max={20} value={item.target_sets} onChange={(e) => onPatch({ target_sets: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} className="num min-h-11 w-full rounded-lg border border-linha bg-superficie px-2 text-lg text-giz" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-giz-suave">
              Repetições
              <input value={item.target_reps} placeholder="8-12" maxLength={7} onChange={(e) => onPatch({ target_reps: e.target.value.replace(/[^\d-]/g, '') })} className="num min-h-11 w-full rounded-lg border border-linha bg-superficie px-2 text-lg text-giz" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-giz-suave">
              Descanso (s)
              <input type="number" min={0} max={1800} step={15} value={item.rest_seconds} onChange={(e) => onPatch({ rest_seconds: Math.min(1800, Math.max(0, Number(e.target.value) || 0)) })} className="num min-h-11 w-full rounded-lg border border-linha bg-superficie px-2 text-lg text-giz" />
            </label>
          </div>
        </div>
      </div>
    </Reorder.Item>
  )
}

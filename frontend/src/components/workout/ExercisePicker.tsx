import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { queryKeys, workoutsApi, type Exercise } from '@/api/workouts'
import { ApiError } from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Spinner'

export function useExerciseMeta() {
  return useQuery({
    queryKey: queryKeys.exerciseMeta,
    queryFn: workoutsApi.exerciseMeta,
    staleTime: Infinity,
  })
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  excludeIds = [],
}: {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise) => void
  excludeIds?: number[]
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [creating, setCreating] = useState(false)
  const deferredQuery = useDeferredValue(query.trim())
  const meta = useExerciseMeta()

  const list = useQuery({
    queryKey: queryKeys.exercises(deferredQuery, group),
    queryFn: () => workoutsApi.exercises(deferredQuery || undefined, group || undefined),
    enabled: open,
    staleTime: 60_000,
  })

  const groups = meta.data?.muscle_groups ?? {}
  const visible = (list.data ?? []).filter((e) => !excludeIds.includes(e.id))

  return (
    <Dialog open={open} onClose={onClose} title={creating ? 'Novo exercício' : 'Escolher exercício'}>
      {creating ? (
        <CreateExerciseForm
          initialName={query}
          onCancel={() => setCreating(false)}
          onCreated={(ex) => {
            setCreating(false)
            onPick(ex)
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-giz-suave" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 80))}
              placeholder="Buscar exercício"
              aria-label="Buscar exercício"
              className="min-h-12 w-full rounded-lg border border-linha bg-superficie-2 pl-10 pr-3 text-giz focus:outline-none focus:ring-2 focus:ring-azul"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrar por grupo muscular">
            {([['', 'Todos'], ...Object.entries(groups)] as [string, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={group === key}
                onClick={() => setGroup(key)}
                className={clsx(
                  'min-h-9 shrink-0 rounded-full border px-3 text-sm',
                  group === key ? 'border-azul bg-azul text-white' : 'border-linha text-giz-suave hover:text-giz',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {list.isPending ? (
            <Spinner label="Carregando exercícios…" />
          ) : list.isError ? (
            <Alert tone="erro">{list.error.message}</Alert>
          ) : visible.length === 0 ? (
            <p className="py-4 text-giz-suave">Nenhum exercício encontrado.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {visible.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => onPick(ex)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-superficie-2"
                  >
                    <span>{ex.name}</span>
                    <span className="shrink-0 text-xs text-giz-suave">
                      {groups[ex.muscle_group] ?? ex.muscle_group}
                      {ex.is_custom ? ' · seu' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secundario" icon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
            Criar exercício
          </Button>
        </div>
      )}
    </Dialog>
  )
}

function CreateExerciseForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string
  onCancel: () => void
  onCreated: (e: Exercise) => void
}) {
  const meta = useExerciseMeta()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName)
  const [group, setGroup] = useState('peito')
  const [equipment, setEquipment] = useState('outro')
  const [bodyweight, setBodyweight] = useState(false)

  const mutation = useMutation({
    mutationFn: workoutsApi.createExercise,
    onSuccess: (ex) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
      onCreated(ex)
    },
  })
  const fieldError = mutation.error instanceof ApiError ? mutation.error.fields : {}

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate({ name: name.trim(), muscle_group: group, equipment, is_bodyweight: bodyweight })
      }}
    >
      {mutation.isError && !fieldError.name ? <Alert tone="erro">{mutation.error.message}</Alert> : null}
      <Field
        label="Nome do exercício"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        required
        minLength={2}
        error={fieldError.name}
      />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Grupo muscular
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="min-h-12 rounded-lg border border-linha bg-superficie px-3 text-base"
        >
          {Object.entries(meta.data?.muscle_groups ?? {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Equipamento
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          className="min-h-12 rounded-lg border border-linha bg-superficie px-3 text-base"
        >
          {Object.entries(meta.data?.equipment ?? {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={bodyweight}
          onChange={(e) => setBodyweight(e.target.checked)}
          className="size-5 accent-[var(--anilha-azul)]"
        />
        Usa o peso do corpo (ex.: barra fixa, flexão)
      </label>
      <div className="flex gap-2">
        <Button variant="fantasma" onClick={onCancel} className="flex-1">
          Voltar
        </Button>
        <Button type="submit" loading={mutation.isPending} className="flex-1">
          Salvar exercício
        </Button>
      </div>
    </form>
  )
}

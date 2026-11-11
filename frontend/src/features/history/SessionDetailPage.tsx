import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, Trophy, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { invalidateTrainingData } from '@/api/invalidate'
import { ApiError } from '@/api/client'
import { queryKeys, RECORD_LABELS, workoutsApi, type PersonalRecord, type WorkoutSet } from '@/api/workouts'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageLoader } from '@/components/ui/Spinner'
import { Comparison } from '@/components/workout/Comparison'
import { IntensityBadge } from '@/components/workout/IntensityPicker'
import { recordUnit } from '@/components/workout/RecordItem'
import { SetRow } from '@/components/workout/SetRow'
import { SetEditor } from '@/features/workout/SetEditor'
import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatDuration, formatLongDate, formatNumber, formatTime } from '@/lib/format'
import { letterColor } from '@/lib/motion'
import { MuscleBar } from '@/features/programs/ProgramParts'
import { muscleLabel, muscleShares } from '@/features/programs/programUtils'

export default function SessionDetailPage() {
  const { id } = useParams()
  const sessionId = Number(id)
  const valid = Number.isInteger(sessionId) && sessionId > 0
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<WorkoutSet | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const session = useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => workoutsApi.session(sessionId),
    enabled: valid,
  })

  const invalidate = () => {
    void invalidateTrainingData(queryClient, sessionId)
  }

  const updateSet = useMutation({
    mutationFn: (v: { id: number; reps: number; weight_kg: number; notes: string | null; rest_seconds: number | null }) =>
      workoutsApi.updateSet(sessionId, v.id, v),
    onSuccess: () => {
      setEditing(null)
      invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: () => workoutsApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) })
      void invalidateTrainingData(queryClient)
      queryClient.invalidateQueries({ queryKey: queryKeys.active })
      navigate('/historico', { replace: true })
    },
  })

  if (!valid || (session.error instanceof ApiError && session.error.status === 404)) {
    return (
      <div>
        <Alert tone="erro">Treino não encontrado.</Alert>
        <Link to="/historico" className="mt-4 inline-block font-semibold text-azul hover:underline">
          Voltar para o histórico
        </Link>
      </div>
    )
  }
  if (session.isPending) return <PageLoader />
  if (session.isError) return <Alert tone="erro">{session.error.message}</Alert>

  const s = session.data
  const beaten = s.records.filter((r) => r.previous_value != null)
  const recordSetIds = new Set(beaten.map((r) => r.set_id))
  const muscles = muscleShares(
    s.exercises.map((b) => ({ muscle_group: b.exercise.muscle_group, target_sets: b.sets.length })),
  )

  return (
    <div className="flex flex-col gap-6">
      <Link to="/historico" className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-giz-suave hover:text-giz">
        <ArrowLeft className="size-4" aria-hidden="true" /> Histórico
      </Link>
      <header className="faixa-aco -mx-4 flex items-start gap-4 px-4 pt-1 sm:-mx-6 sm:px-6">
        <motion.span
          className="block size-16 shrink-0"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        >
          <Plate color={letterColor(s.split?.letter)} letter={s.split?.letter} className="size-full" />
        </motion.span>
        <div className="min-w-0">
          <p className="text-giz-suave">
            {formatLongDate(s.local_date)}, {formatTime(s.started_at, s.timezone)}
            {s.finished_at ? ` às ${formatTime(s.finished_at, s.timezone)}` : ''}
          </p>
          <h1 className="placar break-words text-[2.6rem] sm:text-6xl">
            {s.split ? `Treino ${s.split.letter} — ${s.split.name}` : 'Treino livre'}
          </h1>
          <IntensityBadge intensity={s.intensity} className="mt-1" />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Séries', s.total_sets, ''],
            ['Repetições', s.total_reps, ''],
            ['Maior carga', Math.max(0, ...s.exercises.map((b) => b.summary.top_weight_kg)), 'kg'],
          ] as const
        ).map(([label, value, unit]) => (
          <div key={label} className="rounded-2xl border border-linha bg-superficie px-4 py-3">
            <dt className="text-sm text-giz-suave">{label}</dt>
            <dd className="placar text-4xl">
              <AnimatedNumber value={value} />
              {unit ? <span className="ml-1 font-corpo text-base text-giz-suave">{unit}</span> : null}
            </dd>
          </div>
        ))}
        <div className="rounded-2xl border border-linha bg-superficie px-4 py-3">
          <dt className="text-sm text-giz-suave">Duração</dt>
          <dd className="placar text-4xl">
            {s.duration_seconds != null ? formatDuration(s.duration_seconds) : 'Em andamento'}
          </dd>
        </div>
      </dl>

      {s.notes ? (
        <p className="rounded-xl border border-linha bg-superficie p-4 text-giz">
          <span className="block text-sm text-giz-suave">Observações</span>
          {s.notes}
        </p>
      ) : null}

      {beaten.length > 0 ? <RecordsPodium records={beaten} /> : null}

      {muscles.length > 0 ? (
        <section aria-labelledby="musculos-treino" className="rounded-[24px] border border-linha bg-superficie p-4">
          <h2 id="musculos-treino" className="mb-3 font-semibold">
            Grupos musculares trabalhados
          </h2>
          <MuscleBar muscles={muscles} legend={6} />
        </section>
      ) : null}

      <section aria-labelledby="exercicios" className="flex flex-col gap-4">
        <h2 id="exercicios" className="placar text-3xl">
          Exercícios
        </h2>
        {s.exercises.length === 0 ? <p className="text-giz-suave">Nenhuma série registrada neste treino.</p> : null}
        {s.exercises.map((block, bi) => {
          const hasRecord = block.sets.some((set) => recordSetIds.has(set.id))
          return (
            <motion.article
              key={block.exercise.id}
              className={clsx(
                'relative overflow-hidden rounded-[24px] border bg-superficie p-4',
                hasRecord ? 'border-amarela/50' : 'border-linha',
              )}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.1 + Math.min(bi, 6) * 0.05 }}
            >
              {hasRecord ? <span className="absolute inset-y-0 left-0 w-1 bg-amarela" aria-hidden="true" /> : null}
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-tight">{block.exercise.name}</h3>
                  <p className="text-xs text-giz-suave">{muscleLabel(block.exercise.muscle_group)}</p>
                </div>
                <span className="shrink-0 text-right text-sm text-giz-suave">
                  máx. <span className="num text-xl text-giz">{formatNumber(block.summary.top_weight_kg)}</span> kg
                </span>
              </div>
              <ul>
                {block.sets.map((set) => (
                  <SetRow key={set.id} set={set} timeZone={s.timezone} isRecord={recordSetIds.has(set.id)} onEdit={() => setEditing(set)} />
                ))}
              </ul>
              <div className="mt-3">
                <Comparison comparison={block.comparison} />
              </div>
            </motion.article>
          )
        })}
      </section>

      <Button variant="fantasma" className="self-start text-vermelha" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
        Apagar treino
      </Button>

      <SetEditor
        set={editing}
        pending={updateSet.isPending}
        error={updateSet.error}
        onClose={() => setEditing(null)}
        onSave={(v) => editing && updateSet.mutate({ id: editing.id, rest_seconds: editing.rest_seconds, ...v })}
      />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Apagar treino?"
        footer={
          <div className="flex gap-2">
            <Button variant="fantasma" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="perigo" className="flex-1" loading={remove.isPending} onClick={() => remove.mutate()}>
              Apagar treino
            </Button>
          </div>
        }
      >
        <p>As {s.total_sets} séries serão apagadas e seus recordes recalculados. Essa ação não pode ser desfeita.</p>
        {remove.isError ? <Alert tone="erro">{remove.error.message}</Alert> : null}
      </Dialog>
    </div>
  )
}

function RecordsPodium({ records }: { records: PersonalRecord[] }) {
  return (
    <section
      aria-labelledby="recordes-treino"
      className="relative overflow-hidden rounded-[28px] border border-amarela/50 p-4 sm:p-5"
      style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--anilha-amarela) 16%, transparent), transparent 70%)' }}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.14), transparent)' }}
        initial={{ left: '-40%' }}
        animate={{ left: '120%' }}
        transition={{ duration: 1.3, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
      />
      <div className="relative mb-4 flex items-center gap-3">
        <motion.span
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amarela text-[#1b1400] shadow-[0_10px_30px_-10px_var(--anilha-amarela)]"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}
          aria-hidden="true"
        >
          <Trophy className="size-6" />
        </motion.span>
        <div>
          <h2 id="recordes-treino" className="placar text-3xl text-amarela">
            Recordes neste treino
          </h2>
          <p className="text-sm text-giz-suave">
            {records.length === 1 ? 'Você superou 1 marca pessoal.' : `Você superou ${records.length} marcas pessoais.`}
          </p>
        </div>
      </div>
      <ul className="relative grid gap-2 sm:grid-cols-2">
        {records.map((r, i) => {
          const unit = recordUnit(r)
          const gain = r.value - (r.previous_value ?? 0)
          return (
            <motion.li
              key={r.id}
              className="rounded-[20px] border border-amarela/30 bg-superficie/80 p-3"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.25 + i * 0.08 }}
            >
              <p className="truncate font-semibold">{r.exercise_name}</p>
              <p className="text-xs text-giz-suave">{RECORD_LABELS[r.record_type]}</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="placar text-4xl text-amarela">
                  <AnimatedNumber value={r.value} from={r.previous_value ?? 0} decimals={2} />
                  <span className="ml-1 font-corpo text-sm font-semibold text-giz-suave">{unit}</span>
                </p>
                <p className="pb-1 text-right text-xs text-giz-suave">
                  <span className="num block text-base font-bold text-verde">
                    +{formatNumber(gain)} {unit}
                  </span>
                  antes {formatNumber(r.previous_value ?? 0)} {unit}
                </p>
              </div>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}

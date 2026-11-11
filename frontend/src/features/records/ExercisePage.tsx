import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { Link, useParams } from 'react-router-dom'

import { ApiError } from '@/api/client'
import { queryKeys, RECORD_LABELS, workoutsApi, type PersonalRecord, type RecordType } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Alert } from '@/components/ui/Alert'
import { PageLoader } from '@/components/ui/Spinner'
import { recordUnit } from '@/components/workout/RecordItem'
import { formatInstantDate, formatLocalDate, formatNumber, plural } from '@/lib/format'

import { ExerciseProgress } from './ExerciseProgress'

const TILES: RecordType[] = ['max_weight', 'max_est_1rm', 'max_reps']

function bestByType(history: PersonalRecord[]): Partial<Record<RecordType, PersonalRecord>> {
  const best: Partial<Record<RecordType, PersonalRecord>> = {}
  for (const r of history) {
    const cur = best[r.record_type]
    if (!cur || r.value > cur.value || (r.value === cur.value && r.achieved_at > cur.achieved_at)) best[r.record_type] = r
  }
  return best
}

export default function ExercisePage() {
  const { id } = useParams()
  const exerciseId = Number(id)
  const valid = Number.isInteger(exerciseId) && exerciseId > 0

  const history = useQuery({
    queryKey: queryKeys.exerciseRecords(exerciseId),
    queryFn: () => workoutsApi.exerciseRecords(exerciseId),
    enabled: valid,
  })
  const progress = useQuery({
    queryKey: queryKeys.progress(exerciseId),
    queryFn: () => workoutsApi.exerciseProgress(exerciseId),
    enabled: valid,
  })

  if (!valid || (history.error instanceof ApiError && history.error.status === 404)) {
    return <Alert tone="erro">Exercício não encontrado.</Alert>
  }
  if (history.isPending) return <PageLoader />
  if (history.isError) return <Alert tone="erro">{history.error.message}</Alert>

  const name = history.data[0]?.exercise_name ?? 'Exercício'
  const beaten = [...history.data].filter((r) => r.previous_value != null).reverse()
  const best = bestByType(history.data)
  const points = progress.data ?? []
  const firstTop = points[0]?.top_weight_kg
  const lastTop = points.at(-1)?.top_weight_kg
  const gain = firstTop != null && lastTop != null && points.length > 1 ? lastTop - firstTop : null

  return (
    <div className="flex flex-col gap-8">
      <Link to="/recordes" className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-giz-suave hover:text-giz">
        <ArrowLeft className="size-4" aria-hidden="true" /> Recordes
      </Link>

      <header className="faixa-aco -mx-4 -mt-4 px-4 sm:-mx-6 sm:px-6">
        <motion.h1
          className="placar text-5xl sm:text-7xl"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        >
          {name}
        </motion.h1>
        {points.length > 0 ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-giz-suave">
            <span>
              {plural(points.length, 'sessão', 'sessões')} desde {formatLocalDate(points[0]!.local_date)}
            </span>
            {gain != null && gain > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-verde/15 px-2.5 py-0.5 text-sm font-semibold text-giz">
                <TrendingUp className="size-4 text-verde" aria-hidden="true" />+{formatNumber(gain)} kg na carga máxima
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="marcas-atuais">
        <h2 id="marcas-atuais" className="sr-only">
          Marcas atuais
        </h2>
        <dl className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {TILES.map((type, i) => {
            const r = best[type]
            const main = i === 0
            return (
              <motion.div
                key={type}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.1 + i * 0.06 }}
                className={clsx(
                  'relative overflow-hidden rounded-[24px] border',
                  main ? 'col-span-3 border-amarela/40 bg-aco-2 p-4 sm:col-span-1' : 'border-linha bg-superficie p-3 sm:p-4',
                )}
              >
                {main ? (
                  <div className="pointer-events-none absolute -right-8 -top-8 size-28 opacity-30" aria-hidden="true">
                    <Plate color="var(--anilha-amarela)" className="size-full" />
                  </div>
                ) : null}
                <dt className="relative text-xs text-giz-suave sm:text-sm">{RECORD_LABELS[type]}</dt>
                <dd className="relative">
                  {r ? (
                    <>
                      <span className={clsx('placar block leading-none', main ? 'text-6xl text-amarela' : 'text-3xl sm:text-4xl')}>
                        <AnimatedNumber value={r.value} decimals={2} />
                        <span className="ml-1 font-corpo text-xs font-semibold text-giz-suave sm:text-sm">{recordUnit(r)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-giz-suave">{formatInstantDate(r.achieved_at)}</span>
                    </>
                  ) : (
                    <span className="placar block text-4xl text-giz-suave">—</span>
                  )}
                </dd>
              </motion.div>
            )
          })}
        </dl>
      </section>

      <section aria-labelledby="evolucao" className="rounded-[28px] border border-linha bg-superficie p-5">
        <h2 id="evolucao" className="mb-3 text-lg font-semibold">
          Evolução
        </h2>
        <ExerciseProgress exerciseId={exerciseId} />
      </section>

      <section aria-labelledby="historico-recordes">
        <h2 id="historico-recordes" className="mb-4 text-lg font-semibold">
          Recordes superados
        </h2>
        {beaten.length === 0 ? (
          <p className="text-giz-suave">Nenhuma marca superada ainda. A próxima série pode ser a primeira!</p>
        ) : (
          <ol className="relative ml-3 border-l-2 border-amarela/30 pl-6">
            {beaten.map((r) => {
              const unit = recordUnit(r)
              return (
                <li key={r.id} className="relative pb-5 last:pb-0">
                  <Plate color="var(--anilha-amarela)" className="absolute -left-[37px] top-0.5 size-6" />
                  <p className="text-sm text-giz-suave">{formatInstantDate(r.achieved_at)}</p>
                  <p className="font-medium">{RECORD_LABELS[r.record_type]}</p>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="placar text-3xl">
                      {formatNumber(r.value)} <span className="font-corpo text-sm font-semibold text-giz-suave">{unit}</span>
                    </span>
                    <span className="text-sm text-giz-suave">
                      antes {formatNumber(r.previous_value!)} {unit},{' '}
                      <span className="font-semibold text-verde">
                        +{formatNumber(r.value - r.previous_value!)} {unit}
                      </span>
                    </span>
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

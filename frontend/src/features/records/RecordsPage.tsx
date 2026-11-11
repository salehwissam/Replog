import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { queryKeys, RECORD_LABELS, workoutsApi, type ExerciseRecords, type RecordType } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { PageLoader } from '@/components/ui/Spinner'
import { formatInstantDate, formatNumber } from '@/lib/format'

import { HallOfFame } from './HallOfFame'

const SECONDARY: RecordType[] = ['max_est_1rm', 'max_reps']

export default function RecordsPage() {
  const records = useQuery({ queryKey: queryKeys.records, queryFn: workoutsApi.records })
  const [filter, setFilter] = useState('')

  const list = (records.data ?? []).filter((r) =>
    r.exercise.name.toLocaleLowerCase('pt-BR').includes(filter.trim().toLocaleLowerCase('pt-BR')),
  )

  return (
    <div>
      <PageHeader title="Recordes" subtitle="Suas melhores marcas em cada exercício." />
      {records.isPending ? (
        <PageLoader />
      ) : records.isError ? (
        <Alert tone="erro">{records.error.message}</Alert>
      ) : records.data.length === 0 ? (
        <div className="knurl flex flex-col items-start gap-3 rounded-[28px] border border-dashed border-amarela/40 bg-aco-2 p-6">
          <Plate color="var(--anilha-amarela)" className="size-16" />
          <p className="placar text-4xl">Nenhum recorde ainda</p>
          <p className="text-giz-suave">Seus recordes aparecem aqui sozinhos conforme você registra séries.</p>
          <Link to="/treino" className="font-semibold text-amarela hover:underline">
            Começar um treino
          </Link>
        </div>
      ) : (
        <>
          <HallOfFame records={records.data} />
          <h2 className="placar mb-4 text-4xl">Todos os recordes</h2>
          <div className="relative mb-5 max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-giz-suave" aria-hidden="true" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar exercício"
              aria-label="Filtrar exercício"
              className="min-h-13 w-full rounded-2xl border border-linha bg-superficie pl-12 pr-4 focus:border-azul focus:outline-none focus:ring-4 focus:ring-azul/25"
            />
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {list.map((r, i) => (
              <RecordCard key={r.exercise.id} records={r} index={i} />
            ))}
          </ul>
          {list.length === 0 ? <p className="text-giz-suave">Nenhum exercício com esse nome.</p> : null}
        </>
      )}
    </div>
  )
}

function RecordCard({ records, index }: { records: ExerciseRecords; index: number }) {
  const main = records.max_weight ?? records.max_reps
  const mainUnit = main?.record_type === 'max_reps' ? 'reps' : 'kg'
  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay: Math.min(index, 8) * 0.05 }}
    >
      <Link
        to={`/exercicios/${records.exercise.id}`}
        className="group relative block overflow-hidden rounded-[28px] border border-linha bg-superficie p-5 transition hover:border-amarela/60 active:scale-[0.99]"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amarela via-amarela/60 to-transparent" aria-hidden="true" />
        <motion.div
          className="pointer-events-none absolute -right-10 -top-10 size-40 opacity-25"
          whileHover={{ rotate: 90 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
          aria-hidden="true"
        >
          <Plate color="var(--anilha-amarela)" className="size-full" />
        </motion.div>
        <div className="relative">
          <h3 className="pr-16 text-lg font-semibold">{records.exercise.name}</h3>
          {main ? (
            <>
              <p className="placar mt-2 text-7xl text-amarela">
                <AnimatedNumber value={main.value} decimals={2} />
                <span className="ml-1 font-corpo text-xl font-semibold text-giz-suave">{mainUnit}</span>
              </p>
              <p className="text-sm text-giz-suave">
                {RECORD_LABELS[main.record_type]} em {formatInstantDate(main.achieved_at)}
              </p>
            </>
          ) : null}
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {SECONDARY.map((type) => {
              const rec = records[type]
              if (!rec || rec === main) return null
              return (
                <div key={type} className="rounded-2xl bg-aco-2 px-3 py-2">
                  <dt className="text-xs text-giz-suave">{RECORD_LABELS[type]}</dt>
                  <dd className="placar whitespace-nowrap text-2xl">
                    {formatNumber(rec.value)}
                    <span className="ml-1 font-corpo text-xs font-semibold text-giz-suave">
                      {type === 'max_reps' ? 'reps' : 'kg'}
                    </span>
                  </dd>
                </div>
              )
            })}
          </dl>
          <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-amarela">
            Ver evolução <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </p>
        </div>
      </Link>
    </motion.li>
  )
}

import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { analyticsApi, analyticsKeys, optionalQuery } from '@/api/analytics'
import type { ExerciseRecords } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { dataVars, METAL } from '@/components/charts/palette'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatInstantDate } from '@/lib/format'

const PLACES = [
  { place: 1, metal: METAL.ouro, height: 'h-32 sm:h-36', label: '1º lugar' },
  { place: 2, metal: METAL.prata, height: 'h-22 sm:h-24', label: '2º lugar' },
  { place: 3, metal: METAL.bronze, height: 'h-14 sm:h-16', label: '3º lugar' },
]
const VISUAL_ORDER = [1, 0, 2]

export function HallOfFame({ records }: { records: ExerciseRecords[] }) {
  const summary = useQuery({ queryKey: analyticsKeys.summary, queryFn: analyticsApi.summary, ...optionalQuery })
  const top = records
    .filter((r) => r.max_weight && r.max_weight.value > 0)
    .sort((a, b) => b.max_weight!.value - a.max_weight!.value)
    .slice(0, 3)
  if (top.length === 0) return null

  return (
    <section
      aria-labelledby="hall-da-fama"
      className={`knurl relative -mx-4 mb-8 overflow-hidden border-y border-amarela/30 bg-aco-2 px-4 pb-0 pt-5 sm:mx-0 sm:rounded-[32px] sm:border sm:px-6 ${dataVars}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 max-w-lg rounded-full bg-amarela/15 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="hall-da-fama" className="placar text-4xl">
          Hall da fama
        </h2>
        <p className="text-sm text-giz-suave">
          {summary.data && summary.data.records_beaten > 0 ? (
            <>
              <span className="font-semibold text-giz">{summary.data.records_beaten}</span>{' '}
              {summary.data.records_beaten === 1 ? 'recorde batido' : 'recordes batidos'} até hoje
            </>
          ) : (
            'Suas cargas mais pesadas'
          )}
        </p>
      </div>

      <ol className="relative mt-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
        {VISUAL_ORDER.map((idx) => {
          const r = top[idx]
          const p = PLACES[idx]!
          if (!r)
            return (
              <li key={`vazio-${idx}`} aria-hidden="true" className="flex min-w-0 flex-col items-center justify-end">
                <span className="mb-3 px-1 text-center text-xs text-giz-suave">Lugar vago</span>
                <div className={`w-full rounded-t-2xl border-2 border-b-0 border-dashed border-linha ${p.height}`} />
              </li>
            )
          const rise = { 2: 0.1, 1: 0.25, 0: 0.45 }[idx] ?? 0
          return (
            <li key={r.exercise.id} className="min-w-0">
              <Link to={`/exercicios/${r.exercise.id}`} className="group flex min-w-0 flex-col justify-end rounded-t-2xl">
                <span className="sr-only">{p.label}: </span>
                <motion.div
                  className="flex flex-col items-center px-1 text-center"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: rise + 0.35 }}
                >
                  <motion.span
                    initial={{ rotate: -120, scale: 0.4 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 14, delay: rise + 0.45 }}
                    className={idx === 0 ? 'size-14 sm:size-16' : 'size-11 sm:size-12'}
                  >
                    <Plate color={p.metal} letter={String(p.place)} className="size-full drop-shadow-lg" />
                  </motion.span>
                  <span className="mt-2 line-clamp-2 text-xs font-medium leading-tight text-giz group-hover:underline sm:text-sm">
                    {r.exercise.name}
                  </span>
                  <span className={`placar mt-1 leading-none ${idx === 0 ? 'text-5xl text-amarela sm:text-6xl' : 'text-3xl sm:text-4xl'}`}>
                    <AnimatedNumber value={r.max_weight!.value} decimals={2} />
                    <span className="ml-0.5 font-corpo text-sm font-semibold text-giz-suave">kg</span>
                  </span>
                  <span className="sr-only">em {formatInstantDate(r.max_weight!.achieved_at)}</span>
                </motion.div>
                <motion.div
                  className={`relative mt-3 origin-bottom overflow-hidden rounded-t-2xl ${p.height}`}
                  style={{ background: p.metal }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: 'spring', stiffness: 150, damping: 18, mass: 1.2, delay: rise }}
                  aria-hidden="true"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/30" />
                  <div className="knurl absolute inset-0 opacity-60" />
                  <span className="placar absolute inset-x-0 top-2 text-center text-3xl text-black/35">{p.place}</span>
                </motion.div>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

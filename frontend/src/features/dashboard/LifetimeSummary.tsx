import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { analyticsApi, analyticsKeys, optionalQuery } from '@/api/analytics'
import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatLocalDate, plural } from '@/lib/format'

export function LifetimeSummary() {
  const q = useQuery({ queryKey: analyticsKeys.summary, queryFn: analyticsApi.summary, ...optionalQuery })
  if (!q.data || q.data.total_workouts === 0) return null
  const s = q.data
  const best = s.heaviest_set

  return (
    <section aria-labelledby="carreira" className="relative overflow-hidden rounded-[28px] border border-linha bg-superficie p-5">
      <div className="pointer-events-none absolute -right-14 -top-6 flex flex-col gap-1 opacity-[0.1]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Plate key={i} color="var(--anilha-azul)" className="size-28" />
        ))}
      </div>
      <div className="relative">
        <h2 id="carreira" className="text-lg font-semibold">
          Sua carreira na barra
        </h2>
        {s.first_workout_date ? (
          <p className="text-sm text-giz-suave">Desde {formatLocalDate(s.first_workout_date)}</p>
        ) : null}

        {best ? (
          <Link to={`/exercicios/${best.exercise_id}`} className="group mt-4 block">
            <span className="block text-sm text-giz-suave">Maior carga</span>
            <span className="placar block text-[4.5rem] leading-[0.85] sm:text-8xl">
              <AnimatedNumber value={best.weight_kg} decimals={2} duration={1.6} />
              <span className="ml-2 font-corpo text-2xl font-semibold text-giz-suave">kg</span>
            </span>
            <span className="mt-2 flex items-center gap-1 text-giz-suave">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-giz">{best.name}</span> · {plural(best.reps, 'repetição', 'repetições')} ·{' '}
                {formatLocalDate(best.date)}
              </span>
              <ChevronRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </Link>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Figure label="Treinos" value={s.total_workouts} />
          <Figure label="Séries" value={s.total_sets} />
          <Figure label="Repetições" value={s.total_reps} />
          <Figure label="Recordes batidos" value={s.records_beaten} />
        </dl>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-aco-2 px-4 py-3">
            <p className="text-sm text-giz-suave">Maior sequência</p>
            <p className="font-semibold">
              {plural(s.best_streak_weeks, 'semana seguida', 'semanas seguidas')}
              {s.current_streak_weeks > 0 ? (
                <span className="font-normal text-giz-suave"> (agora: {plural(s.current_streak_weeks, 'semana', 'semanas')})</span>
              ) : null}
            </p>
          </div>
          {s.favorite_exercise ? (
            <Link
              to={`/exercicios/${s.favorite_exercise.id}`}
              className="group flex items-center gap-3 rounded-2xl bg-aco-2 px-4 py-3 transition hover:bg-superficie-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-giz-suave">Exercício favorito</span>
                <span className="block truncate font-semibold">{s.favorite_exercise.name}</span>
                <span className="block text-sm text-giz-suave">{plural(s.favorite_exercise.sessions, 'sessão', 'sessões')}</span>
              </span>
              <ChevronRight className="size-5 text-giz-suave transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-giz-suave">{label}</dt>
      <dd className="placar text-4xl">
        <AnimatedNumber value={value} duration={1.4} />
      </dd>
    </div>
  )
}

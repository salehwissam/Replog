import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Library, Play } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { queryKeys, workoutsApi } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { SimpleBarChart } from '@/components/charts/BarChartCard'
import { Alert } from '@/components/ui/Alert'
import { PageLoader } from '@/components/ui/Spinner'
import { RecordItem } from '@/components/workout/RecordItem'
import { AchievementsStrip } from '@/features/achievements/AchievementsStrip'
import { useCurrentUser } from '@/features/auth/useAuth'
import { formatDuration, formatLocalDate, greeting, plural, todayLong } from '@/lib/format'
import { letterColor } from '@/lib/motion'

import { LifetimeSummary } from './LifetimeSummary'
import { WeekBarbell } from './WeekBarbell'

export default function DashboardPage() {
  const user = useCurrentUser()
  const dash = useQuery({ queryKey: queryKeys.dashboard, queryFn: workoutsApi.dashboard })
  const splits = useQuery({ queryKey: queryKeys.splits, queryFn: workoutsApi.splits })
  const firstName = user.name.split(' ')[0]

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="text-giz-suave">{todayLong()}</p>
        <motion.h1
          className="placar mt-1 text-[3.6rem] sm:text-7xl"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        >
          {greeting()}, {firstName}
        </motion.h1>
      </header>

      {dash.isPending ? (
        <PageLoader />
      ) : dash.isError ? (
        <Alert tone="erro">{dash.error.message}</Alert>
      ) : (
        <>
          <WeekBarbell dash={dash.data} />

          {splits.data && splits.data.length === 0 ? (
            <Link
              to="/programas"
              className="knurl flex items-center gap-4 rounded-[28px] border border-amarela/50 bg-aco-2 p-5 transition hover:border-amarela active:scale-[0.99]"
            >
              <Library className="size-9 shrink-0 text-amarela" aria-hidden="true" />
              <span className="flex-1">
                <span className="placar block text-3xl">Comece com um programa pronto</span>
                <span className="text-sm text-giz-suave">ABC, corpo inteiro, superior e inferior e mais. Monta suas divisões em um toque.</span>
              </span>
              <ChevronRight className="size-6 text-amarela" aria-hidden="true" />
            </Link>
          ) : null}

          <Link
            to="/treino"
            className="group relative flex items-center gap-4 overflow-hidden rounded-[28px] bg-azul p-5 text-white shadow-[0_20px_50px_-20px_var(--anilha-azul)] transition active:scale-[0.98]"
          >
            <motion.span
              className="relative block size-16 shrink-0"
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            >
              <Plate color="rgb(255 255 255 / 0.18)" className="size-full" />
              <Play className="absolute inset-0 m-auto size-6 fill-white" aria-hidden="true" />
            </motion.span>
            <span className="relative flex-1">
              <span className="placar block text-4xl">
                {dash.data.active_session_id ? 'Continuar treino' : 'Começar treino'}
              </span>
              <span className="text-sm text-white/80">
                {dash.data.active_session_id ? 'Você tem um treino em andamento.' : 'Escolha a divisão e registre série por série.'}
              </span>
            </span>
            <ChevronRight className="relative size-7 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>

          <AchievementsStrip />

          <div className="grid gap-7 lg:grid-cols-2">
            <section aria-labelledby="series-semana" className="rounded-[28px] border border-linha bg-superficie p-5">
              <h2 id="series-semana" className="text-lg font-semibold">
                Séries por semana
              </h2>
              <p className="mb-2 text-sm text-giz-suave">Séries de trabalho nas últimas 8 semanas (aquecimento não conta)</p>
              <SimpleBarChart
                unit="séries"
                ariaLabel="Gráfico de séries por semana nas últimas 8 semanas"
                valueLabel="Séries"
                data={dash.data.weekly.map((w) => ({
                  label: w.label,
                  value: w.sets,
                  detail: plural(w.workouts, 'treino', 'treinos'),
                }))}
              />
            </section>

            <section aria-labelledby="recordes-recentes" className="rounded-[28px] border border-linha bg-superficie p-5">
              <div className="flex items-baseline justify-between">
                <h2 id="recordes-recentes" className="text-lg font-semibold">
                  Recordes recentes
                </h2>
                <Link to="/recordes" className="text-sm font-semibold text-amarela hover:underline">
                  Ver todos
                </Link>
              </div>
              {dash.data.recent_records.length === 0 ? (
                <p className="mt-3 text-giz-suave">
                  Quando você superar uma marca, ela aparece aqui. A primeira vez de cada exercício vira sua referência.
                </p>
              ) : (
                <ul className="divide-y divide-linha/60">
                  {dash.data.recent_records.map((r) => (
                    <RecordItem key={r.id} record={r} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-labelledby="ultimo-treino">
            <h2 id="ultimo-treino" className="mb-3 text-lg font-semibold">
              Último treino
            </h2>
            {dash.data.last_session ? (
              <Link
                to={`/historico/${dash.data.last_session.id}`}
                className="flex items-center gap-4 rounded-[28px] border border-linha bg-superficie p-4 transition hover:border-azul/60 active:scale-[0.99]"
              >
                <Plate
                  color={letterColor(dash.data.last_session.split_letter)}
                  letter={dash.data.last_session.split_letter ?? undefined}
                  className="size-14 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {dash.data.last_session.split_letter
                      ? `Treino ${dash.data.last_session.split_letter} — ${dash.data.last_session.split_name}`
                      : 'Treino livre'}
                  </p>
                  <p className="text-sm text-giz-suave">
                    {formatLocalDate(dash.data.last_session.local_date)}, {plural(dash.data.last_session.total_sets, 'série', 'séries')}
                    {dash.data.last_session.duration_seconds != null
                      ? `, ${formatDuration(dash.data.last_session.duration_seconds)}`
                      : ' (em andamento)'}
                  </p>
                  <p className="truncate text-sm text-giz-suave">{dash.data.last_session.exercise_names.join(', ')}</p>
                </div>
                <ChevronRight className="size-5 text-giz-suave" aria-hidden="true" />
              </Link>
            ) : (
              <p className="text-giz-suave">Nenhum treino registrado ainda. Que tal começar hoje?</p>
            )}
          </section>

          <LifetimeSummary />
        </>
      )}
    </div>
  )
}

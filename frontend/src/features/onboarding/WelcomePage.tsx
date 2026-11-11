import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, Check, Library, PencilRuler } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { queryKeys, workoutsApi, type Program } from '@/api/workouts'
import { Barbell, type BarbellPlate } from '@/components/brand/Barbell'
import { BarbellMark } from '@/components/brand/BarbellMark'
import { Plate } from '@/components/brand/Plate'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useCurrentUser } from '@/features/auth/useAuth'
import { ApplyProgramActions, LevelMeter, MuscleBar, ProgramBarbell, WeekStrip } from '@/features/programs/ProgramParts'
import { joinPt, muscleShares, programStats, WEEKDAYS_LONG, weekPattern } from '@/features/programs/programUtils'
import { letterColor, molaToque } from '@/lib/motion'

import { DAY_OPTIONS, GOALS, markWelcomeSeen, recommendationReason, recommendProgram, type Goal } from './recommend'

const GOAL_LOADS: Record<Goal, BarbellPlate[]> = {
  forca: [
    { id: 'v1', color: 'var(--anilha-vermelha)', height: 1, thickness: 1.3 },
    { id: 'v2', color: 'var(--anilha-vermelha)', height: 1, thickness: 1.3 },
    { id: 'a1', color: 'var(--anilha-azul)', height: 1, thickness: 1.1 },
  ],
  hipertrofia: [
    { id: 'a1', color: 'var(--anilha-azul)', height: 1, thickness: 1.1 },
    { id: 'o1', color: 'var(--anilha-amarela)', height: 0.88 },
    { id: 'g1', color: 'var(--anilha-verde)', height: 0.76, thickness: 0.85 },
  ],
  iniciante: [{ id: 'g1', color: 'var(--anilha-verde)', height: 0.76, thickness: 0.85 }],
}

const STEP_TITLES = ['Seu objetivo', 'Sua semana', 'Seu programa'] as const

export default function WelcomePage() {
  const user = useCurrentUser()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [days, setDays] = useState<number | null>(null)
  const programs = useQuery({ queryKey: queryKeys.programs, queryFn: workoutsApi.programs, staleTime: Infinity })
  const firstName = user.name.split(' ')[0] || 'atleta'

  useEffect(() => {
    if (user.id) markWelcomeSeen(user.id)
  }, [user.id])

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }
  const canContinue = step === 0 ? goal != null : step === 1 ? days != null : false
  const recommended = goal && days && programs.data ? recommendProgram(programs.data, goal, days) : null

  return createPortal(
    <div className="fixed inset-0 z-[45] overflow-y-auto bg-aco">
    <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pt-5">
      <div className="knurl pointer-events-none absolute inset-x-0 top-0 h-56 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true" />

      <header className="relative flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <BarbellMark className="h-6 w-auto" />
          <span className="placar text-2xl">REPLOG</span>
        </span>
        <Link to="/" className="flex min-h-11 items-center px-2 text-sm font-semibold text-giz-suave hover:text-giz">
          Pular por agora
        </Link>
      </header>

      <ol className="relative mt-6 grid grid-cols-3 gap-2" aria-label="Passos">
        {STEP_TITLES.map((t, i) => (
          <li key={t} className="flex flex-col gap-1.5" aria-current={i === step ? 'step' : undefined}>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-linha">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full bg-azul"
                initial={false}
                animate={{ width: i < step || (i === step && step === STEP_TITLES.length - 1) ? '100%' : i === step ? '50%' : '0%' }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              />
            </span>
            <span className={clsx('text-xs', i <= step ? 'text-giz' : 'text-giz-suave')}>
              {i + 1}. {t}
            </span>
          </li>
        ))}
      </ol>

      <div className="relative mt-8 flex-1">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={step}
            custom={direction}
            initial={reduce ? false : { opacity: 0, x: direction * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -60, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            aria-labelledby="passo-titulo"
          >
            {step === 0 ? (
              <>
                <h1 id="passo-titulo" className="placar text-[3.2rem] sm:text-6xl">
                  Boas-vindas, {firstName}.
                </h1>
                <p className="mt-2 text-giz-suave">Duas perguntas rápidas e sua barra fica montada. Qual é o seu objetivo agora?</p>
                <div role="radiogroup" aria-label="Objetivo" className="mt-6 flex flex-col gap-3">
                  {GOALS.map((g, i) => {
                    const on = goal === g.key
                    return (
                      <motion.button
                        key={g.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setGoal(g.key)}
                        initial={reduce ? false : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 28, delay: 0.1 + i * 0.07 }}
                        whileTap={{ scale: 0.98 }}
                        className={clsx(
                          'relative flex items-center gap-3 overflow-hidden rounded-[24px] border p-4 text-left transition-colors',
                          on ? 'border-azul bg-azul/10' : 'border-linha bg-superficie hover:border-azul/50',
                        )}
                      >
                        <span className="w-[4.5rem] shrink-0 sm:w-28" aria-hidden="true">
                          <Barbell plates={GOAL_LOADS[g.key]} height={36} knurl={false} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="placar block text-[1.6rem] leading-[0.95]">{g.title}</span>
                          <span className="mt-1 block text-sm leading-snug text-giz-suave">{g.body}</span>
                        </span>
                        <span
                          className={clsx(
                            'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                            on ? 'border-azul bg-azul text-white' : 'border-linha',
                          )}
                          aria-hidden="true"
                        >
                          {on ? <Check className="size-4" strokeWidth={3} /> : null}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </>
            ) : step === 1 ? (
              <>
                <h1 id="passo-titulo" className="placar text-[3.2rem] sm:text-6xl">
                  Quantos dias por semana?
                </h1>
                <p className="mt-2 text-giz-suave">Conte só com os dias que você consegue manter. Constância vence intensidade.</p>
                <div role="radiogroup" aria-label="Dias por semana" className="mt-6 grid grid-cols-5 gap-2">
                  {DAY_OPTIONS.map((d) => {
                    const on = days === d
                    return (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`${d} dias`}
                        onClick={() => setDays(d)}
                        className={clsx(
                          'relative flex aspect-[3/4] flex-col items-center justify-center rounded-[22px] border transition-colors active:scale-95',
                          on ? 'border-transparent text-white' : 'border-linha bg-superficie text-giz hover:border-azul/50',
                        )}
                      >
                        {on ? (
                          <motion.span layoutId="dias-escolhidos" className="absolute inset-0 rounded-[22px] bg-azul" transition={molaToque} />
                        ) : null}
                        <span className="placar relative text-5xl">{d}</span>
                        <span className={clsx('relative text-xs', on ? 'text-white/85' : 'text-giz-suave')}>dias</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-8 rounded-[24px] border border-linha bg-aco-2 p-4">
                  {days ? (
                    <>
                      <WeekStrip days={days} />
                      <p className="mt-3 text-sm text-giz-suave" aria-live="polite">
                        Sugestão: {joinPt(weekPattern(days).map((d) => WEEKDAYS_LONG[d]!))}. Descanso também faz parte do treino.
                      </p>
                    </>
                  ) : (
                    <>
                      <WeekStrip days={0} />
                      <p className="mt-3 text-sm text-giz-suave">Escolha um número e veja como fica a sua semana.</p>
                    </>
                  )}
                </div>
              </>
            ) : (
              <RecommendationStep
                pending={programs.isPending}
                error={programs.isError ? programs.error.message : null}
                program={recommended}
                goal={goal!}
                days={days!}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <footer className="sticky bottom-0 z-10 -mx-5 mt-8 flex items-center gap-3 bg-linear-to-t from-aco from-60% to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        {step > 0 ? (
          <Button variant="fantasma" icon={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>
            Voltar
          </Button>
        ) : null}
        {step < 2 ? (
          <Button size="lg" className="flex-1" disabled={!canContinue} onClick={() => go(step + 1)}>
            {step === 0 ? 'Continuar' : 'Ver meu programa'}
          </Button>
        ) : recommended ? (
          <div className="flex-1">
            <ApplyProgramActions program={recommended} />
          </div>
        ) : null}
      </footer>
    </div>
    </div>,
    document.body,
  )
}

function RecommendationStep({
  pending,
  error,
  program,
  goal,
  days,
}: {
  pending: boolean
  error: string | null
  program: Program | null
  goal: Goal
  days: number
}) {
  if (pending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner label="Escolhendo seu programa…" />
      </div>
    )
  }
  if (error || !program) {
    return (
      <div className="flex flex-col gap-4">
        <h1 id="passo-titulo" className="placar text-5xl">
          Seu programa
        </h1>
        <Alert tone="erro">{error ?? 'Nenhum programa disponível agora.'}</Alert>
        <OtherPaths />
      </div>
    )
  }
  const stats = programStats(program)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-giz-suave">Recomendado para você</p>
        <h1 id="passo-titulo" className="placar text-[3.6rem] sm:text-7xl">
          {program.name}
        </h1>
      </div>
      <div className="relative -mx-2">
        <ProgramBarbell letters={program.splits.map((s) => s.letter)} height={96} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LevelMeter level={program.level} />
        <span className="text-sm text-giz-suave">{program.days_per_week}</span>
      </div>
      <p>{recommendationReason(goal, days, program)}</p>

      <section aria-labelledby="semana-recomendada" className="rounded-[24px] border border-linha bg-aco-2 p-4">
        <h2 id="semana-recomendada" className="mb-3 font-semibold">
          Sua semana com {days} dias
        </h2>
        <WeekStrip days={days} letters={program.splits.map((s) => s.letter)} />
      </section>

      <ul className="flex flex-col gap-2">
        {program.splits.map((s, i) => (
          <motion.li
            key={s.letter}
            className="flex items-center gap-3 rounded-[20px] border border-linha bg-superficie p-3"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, delay: 0.2 + i * 0.06 }}
          >
            <Plate color={letterColor(s.letter)} letter={s.letter} className="size-11 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{s.name}</span>
              <span className="block truncate text-sm text-giz-suave">
                {s.exercises.length} exercícios: {muscleShares(s.exercises).slice(0, 3).map((m) => m.label).join(', ')}
              </span>
            </span>
          </motion.li>
        ))}
      </ul>
      <MuscleBar muscles={stats.muscles} legend={5} />

      <OtherPaths />
    </div>
  )
}

function OtherPaths() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link
        to="/divisoes"
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-superficie-2 px-3 text-sm font-semibold transition hover:bg-linha active:scale-[0.97]"
      >
        <PencilRuler className="size-4" aria-hidden="true" /> Montar sozinho
      </Link>
      <Link
        to="/programas"
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-superficie-2 px-3 text-sm font-semibold transition hover:bg-linha active:scale-[0.97]"
      >
        <Library className="size-4" aria-hidden="true" /> Ver todos
      </Link>
    </div>
  )
}

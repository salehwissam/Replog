import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Dumbbell, Library } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { invalidateTrainingData } from '@/api/invalidate'
import { queryKeys, workoutsApi, type Split } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { letterColor } from '@/lib/motion'

export function StartWorkout() {
  const queryClient = useQueryClient()
  const splits = useQuery({ queryKey: queryKeys.splits, queryFn: workoutsApi.splits })
  const [chosen, setChosen] = useState<number | 'livre' | null>(null)
  const start = useMutation({
    mutationFn: (split: Split | null) => workoutsApi.start({ split_id: split?.id ?? null }),
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.active, session)
      void invalidateTrainingData(queryClient)
    },
    onError: () => setChosen(null),
  })

  const go = (split: Split | null) => {
    setChosen(split?.id ?? 'livre')
    start.mutate(split)
  }

  return (
    <div>
      <PageHeader title="Treinar" subtitle="Qual treino é hoje?" />
      {start.isError ? (
        <div className="mb-4">
          <Alert tone="erro">{start.error.message}</Alert>
        </div>
      ) : null}

      {splits.isPending ? (
        <Spinner label="Carregando divisões…" />
      ) : splits.isError ? (
        <Alert tone="erro">{splits.error.message}</Alert>
      ) : (
        <div className="flex flex-col gap-3">
          {splits.data.length === 0 ? (
            <Link
              to="/programas"
              className="knurl flex flex-col gap-3 rounded-[28px] border border-amarela/50 bg-aco-2 p-5 transition hover:border-amarela active:scale-[0.99]"
            >
              <span className="flex items-center gap-2 text-amarela">
                <Library className="size-6" aria-hidden="true" />
                <span className="font-semibold">Programas prontos</span>
              </span>
              <span className="placar text-4xl">Ainda sem divisões?</span>
              <span className="text-giz-suave">
                Escolha um programa (ABC, corpo inteiro, superior e inferior…) e comece o treino com os exercícios já na fila.
              </span>
              <span className="flex items-center gap-1 font-semibold text-amarela">
                Ver programas <ChevronRight className="size-5" aria-hidden="true" />
              </span>
            </Link>
          ) : null}

          {splits.data.map((split, i) => {
            const loading = start.isPending && chosen === split.id
            return (
              <motion.button
                key={split.id}
                type="button"
                disabled={start.isPending}
                onClick={() => go(split)}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26, delay: i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                className="group flex items-center gap-4 rounded-[28px] border border-linha bg-superficie p-4 text-left transition-colors hover:border-azul/60 disabled:opacity-60"
              >
                <motion.span
                  className="block size-[72px] shrink-0"
                  animate={loading ? { rotate: 360 } : { rotate: 0 }}
                  transition={loading ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : { type: 'spring' }}
                >
                  <Plate color={letterColor(split.letter)} letter={split.letter} className="size-full drop-shadow-md" />
                </motion.span>
                <span className="min-w-0 flex-1">
                  <span className="placar block text-3xl">{split.name}</span>
                  <span className="block truncate text-sm text-giz-suave">
                    {split.exercises.length > 0
                      ? split.exercises.map((e) => e.exercise.name).join(', ')
                      : 'Sem exercícios definidos'}
                  </span>
                </span>
                <ChevronRight className="size-6 shrink-0 text-giz-suave transition-transform group-hover:translate-x-1 group-hover:text-azul" aria-hidden="true" />
              </motion.button>
            )
          })}

          <Button
            size="lg"
            variant={splits.data.length ? 'secundario' : 'primario'}
            icon={<Dumbbell className="size-5" />}
            loading={start.isPending && chosen === 'livre'}
            disabled={start.isPending}
            onClick={() => go(null)}
          >
            Começar treino livre
          </Button>

          {splits.data.length > 0 ? (
            <p className="text-sm text-giz-suave">
              Quer outra divisão?{' '}
              <Link to="/programas" className="font-semibold text-azul hover:underline">
                Programas prontos
              </Link>{' '}
              ou{' '}
              <Link to="/divisoes" className="font-semibold text-azul hover:underline">
                monte a sua
              </Link>
              .
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

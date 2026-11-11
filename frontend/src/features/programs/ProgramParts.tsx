import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Dumbbell } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '@/api/client'
import { queryKeys, workoutsApi, type Program } from '@/api/workouts'
import { Barbell } from '@/components/brand/Barbell'
import { Plate } from '@/components/brand/Plate'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { letterColor } from '@/lib/motion'

import { levelLabel, levelRank, muscleColor, WEEKDAYS, WEEKDAYS_LONG, weekPattern, type MuscleShare } from './programUtils'

export function ProgramBarbell({ letters, height = 70 }: { letters: string[]; height?: number }) {
  return (
    <Barbell
      height={height}
      knurl={false}
      plates={letters.map((l, i) => ({
        id: l,
        color: letterColor(l),
        height: 1 - i * 0.07,
        thickness: 1.1,
      }))}
    />
  )
}

export function LevelMeter({ level }: { level: string }) {
  const rank = levelRank(level)
  const color = rank === 1 ? 'bg-verde' : rank === 2 ? 'bg-azul' : 'bg-vermelha'
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span className="flex items-end gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={clsx('w-[5px] rounded-sm', n <= rank ? color : 'bg-linha')} style={{ height: 6 + n * 4 }} />
        ))}
      </span>
      {levelLabel(level)}
    </span>
  )
}

export function MuscleBar({
  muscles,
  legend = 4,
  className,
  delay = 0,
}: {
  muscles: MuscleShare[]
  legend?: number
  className?: string
  delay?: number
}) {
  const total = muscles.reduce((acc, m) => acc + m.sets, 0) || 1
  const summary = muscles.map((m) => `${m.label}: ${m.sets} séries`).join('; ')
  const top = muscles.slice(0, 5)
  const rest = muscles.slice(5).reduce((acc, m) => acc + m.sets, 0)
  const segments = rest > 0 ? [...top, { key: 'outros-grupos', label: 'Outros', sets: rest }] : top
  return (
    <div className={className}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-superficie-2" role="img" aria-label={`Séries por grupo muscular. ${summary}`}>
        {segments.map((m, i) => (
          <motion.span
            key={m.key}
            className="h-full border-r-2 border-superficie last:border-r-0"
            style={{ background: m.key === 'outros-grupos' ? 'var(--linha)' : muscleColor(m.key) }}
            initial={{ width: 0 }}
            animate={{ width: `${(m.sets / total) * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 24, delay: delay + i * 0.04 }}
          />
        ))}
      </div>
      {legend > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-giz-suave" aria-hidden="true">
          {muscles.slice(0, legend).map((m) => (
            <li key={m.key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: muscleColor(m.key) }} />
              {m.label}
              <span className="num text-sm text-giz">{m.sets}</span>
            </li>
          ))}
          {muscles.length > legend ? <li>+{muscles.length - legend}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

export function WeekStrip({ days, letters }: { days: number; letters?: string[] }) {
  const pattern = weekPattern(days)
  const assigned = new Map(pattern.map((d, i) => [d, letters && letters.length ? letters[i % letters.length]! : null]))
  const label = pattern
    .map((d) => {
      const l = assigned.get(d)
      return l ? `${WEEKDAYS_LONG[d]}: treino ${l}` : WEEKDAYS_LONG[d]
    })
    .join(', ')
  return (
    <div role="img" aria-label={`Semana sugerida: ${label}. Nos outros dias, descanso.`} className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((name, d) => {
        const on = assigned.has(d)
        const letter = assigned.get(d)
        return (
          <div key={name} className="flex flex-col items-center gap-1.5">
            <div className="relative flex aspect-square w-full max-w-14 items-center justify-center rounded-full border border-dashed border-linha">
              {on ? (
                <motion.span
                  key={`${days}-${letter ?? 'x'}`}
                  className="absolute -inset-px"
                  initial={{ scale: 0, rotate: -150 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 17, delay: pattern.indexOf(d) * 0.05 }}
                >
                  <Plate color={letter ? letterColor(letter) : 'var(--anilha-azul)'} letter={letter ?? undefined} className="size-full" />
                </motion.span>
              ) : null}
            </div>
            <span className={clsx('text-xs font-medium', on ? 'text-giz' : 'text-giz-suave/70')}>{name}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ApplyProgramActions({ program, onApplied }: { program: Program; onApplied?: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const [needsReplace, setNeedsReplace] = useState(false)

  const apply = useMutation({
    mutationFn: (replace: boolean) => workoutsApi.applyProgram(program.key, replace),
    onSuccess: (splits) => {
      queryClient.setQueryData(queryKeys.splits, splits)
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.show({ tone: 'sucesso', title: `Programa ${program.name} aplicado`, body: 'Suas divisões estão prontas.' })
      onApplied?.()
      navigate('/treino')
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'divisoes_existentes') setNeedsReplace(true)
    },
  })

  if (needsReplace) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-giz-suave">
          Você já tem divisões montadas. Elas serão substituídas por este programa (seus treinos registrados não mudam).
        </p>
        <div className="flex gap-2">
          <Button variant="fantasma" className="flex-1" onClick={() => setNeedsReplace(false)}>
            Manter as minhas
          </Button>
          <Button variant="perigo" className="flex-1" loading={apply.isPending} onClick={() => apply.mutate(true)}>
            Substituir divisões
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {apply.isError && !(apply.error instanceof ApiError && apply.error.code === 'divisoes_existentes') ? (
        <Alert tone="erro">{apply.error.message}</Alert>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        icon={<Dumbbell className="size-5" />}
        loading={apply.isPending}
        onClick={() => apply.mutate(false)}
      >
        Usar este programa
      </Button>
    </div>
  )
}

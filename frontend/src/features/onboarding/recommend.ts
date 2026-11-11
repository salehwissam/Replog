import type { Program } from '@/api/workouts'
import { levelRank, parseDays } from '@/features/programs/programUtils'

export type Goal = 'forca' | 'hipertrofia' | 'iniciante'

export const GOALS: { key: Goal; title: string; body: string }[] = [
  { key: 'forca', title: 'Ficar mais forte', body: 'Mais carga no agachamento, supino e remada.' },
  { key: 'hipertrofia', title: 'Ganhar massa muscular', body: 'Mais séries por grupo muscular.' },
  { key: 'iniciante', title: 'Começar do zero', body: 'Aprender os movimentos com um treino simples.' },
]

export const DAY_OPTIONS = [2, 3, 4, 5, 6] as const

const PREFERENCES: Record<Goal, Record<number, string[]>> = {
  iniciante: {
    2: ['corpo-inteiro'],
    3: ['corpo-inteiro'],
    4: ['corpo-inteiro', 'superior-inferior'],
    5: ['corpo-inteiro', 'superior-inferior'],
    6: ['corpo-inteiro', 'superior-inferior'],
  },
  forca: {
    2: ['corpo-inteiro'],
    3: ['empurrar-puxar-pernas', 'corpo-inteiro'],
    4: ['superior-inferior'],
    5: ['empurrar-puxar-pernas', 'superior-inferior'],
    6: ['empurrar-puxar-pernas'],
  },
  hipertrofia: {
    2: ['corpo-inteiro'],
    3: ['abc', 'empurrar-puxar-pernas'],
    4: ['superior-inferior', 'abc'],
    5: ['abcde', 'abc'],
    6: ['abc', 'empurrar-puxar-pernas'],
  },
}

export function recommendProgram(programs: Program[], goal: Goal, days: number): Program | null {
  if (programs.length === 0) return null
  const byKey = new Map(programs.map((p) => [p.key, p]))
  for (const key of PREFERENCES[goal][days] ?? []) {
    const found = byKey.get(key)
    if (found) return found
  }
  const wantedLevel = goal === 'iniciante' ? 1 : 2
  const scored = programs.map((p) => {
    const fitsDays = parseDays(p.days_per_week).includes(days) ? 0 : 10
    return { p, score: fitsDays + Math.abs(levelRank(p.level) - wantedLevel) }
  })
  scored.sort((a, b) => a.score - b.score)
  return scored[0]!.p
}

export function recommendationReason(goal: Goal, days: number, program: Program): string {
  const cycle = program.splits.map((s) => s.letter).join(', ')
  const repeats = days > program.splits.length
  const base =
    goal === 'iniciante'
      ? 'Poucos exercícios, movimentos básicos e o corpo todo em cada treino.'
      : goal === 'forca'
        ? 'Movimentos compostos no centro de cada treino, com descanso para carga alta.'
        : 'Volume bem distribuído para cada grupo muscular crescer.'
  return repeats
    ? `${base} Com ${days} dias, você repete o ciclo ${cycle} ao longo da semana.`
    : `${base} Um treino diferente em cada um dos ${days} dias.`
}

const seenKey = (userId: number) => `replog:boas-vindas:${userId}`

export function welcomeSeen(userId: number): boolean {
  try {
    return localStorage.getItem(seenKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markWelcomeSeen(userId: number): void {
  try {
    localStorage.setItem(seenKey(userId), '1')
  } catch {
  }
}

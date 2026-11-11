import type { Program } from '@/api/workouts'

export const MUSCLE_LABELS: Record<string, string> = {
  peito: 'Peito',
  costas: 'Costas',
  ombros: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  antebraco: 'Antebraço',
  quadriceps: 'Quadríceps',
  posterior: 'Posterior de coxa',
  gluteos: 'Glúteos',
  panturrilha: 'Panturrilha',
  abdomen: 'Abdômen',
  corpo_inteiro: 'Corpo inteiro',
}

export function muscleLabel(key: string | null | undefined): string {
  if (!key) return 'Outros'
  return MUSCLE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

export const LEVELS = ['iniciante', 'intermediário', 'avançado'] as const

export function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1)
}

export function levelRank(level: string): number {
  const i = (LEVELS as readonly string[]).indexOf(level)
  return i < 0 ? 2 : i + 1
}

export function parseDays(text: string): number[] {
  const range = /(\d+)\s*a\s*(\d+)/.exec(text)
  if (range) {
    const from = Number(range[1])
    const to = Number(range[2])
    return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  }
  return Array.from(text.matchAll(/\d+/g), (m) => Number(m[0]))
}

export interface MuscleShare {
  key: string
  label: string
  sets: number
}

export interface ProgramStats {
  workouts: number
  exercises: number
  sets: number
  muscles: MuscleShare[]
}

export function muscleShares(exercises: { muscle_group: string | null; target_sets: number }[]): MuscleShare[] {
  const map = new Map<string, number>()
  for (const e of exercises) {
    const key = e.muscle_group ?? 'outros'
    map.set(key, (map.get(key) ?? 0) + e.target_sets)
  }
  return [...map.entries()]
    .map(([key, sets]) => ({ key, label: muscleLabel(key === 'outros' ? null : key), sets }))
    .sort((a, b) => b.sets - a.sets || a.label.localeCompare(b.label, 'pt-BR'))
}

export function programStats(p: Program): ProgramStats {
  const all = p.splits.flatMap((s) => s.exercises)
  return {
    workouts: p.splits.length,
    exercises: all.length,
    sets: all.reduce((acc, e) => acc + e.target_sets, 0),
    muscles: muscleShares(all),
  }
}

const MUSCLE_COLORS: Record<string, string> = {
  peito: 'var(--anilha-vermelha)',
  costas: 'var(--anilha-azul)',
  ombros: 'var(--anilha-amarela)',
  biceps: '#a678ff',
  triceps: '#ff8a4c',
  antebraco: '#8a94ad',
  quadriceps: 'var(--anilha-verde)',
  posterior: '#2fc9c9',
  gluteos: '#ff6fae',
  panturrilha: '#6ea8ff',
  abdomen: '#c8d26b',
  corpo_inteiro: 'var(--giz-suave)',
}

export function muscleColor(key: string): string {
  return MUSCLE_COLORS[key] ?? 'var(--linha)'
}

export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const
export const WEEKDAYS_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const

const PATTERNS: Record<number, number[]> = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
}

export function weekPattern(days: number): number[] {
  if (days <= 0) return []
  return PATTERNS[Math.min(7, Math.max(1, days))]!
}

export function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

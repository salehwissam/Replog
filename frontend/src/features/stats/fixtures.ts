import type { AnalyticsSummary, HeatmapDay, MuscleShare } from '@/api/analytics'

export const summaryFixture: AnalyticsSummary = {
  total_workouts: 87,
  total_sets: 1764,
  total_reps: 16210,
  total_volume_kg: 248_350,
  records_beaten: 46,
  current_streak_weeks: 5,
  best_streak_weeks: 11,
  first_workout_date: '2026-03-02',
  favorite_exercise: { id: 1, name: 'Supino reto com barra', sessions: 31 },
  heaviest_set: { exercise_id: 2, name: 'Agachamento livre', weight_kg: 142.5, reps: 3, date: '2026-10-28' },
}

export const musclesFixture: MuscleShare[] = [
  { muscle_group: 'peito', label: 'Peito', sets: 24, volume_kg: 14_200 },
  { muscle_group: 'costas', label: 'Costas', sets: 21, volume_kg: 12_850 },
  { muscle_group: 'quadriceps', label: 'Quadríceps', sets: 18, volume_kg: 19_400 },
  { muscle_group: 'ombros', label: 'Ombros', sets: 14, volume_kg: 4_900 },
  { muscle_group: 'biceps', label: 'Bíceps', sets: 10, volume_kg: 2_150 },
  { muscle_group: 'triceps', label: 'Tríceps', sets: 9, volume_kg: 2_480 },
  { muscle_group: 'posterior', label: 'Posterior de coxa', sets: 6, volume_kg: 3_600 },
]

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function heatmapFixture(days = 182, end = new Date()): HeatmapDay[] {
  const out: HeatmapDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i)
    const dow = (d.getDay() + 6) % 7
    const week = Math.floor((days - 1 - i) / 7)
    const skipWeek = week % 9 === 4
    const trains = !skipWeek && (dow === 0 || dow === 1 || dow === 3 || (dow === 4 && week % 2 === 0))
    const volume = trains ? Math.round(2400 + week * 70 + ((i * 37) % 1900)) : 0
    const sets = trains ? 12 + Math.floor(week / 4) + ((i * 7) % 6) : 0
    out.push({ date: iso(d), volume_kg: volume, workouts: trains ? 1 : 0, sets })
  }
  return out
}

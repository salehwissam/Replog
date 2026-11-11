import { api } from './client'

export interface FavoriteExercise {
  id: number
  name: string
  sessions: number
}

export interface HeaviestSet {
  exercise_id: number
  name: string
  weight_kg: number
  reps: number
  date: string
}

export interface AnalyticsSummary {
  total_workouts: number
  total_sets: number
  total_reps: number
  total_volume_kg: number
  records_beaten: number
  current_streak_weeks: number
  best_streak_weeks: number
  first_workout_date: string | null
  favorite_exercise: FavoriteExercise | null
  heaviest_set: HeaviestSet | null
}

export interface MuscleShare {
  muscle_group: string
  label: string
  sets: number
  volume_kg: number
}

export interface HeatmapDay {
  date: string
  volume_kg: number
  workouts: number
  sets: number
}

export interface SessionSummary {
  session_id: number
  volume_kg: number
  sets: number
  reps: number
  duration_seconds: number | null
  records_beaten: number
  muscle_groups: { muscle_group: string; label: string; sets: number }[]
  previous_same_split: { session_id: number; local_date: string; volume_kg: number; sets: number } | null
  delta_volume_kg: number | null
}

export const HEATMAP_DAYS = 182

export const analyticsApi = {
  summary: () => api<AnalyticsSummary>('/analytics/summary'),
  muscles: (weeks: number) => api<MuscleShare[]>('/analytics/muscles', { query: { weeks } }),
  heatmap: (days: number = HEATMAP_DAYS) => api<HeatmapDay[]>('/analytics/heatmap', { query: { days } }),
  sessionSummary: (id: number) => api<SessionSummary>(`/analytics/sessions/${id}/summary`),
}

export const analyticsKeys = {
  summary: ['analytics', 'summary'] as const,
  muscles: (weeks: number) => ['analytics', 'muscles', weeks] as const,
  heatmap: (days: number) => ['analytics', 'heatmap', days] as const,
  sessionSummary: (id: number) => ['analytics', 'session', id] as const,
}

export const optionalQuery = { retry: false, staleTime: 60_000 } as const

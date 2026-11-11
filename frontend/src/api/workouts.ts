import { api } from './client'

export type RecordType = 'max_weight' | 'max_reps' | 'max_est_1rm'

export interface Exercise {
  id: number
  name: string
  muscle_group: string
  equipment: string
  is_bodyweight: boolean
  is_custom: boolean
}

export interface ExerciseMeta {
  muscle_groups: Record<string, string>
  equipment: Record<string, string>
}

export interface SplitExercise {
  exercise: Exercise
  target_sets: number
  target_reps: string | null
  rest_seconds: number
}

export interface Split {
  id: number
  letter: SplitLetter
  name: string
  description: string | null
  exercises: SplitExercise[]
}

export type SplitLetter = 'A' | 'B' | 'C' | 'D' | 'E'
export const SPLIT_LETTERS: SplitLetter[] = ['A', 'B', 'C', 'D', 'E']

export type SetType = 'normal' | 'aquecimento' | 'drop' | 'falha'
export const SET_TYPES: SetType[] = ['normal', 'aquecimento', 'drop', 'falha']
export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Normal',
  aquecimento: 'Aquecimento',
  drop: 'Drop',
  falha: 'Falha',
}

export type Intensity = 'normal' | 'pesado' | 'leve'
export const INTENSITIES: Intensity[] = ['normal', 'pesado', 'leve']
export const INTENSITY_LABELS: Record<Intensity, string> = {
  normal: 'Normal',
  pesado: 'Pesado',
  leve: 'Leve',
}

export interface WorkoutSet {
  id: number
  exercise_id: number
  set_number: number
  reps: number
  weight_kg: number
  set_type?: SetType
  rpe?: number | null
  volume_kg: number
  est_1rm: number | null
  rest_seconds: number | null
  notes: string | null
  performed_at: string
}

export interface PersonalRecord {
  id: number
  exercise_id: number
  exercise_name: string
  record_type: RecordType
  value: number
  previous_value: number | null
  set_id: number | null
  session_id: number
  achieved_at: string
}

export interface ExerciseSummary {
  sets: number
  total_reps: number
  top_weight_kg: number
  volume_kg: number
  best_est_1rm: number | null
}

export interface ExerciseComparison {
  previous_session_id: number
  previous_date: string
  previous: ExerciseSummary
  delta_top_weight_kg: number
  delta_total_reps: number
  delta_volume_kg: number
}

export interface SessionExercise {
  exercise: Exercise
  sets: WorkoutSet[]
  summary: ExerciseSummary
  comparison: ExerciseComparison | null
}

export interface WorkoutSession {
  id: number
  split: Split | null
  intensity: Intensity
  started_at: string
  finished_at: string | null
  timezone: string
  local_date: string
  notes: string | null
  duration_seconds: number | null
  total_sets: number
  total_reps: number
  volume_kg: number
  exercises: SessionExercise[]
  records: PersonalRecord[]
}

export interface SessionListItem {
  id: number
  local_date: string
  started_at: string
  finished_at: string | null
  timezone: string
  split_letter: string | null
  split_name: string | null
  intensity: Intensity
  exercise_names: string[]
  total_sets: number
  volume_kg: number
  duration_seconds: number | null
  records_count: number
}

export interface SessionPage {
  items: SessionListItem[]
  total: number
  page: number
  page_size: number
}

export interface ExerciseRecords {
  exercise: Exercise
  max_weight: PersonalRecord | null
  max_reps: PersonalRecord | null
  max_est_1rm: PersonalRecord | null
}

export interface ProgressPoint {
  session_id: number
  local_date: string
  top_weight_kg: number
  best_est_1rm: number | null
  volume_kg: number
  total_reps: number
}

export interface VolumeBucket {
  start: string
  label: string
  volume_kg: number
  workouts: number
  sets: number
}

export interface Dashboard {
  week_workouts: number
  week_volume_kg: number
  week_sets: number
  total_workouts: number
  streak_weeks: number
  last_session: SessionListItem | null
  active_session_id: number | null
  recent_records: PersonalRecord[]
  weekly: VolumeBucket[]
  week_sessions?: WeekSession[]
}

export interface WeekSession {
  id: number
  local_date: string
  split_letter: string | null
  finished: boolean
}

export interface ProgramExercise {
  exercise_id: number | null
  name: string
  muscle_group: string | null
  target_sets: number
  target_reps: string
  rest_seconds: number
}

export interface Program {
  key: string
  name: string
  level: string
  days_per_week: string
  goal: string
  description: string
  splits: { letter: SplitLetter; name: string; exercises: ProgramExercise[] }[]
}

export interface SetInput {
  exercise_id: number
  reps: number
  weight_kg: number
  rest_seconds?: number | null
  notes?: string | null
  set_type?: SetType
  rpe?: number | null
}

export interface SetValues {
  reps: number
  weight_kg: number
  notes: string | null
  set_type: SetType
  rpe: number | null
}

export function setPayload(values: SetValues, known = false): Omit<SetInput, 'exercise_id'> {
  const { set_type, rpe, ...rest } = values
  return {
    ...rest,
    ...(known || set_type !== 'normal' ? { set_type } : {}),
    ...(known || rpe != null ? { rpe } : {}),
  }
}

export interface ExerciseSuggestion {
  exercise_id: number
  based_on_session_id: number | null
  last_date: string | null
  last_sets: { reps: number; weight_kg: number; set_type: SetType }[]
  suggestion: { weight_kg: number; reps: number; reason: string } | null
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

export function validTargetReps(value: string | null | undefined): string | undefined {
  const v = value?.replace(/\s/g, '')
  return v && /^\d{1,3}(-\d{1,3})?$/.test(v) ? v : undefined
}

export const RECORD_LABELS: Record<RecordType, string> = {
  max_weight: 'Maior carga',
  max_reps: 'Mais repetições',
  max_est_1rm: '1RM estimado',
}

export const workoutsApi = {
  exerciseMeta: () => api<ExerciseMeta>('/exercises/meta'),
  exercises: (q?: string, group?: string) => api<Exercise[]>('/exercises', { query: { q, group } }),
  createExercise: (data: Omit<Exercise, 'id' | 'is_custom'>) =>
    api<Exercise>('/exercises', { method: 'POST', body: data }),
  archiveExercise: (id: number) => api<void>(`/exercises/${id}`, { method: 'DELETE' }),
  exerciseProgress: (id: number) => api<ProgressPoint[]>(`/exercises/${id}/progress`),
  exerciseRecords: (id: number) => api<PersonalRecord[]>(`/exercises/${id}/records`),
  suggestion: (id: number, targetReps?: string) =>
    api<ExerciseSuggestion>(`/exercises/${id}/suggestion`, { query: { target_reps: validTargetReps(targetReps) } }),
  sessionSummary: (id: number) => api<SessionSummary>(`/analytics/sessions/${id}/summary`),

  splits: () => api<Split[]>('/splits'),
  saveSplit: (
    letter: SplitLetter,
    data: {
      name: string
      description?: string | null
      exercises: { exercise_id: number; target_sets: number; target_reps: string | null; rest_seconds: number }[]
    },
  ) => api<Split>(`/splits/${letter}`, { method: 'PUT', body: data }),
  deleteSplit: (letter: SplitLetter) => api<void>(`/splits/${letter}`, { method: 'DELETE' }),

  active: () => api<WorkoutSession | null>('/workouts/active'),
  session: (id: number) => api<WorkoutSession>(`/workouts/${id}`),
  start: (data: { split_id?: number | null; notes?: string | null; intensity?: Intensity }) =>
    api<WorkoutSession>('/workouts', { method: 'POST', body: data }),
  updateNotes: (id: number, notes: string | null) =>
    api<WorkoutSession>(`/workouts/${id}`, { method: 'PATCH', body: { notes } }),
  updateIntensity: (id: number, intensity: Intensity) =>
    api<WorkoutSession>(`/workouts/${id}`, { method: 'PATCH', body: { intensity } }),
  finish: (id: number) => api<WorkoutSession>(`/workouts/${id}/finish`, { method: 'POST' }),
  deleteSession: (id: number) => api<void>(`/workouts/${id}`, { method: 'DELETE' }),
  addSet: (sessionId: number, data: SetInput) =>
    api<{ set: WorkoutSet; new_records: PersonalRecord[] }>(`/workouts/${sessionId}/sets`, {
      method: 'POST',
      body: data,
    }),
  updateSet: (sessionId: number, setId: number, data: Omit<SetInput, 'exercise_id'>) =>
    api<WorkoutSet>(`/workouts/${sessionId}/sets/${setId}`, { method: 'PUT', body: data }),
  deleteSet: (sessionId: number, setId: number) =>
    api<void>(`/workouts/${sessionId}/sets/${setId}`, { method: 'DELETE' }),

  history: (params: {
    page?: number
    page_size?: number
    date_from?: string
    date_to?: string
    exercise_id?: number
  }) => api<SessionPage>('/workouts', { query: params }),
  calendar: (month: string) => api<{ month: string; days: string[] }>('/workouts/calendar', { query: { month } }),

  records: () => api<ExerciseRecords[]>('/records'),
  recentRecords: (limit = 10) => api<PersonalRecord[]>('/records/recent', { query: { limit } }),
  recordsPerMonth: (count = 12) => api<VolumeBucket[]>('/records/per-month', { query: { count } }),

  dashboard: () => api<Dashboard>('/stats/dashboard'),
  programs: () => api<Program[]>('/programs'),
  applyProgram: (key: string, replace_existing: boolean) =>
    api<Split[]>(`/programs/${encodeURIComponent(key)}/apply`, { method: 'POST', body: { replace_existing } }),
  volume: (period: 'week' | 'month', count: number) =>
    api<VolumeBucket[]>('/stats/volume', { query: { period, count } }),
}

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  active: ['workout', 'active'] as const,
  session: (id: number) => ['workout', id] as const,
  history: (params: object) => ['history', params] as const,
  calendar: (month: string) => ['calendar', month] as const,
  splits: ['splits'] as const,
  programs: ['programs'] as const,
  exercises: (q: string, group: string) => ['exercises', q, group] as const,
  exerciseMeta: ['exercise-meta'] as const,
  records: ['records'] as const,
  recentRecords: ['records', 'recent'] as const,
  progress: (id: number) => ['progress', id] as const,
  exerciseRecords: (id: number) => ['exercise-records', id] as const,
  volume: (period: string, count: number) => ['volume', period, count] as const,
  suggestion: (id: number, targetReps?: string) => ['suggestion', id, targetReps ?? ''] as const,
  sessionSummary: (id: number) => ['session-summary', id] as const,
}

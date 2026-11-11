import { api } from './client'
import type { Exercise } from './workouts'

export interface AdminStats {
  users_total: number
  users_verified: number
  users_inactive: number
  users_active_7d: number
  new_users_7d: number
  workouts_total: number
  workouts_7d: number
  sets_total: number
}

export interface AdminUser {
  id: number
  name: string
  email: string
  role: 'user' | 'admin'
  is_active: boolean
  is_verified: boolean
  created_at: string
  last_seen_at: string | null
  workouts: number
}

export interface AdminUserPage {
  items: AdminUser[]
  total: number
  page: number
  page_size: number
}

export const adminApi = {
  stats: () => api<AdminStats>('/admin/stats'),
  users: (q: string, page: number) => api<AdminUserPage>('/admin/users', { query: { q, page } }),
  setActive: (id: number, is_active: boolean) =>
    api<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: { is_active } }),
  createExercise: (data: Omit<Exercise, 'id' | 'is_custom'>) =>
    api<Exercise>('/admin/exercises', { method: 'POST', body: data }),
  archiveExercise: (id: number) => api<void>(`/admin/exercises/${id}`, { method: 'DELETE' }),
}

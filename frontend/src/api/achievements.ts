import { api } from './client'

export type AchievementTier = 'bronze' | 'prata' | 'ouro'

export interface Achievement {
  key: string
  title: string
  description: string
  icon: string
  tier: AchievementTier
  unlocked: boolean
  unlocked_at: string | null
  progress: number
  current: number
  target: number
}

export const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
}

export const TIER_ORDER: AchievementTier[] = ['bronze', 'prata', 'ouro']

export const achievementsApi = {
  list: () => api<Achievement[]>('/achievements'),
}

export const achievementKeys = {
  list: ['achievements'] as const,
}

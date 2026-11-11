import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { achievementKeys, achievementsApi, type Achievement } from '@/api/achievements'
import { optionalQuery } from '@/api/analytics'

export function useAchievements() {
  return useQuery({ queryKey: achievementKeys.list, queryFn: achievementsApi.list, ...optionalQuery })
}

export function recentUnlocked(list: Achievement[]): Achievement[] {
  return list
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlocked_at ?? '').localeCompare(a.unlocked_at ?? ''))
}

export function nextUp(list: Achievement[]): Achievement[] {
  return list.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress)
}

export function progressText(a: Achievement): string {
  const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
  return `${fmt.format(Math.min(a.current, a.target))} de ${fmt.format(a.target)}`
}

const SEEN_KEY = 'replog_conquistas_vistas'

function readSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

export function useFreshUnlocks(list: Achievement[] | undefined): Set<string> {
  const [seen] = useState(readSeen)
  const fresh = new Set<string>()
  for (const a of list ?? []) if (a.unlocked && !seen?.has(a.key)) fresh.add(a.key)

  useEffect(() => {
    if (!list) return
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(list.filter((a) => a.unlocked).map((a) => a.key)))
    } catch {
    }
  }, [list])

  return fresh
}

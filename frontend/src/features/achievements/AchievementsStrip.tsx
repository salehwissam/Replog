import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { TIER_LABELS } from '@/api/achievements'

import { Medal } from './Medal'
import { nextUp, progressText, recentUnlocked, useAchievements, useFreshUnlocks } from './model'

export function AchievementsStrip() {
  const q = useAchievements()
  const fresh = useFreshUnlocks(q.data)
  if (!q.data || q.data.length === 0) return null

  const recent = recentUnlocked(q.data).slice(0, 3)
  const next = nextUp(q.data)[0]
  const total = q.data.filter((a) => a.unlocked).length

  return (
    <section aria-labelledby="conquistas-inicio" className="rounded-[28px] border border-linha bg-superficie p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="conquistas-inicio" className="text-lg font-semibold">
          Conquistas
        </h2>
        <Link to="/conquistas" className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-azul hover:underline">
          Ver todas <span className="sr-only">as conquistas</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="-mt-1 text-sm text-giz-suave">
        {total} de {q.data.length} medalhas cunhadas
      </p>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-stretch">
        {recent.length ? (
          <ul className="flex flex-1 gap-3">
            {recent.map((a, i) => (
              <li key={a.key} className="flex w-1/3 max-w-28 flex-col items-center text-center">
                <Medal tier={a.tier} icon={a.icon} unlocked mint={fresh.has(a.key)} delay={0.3 + i * 0.12} className="w-16" />
                <span className="mt-2 text-sm font-medium leading-tight">{a.title}</span>
                <span className="sr-only">{TIER_LABELS[a.tier]}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {next ? (
          <div className="flex flex-1 items-center gap-4 rounded-2xl bg-aco-2 p-3.5">
            <Medal tier={next.tier} icon={next.icon} unlocked={false} progress={next.progress} className="w-16" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-giz-suave">Próxima conquista</p>
              <p className="font-semibold leading-snug">{next.title}</p>
              <p className="text-sm text-giz-suave">{next.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-verde/15" aria-hidden="true">
                  <motion.div
                    className="h-full rounded-full bg-verde"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(next.progress * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.4 }}
                  />
                </div>
                <span className="num text-sm">{progressText(next)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

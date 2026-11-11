import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { TIER_LABELS, TIER_ORDER, type Achievement, type AchievementTier } from '@/api/achievements'
import { PageHeader } from '@/components/layout/PageHeader'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { PageLoader } from '@/components/ui/Spinner'
import { formatInstantDate } from '@/lib/format'

import { Medal } from './Medal'
import { nextUp, progressText, recentUnlocked, useAchievements, useFreshUnlocks } from './model'

const TIER_INTRO: Record<AchievementTier, string> = {
  bronze: 'Os primeiros passos na plataforma.',
  prata: 'Constância de quem já pegou o ritmo.',
  ouro: 'Marcas de quem vive a barra.',
}

export default function AchievementsPage() {
  const q = useAchievements()
  const fresh = useFreshUnlocks(q.data)

  if (q.isPending) {
    return (
      <div>
        <PageHeader title="Conquistas" />
        <PageLoader />
      </div>
    )
  }
  if (q.isError || !q.data || q.data.length === 0) {
    return (
      <div>
        <PageHeader title="Conquistas" />
        <div className="knurl rounded-[28px] border border-dashed border-linha bg-aco-2 p-6">
          <p className="placar text-4xl">As medalhas estão sendo cunhadas</p>
          <p className="mt-2 text-giz-suave">
            As conquistas ainda não estão disponíveis. Continue registrando seus treinos: tudo o que você fizer conta quando elas chegarem.
          </p>
          <Link to="/treino" className="mt-4 inline-flex min-h-11 items-center font-semibold text-azul hover:underline">
            Começar treino
          </Link>
        </div>
      </div>
    )
  }

  const list = q.data
  const unlocked = list.filter((a) => a.unlocked).length
  const freshTitles = list.filter((a) => fresh.has(a.key)).map((a) => a.title)
  let order = 0

  return (
    <div>
      <PageHeader title="Conquistas" subtitle="Cada medalha é uma anilha cunhada no seu treino." />

      <p className="sr-only" role="status">
        {freshTitles.length ? `Novas conquistas: ${freshTitles.join(', ')}.` : ''}
      </p>

      <section aria-labelledby="placar-conquistas" className="knurl -mx-4 mb-9 border-y border-linha bg-aco-2 px-4 py-5 sm:mx-0 sm:rounded-[32px] sm:border sm:px-6">
        <h2 id="placar-conquistas" className="sr-only">
          Resumo das conquistas
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="flex items-baseline gap-2">
            <span className="placar text-7xl text-amarela">
              <AnimatedNumber value={unlocked} />
            </span>
            <span className="text-giz-suave">
              de {list.length} conquistadas
            </span>
          </p>
          <ul className="flex gap-5">
            {TIER_ORDER.map((tier) => {
              const all = list.filter((a) => a.tier === tier)
              if (!all.length) return null
              const got = all.filter((a) => a.unlocked).length
              return (
                <li key={tier} className="flex items-center gap-2">
                  <Medal tier={tier} icon="medal" unlocked className="w-9" />
                  <span className="text-sm leading-tight">
                    <span className="block font-semibold">{TIER_LABELS[tier]}</span>
                    <span className="text-giz-suave">
                      {got} de {all.length}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-verde/15" aria-hidden="true">
          <motion.div
            className="h-full rounded-full bg-verde"
            initial={{ width: 0 }}
            animate={{ width: `${(unlocked / list.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.2 }}
          />
        </div>
      </section>

      <div className="flex flex-col gap-10">
        {TIER_ORDER.map((tier) => {
          const items = [...recentUnlocked(list.filter((a) => a.tier === tier)), ...nextUp(list.filter((a) => a.tier === tier))]
          if (!items.length) return null
          return (
            <section key={tier} aria-labelledby={`nivel-${tier}`}>
              <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-linha pb-2">
                <h2 id={`nivel-${tier}`} className="placar text-4xl">
                  {TIER_LABELS[tier]}
                </h2>
                <p className="text-sm text-giz-suave">{TIER_INTRO[tier]}</p>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((a) => (
                  <AchievementTile key={a.key} achievement={a} mint={fresh.has(a.key)} delay={Math.min(order++, 14) * 0.06} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function AchievementTile({ achievement: a, mint, delay }: { achievement: Achievement; mint: boolean; delay: number }) {
  const status = a.unlocked
    ? `${TIER_LABELS[a.tier]}, conquistada${a.unlocked_at ? ` em ${formatInstantDate(a.unlocked_at)}` : ''}`
    : `${TIER_LABELS[a.tier]}, bloqueada, ${progressText(a)}`
  return (
    <li className="flex flex-col items-center text-center">
      <Medal
        tier={a.tier}
        icon={a.icon}
        unlocked={a.unlocked}
        progress={a.progress}
        mint={mint}
        delay={delay}
        className={clsx('w-28 sm:w-32', !a.unlocked && 'opacity-90')}
      />
      <h3 className={clsx('mt-3 font-semibold leading-snug', !a.unlocked && 'text-giz-suave')}>{a.title}</h3>
      <span className="sr-only">{status}.</span>
      <p className="mt-0.5 max-w-[16rem] text-sm text-giz-suave">{a.description}</p>
      {a.unlocked ? (
        <p className="mt-1.5 text-xs font-medium text-giz-suave" aria-hidden="true">
          {a.unlocked_at ? `Conquistada em ${formatInstantDate(a.unlocked_at)}` : 'Conquistada'}
        </p>
      ) : (
        <p className="num mt-1.5 text-base text-giz" aria-hidden="true">
          {progressText(a)}
        </p>
      )}
    </li>
  )
}

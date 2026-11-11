import { clsx } from 'clsx'
import { Lock } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { createElement, useId } from 'react'

import type { AchievementTier } from '@/api/achievements'
import { dataVars, METAL } from '@/components/charts/palette'

import { achievementIcon } from './icons'

const PIPS: Record<AchievementTier, number> = { bronze: 1, prata: 2, ouro: 3 }
const INK: Record<AchievementTier, string> = {
  bronze: 'rgb(255 255 255 / 0.95)',
  prata: 'rgb(12 17 33 / 0.82)',
  ouro: 'rgb(42 29 0 / 0.86)',
}

export function Medal({
  tier,
  icon,
  unlocked,
  progress = 0,
  mint = false,
  delay = 0,
  className,
}: {
  tier: AchievementTier
  icon: string
  unlocked: boolean
  progress?: number
  mint?: boolean
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const sheen = `brilho-${uid}`
  const clip = `disco-${uid}`
  const metal = METAL[tier]
  const pips = PIPS[tier]
  const p = Math.max(0, Math.min(1, progress))

  const animateMint = mint && unlocked && !reduce

  return (
    <motion.div
      className={clsx('relative aspect-square shrink-0', dataVars, className)}
      style={{ perspective: 600 }}
      initial={animateMint ? { rotateY: 200, scale: 0.55 } : false}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 13, mass: 1.2, delay }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="size-full overflow-visible">
        <defs>
          <radialGradient id={sheen} cx="0.32" cy="0.26" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#000" stopOpacity="0.28" />
          </radialGradient>
          <clipPath id={clip}>
            <circle cx="50" cy="50" r="47" />
          </clipPath>
        </defs>

        {unlocked ? (
          <>
            <circle cx="50" cy="50" r="47" fill={metal} />
            <circle cx="50" cy="50" r="47" fill={`url(#${sheen})`} />
            <circle cx="50" cy="50" r="41.5" fill="none" stroke="rgb(0 0 0 / 0.25)" strokeWidth="1.6" />
            <circle cx="50" cy="50" r="33" fill="rgb(0 0 0 / 0.12)" />
            <circle cx="50" cy="50" r="33" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="1" />
            {Array.from({ length: pips }, (_, i) => {
              const angle = Math.PI / 2 + (i - (pips - 1) / 2) * 0.24
              return <circle key={i} cx={50 + Math.cos(angle) * 37.5} cy={50 + Math.sin(angle) * 37.5} r="2.2" fill={INK[tier]} />
            })}
            {animateMint ? (
              <g clipPath={`url(#${clip})`}>
                <g transform="rotate(20 50 50)">
                  <motion.rect
                    y="-20"
                    width="34"
                    height="140"
                    fill="rgb(255 255 255 / 0.55)"
                    initial={{ x: -80 }}
                    animate={{ x: 160 }}
                    transition={{ duration: 0.9, ease: [0.3, 0, 0.2, 1], delay: delay + 0.45 }}
                  />
                </g>
              </g>
            ) : null}
          </>
        ) : (
          <>
            <circle cx="50" cy="50" r="47" fill="var(--superficie-2)" />
            <circle cx="50" cy="50" r="41.5" fill="none" stroke="var(--linha)" strokeWidth="1.6" strokeDasharray="3 3" />
            <circle cx="50" cy="50" r="33" fill="rgb(0 0 0 / 0.1)" />
            <circle cx="50" cy="50" r="47" fill="none" stroke="var(--linha)" strokeWidth="3.5" />
            {p > 0 ? (
              <motion.circle
                cx="50"
                cy="50"
                r="47"
                fill="none"
                stroke="var(--anilha-verde)"
                strokeWidth="3.5"
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                pathLength={1}
                strokeDasharray="1 1"
                initial={{ strokeDashoffset: 1 }}
                animate={{ strokeDashoffset: 1 - p }}
                transition={{ type: 'spring', stiffness: 60, damping: 18, delay: delay + 0.2 }}
              />
            ) : null}
          </>
        )}
      </svg>

      <span className="absolute inset-0 flex items-center justify-center">
        {createElement(achievementIcon(icon), {
          className: 'size-[36%]',
          strokeWidth: 2.2,
          style: { color: unlocked ? INK[tier] : 'var(--giz-suave)', opacity: unlocked ? 1 : 0.55 },
        })}
      </span>
      {!unlocked ? (
        <span className="absolute bottom-[2%] right-[2%] flex size-[30%] items-center justify-center rounded-full border-2 border-superficie bg-aco-2">
          <Lock className="size-[55%] text-giz-suave" strokeWidth={2.4} />
        </span>
      ) : null}
      {animateMint ? (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ borderColor: metal }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: delay + 0.35 }}
        />
      ) : null}
    </motion.div>
  )
}

import { clsx } from 'clsx'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { molaAnilha } from '@/lib/motion'

type Tone = 'azul' | 'ouro' | 'verde' | 'vermelho' | 'neutro'

const toneColor: Record<Tone, string> = {
  azul: 'var(--anilha-azul)',
  ouro: 'var(--anilha-amarela)',
  verde: 'var(--anilha-verde)',
  vermelho: 'var(--anilha-vermelha)',
  neutro: 'var(--giz-suave)',
}

const toneInk: Record<Tone, string> = {
  ...toneColor,
  ouro: 'var(--tinta-ouro)',
  verde: 'var(--tinta-verde)',
}

function EmptyBar({ color }: { color: string }) {
  const W = 240
  const mid = 34
  const ghosts = [
    { x: 64, w: 12, h: 52 },
    { x: 50, w: 11, h: 44 },
    { x: 37, w: 10, h: 36 },
  ]
  return (
    <svg viewBox={`0 0 ${W} 68`} className="h-16 w-full max-w-60 overflow-visible" aria-hidden="true">
      <rect x="4" y={mid - 4} width={W - 8} height="8" rx="2.5" fill="var(--aco-barra)" opacity="0.6" />
      <rect x="82" y={mid - 3} width={W - 164} height="6" rx="1.5" fill="var(--linha-forte)" />
      <rect x="78" y={mid - 10} width="5" height="20" rx="1.5" fill="var(--giz-suave)" />
      <rect x={W - 83} y={mid - 10} width="5" height="20" rx="1.5" fill="var(--giz-suave)" />
      {ghosts.slice(1).flatMap((g) =>
        [g.x, W - g.x - g.w].map((x) => (
          <rect
            key={`${g.x}-${x}`}
            x={x}
            y={mid - g.h / 2}
            width={g.w}
            height={g.h}
            rx="2.5"
            fill="none"
            stroke="var(--linha-forte)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        )),
      )}
      {[-1, 1].map((side) => {
        const g = ghosts[0]!
        const x = side < 0 ? g.x : W - g.x - g.w
        return (
          <motion.rect
            key={side}
            x={x}
            y={mid - g.h / 2}
            width={g.w}
            height={g.h}
            rx="3"
            fill={color}
            initial={{ x: side * -70, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ ...molaAnilha, delay: 0.25 }}
          />
        )
      })}
    </svg>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  tone = 'azul',
  compact = false,
  className,
  headingLevel = 2,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  tone?: Tone
  compact?: boolean
  className?: string
  headingLevel?: 2 | 3 | 4
}) {
  const color = toneColor[tone]
  const ink = toneInk[tone]
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  return (
    <div
      className={clsx(
        'flex flex-col items-center text-center',
        compact ? 'gap-3 px-4 py-6' : 'knurl gap-4 rounded-[28px] border border-dashed border-linha-forte px-6 py-10 sm:py-12',
        className,
      )}
    >
      {icon ? (
        <motion.span
          className={clsx(
            'relative flex items-center justify-center rounded-full [&_svg]:size-1/2',
            compact ? 'size-12' : 'size-16',
          )}
          style={{ color: ink, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
          initial={{ scale: 0.6, rotate: -90, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ ...molaAnilha, delay: 0.15 }}
          aria-hidden="true"
        >
          <span
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
          />
          {icon}
        </motion.span>
      ) : (
        <EmptyBar color={color} />
      )}
      <div className="max-w-sm">
        <Heading className={clsx('placar', compact ? 'text-2xl' : 'text-3xl sm:text-4xl')}>{title}</Heading>
        {description ? (
          <div className={clsx('mt-2 text-giz-suave', compact ? 'text-sm' : 'text-base')}>{description}</div>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}

import { clsx } from 'clsx'
import { motion } from 'motion/react'

import { Plate } from '@/components/brand/Plate'
import { molaAnilha } from '@/lib/motion'

const MAX_SHOWN = 10

export function SetPlates({ done, target, className }: { done: number; target: number | null; className?: string }) {
  const slots = Math.min(MAX_SHOWN, Math.max(target ?? 0, done))
  const overflow = Math.max(target ?? 0, done) - slots
  const label =
    target != null ? `${done} de ${target} séries-alvo feitas` : `${done} ${done === 1 ? 'série feita' : 'séries feitas'}`

  if (slots === 0) return null

  return (
    <div role="img" aria-label={label} className={clsx('flex items-center gap-1.5', className)}>
      {Array.from({ length: slots }, (_, i) => {
        const filled = i < done
        const next = i === done
        return (
          <span key={i} className="relative block size-7">
            <svg
              viewBox="0 0 100 100"
              aria-hidden="true"
              className={clsx('absolute inset-0 size-full', next ? 'text-azul' : 'text-linha')}
            >
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="currentColor"
                strokeWidth={next ? 9 : 7}
                strokeDasharray={next ? undefined : '10 9'}
              />
            </svg>
            {filled ? (
              <motion.span
                className="absolute inset-0 block"
                initial={{ scale: 0.2, rotate: -160, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={molaAnilha}
              >
                <Plate color="var(--anilha-verde)" className="size-full" />
              </motion.span>
            ) : null}
          </span>
        )
      })}
      {overflow > 0 ? <span className="num text-base text-giz-suave">+{overflow}</span> : null}
    </div>
  )
}

import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { molaAnilha } from '@/lib/motion'

export function PageHeader({
  title,
  subtitle,
  actions,
  accent = 'var(--anilha-azul)',
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  accent?: string
}) {
  return (
    <header className="mb-7 pt-1 sm:pt-2">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="-mb-[0.12em] min-w-0 overflow-hidden pb-[0.12em]">
          <motion.h1
            className="placar text-[3.4rem] tracking-[-0.015em] text-balance sm:text-7xl"
            initial={{ y: '108%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 1.05 }}
          >
            {title}
          </motion.h1>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="mt-3.5 flex items-center" aria-hidden="true">
        {[
          { cls: 'h-5 w-2', bg: 'var(--aco-barra)', delay: 0.4 },
          { cls: 'h-8 w-3', bg: accent, delay: 0.3 },
        ].map((p) => (
          <motion.span
            key={p.cls}
            className={`${p.cls} mr-px shrink-0 rounded-[3px] shadow-[inset_-2px_0_0_rgb(0_0_0/0.22),inset_1px_0_0_rgb(255_255_255/0.28)]`}
            style={{ background: p.bg }}
            initial={{ x: -36, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ ...molaAnilha, delay: p.delay }}
          />
        ))}
        <span className="ml-0.5 h-3.5 w-1 shrink-0 rounded-[1.5px] bg-giz-suave/80" />
        <motion.span
          className="knurl h-1.5 flex-1 origin-left rounded-r-full"
          style={{
            backgroundColor: 'var(--linha-forte)',
            maskImage: 'linear-gradient(to right, black 0%, black 30%, transparent 92%)',
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {subtitle ? <div className="mt-3 max-w-prose text-giz-suave">{subtitle}</div> : null}
    </header>
  )
}

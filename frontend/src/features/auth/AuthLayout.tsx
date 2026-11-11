import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Barbell } from '@/components/brand/Barbell'
import { molaToque } from '@/lib/motion'

const HERO_PLATES = [
  { id: 'v', color: 'var(--anilha-vermelha)', height: 1, thickness: 1.3 },
  { id: 'a', color: 'var(--anilha-azul)', height: 1, thickness: 1.15 },
  { id: 'o', color: 'var(--anilha-amarela)', height: 0.9 },
  { id: 'g', color: 'var(--anilha-verde)', height: 0.78, thickness: 0.85 },
]

const WORD = 'REPLOG'.split('')
const LETTER_DELAY = 0.55
const LETTER_STEP = 0.07
const LANDING = LETTER_DELAY + LETTER_STEP * (WORD.length - 1) + 0.16

let heroPlayed = false
let lastOrder: number | null = null

const CHALK = Array.from({ length: 16 }, (_, i) => {
  const side = i % 2 === 0 ? -1 : 1
  const spread = 0.3 + ((i * 37) % 70) / 100
  return {
    id: i,
    x: side * spread * 170,
    y: -18 - ((i * 53) % 46),
    size: 3 + ((i * 29) % 6),
    delay: LANDING + ((i * 13) % 10) / 100,
  }
})

function ChalkDust() {
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center" aria-hidden="true">
      {CHALK.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full bg-giz"
          style={{ width: p.size, height: p.size }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.55, 0], x: p.x, y: [0, p.y, p.y + 10], scale: [0.4, 1.6, 2.2] }}
          transition={{ duration: 1.4, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </span>
  )
}

function Hero({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion()
  const [skip] = useState(() => heroPlayed || Boolean(reduce))
  useEffect(() => {
    heroPlayed = true
  }, [])

  return (
    <div className="relative flex flex-col items-center">
      <motion.div
        className="w-full"
        initial={skip ? false : { x: '-110%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      >
        <Barbell plates={HERO_PLATES} height={compact ? 84 : 150} />
      </motion.div>
      <Link to="/" aria-label="REPLOG, início" className="relative mt-3 flex" style={{ perspective: 600 }}>
        {WORD.map((letter, i) => (
          <motion.span
            key={i}
            className={compact ? 'placar text-6xl' : 'placar text-[5.5rem] xl:text-[7.5rem]'}
            initial={skip ? false : { y: '-140%', rotateX: -70, opacity: 0 }}
            animate={{ y: 0, rotateX: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 20, delay: LETTER_DELAY + i * LETTER_STEP }}
          >
            {letter}
          </motion.span>
        ))}
        {skip ? null : <ChalkDust />}
      </Link>
      <motion.span
        aria-hidden="true"
        className="mt-1 block h-[3px] rounded-full bg-linear-to-r from-transparent via-linha to-transparent"
        initial={skip ? false : { width: '0%' }}
        animate={{ width: compact ? '70%' : '86%' }}
        transition={{ delay: skip ? 0 : LANDING - 0.1, type: 'spring', stiffness: 200, damping: 26 }}
      />
      <motion.p
        className="mt-3 text-center text-giz-suave"
        initial={skip ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: skip ? 0 : LANDING + 0.25 }}
      >
        Registre cada repetição. Supere cada recorde.
      </motion.p>
    </div>
  )
}

function AuthTabs({ current }: { current: 'entrar' | 'cadastrar' }) {
  const tabs = [
    { key: 'entrar', to: '/entrar', label: 'Entrar' },
    { key: 'cadastrar', to: '/cadastrar', label: 'Criar conta' },
  ] as const
  return (
    <nav aria-label="Acesso" className="mb-8 grid grid-cols-2 rounded-full border border-linha bg-aco-2 p-1">
      {tabs.map((t) => {
        const active = t.key === current
        return (
          <Link
            key={t.key}
            to={t.to}
            replace
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'relative flex min-h-11 items-center justify-center rounded-full text-sm font-semibold transition-colors',
              active ? 'text-white' : 'text-giz-suave hover:text-giz',
            )}
          >
            {active ? (
              <motion.span
                layoutId="auth-tab"
                className="absolute inset-0 rounded-full bg-azul shadow-[0_8px_24px_-10px_var(--anilha-azul)]"
                transition={molaToque}
              />
            ) : null}
            <span className="relative">{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  tabs,
  order = 0,
  art,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  tabs?: 'entrar' | 'cadastrar'
  order?: number
  art?: ReactNode
}) {
  const reduce = useReducedMotion()
  const [direction] = useState(() => (lastOrder == null ? 0 : Math.sign(order - lastOrder)))
  useEffect(() => {
    lastOrder = order
  }, [order])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <div className="knurl relative hidden overflow-hidden border-r border-linha bg-aco-2 lg:flex lg:items-center lg:justify-center lg:px-12">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: 'linear-gradient(to top, var(--aco-2), transparent)' }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--anilha-azul), transparent 65%)' }}
          aria-hidden="true"
        />
        <div className="relative w-full max-w-xl">
          <Hero />
        </div>
      </div>

      <div className="flex min-h-dvh flex-col overflow-x-hidden px-5 pb-10 pt-6 sm:items-center sm:justify-center">
        <div className="w-full max-w-md">
          <div className="faixa-aco -mx-5 mb-6 px-5 pt-2 lg:hidden">
            <Hero compact />
          </div>
          <motion.div
            initial={reduce ? false : direction === 0 ? { opacity: 0, y: 24 } : { opacity: 0, x: direction * 56 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30, delay: direction === 0 ? 0.25 : 0 }}
          >
            {tabs ? <AuthTabs current={tabs} /> : null}
            {art ? <div className="mb-5">{art}</div> : null}
            <h1 className="placar text-5xl">{title}</h1>
            {subtitle ? <p className="mt-2 text-giz-suave">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-8 text-sm text-giz-suave">{footer}</div> : null}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export function SuccessSeal({ children, tone = 'verde' }: { children: ReactNode; tone?: 'verde' | 'azul' }) {
  const color = tone === 'verde' ? 'var(--anilha-verde)' : 'var(--anilha-azul)'
  return (
    <motion.div
      className="relative flex size-20 items-center justify-center rounded-full text-white"
      style={{ background: color, boxShadow: `0 16px 40px -14px ${color}` }}
      initial={{ scale: 0, rotate: -160 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.15 }}
      aria-hidden="true"
    >
      <span className="absolute inset-[7px] rounded-full border-[3px] border-black/20" />
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ border: `2px solid ${color}` }}
        initial={{ scale: 1, opacity: 0.8 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 1.1, delay: 0.45, ease: 'easeOut' }}
      />
      <span className="relative">{children}</span>
    </motion.div>
  )
}

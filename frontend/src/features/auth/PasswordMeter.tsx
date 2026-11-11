import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { molaAnilha } from '@/lib/motion'
import { passwordStrength, PASSWORD_MIN } from '@/lib/validation'

const LEVEL_PLATES = [
  { color: 'var(--anilha-vermelha)', h: 30, w: 7 },
  { color: 'var(--anilha-amarela)', h: 25, w: 6 },
  { color: 'var(--anilha-verde)', h: 20, w: 5 },
]
const LEVEL_TEXT = ['text-giz-suave', 'text-vermelha', 'text-amarela', 'text-verde'] as const

export function passwordChecks(pwd: string) {
  return [
    { key: 'tamanho', label: `${PASSWORD_MIN} ou mais caracteres`, ok: pwd.length >= PASSWORD_MIN },
    { key: 'caixa', label: 'Maiúsculas e minúsculas', ok: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) },
    { key: 'simbolos', label: 'Números e símbolos', ok: /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd) },
  ]
}

export function PasswordMeter({ password }: { password: string }) {
  const strength = passwordStrength(password)
  const loaded = LEVEL_PLATES.slice(0, strength.level)
  const W = 132
  const mid = 18
  const collar = 34

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <svg viewBox={`0 0 ${W} 36`} className="h-9 w-[132px] shrink-0 overflow-visible" aria-hidden="true">
          <rect x="0" y={mid - 2.5} width={W} height="5" rx="2" fill="var(--linha)" />
          <rect x={collar - 4} y={mid - 7} width="3" height="14" rx="1" fill="var(--giz-suave)" />
          <rect x={W - collar + 1} y={mid - 7} width="3" height="14" rx="1" fill="var(--giz-suave)" />
          <AnimatePresence>
            {loaded.flatMap((p, i) => {
              const offset = LEVEL_PLATES.slice(0, i).reduce((acc, q) => acc + q.w + 1.5, 0)
              const xl = collar - 6 - offset - p.w
              const xr = W - collar + 6 + offset
              return [
                <motion.rect
                  key={`l${i}`}
                  x={xl}
                  y={mid - p.h / 2}
                  width={p.w}
                  height={p.h}
                  rx="1.5"
                  fill={p.color}
                  initial={{ x: -xl - p.w - 4, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -xl - p.w - 4, opacity: 0, transition: { duration: 0.18 } }}
                  transition={molaAnilha}
                />,
                <motion.rect
                  key={`r${i}`}
                  x={xr}
                  y={mid - p.h / 2}
                  width={p.w}
                  height={p.h}
                  rx="1.5"
                  fill={p.color}
                  initial={{ x: W - xr + 4, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: W - xr + 4, opacity: 0, transition: { duration: 0.18 } }}
                  transition={molaAnilha}
                />,
              ]
            })}
          </AnimatePresence>
        </svg>
        <p className={clsx('placar text-2xl leading-none transition-colors', LEVEL_TEXT[strength.level])} aria-live="polite">
          {strength.label ? `Força: ${strength.label}` : <span className="font-corpo text-sm font-normal">Carregue a barra</span>}
        </p>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {passwordChecks(password).map((c) => (
          <li key={c.key} className={clsx('flex items-center gap-1.5 text-xs transition-colors', c.ok ? 'text-giz' : 'text-giz-suave')}>
            <motion.span
              className={clsx(
                'flex size-4 items-center justify-center rounded-full border',
                c.ok ? 'border-verde bg-verde text-[#04130b]' : 'border-linha',
              )}
              animate={{ scale: c.ok ? [1, 1.35, 1] : 1 }}
              transition={{ duration: 0.32, ease: 'easeOut' }}
            >
              {c.ok ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
            </motion.span>
            {c.label}
            <span className="sr-only">{c.ok ? ', ok' : ', pendente'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

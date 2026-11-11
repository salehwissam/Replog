import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, Info, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

type Tone = 'erro' | 'sucesso' | 'info' | 'recorde'

const tones: Record<Tone, { cls: string; Icon: typeof Info; icon: string; faixa: string }> = {
  erro: { cls: 'border-vermelha/40 bg-vermelha/10', Icon: CircleAlert, icon: 'text-vermelha', faixa: 'bg-vermelha' },
  sucesso: { cls: 'border-verde/40 bg-verde/10', Icon: CircleCheck, icon: 'text-verde', faixa: 'bg-verde' },
  info: { cls: 'border-azul/35 bg-azul/10', Icon: Info, icon: 'text-azul', faixa: 'bg-azul' },
  recorde: { cls: 'border-amarela/50 bg-amarela/10', Icon: Trophy, icon: 'text-amarela', faixa: 'bg-amarela' },
}

export function Alert({
  tone = 'info',
  title,
  action,
  className,
  children,
}: {
  tone?: Tone
  title?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const { cls, Icon, icon, faixa } = tones[tone]
  return (
    <motion.div
      role={tone === 'erro' ? 'alert' : 'status'}
      initial={tone === 'erro' ? { x: 0 } : { opacity: 0, y: -6 }}
      animate={tone === 'erro' ? { x: [0, -6, 6, -3, 3, 0] } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={clsx('relative flex gap-3 overflow-hidden rounded-2xl border py-3.5 pl-4 pr-3.5 text-sm text-giz', cls, className)}
    >
      <span className={clsx('absolute inset-y-2 left-0 w-1 rounded-r-full', faixa)} aria-hidden="true" />
      <Icon className={clsx('mt-0.5 size-5 shrink-0', icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={clsx(title && 'text-giz-suave')}>{children}</div>
        {action ? <div className="mt-2.5 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </motion.div>
  )
}

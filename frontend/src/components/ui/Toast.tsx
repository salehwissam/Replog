import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, Info, Trophy, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import { molaToque, vibrar, VIBRACOES } from '@/lib/motion'

type ToastTone = 'sucesso' | 'erro' | 'recorde' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  body?: string
  duration?: number
}

interface ToastApi {
  show: (toast: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastApi>({ show: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

const styles: Record<ToastTone, { Icon: typeof Info; icon: string; border: string; bar: string }> = {
  sucesso: { Icon: CircleCheck, icon: 'text-verde', border: 'border-verde/50', bar: 'bg-verde' },
  erro: { Icon: CircleAlert, icon: 'text-vermelha', border: 'border-vermelha/60', bar: 'bg-vermelha' },
  recorde: { Icon: Trophy, icon: 'text-amarela', border: 'border-amarela/70', bar: 'bg-amarela' },
  info: { Icon: Info, icon: 'text-azul', border: 'border-azul/50', bar: 'bg-azul' },
}

const DEFAULT_DURATION: Record<ToastTone, number> = { sucesso: 4200, info: 4200, recorde: 5200, erro: 6000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = Date.now() + Math.random()
      const duration = toast.duration ?? DEFAULT_DURATION[toast.tone]
      setItems((prev) => [...prev.slice(-2), { ...toast, id, duration }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration),
      )
      if (toast.tone === 'recorde') vibrar(VIBRACOES.recorde)
      else if (toast.tone === 'erro') vibrar(VIBRACOES.erro)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const s = styles[t.tone]
            return (
              <motion.div
                key={t.id}
                layout
                role={t.tone === 'erro' ? 'alert' : 'status'}
                initial={{ y: -48, opacity: 0, scale: 0.9, rotateX: -35 }}
                animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
                exit={{ y: -24, opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
                transition={molaToque}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) dismiss(t.id)
                }}
                style={{ transformPerspective: 600 }}
                className={clsx(
                  'pointer-events-auto relative flex w-full max-w-sm touch-pan-y items-start gap-3 overflow-hidden rounded-2xl border bg-superficie/95 py-3.5 pl-3.5 pr-2 shadow-[var(--sombra)] backdrop-blur-md',
                  s.border,
                )}
              >
                {t.tone === 'recorde' ? (
                  <span
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_srgb,var(--anilha-amarela)_18%,transparent),transparent_60%)]"
                    aria-hidden="true"
                  />
                ) : null}
                <s.Icon className={clsx('relative mt-0.5 size-5 shrink-0', s.icon)} aria-hidden="true" />
                <div className="relative min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  {t.body ? <p className="text-sm text-giz-suave">{t.body}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="relative -my-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-giz-suave transition hover:bg-superficie-2 hover:text-giz active:scale-90"
                  aria-label="Fechar aviso"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
                <span
                  className={clsx('esvaziar absolute inset-x-0 bottom-0 h-0.5 opacity-70', s.bar)}
                  style={{ ['--duracao' as string]: `${t.duration}ms` }}
                  aria-hidden="true"
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

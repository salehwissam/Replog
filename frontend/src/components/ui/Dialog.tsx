import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { molaGaveta, vibrar, VIBRACOES } from '@/lib/motion'

function isWide(): boolean {
  try {
    return window.matchMedia('(min-width: 640px)').matches
  } catch {
    return false
  }
}

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  description?: ReactNode
  size?: 'md' | 'lg'
}

export function Dialog(props: DialogProps) {
  return createPortal(<AnimatePresence>{props.open ? <Panel {...props} /> : null}</AnimatePresence>, document.body)
}

function Panel({ onClose, title, children, footer, description, size = 'md' }: Omit<DialogProps, 'open'>) {
  const titleId = useId()
  const descId = useId()
  const [wide] = useState(isWide)
  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useDragControls()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusable = panel?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-close]), [href], [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable ?? panel)?.focus()
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== panel) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && panel) {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => !el.hasAttribute('disabled'))
        if (items.length === 0) return
        const first = items[0]!
        const last = items[items.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <motion.div
        className="absolute inset-0 bg-[var(--veu)] backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        initial={wide ? { y: 24, scale: 0.94, opacity: 0 } : { y: '100%', opacity: 0.6 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={
          wide
            ? { y: 12, scale: 0.97, opacity: 0, transition: { duration: 0.16 } }
            : { y: '100%', opacity: 0, transition: { duration: 0.22 } }
        }
        transition={molaGaveta}
        drag={wide ? false : 'y'}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) {
            vibrar(VIBRACOES.passo)
            onClose()
          }
        }}
        className={clsx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-linha bg-superficie shadow-[var(--sombra)] sm:rounded-[28px] sm:border-b',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--realce)] to-transparent" aria-hidden="true" />
        <div
          className="flex cursor-grab touch-none items-center justify-center gap-[3px] pb-1 pt-3 active:cursor-grabbing sm:hidden"
          onPointerDown={(e) => drag.start(e)}
          aria-hidden="true"
        >
          <span className="h-3 w-1 rounded-[2px] bg-linha-forte" />
          <span className="h-1.5 w-11 rounded-full bg-linha-forte" />
          <span className="h-3 w-1 rounded-[2px] bg-linha-forte" />
        </div>
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-2 sm:pt-6">
          <div className="min-w-0 pt-1">
            <h2 id={titleId} className="placar text-3xl sm:text-4xl">
              {title}
            </h2>
            {description ? (
              <div id={descId} className="mt-1.5 text-sm text-giz-suave">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-giz-suave transition hover:bg-superficie-2 hover:text-giz active:scale-90"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">{children}</div>
        {footer ? (
          <div className="border-t border-linha bg-aco-2/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        ) : null}
      </motion.div>
    </div>
  )
}

import { clsx } from 'clsx'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'

import { molaToque } from '@/lib/motion'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: ReactNode
  suffix?: ReactNode
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, suffix, className, id, type, disabled, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-erro` : hint ? `${inputId}-dica` : undefined
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const [scope, animate] = useAnimate<HTMLDivElement>()

  useEffect(() => {
    if (error && scope.current) animate(scope.current, { x: [0, -5, 5, -2, 0] }, { duration: 0.32 })
  }, [error, animate, scope])

  return (
    <div className={clsx('group/campo flex flex-col gap-1.5', disabled && 'opacity-60', className)}>
      <label
        htmlFor={inputId}
        className={clsx(
          'text-sm font-medium transition-colors',
          error ? 'text-vermelha' : 'text-giz-suave group-focus-within/campo:text-azul',
        )}
      >
        {label}
      </label>
      <div ref={scope} className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && visible ? 'text' : type}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'min-h-13 w-full rounded-2xl border bg-campo px-4 text-base text-giz',
            'shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow,background-color] duration-150',
            'placeholder:text-giz-suave/70 focus:bg-campo-foco focus:outline-none focus:ring-4',
            'disabled:cursor-not-allowed',
            error
              ? 'border-vermelha focus:ring-vermelha/25'
              : 'border-linha hover:border-linha-forte focus:border-azul focus:ring-azul/25',
            (isPassword || suffix) && 'pr-12',
          )}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-giz-suave transition hover:text-giz active:scale-90"
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={visible}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={visible ? 'ocultar' : 'mostrar'}
                initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 30, opacity: 0, scale: 0.7 }}
                transition={molaToque}
              >
                {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        ) : suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-center text-giz-suave">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <motion.p
          id={`${inputId}-erro`}
          className="flex items-start gap-1.5 text-sm font-medium text-vermelha"
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={molaToque}
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </motion.p>
      ) : hint ? (
        <div id={`${inputId}-dica`} className="text-sm text-giz-suave">
          {hint}
        </div>
      ) : null}
    </div>
  )
})

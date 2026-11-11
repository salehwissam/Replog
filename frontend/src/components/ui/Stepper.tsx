import { clsx } from 'clsx'
import { CircleAlert, Minus, Plus } from 'lucide-react'
import { useAnimate } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

import { vibrar, VIBRACOES } from '@/lib/motion'

function HoldButton({
  onStep,
  label,
  children,
  atLimit = false,
  side,
}: {
  onStep: () => void
  label: string
  children: ReactNode
  atLimit?: boolean
  side: 'esq' | 'dir'
}) {
  const timeout = useRef<number | undefined>(undefined)
  const interval = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const stepRef = useRef(onStep)

  useEffect(() => {
    stepRef.current = onStep
  }, [onStep])

  useEffect(
    () => () => {
      window.clearTimeout(timeout.current)
      window.clearInterval(interval.current)
    },
    [],
  )

  function stop() {
    window.clearTimeout(timeout.current)
    window.clearInterval(interval.current)
  }

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={() => {
        fired.current = false
        timeout.current = window.setTimeout(() => {
          fired.current = true
          interval.current = window.setInterval(() => stepRef.current(), 90)
        }, 420)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        if (fired.current) {
          fired.current = false
          return
        }
        onStep()
      }}
      className={clsx(
        'relative flex w-16 shrink-0 touch-manipulation select-none items-center justify-center transition',
        'hover:bg-superficie-2 active:bg-superficie-2 [&>svg]:transition-transform [&>svg]:duration-100 active:[&>svg]:scale-75',
        side === 'esq' ? 'border-r border-linha/70' : 'border-l border-linha/70',
        atLimit ? 'text-giz-suave/40' : 'text-giz',
      )}
    >
      {children}
    </button>
  )
}

export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max,
  unit,
  decimals = 0,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  step: number
  min?: number
  max: number
  unit?: string
  decimals?: number
  error?: string
}) {
  const id = useId()
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  function bump(delta: number) {
    const numeric = Number(valueRef.current.replace(',', '.'))
    const safe = Number.isFinite(numeric) ? numeric : 0
    const next = Math.min(max, Math.max(min, Math.round((safe + delta) * 100) / 100))
    if (next === safe && valueRef.current !== '') {
      if (scope.current) animate(scope.current, { x: [0, delta > 0 ? 4 : -4, 0] }, { duration: 0.18 })
      return
    }
    vibrar(VIBRACOES.passo)
    const text = decimals ? String(next).replace('.', ',') : String(Math.round(next))
    valueRef.current = text
    onChange(text)
    if (scope.current) {
      animate(scope.current, { scale: [1, 1.14, 1], y: [0, delta > 0 ? -4 : 4, 0] }, { duration: 0.28 })
    }
  }

  const stepLabel = String(step).replace('.', ',')
  const numeric = Number(value.replace(',', '.'))
  const atMin = value !== '' && Number.isFinite(numeric) && numeric <= min
  const atMax = value !== '' && Number.isFinite(numeric) && numeric >= max

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={clsx('text-sm font-medium transition-colors', error ? 'text-vermelha' : 'text-giz-suave')}
      >
        {label}
      </label>
      <div
        className={clsx(
          'knurl flex items-stretch overflow-hidden rounded-[22px] border bg-aco-2 shadow-[inset_0_2px_6px_rgb(0_0_0/0.18)] transition focus-within:ring-4',
          error
            ? 'border-vermelha focus-within:ring-vermelha/20'
            : 'border-linha focus-within:border-azul focus-within:ring-azul/20',
        )}
      >
        <HoldButton side="esq" atLimit={atMin} onStep={() => bump(-step)} label={`Diminuir ${label.toLowerCase()} em ${stepLabel}`}>
          <Minus className="size-7" />
        </HoldButton>
        <div ref={scope} className="relative flex-1">
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))}
            inputMode={decimals ? 'decimal' : 'numeric'}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-erro` : undefined}
            className="placar h-20 w-full bg-transparent text-center text-6xl text-giz focus:outline-none focus-visible:outline-none"
          />
          {unit ? (
            <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs font-semibold text-giz-suave">
              {unit}
            </span>
          ) : null}
        </div>
        <HoldButton side="dir" atLimit={atMax} onStep={() => bump(step)} label={`Aumentar ${label.toLowerCase()} em ${stepLabel}`}>
          <Plus className="size-7" />
        </HoldButton>
      </div>
      {error ? (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 text-sm font-medium text-vermelha" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  )
}

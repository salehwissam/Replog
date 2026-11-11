import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { useId, useRef, type KeyboardEvent } from 'react'

import { INTENSITIES, INTENSITY_LABELS, type Intensity } from '@/api/workouts'
import { molaToque } from '@/lib/motion'

export const INTENSITY_STYLE: Record<Intensity, { pill: string; text: string; badge: string }> = {
  normal: { pill: 'bg-azul', text: 'text-white', badge: 'bg-azul/15 text-azul' },
  pesado: { pill: 'bg-vermelha', text: 'text-white', badge: 'bg-vermelha/15 text-vermelha' },
  leve: { pill: 'bg-verde', text: 'text-aco', badge: 'bg-verde/15 text-verde' },
}

export const INTENSITY_HINTS: Record<Intensity, string> = {
  normal: 'Progressão de sempre: a sugestão parte do seu último treino normal.',
  pesado: 'Força: mais carga e de 3 a 6 repetições. Compara só com treinos pesados.',
  leve: 'Descarga: cerca de 60% da carga, foco na técnica. Não conta como piora.',
}

export function IntensityPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Intensity
  onChange: (v: Intensity) => void
  disabled?: boolean
}) {
  const uid = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + INTENSITIES.length) % INTENSITIES.length
    onChange(INTENSITIES[next]!)
    refs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p id={`${uid}-titulo`} className="px-1 text-sm font-semibold text-giz-suave">
        Intensidade do treino
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-titulo`}
        aria-describedby={`${uid}-dica`}
        className="grid grid-cols-3 gap-1 rounded-[18px] border border-linha bg-aco-2 p-1"
      >
        {INTENSITIES.map((t, i) => {
          const active = t === value
          return (
            <button
              key={t}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(t)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                'relative flex min-h-11 touch-manipulation items-center justify-center rounded-[14px] px-1 text-sm font-semibold transition-colors active:scale-95 disabled:cursor-wait',
                active ? INTENSITY_STYLE[t].text : 'text-giz-suave hover:text-giz',
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`intensidade-${uid}`}
                  transition={molaToque}
                  className={clsx('absolute inset-0 rounded-[14px]', INTENSITY_STYLE[t].pill)}
                />
              ) : null}
              <span className="relative">{INTENSITY_LABELS[t]}</span>
            </button>
          )
        })}
      </div>
      <p id={`${uid}-dica`} className="px-1 text-sm text-giz-suave">
        {INTENSITY_HINTS[value]}
      </p>
    </div>
  )
}

export function IntensityBadge({ intensity, className }: { intensity: Intensity; className?: string }) {
  if (intensity === 'normal') return null
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold',
        INTENSITY_STYLE[intensity].badge,
        className,
      )}
    >
      {intensity === 'pesado' ? 'Pesado' : 'Leve · descarga'}
    </span>
  )
}

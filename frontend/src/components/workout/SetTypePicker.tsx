import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { useId, useRef, type KeyboardEvent } from 'react'

import { SET_TYPE_LABELS, SET_TYPES, type SetType } from '@/api/workouts'
import { molaToque } from '@/lib/motion'

export const SET_TYPE_STYLE: Record<SetType, { pill: string; text: string }> = {
  normal: { pill: 'bg-azul', text: 'text-white' },
  aquecimento: { pill: 'bg-giz', text: 'text-aco' },
  drop: { pill: 'bg-linha', text: 'text-giz' },
  falha: { pill: 'bg-vermelha', text: 'text-white' },
}

export function SetTypePicker({ value, onChange }: { value: SetType; onChange: (t: SetType) => void }) {
  const uid = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + SET_TYPES.length) % SET_TYPES.length
    onChange(SET_TYPES[next]!)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tipo de série"
      className="grid grid-cols-[1fr_1.5fr_0.9fr_1fr] gap-1 rounded-[18px] border border-linha bg-aco-2 p-1"
    >
      {SET_TYPES.map((t, i) => {
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
            onClick={() => onChange(t)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              'relative flex min-h-11 touch-manipulation items-center justify-center rounded-[14px] px-1 text-sm font-semibold transition-colors active:scale-95',
              active ? SET_TYPE_STYLE[t].text : 'text-giz-suave hover:text-giz',
            )}
          >
            {active ? (
              <motion.span
                layoutId={`tipo-serie-${uid}`}
                transition={molaToque}
                className={clsx(
                  'absolute inset-0 rounded-[14px]',
                  SET_TYPE_STYLE[t].pill,
                  t === 'aquecimento' && 'outline-2 outline-offset-[-4px] outline-dashed outline-aco/35',
                )}
              />
            ) : null}
            <span className="relative">{SET_TYPE_LABELS[t]}</span>
          </button>
        )
      })}
    </div>
  )
}

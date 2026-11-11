import { clsx } from 'clsx'
import { useId, useLayoutEffect, useRef } from 'react'

import { formatNumber } from '@/lib/format'

export const RPE_VALUES = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5)

export function rpeHint(rpe: number): string {
  if (rpe >= 10) return 'Até o limite: não sobrava nenhuma repetição.'
  if (rpe >= 9.5) return 'Quase no limite: talvez mais 1.'
  if (rpe >= 9) return 'Sobrava 1 repetição.'
  if (rpe >= 8.5) return 'Sobravam 1 ou 2 repetições.'
  if (rpe >= 7) return `Sobravam ${formatNumber(10 - rpe)} repetições.`
  return 'Leve: sobravam 4 ou mais repetições.'
}

export function RpePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const initial = useRef(value)

  useLayoutEffect(() => {
    const el = track.current
    const anchor = el?.querySelector<HTMLElement>(`[data-rpe="${initial.current ?? 6}"]`)
    if (el && anchor) el.scrollLeft = Math.max(0, anchor.offsetLeft - 8)
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-sm font-medium text-giz-suave">
          Esforço (RPE)
        </span>
        <span className="truncate text-xs text-giz-suave" aria-live="polite">
          {value != null ? rpeHint(value) : 'Opcional'}
        </span>
      </div>
      <div
        ref={track}
        role="group"
        aria-labelledby={labelId}
        className="sem-barra-rolagem relative -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 py-0.5"
      >
        {RPE_VALUES.map((v) => {
          const active = v === value
          const whole = Number.isInteger(v)
          return (
            <button
              key={v}
              type="button"
              data-rpe={v}
              aria-pressed={active}
              aria-label={`RPE ${formatNumber(v)}`}
              onClick={() => onChange(active ? null : v)}
              className={clsx(
                'num flex h-11 shrink-0 snap-start touch-manipulation items-center justify-center rounded-xl border font-bold transition active:scale-90',
                whole ? 'w-11 text-xl' : 'w-12 text-base',
                active
                  ? 'border-transparent bg-azul text-white shadow-[0_8px_20px_-10px_var(--anilha-azul)]'
                  : v >= 9
                    ? 'border-vermelha/35 bg-aco-2 text-giz'
                    : 'border-linha bg-aco-2 text-giz-suave',
              )}
            >
              {formatNumber(v)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

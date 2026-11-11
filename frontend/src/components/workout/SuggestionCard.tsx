import { clsx } from 'clsx'
import { Check, TrendingUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import type { ExerciseSuggestion } from '@/api/workouts'
import { formatLocalDate, formatNumber } from '@/lib/format'
import { molaToque } from '@/lib/motion'

export function SuggestionCard({
  data,
  applied,
  onUse,
}: {
  data: ExerciseSuggestion
  applied: boolean
  onUse: () => void
}) {
  const { suggestion, last_sets: sets } = data
  if (!suggestion && sets.length === 0) return null

  return (
    <section aria-label="Última vez e sugestão" className="overflow-hidden rounded-[22px] border border-linha bg-aco-2">
      {sets.length > 0 ? (
        <div className="px-3.5 pb-3 pt-2.5">
          <p className="text-xs text-giz-suave">
            Última vez{data.last_date ? `, em ${formatLocalDate(data.last_date, { day: '2-digit', month: '2-digit' })}` : ''}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {sets.map((s, i) => (
              <li
                key={i}
                className={clsx(
                  'num rounded-lg px-2 py-0.5 text-lg leading-tight',
                  s.set_type === 'aquecimento'
                    ? 'border border-dashed border-giz-suave/50 text-giz-suave'
                    : 'bg-superficie-2 text-giz',
                )}
                title={s.set_type === 'aquecimento' ? 'Aquecimento' : undefined}
              >
                {s.reps}
                <span className="mx-0.5 text-sm text-giz-suave">×</span>
                {formatNumber(s.weight_kg)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestion ? (
        <div className="flex items-center gap-3 border-t border-linha/70 bg-verde/[0.07] px-3.5 py-2.5">
          <TrendingUp className="size-5 shrink-0 text-verde" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-giz">
              Sugestão:{' '}
              <strong className="num text-xl font-bold text-verde">
                {formatNumber(suggestion.weight_kg)} kg × {suggestion.reps}
              </strong>
            </p>
            <p className="text-xs leading-snug text-giz-suave">{suggestion.reason}</p>
          </div>
          <button
            type="button"
            onClick={onUse}
            className={clsx(
              'relative flex min-h-11 shrink-0 items-center gap-1.5 overflow-hidden rounded-xl px-3 text-sm font-semibold transition active:scale-95',
              applied ? 'bg-verde/15 text-verde' : 'bg-azul text-white',
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={applied ? 'ok' : 'usar'}
                className="flex items-center gap-1.5"
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -18, opacity: 0 }}
                transition={molaToque}
              >
                {applied ? <Check className="size-4" aria-hidden="true" /> : null}
                {applied ? 'Aplicada' : 'Usar sugestão'}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      ) : null}
    </section>
  )
}

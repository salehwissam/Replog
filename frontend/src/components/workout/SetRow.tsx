import { clsx } from 'clsx'
import { ArrowDownRight, Flame, Pencil, Trash2, Trophy, Zap } from 'lucide-react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { useRef, useState } from 'react'

import { SET_TYPE_LABELS, type SetType, type WorkoutSet } from '@/api/workouts'
import { formatNumber, formatTime } from '@/lib/format'

const SWIPE_THRESHOLD = 84

function TypeTag({ type }: { type: SetType }) {
  if (type === 'normal') return null
  const Icon = type === 'aquecimento' ? Flame : type === 'drop' ? ArrowDownRight : Zap
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle font-corpo text-xs font-semibold',
        type === 'aquecimento' && 'border border-dashed border-giz-suave/60 text-giz-suave',
        type === 'drop' && 'bg-linha text-giz',
        type === 'falha' && 'bg-vermelha/15 text-vermelha',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {SET_TYPE_LABELS[type]}
    </span>
  )
}

export function SetRow({
  set,
  timeZone,
  onEdit,
  onDelete,
  isRecord,
}: {
  set: WorkoutSet
  timeZone: string
  onEdit?: () => void
  onDelete?: () => void
  isRecord?: boolean
}) {
  const type: SetType = set.set_type ?? 'normal'
  const warmup = type === 'aquecimento'
  const x = useMotionValue(0)
  const editReveal = useTransform(x, [0, 44], [0, 1])
  const deleteReveal = useTransform(x, [-44, 0], [1, 0])
  const [dragging, setDragging] = useState(false)
  const armed = useRef<'edit' | 'delete' | null>(null)
  const swipeable = Boolean(onEdit || onDelete)

  function onDrag(_: unknown, info: PanInfo) {
    const next = info.offset.x > SWIPE_THRESHOLD && onEdit ? 'edit' : info.offset.x < -SWIPE_THRESHOLD && onDelete ? 'delete' : null
    if (next && next !== armed.current) {
      try {
        navigator.vibrate?.(12)
      } catch {
      }
    }
    armed.current = next
  }

  function onDragEnd() {
    setDragging(false)
    const action = armed.current
    armed.current = null
    if (action === 'edit') onEdit?.()
    if (action === 'delete') onDelete?.()
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -80, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 460, damping: 30 }}
      className="relative border-b border-linha/60 last:border-b-0"
    >
      {swipeable ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-between">
          <motion.span style={{ opacity: editReveal }} className="flex h-full items-center gap-2 pl-2 text-sm font-semibold text-azul">
            <Pencil className="size-5" /> Editar
          </motion.span>
          <motion.span style={{ opacity: deleteReveal }} className="flex h-full items-center gap-2 pr-2 text-sm font-semibold text-vermelha">
            Apagar <Trash2 className="size-5" />
          </motion.span>
        </div>
      ) : null}

      <motion.div
        drag={swipeable ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: onDelete ? 0.55 : 0.08, right: onEdit ? 0.55 : 0.08 }}
        dragSnapToOrigin
        dragDirectionLock
        onDragStart={() => setDragging(true)}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        style={{ x }}
        className={clsx(
          'relative flex min-h-14 items-center gap-3 py-2',
          dragging && 'rounded-xl bg-superficie-2 shadow-[var(--sombra)]',
        )}
      >
        <span
          className={clsx(
            'placar flex size-9 shrink-0 items-center justify-center rounded-full text-xl',
            isRecord
              ? 'bg-amarela text-[#1b1400]'
              : warmup
                ? 'border-2 border-dashed border-giz-suave/50 text-giz-suave'
                : type === 'falha'
                  ? 'bg-vermelha/15 text-vermelha'
                  : 'bg-superficie-2 text-giz-suave',
          )}
          aria-label={`Série ${set.set_number}`}
        >
          {set.set_number}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx('placar text-3xl leading-none', warmup && 'text-giz-suave')}>
            {set.reps}
            <span className="mx-1 font-corpo text-base font-semibold text-giz-suave">×</span>
            {formatNumber(set.weight_kg)}
            <span className="ml-0.5 font-corpo text-base font-semibold text-giz-suave">kg</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-giz-suave">
            {isRecord ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amarela/15 px-2 py-0.5 font-semibold text-amarela">
                <Trophy className="size-3" aria-hidden="true" /> Recorde
              </span>
            ) : null}
            <TypeTag type={type} />
            {set.rpe != null ? (
              <span className="num rounded-full border border-linha px-2 py-0.5 text-sm leading-none text-giz">
                RPE {formatNumber(set.rpe)}
              </span>
            ) : null}
            <span>
              {formatTime(set.performed_at, timeZone)}
              {set.rest_seconds != null ? `, descanso ${Math.round(set.rest_seconds)}s` : ''}
              {set.notes ? `, ${set.notes}` : ''}
            </span>
          </p>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-giz-suave transition hover:bg-superficie-2 hover:text-giz active:scale-90"
            aria-label={`Editar série ${set.set_number}`}
          >
            <Pencil className="size-4" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-giz-suave transition hover:bg-vermelha/10 hover:text-vermelha active:scale-90"
            aria-label={`Apagar série ${set.set_number}`}
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </motion.div>
    </motion.li>
  )
}

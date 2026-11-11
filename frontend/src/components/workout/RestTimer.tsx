import { clsx } from 'clsx'
import { BellRing, Pause, Play, RotateCcw, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useImperativeHandle, useState, type Ref } from 'react'

import { formatDuration } from '@/lib/format'

const PRESETS = [60, 90, 120, 180]
const STORAGE_KEY = 'replog_descanso'

interface TimerState {
  duration: number
  endsAt: number | null
  remainingWhenPaused: number | null
  finished: boolean
}

function load(): TimerState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TimerState) : null
  } catch {
    return null
  }
}

function save(state: TimerState | null) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
  }
}

function alertFinished() {
  try {
    navigator.vibrate?.([250, 120, 250])
  } catch {
  }
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.6)
    }
  } catch {
  }
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification('Descanso finalizado', { body: 'Hora da próxima série!', tag: 'replog-descanso' })
    } catch {
    }
  }
}

export interface RestTimerHandle {
  start: (seconds: number) => void
}

export function RestTimer({ ref, planned }: { ref?: Ref<RestTimerHandle>; planned?: number }) {
  const [state, setState] = useState<TimerState | null>(load)
  const [now, setNow] = useState(() => Date.now())

  const update = useCallback((next: TimerState | null) => {
    setState(next)
    save(next)
  }, [])

  const start = useCallback(
    (seconds: number) => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => undefined)
      }
      setNow(Date.now())
      update({ duration: seconds, endsAt: Date.now() + seconds * 1000, remainingWhenPaused: null, finished: false })
    },
    [update],
  )

  useImperativeHandle(ref, () => ({ start }), [start])

  const endsAt = state?.endsAt ?? null
  useEffect(() => {
    if (endsAt == null) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= endsAt) {
        window.clearInterval(id)
        alertFinished()
        setState((prev) => {
          const next = prev ? { ...prev, endsAt: null, remainingWhenPaused: 0, finished: true } : prev
          save(next)
          return next
        })
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [endsAt])

  const running = state?.endsAt != null
  const remaining = state
    ? state.endsAt != null
      ? Math.max(0, Math.ceil((state.endsAt - now) / 1000))
      : (state.remainingWhenPaused ?? state.duration)
    : 0
  const progress = state && state.duration > 0 ? 1 - remaining / state.duration : 0

  if (!state) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-giz-suave">Descanso:</span>
        {PRESETS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => start(s)}
            className={clsx(
              'num min-h-11 rounded-full border px-4 text-lg font-bold transition hover:border-azul active:scale-90',
              s === planned ? 'border-azul/70 bg-azul/10 text-giz' : 'border-linha bg-superficie-2 text-giz',
            )}
          >
            {formatDuration(s)}
          </button>
        ))}
      </div>
    )
  }

  const R = 44
  const CIRC = 2 * Math.PI * R
  const urgent = running && remaining <= 5
  const ringColor = state.finished ? 'var(--anilha-verde)' : urgent ? 'var(--anilha-vermelha)' : 'var(--anilha-azul)'
  const shift = (delta: number) => {
    if (state.endsAt == null) return
    const left = Math.max(1, remaining + delta)
    setNow(Date.now())
    update({ ...state, endsAt: Date.now() + left * 1000, duration: Math.max(left, state.duration + delta) })
  }
  const ctrl =
    'flex h-12 items-center justify-center rounded-2xl bg-superficie-2/80 text-giz transition hover:bg-linha active:scale-90 disabled:opacity-35'

  return (
    <motion.section
      aria-label="Cronômetro de descanso"
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={clsx(
        'knurl relative overflow-hidden rounded-[26px] border p-3 transition-colors',
        state.finished ? 'border-verde/70 bg-verde/10' : urgent ? 'border-vermelha/50 bg-aco-2' : 'border-linha bg-aco-2',
      )}
    >
      <div className="relative flex items-center gap-3">
        <motion.div
          className="relative size-36 shrink-0"
          animate={state.finished || urgent ? { scale: [1, 1.05, 1] } : { scale: 1 }}
          transition={state.finished || urgent ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
        >
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="49" fill="var(--superficie)" />
            {Array.from({ length: 36 }, (_, i) => {
              const a = (i / 36) * Math.PI * 2
              const outer = i % 3 === 0 ? 38 : 36.5
              return (
                <line
                  key={i}
                  x1={50 + Math.cos(a) * 34.5}
                  y1={50 + Math.sin(a) * 34.5}
                  x2={50 + Math.cos(a) * outer}
                  y2={50 + Math.sin(a) * outer}
                  stroke="var(--linha)"
                  strokeWidth="1.2"
                />
              )
            })}
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--linha)" strokeWidth="7" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={state.finished ? 0 : CIRC * Math.min(1, progress)}
              style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s', filter: `drop-shadow(0 0 5px ${ringColor})` }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center">
            {state.finished ? (
              <BellRing className="size-10 text-verde" aria-hidden="true" />
            ) : (
              <span className={clsx('placar text-5xl leading-none', urgent && 'text-vermelha')}>{formatDuration(remaining)}</span>
            )}
          </span>
        </motion.div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className={clsx('text-base font-semibold leading-tight', state.finished ? 'text-verde' : 'text-giz')}>
              {state.finished ? 'Descanso finalizado' : 'Descansando'}
            </p>
            <p className="text-xs text-giz-suave">
              {state.finished ? 'Hora da próxima série.' : running ? `De ${formatDuration(state.duration)} no total` : 'Pausado'}
            </p>
            <span className="sr-only" aria-live="polite">
              {state.finished ? 'Descanso finalizado. Hora da próxima série!' : ''}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={() => shift(-15)} className={clsx(ctrl, 'num text-lg font-bold')} aria-label="Tirar 15 segundos" disabled={!running}>
              −15
            </button>
            <button type="button" onClick={() => shift(15)} className={clsx(ctrl, 'num text-lg font-bold')} aria-label="Adicionar 15 segundos" disabled={!running}>
              +15
            </button>
            {running ? (
              <button
                type="button"
                onClick={() => update({ ...state, endsAt: null, remainingWhenPaused: remaining })}
                className={ctrl}
                aria-label="Pausar"
              >
                <Pause className="size-5" />
              </button>
            ) : !state.finished ? (
              <button
                type="button"
                onClick={() => {
                  setNow(Date.now())
                  update({ ...state, endsAt: Date.now() + remaining * 1000, remainingWhenPaused: null })
                }}
                className={ctrl}
                aria-label="Continuar"
              >
                <Play className="size-5" />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <button type="button" onClick={() => start(state.duration)} className={clsx(ctrl, 'col-span-2')} aria-label="Reiniciar">
              <RotateCcw className="size-5" />
            </button>
            <button type="button" onClick={() => update(null)} className={ctrl} aria-label="Fechar cronômetro">
              <X className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { RECORD_LABELS, type PersonalRecord, type WorkoutSession } from '@/api/workouts'
import { Plate } from '@/components/brand/Plate'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'

import { WorkoutSummaryOverlay } from './WorkoutSummary'

interface CelebrationApi {
  celebrate: (records: PersonalRecord[]) => void
  showSummary: (session: WorkoutSession) => void
}

const CelebrationContext = createContext<CelebrationApi>({ celebrate: () => undefined, showSummary: () => undefined })

export function useCelebration(): CelebrationApi {
  return useContext(CelebrationContext)
}

const COLORS = [
  'var(--anilha-amarela)',
  'var(--anilha-amarela)',
  'var(--anilha-vermelha)',
  'var(--anilha-azul)',
  'var(--anilha-verde)',
  'var(--anilha-branca)',
]

function burst(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
    const dist = 140 + Math.random() * 220
    return {
      id: i,
      color: COLORS[i % COLORS.length]!,
      size: 26 + Math.random() * 46,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 60,
      rotate: (Math.random() - 0.5) * 720,
      delay: Math.random() * 0.12,
    }
  })
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<PersonalRecord[] | null>(null)
  const [summary, setSummary] = useState<WorkoutSession | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    setRecords(null)
  }, [])

  const celebrate = useCallback((list: PersonalRecord[]) => {
    if (list.length === 0) return
    try {
      navigator.vibrate?.([80, 60, 80, 60, 220])
    } catch {
    }
    window.clearTimeout(timer.current)
    setRecords(list)
    timer.current = window.setTimeout(() => setRecords(null), 3600)
  }, [])

  const showSummary = useCallback((session: WorkoutSession) => {
    window.clearTimeout(timer.current)
    setRecords(null)
    setSummary(session)
  }, [])
  const closeSummary = useCallback(() => setSummary(null), [])

  useEffect(() => () => window.clearTimeout(timer.current), [])
  const value = useMemo(() => ({ celebrate, showSummary }), [celebrate, showSummary])

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <AnimatePresence>{records ? <Overlay records={records} onClose={close} /> : null}</AnimatePresence>
      <AnimatePresence>
        {summary ? <WorkoutSummaryOverlay key={summary.id} session={summary} onClose={closeSummary} /> : null}
      </AnimatePresence>
    </CelebrationContext.Provider>
  )
}

function Overlay({ records, onClose }: { records: PersonalRecord[]; onClose: () => void }) {
  const reduce = useReducedMotion()
  const [pieces] = useState(() => burst(reduce ? 0 : 22))
  const main = records.find((r) => r.record_type === 'max_weight') ?? records[0]!

  return (
    <motion.div
      role="status"
      aria-live="assertive"
      data-theme="escuro"
      className="fixed inset-0 z-[80] flex cursor-pointer items-center justify-center overflow-hidden px-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className="absolute inset-0 bg-[#05070f]/90 backdrop-blur-md" aria-hidden="true" />
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, rgb(255 201 60 / 0.32), transparent 60%)' }}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute left-1/2 top-[45%]" aria-hidden="true">
        {pieces.map((p) => (
          <motion.div
            key={p.id}
            className="absolute"
            style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
            initial={{ x: 0, y: 0, scale: 0.2, rotate: 0, opacity: 1 }}
            animate={{ x: p.x, y: [0, p.y, p.y + 260], scale: 1, rotate: p.rotate, opacity: [1, 1, 0] }}
            transition={{ duration: 2.4, delay: p.delay, ease: [0.12, 0.8, 0.3, 1], times: [0, 0.45, 1] }}
          >
            <Plate color={p.color} className="size-full drop-shadow-lg" />
          </motion.div>
        ))}
      </div>

      <div className="relative flex max-w-md flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0, rotate: -120 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.05 }}
        >
          <Plate color="var(--anilha-amarela)" className="size-24 drop-shadow-[0_0_40px_rgb(255_201_60/0.6)]" />
        </motion.div>
        <motion.p
          className="placar mt-5 text-6xl text-amarela sm:text-7xl"
          initial={{ y: 40, opacity: 0, scale: 1.4 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.12 }}
        >
          Novo recorde pessoal!
        </motion.p>
        <motion.div
          className="mt-5 flex flex-col items-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <p className="text-lg text-giz">{main.exercise_name}</p>
          <p className="placar mt-1 text-7xl text-white">
            <AnimatedNumber value={main.value} from={main.previous_value ?? 0} decimals={2} duration={1.4} />
            <span className="ml-2 text-3xl text-giz-suave">{main.record_type === 'max_reps' ? 'reps' : 'kg'}</span>
          </p>
          <p className="text-giz-suave">{RECORD_LABELS[main.record_type]}</p>
          {records.length > 1 ? (
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {records
                .filter((r) => r !== main)
                .map((r, i) => (
                  <motion.li
                    key={r.id}
                    className="rounded-full border border-amarela/40 bg-amarela/10 px-3 py-1 text-sm text-amarela"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.6 + i * 0.08 }}
                  >
                    {RECORD_LABELS[r.record_type]}
                  </motion.li>
                ))}
            </ul>
          ) : null}
        </motion.div>
        <p className="mt-6 text-xs text-giz-suave">Toque para continuar</p>
      </div>
    </motion.div>
  )
}

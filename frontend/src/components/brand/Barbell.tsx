import { AnimatePresence, motion } from 'motion/react'
import { useId } from 'react'

import { molaAnilha } from '@/lib/motion'

export interface BarbellPlate {
  id: string
  color: string
  height: number
  thickness?: number
  label?: string
}

export function Barbell({
  plates,
  lifted = false,
  height = 120,
  className,
  title,
  knurl = true,
}: {
  plates: BarbellPlate[]
  lifted?: boolean
  height?: number
  className?: string
  title?: string
  knurl?: boolean
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const knurlId = `knurl-${uid}`
  const steelId = `aco-${uid}`
  const W = 400
  const H = 120
  const mid = H / 2
  const collar = 112
  const baseW = 15
  const gap = 2.5

  const placed: (BarbellPlate & { w: number; x: number; h: number })[] = []
  for (let i = 0, edge = collar; i < plates.length; i++) {
    const p = plates[i]!
    const w = baseW * (p.thickness ?? 1)
    edge -= w + gap
    placed.push({ ...p, w, x: edge + gap, h: Math.max(18, p.height * (H - 6)) })
  }

  return (
    <motion.svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ height, width: '100%', overflow: 'visible' }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      animate={{ y: lifted ? -10 : 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 14 }}
    >
      <defs>
        <pattern id={knurlId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--aco-barra)" />
          <path d="M0 0 L0 5 M0 0 L5 0" stroke="rgb(0 0 0 / 0.35)" strokeWidth="1.4" />
        </pattern>
        <linearGradient id={steelId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(255 255 255 / 0.35)" />
          <stop offset="0.5" stopColor="rgb(255 255 255 / 0)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0.35)" />
        </linearGradient>
      </defs>

      <rect x="0" y={mid - 7} width={collar + 8} height="14" rx="3" fill="var(--aco-barra)" opacity="0.9" />
      <rect x={W - collar - 8} y={mid - 7} width={collar + 8} height="14" rx="3" fill="var(--aco-barra)" opacity="0.9" />
      <rect x={collar} y={mid - 4.5} width={W - collar * 2} height="9" rx="2" fill={knurl ? `url(#${knurlId})` : 'var(--aco-barra)'} />
      <rect x="0" y={mid - 7} width={W} height="14" rx="3" fill={`url(#${steelId})`} opacity="0.6" style={{ mixBlendMode: 'overlay' }} />
      <rect x={collar + 2} y={mid - 13} width="8" height="26" rx="2" fill="var(--giz)" opacity="0.85" />
      <rect x={W - collar - 10} y={mid - 13} width="8" height="26" rx="2" fill="var(--giz)" opacity="0.85" />

      <AnimatePresence initial>
        {placed.flatMap((p, i) => {
          const travel = p.x + p.w + 24
          return [-1, 1].map((side) => (
            <motion.g
              key={`${p.id}-${side}`}
              initial={{ x: side * travel, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: side * travel, opacity: 0, transition: { duration: 0.22 } }}
              transition={{ ...molaAnilha, delay: i * 0.06 }}
            >
              <PlateSide x={side < 0 ? p.x : W - p.x - p.w} w={p.w} h={p.h} mid={mid} color={p.color} mirror={side > 0} />
            </motion.g>
          ))
        })}
      </AnimatePresence>
    </motion.svg>
  )
}

function PlateSide({
  x,
  w,
  h,
  mid,
  color,
  mirror = false,
}: {
  x: number
  w: number
  h: number
  mid: number
  color: string
  mirror?: boolean
}) {
  const shine = mirror ? x + w * 0.18 : x + w * 0.62
  const shade = mirror ? x + w * 0.82 : x
  return (
    <g>
      <rect x={x} y={mid - h / 2} width={w} height={h} rx={Math.min(5, w / 3)} fill={color} />
      <rect x={shine} y={mid - h / 2 + 4} width={w * 0.2} height={h - 8} rx="1.5" fill="rgb(255 255 255 / 0.22)" />
      <rect x={shade} y={mid - h / 2} width={w * 0.18} height={h} rx="1.5" fill="rgb(0 0 0 / 0.22)" />
    </g>
  )
}

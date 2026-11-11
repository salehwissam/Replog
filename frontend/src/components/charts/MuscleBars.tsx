import { motion } from 'motion/react'

import type { MuscleShare } from '@/api/analytics'
import { formatInt, plural } from '@/lib/format'

import { DataTable } from './DataTable'

export function MuscleBars({ data, caption }: { data: MuscleShare[]; caption: string }) {
  const max = Math.max(1, ...data.map((d) => d.sets))
  const total = data.reduce((s, d) => s + d.sets, 0)

  return (
    <div>
      <ul className="flex flex-col gap-3.5" aria-label={caption}>
        {data.map((d, i) => {
          const share = total ? Math.round((d.sets / total) * 100) : 0
          const pct = (d.sets / max) * 100
          return (
            <li key={d.muscle_group}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{d.label}</span>
                <span className="text-sm text-giz-suave">
                  <span className="num text-lg text-giz">{formatInt(d.sets)}</span> {d.sets === 1 ? 'série' : 'séries'}
                  <span className="ml-1.5">({share}%)</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-4" aria-hidden="true">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-azul/15" />
                <motion.div
                  className="absolute inset-y-0 left-0"
                  initial={{ width: '0%' }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 140, damping: 20, mass: 1.1, delay: 0.1 + i * 0.07 }}
                >
                  <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-azul/50 to-azul" />
                  <div className="absolute -right-0.5 top-0 h-4 w-2 rounded-[3px] bg-azul shadow-[inset_-2px_0_0_rgb(0_0_0/0.25)]" />
                </motion.div>
              </div>
            </li>
          )
        })}
      </ul>
      <DataTable
        caption={caption}
        columns={['Grupo muscular', 'Séries']}
        rows={data.map((d) => [d.label, plural(d.sets, 'série', 'séries')])}
      />
    </div>
  )
}

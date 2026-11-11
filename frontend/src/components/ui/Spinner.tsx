import { clsx } from 'clsx'

import { Plate } from '@/components/brand/Plate'

import { SkeletonPage } from './Skeleton'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span className={clsx('inline-block shrink-0 motion-safe:animate-girar-anilha', className ?? 'size-6')} aria-hidden="true">
        <Plate color="currentColor" grip className="size-full opacity-90" />
      </span>
      <span className={label ? 'text-giz-suave' : 'sr-only'}>{label ?? 'Carregando'}</span>
    </span>
  )
}

const LOADER_PLATES = [
  { color: 'var(--anilha-vermelha)', x: 46, w: 11, h: 58, delay: 0 },
  { color: 'var(--anilha-azul)', x: 33, w: 10, h: 50, delay: 0.14 },
  { color: 'var(--anilha-amarela)', x: 22, w: 8.5, h: 40, delay: 0.28 },
]

export function BarbellLoader({ className }: { className?: string }) {
  const W = 200
  const mid = 40
  return (
    <svg viewBox={`0 0 ${W} 84`} className={clsx('w-44 overflow-visible', className)} aria-hidden="true">
      <rect x="18" y="81" width={W - 36} height="2" rx="1" fill="var(--linha)" />
      <g className="carregador-barra" style={{ transformBox: 'fill-box' }}>
        <rect x="4" y={mid - 4} width={W - 8} height="8" rx="2.5" fill="var(--aco-barra)" opacity="0.85" />
        <rect x="62" y={mid - 3} width={W - 124} height="6" rx="1.5" fill="var(--linha-forte)" />
        <rect x="58" y={mid - 10} width="5" height="20" rx="1.5" fill="var(--giz)" opacity="0.85" />
        <rect x={W - 63} y={mid - 10} width="5" height="20" rx="1.5" fill="var(--giz)" opacity="0.85" />
        {LOADER_PLATES.map((p) => (
          <g key={p.color}>
            <rect
              className="carregador-anilha-esq"
              style={{ ['--atraso' as string]: `${p.delay}s` }}
              x={p.x}
              y={mid - p.h / 2}
              width={p.w}
              height={p.h}
              rx="2.5"
              fill={p.color}
            />
            <rect
              className="carregador-anilha-dir"
              style={{ ['--atraso' as string]: `${p.delay}s` }}
              x={W - p.x - p.w}
              y={mid - p.h / 2}
              width={p.w}
              height={p.h}
              rx="2.5"
              fill={p.color}
            />
          </g>
        ))}
      </g>
    </svg>
  )
}

export function PageLoader({
  label = 'Carregando…',
  variant = 'barra',
}: {
  label?: string
  variant?: 'barra' | 'pagina'
}) {
  if (variant === 'pagina') return <SkeletonPage label={label} />
  return (
    <div role="status" aria-live="polite" className="aparece-devagar flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <BarbellLoader />
      <span className="text-sm font-medium text-giz-suave">{label}</span>
    </div>
  )
}

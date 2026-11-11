import { clsx } from 'clsx'
import type { CSSProperties, ReactNode } from 'react'

type Shape = 'bloco' | 'texto' | 'titulo' | 'circulo' | 'anilha'

const shapes: Record<Shape, string> = {
  bloco: 'rounded-2xl',
  texto: 'h-3.5 rounded-md',
  titulo: 'h-10 rounded-lg',
  circulo: 'aspect-square rounded-full',
  anilha: 'aspect-square rounded-full',
}

export function Skeleton({
  className,
  shape = 'bloco',
  style,
}: {
  className?: string
  shape?: Shape
  style?: CSSProperties
}) {
  return (
    <span aria-hidden="true" className={clsx('esqueleto block', shapes[shape], className)} style={style}>
      {shape === 'anilha' ? (
        <span className="absolute inset-[18%] rounded-full border-2 border-linha" />
      ) : null}
    </span>
  )
}

const LINE_WIDTHS = ['100%', '92%', '78%', '86%', '60%']

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx('flex flex-col gap-2.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          shape="texto"
          style={{ width: i === lines - 1 && lines > 1 ? '58%' : LINE_WIDTHS[i % LINE_WIDTHS.length] }}
        />
      ))}
    </span>
  )
}

export function SkeletonGroup({
  label = 'Carregando…',
  className,
  children,
}: {
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={clsx('aparece-devagar', className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export function SkeletonCard({
  className,
  plate = true,
  lines = 1,
}: {
  className?: string
  plate?: boolean
  lines?: number
}) {
  return (
    <div
      aria-hidden="true"
      className={clsx('flex items-center gap-4 rounded-[28px] border border-linha bg-superficie p-4 sm:p-5', className)}
    >
      {plate ? <Skeleton shape="anilha" className="size-14 shrink-0" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Skeleton shape="titulo" className="h-7 w-3/5" />
        <SkeletonText lines={lines} />
      </div>
    </div>
  )
}

export function SkeletonPage({
  label = 'Carregando…',
  cards = 3,
  className,
}: {
  label?: string
  cards?: number
  className?: string
}) {
  return (
    <SkeletonGroup label={label} className={clsx('flex flex-col', className)}>
      <div aria-hidden="true" className="mb-8 pt-3">
        <Skeleton shape="titulo" className="h-14 w-[min(18rem,70%)] sm:h-[4.5rem]" />
        <div className="mt-4 flex items-center gap-1.5">
          <Skeleton className="h-6 w-2.5 rounded-[3px]" />
          <Skeleton className="h-4 w-1.5 rounded-[2px]" />
          <Skeleton className="h-1 flex-1 rounded-full" />
        </div>
        <Skeleton shape="texto" className="mt-4 w-[min(22rem,85%)]" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} lines={i === 0 ? 2 : 1} />
        ))}
      </div>
    </SkeletonGroup>
  )
}

import { clsx } from 'clsx'
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react'
import { useEffect } from 'react'

const fmt = (decimals: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })

export function AnimatedNumber({
  value,
  from = 0,
  decimals = 0,
  duration = 1.1,
  delay = 0,
  className,
}: {
  value: number
  from?: number
  decimals?: number
  duration?: number
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : from)
  const formatter = fmt(decimals)
  const text = useTransform(mv, (v) => formatter.format(decimals ? v : Math.round(v)))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration, delay, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [value, duration, delay, mv, reduce])

  return (
    <span className={clsx('tabular-nums', className)} aria-label={formatter.format(value)}>
      <motion.span aria-hidden="true">{text}</motion.span>
    </span>
  )
}

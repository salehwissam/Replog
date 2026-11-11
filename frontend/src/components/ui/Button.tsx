import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'

import { vibrar, VIBRACOES } from '@/lib/motion'

import { Spinner } from './Spinner'

type Variant = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'ouro'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  iconRight?: ReactNode
  haptic?: boolean
}

const variants: Record<Variant, string> = {
  primario:
    'brilho-passa bg-azul-forte text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_10px_28px_-12px_var(--anilha-azul)] hover:bg-azul hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_14px_32px_-12px_var(--anilha-azul)]',
  secundario:
    'border border-linha bg-superficie-2 text-giz shadow-[inset_0_1px_0_var(--realce)] hover:border-linha-forte hover:bg-linha/60',
  fantasma: 'bg-transparent text-giz-suave hover:bg-superficie-2 hover:text-giz',
  perigo:
    'brilho-passa bg-vermelha-forte text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_28px_-14px_var(--anilha-vermelha)] hover:brightness-110',
  ouro: 'brilho-passa bg-amarela text-[#1b1400] shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_10px_30px_-12px_var(--anilha-amarela)] hover:brightness-105',
}

const sizes = {
  sm: 'min-h-9 rounded-xl px-3 text-sm',
  md: 'min-h-11 rounded-2xl px-4',
  lg: 'min-h-15 rounded-[20px] px-6 text-lg',
}

const HEAVY: Variant[] = ['primario', 'ouro', 'perigo']

export function Button({
  variant = 'primario',
  loading = false,
  size = 'md',
  icon,
  iconRight,
  haptic,
  className,
  children,
  disabled,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const vibrate = haptic ?? HEAVY.includes(variant)
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (vibrate) vibrar(VIBRACOES.toque)
        onClick?.(e)
      }}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 font-semibold tracking-[0.005em]',
        'transition-[transform,background-color,box-shadow,filter,border-color,color] duration-150 ease-out',
        'active:translate-y-px active:scale-[0.965] active:shadow-none disabled:active:translate-y-0 disabled:active:scale-100',
        loading ? 'cursor-wait' : 'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:saturate-[0.6]',
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className={size === 'lg' ? 'size-6' : 'size-5'} /> : icon}
      {children}
      {iconRight}
    </button>
  )
}

import type { Transition } from 'motion/react'

export const molaAnilha: Transition = { type: 'spring', stiffness: 380, damping: 24, mass: 1.1 }

export const molaToque: Transition = { type: 'spring', stiffness: 600, damping: 34 }

export const molaGaveta: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }

export const molaPagina: Transition = { type: 'spring', stiffness: 360, damping: 34, mass: 0.95 }

export const molaLevantar: Transition = { type: 'spring', stiffness: 300, damping: 14 }

export const curvaAco = [0.16, 1, 0.3, 1] as const

export const LETTER_COLORS: Record<string, string> = {
  A: 'var(--anilha-vermelha)',
  B: 'var(--anilha-azul)',
  C: 'var(--anilha-amarela)',
  D: 'var(--anilha-verde)',
  E: 'var(--anilha-branca)',
}

export function letterColor(letter: string | null | undefined): string {
  return (letter && LETTER_COLORS[letter]) || 'var(--giz-suave)'
}

export const VIBRACOES = {
  passo: 6,
  toque: 12,
  erro: [24, 50, 24],
  recorde: [18, 60, 32],
} as const

export function vibrar(padrao: number | readonly number[] = VIBRACOES.toque): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(typeof padrao === 'number' ? padrao : [...padrao])
  } catch {
  }
}

export interface Plate {
  kg: number
  color: string
  height: number
}

export const PLATES: Plate[] = [
  { kg: 25, color: 'var(--anilha-vermelha)', height: 1 },
  { kg: 20, color: 'var(--anilha-azul)', height: 1 },
  { kg: 15, color: 'var(--anilha-amarela)', height: 0.9 },
  { kg: 10, color: 'var(--anilha-verde)', height: 0.78 },
  { kg: 5, color: 'var(--anilha-branca)', height: 0.62 },
  { kg: 2.5, color: 'var(--anilha-vermelha)', height: 0.48 },
  { kg: 1.25, color: 'var(--giz-suave)', height: 0.4 },
]

export const BAR_KG = 20

export interface PlateLoad {
  perSide: Plate[]
  remainder: number
  belowBar: boolean
}

export function plateLoad(totalKg: number, barKg = BAR_KG): PlateLoad {
  if (!Number.isFinite(totalKg) || totalKg < barKg) {
    return { perSide: [], remainder: 0, belowBar: totalKg > 0 && totalKg < barKg }
  }
  let side = Math.round(((totalKg - barKg) / 2) * 100)
  const perSide: Plate[] = []
  for (const plate of PLATES) {
    const cents = Math.round(plate.kg * 100)
    while (side >= cents && perSide.length < 12) {
      perSide.push(plate)
      side -= cents
    }
  }
  return { perSide, remainder: side / 100, belowBar: false }
}

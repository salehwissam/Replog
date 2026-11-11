import { Barbell } from '@/components/brand/Barbell'
import { formatNumber } from '@/lib/format'
import { BAR_KG, plateLoad } from '@/lib/plates'

const THICKNESS: Record<number, number> = { 25: 1.3, 20: 1.15, 15: 1, 10: 0.85, 5: 0.62, 2.5: 0.48, 1.25: 0.4 }

export function BarbellLoad({ totalKg, lifted = false }: { totalKg: number; lifted?: boolean }) {
  const load = plateLoad(totalKg)
  const description =
    !Number.isFinite(totalKg) || totalKg <= 0
      ? 'Sem carga'
      : load.belowBar
        ? `Carga menor que a barra de ${BAR_KG} kg`
        : load.perSide.length === 0
          ? `Barra vazia (${BAR_KG} kg)`
          : `Por lado: ${load.perSide.map((p) => formatNumber(p.kg)).join(' + ')} kg`

  const plates = load.perSide.map((p, i) => ({
    id: `${i}-${p.kg}`,
    color: p.color,
    height: p.height,
    thickness: THICKNESS[p.kg] ?? 1,
  }))

  return (
    <figure className="flex flex-col gap-1">
      <Barbell plates={plates} lifted={lifted} height={96} title={description} />
      <figcaption className="text-center text-sm text-giz-suave">
        {description}
        {load.remainder > 0 ? `, faltam ${formatNumber(load.remainder)} kg por lado` : ''}
      </figcaption>
    </figure>
  )
}

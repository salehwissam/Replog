import { clsx } from 'clsx'

function arc(centerDeg: number, spanDeg: number, r: number): string {
  const rad = (d: number) => (d * Math.PI) / 180
  const a = rad(centerDeg - spanDeg / 2)
  const b = rad(centerDeg + spanDeg / 2)
  const p = (t: number) => `${(50 + r * Math.cos(t)).toFixed(2)} ${(50 + r * Math.sin(t)).toFixed(2)}`
  return `M ${p(a)} A ${r} ${r} 0 0 1 ${p(b)}`
}

const GRIPS = [-90, 30, 150].map((deg) => arc(deg, 46, 27))

export function Plate({
  color,
  letter,
  className,
  spin = false,
  grip = false,
}: {
  color: string
  letter?: string
  className?: string
  spin?: boolean
  grip?: boolean
}) {
  return (
    <svg viewBox="0 0 100 100" className={clsx(className, spin && 'motion-safe:animate-[spin_0.9s_ease-out]')} aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill={color} />
      <path d="M 9 38 A 42 42 0 0 1 91 38" fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(0 0 0 / 0.22)" strokeWidth="3" />
      {grip ? (
        <>
          <circle cx="50" cy="50" r="40" fill="rgb(0 0 0 / 0.06)" />
          {GRIPS.map((d) => (
            <path key={d} d={d} fill="none" stroke="rgb(0 0 0 / 0.38)" strokeWidth="9" strokeLinecap="round" />
          ))}
          <circle cx="50" cy="50" r="13" fill="rgb(0 0 0 / 0.16)" />
        </>
      ) : (
        <circle cx="50" cy="50" r="31" fill="rgb(0 0 0 / 0.14)" />
      )}
      {letter ? (
        <text
          x="50"
          y="51"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Big Shoulders Display, sans-serif"
          fontWeight="900"
          fontSize="46"
          fill="rgb(255 255 255 / 0.96)"
          style={{ paintOrder: 'stroke', stroke: 'rgb(0 0 0 / 0.25)', strokeWidth: 2 }}
        >
          {letter}
        </text>
      ) : (
        <>
          <circle cx="50" cy="50" r="8" fill="var(--aco)" />
          <circle cx="50" cy="50" r="8.5" fill="none" stroke="rgb(255 255 255 / 0.4)" strokeWidth="2" />
        </>
      )}
    </svg>
  )
}

export function BarbellMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true">
      <rect x="0" y="17" width="64" height="6" rx="2" fill="var(--aco-barra)" />
      <rect x="7" y="1" width="8" height="38" rx="2.5" fill="var(--anilha-vermelha)" />
      <rect x="16.5" y="6" width="5.5" height="28" rx="2" fill="var(--anilha-azul)" />
      <rect x="49" y="1" width="8" height="38" rx="2.5" fill="var(--anilha-vermelha)" />
      <rect x="42" y="6" width="5.5" height="28" rx="2" fill="var(--anilha-azul)" />
    </svg>
  )
}

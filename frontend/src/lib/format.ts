const kgFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const intFormatter = new Intl.NumberFormat('pt-BR')

export function formatKg(value: number | string): string {
  return `${kgFormatter.format(Number(value))} kg`
}

export function formatNumber(value: number | string): string {
  return kgFormatter.format(Number(value))
}

export function formatInt(value: number): string {
  return intFormatter.format(value)
}

export function formatLocalDate(isoDate: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts }).format(date)
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatLongDate(isoDate: string): string {
  return capitalizeFirst(formatLocalDate(isoDate, { weekday: 'long', day: 'numeric', month: 'long' }))
}

export function formatTime(isoDateTime: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(isoDateTime))
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${intFormatter.format(n)} ${n === 1 ? singular : pluralForm}`
}

export function formatInstantDate(isoDateTime: string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(isoDateTime))
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function todayLong(date = new Date()): string {
  const text = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type Theme = 'escuro' | 'claro'
const KEY = 'replog_tema'

export const THEME_COLORS: Record<Theme, string> = { escuro: '#0b1020', claro: '#e9edf4' }

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'claro' || value === 'escuro') return value
  } catch {
  }
  return 'escuro'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme === 'claro' ? 'light' : 'dark'
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme])
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
  }
  applyTheme(theme)
}

export function applyStoredTheme(): void {
  applyTheme(getStoredTheme())
}

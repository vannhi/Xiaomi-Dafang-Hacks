// Theme: color scheme and accent color, remembered per browser

export type Scheme = 'auto' | 'light' | 'dark'

export const accents = {
  teal: '#0f8b8d',
  blue: '#2f6fde',
  indigo: '#5b5bd6',
  green: '#2f9e44',
  orange: '#e8590c',
  pink: '#d6336c',
  grey: '#5c6670',
} as const

export type Accent = keyof typeof accents

function load<T extends string>(key: string, allowed: readonly string[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    if (value && allowed.includes(value)) return value as T
  } catch {
    // Storage unavailable (private mode): use defaults
  }
  return fallback
}

export const theme = $state({
  scheme: load<Scheme>('dafang.scheme', ['auto', 'light', 'dark'], 'auto'),
  accent: load<Accent>('dafang.accent', Object.keys(accents), 'teal'),
})

export function applyTheme() {
  const root = document.documentElement
  if (theme.scheme === 'auto') delete root.dataset.theme
  else root.dataset.theme = theme.scheme
  root.style.setProperty('--accent', accents[theme.accent])
  try {
    localStorage.setItem('dafang.scheme', theme.scheme)
    localStorage.setItem('dafang.accent', theme.accent)
  } catch {
    // Not remembered, still applied
  }
}

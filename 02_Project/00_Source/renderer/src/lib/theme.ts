export type Theme = 'light' | 'dark'

const KEY = 'agentdeck.theme'
const DEFAULT_THEME: Theme = 'dark'

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
  }
  return DEFAULT_THEME
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
  }
  applyTheme(theme)
}

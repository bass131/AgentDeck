const PANE_KEY_PREFIX = 'agentdeck.pane.'

export function clampPaneWidth(px: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, px)))
}

export function calcAgentWidth(startW: number, deltaX: number, min: number, max: number): number {
  return clampPaneWidth(startW - deltaX, min, max)
}

export function loadPaneWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(PANE_KEY_PREFIX + key)
    if (raw !== null) {
      const v = parseInt(raw, 10)
      if (Number.isFinite(v) && v > 0) return v
    }
  } catch {
  }
  return fallback
}

export function savePaneWidth(key: string, px: number): void {
  try {
    localStorage.setItem(PANE_KEY_PREFIX + key, String(px))
  } catch {
  }
}

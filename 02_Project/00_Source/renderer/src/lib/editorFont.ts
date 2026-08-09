const EDITOR_FONT_KEY = 'agentdeck.editorFont'

export const EDITOR_FONT_MIN = 10

export const EDITOR_FONT_MAX = 28

export const EDITOR_FONT_DEFAULT = 13

export function clampEditorFont(px: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, px)))
}

export function nextEditorFont(current: number, step: number): number {
  return clampEditorFont(current + step, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
}

export function loadEditorFont(): number {
  try {
    const raw = localStorage.getItem(EDITOR_FONT_KEY)
    if (raw !== null) {
      const v = parseInt(raw, 10)
      if (Number.isFinite(v) && v > 0) {
        return clampEditorFont(v, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
      }
    }
  } catch {
  }
  return EDITOR_FONT_DEFAULT
}

export function saveEditorFont(px: number): void {
  try {
    localStorage.setItem(EDITOR_FONT_KEY, String(px))
  } catch {
  }
}

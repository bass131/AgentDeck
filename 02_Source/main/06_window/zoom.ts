import { ZOOM_FACTOR_RANGE } from '../../shared/ipcContract'

export function resolveBootZoomFactor(rawValue: unknown): number | null {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return null
  }
  return Math.min(ZOOM_FACTOR_RANGE.MAX, Math.max(ZOOM_FACTOR_RANGE.MIN, rawValue))
}

export interface ZoomRestoreDeps {
  getUiPrefs: () => Promise<{ zoomFactor?: unknown }>
  applyZoomFactor: (factor: number) => void
}

export async function restoreBootZoom(deps: ZoomRestoreDeps): Promise<void> {
  const prefs = await deps.getUiPrefs()
  const clamped = resolveBootZoomFactor(prefs?.zoomFactor)
  if (clamped === null) return
  try {
    deps.applyZoomFactor(clamped)
  } catch {
  }
}

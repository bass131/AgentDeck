import type { EngineUpdateInfo } from '../../../shared/ipcContract'

export const ENGINE_SEEN_KEY = 'engine.seenLatest'

export function decideEngineNotice(
  info: EngineUpdateInfo | null | undefined,
  seen: string
): boolean {
  if (!info) return false
  if (!info.updateAvailable) return false
  if (!info.latest) return false
  return info.latest !== seen
}

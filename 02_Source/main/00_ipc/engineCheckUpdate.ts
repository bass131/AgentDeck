import type { EngineUpdateInfo } from '../../shared/ipcContract'

export function cmpVer(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  const len = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA !== numB) {
      return numA - numB
    }
  }
  return 0
}

export async function checkEngineUpdate(
  backend: { version(): Promise<string | null>; latestVersion(): Promise<string | null> }
): Promise<EngineUpdateInfo> {
  const [current, latest] = await Promise.all([
    (async (): Promise<string | null> => {
      try {
        const v = await backend.version()
        if (typeof v === 'string' && v.length > 0) return v
        return null
      } catch {
        return null
      }
    })(),
    (async (): Promise<string | null> => {
      try {
        const v = await backend.latestVersion()
        if (typeof v === 'string' && v.length > 0) return v
        return null
      } catch {
        return null
      }
    })()
  ])

  const updateAvailable =
    current !== null && latest !== null
      ? cmpVer(current, latest) < 0
      : false

  return { current, latest, updateAvailable }
}

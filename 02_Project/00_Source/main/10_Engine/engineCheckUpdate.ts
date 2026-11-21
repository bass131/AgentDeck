import type { EngineUpdateInfo } from '../../shared/ipcContract'

// semver 순서 — 빌드 메타(+…)는 무시하고, pre-release(-…)는 같은 번호의 정식보다 앞이다
export function cmpVer(a: string, b: string): number {
  const [coreA, preA] = splitVer(a)
  const [coreB, preB] = splitVer(b)
  const coreA2 = coreA.split('.').map(toNum)
  const coreB2 = coreB.split('.').map(toNum)
  for (let i = 0; i < Math.max(coreA2.length, coreB2.length); i++) {
    const diff = (coreA2[i] ?? 0) - (coreB2[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (preA === null || preB === null) return preA === preB ? 0 : preA === null ? 1 : -1
  const idsA = preA.split('.')
  const idsB = preB.split('.')
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const x = idsA[i]
    const y = idsB[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff
    } else if (nx !== ny) {
      return nx ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

function splitVer(v: string): [string, string | null] {
  const core = v.trim().replace(/^v/, '').split('+')[0]
  const dash = core.indexOf('-')
  return dash < 0 ? [core, null] : [core.slice(0, dash), core.slice(dash + 1)]
}

function toNum(part: string): number {
  const n = Number(part)
  return Number.isFinite(n) ? n : 0
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

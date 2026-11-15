import { join } from 'node:path'

// 비활성 목록 오버레이(userData의 `{ disabled: string[] }` 파일)의 한 곳 (M05 G11) — skills와 mcp가 함께 쓴다.
// 파일 이름과 출력 투영(skills: {name: 'off'}, mcp: [{serverName}])은 소비처가 정한다.
// 경로 해석(getUserData)은 try 밖이다 — 해석이 throw하면 읽기·쓰기 모두 throw가 그대로 나간다(옮기기 전과 같다).
export interface DisabledOverlayDeps {
  getUserData: () => string
  readFile: (filePath: string) => string
  writeFile: (filePath: string, content: string) => void
  mkdirSync: (dir: string) => void
}

export interface DisabledOverlay {
  readDisabled(): Set<string>
  setEnabled(name: string, enabled: boolean): boolean
}

function parseDisabled(
  overlayPath: string,
  readFileFn: (filePath: string) => string
): Set<string> {
  try {
    const raw = readFileFn(overlayPath)
    const j: unknown = JSON.parse(raw)
    const list = (j as Record<string, unknown>)?.disabled
    if (!Array.isArray(list)) return new Set()
    return new Set(list.filter((s): s is string => typeof s === 'string'))
  } catch {
    return new Set()
  }
}

export function createDisabledOverlay(fileName: string, deps: DisabledOverlayDeps): DisabledOverlay {
  function getOverlayPath(): string {
    return join(deps.getUserData(), fileName)
  }

  function readDisabled(): Set<string> {
    return parseDisabled(getOverlayPath(), deps.readFile)
  }

  function setEnabled(name: string, enabled: boolean): boolean {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return false
    }

    const overlayPath = getOverlayPath()
    const set = parseDisabled(overlayPath, deps.readFile)

    if (enabled) {
      set.delete(name)
    } else {
      set.add(name)
    }

    try {
      const userDataDir = deps.getUserData()
      deps.mkdirSync(userDataDir)
      deps.writeFile(overlayPath, JSON.stringify({ disabled: [...set].sort() }, null, 2))
      return true
    } catch {
      return false
    }
  }

  return { readDisabled, setEnabled }
}

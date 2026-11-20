// 탐색기의 순수 함수 — 컴포넌트 파일 밖에 두어 Fast Refresh 경계를 지킨다 (M05 Backlog 26)
type ChangeTag = 'edit'

export function buildChgMaps(changed: Set<string>, viewing: boolean) {
  const files = new Map<string, ChangeTag>()
  const dirs = new Map<string, ChangeTag>()
  if (viewing) return { files, dirs }
  for (const filePath of changed) {
    files.set(filePath, 'edit')
    let p = filePath
    while (p.includes('/')) {
      p = p.slice(0, p.lastIndexOf('/'))
      dirs.set(p, 'edit')
    }
  }
  return { files, dirs }
}

const DRIVE_PATH = /^[A-Za-z]:/

export function normalizeToRel(saved: string[], root: string): string[] {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  // 드라이브 문자 경로는 대소문자를 가리지 않는다(Windows)
  const fold = DRIVE_PATH.test(normRoot) ? (s: string) => s.toLowerCase() : (s: string) => s
  const prefix = fold(normRoot + '/')
  return saved.map((p) => {
    const norm = p.replace(/\\/g, '/')
    if (fold(norm).startsWith(prefix)) {
      return norm.slice(prefix.length)
    }
    return norm
  }).filter((p) => !p.startsWith('/') && !DRIVE_PATH.test(p) && p !== '..' && !p.startsWith('../'))
}

export function getAncestors(rel: string): string[] {
  const parts = rel.split('/')
  const ancestors: string[] = []
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'))
  }
  return ancestors
}

export function allDirsToLoad(savedExpanded: string[]): string[] {
  const dirs = new Set<string>()
  for (const rel of savedExpanded) {
    for (const anc of getAncestors(rel)) {
      dirs.add(anc)
    }
    dirs.add(rel)
  }
  return Array.from(dirs)
}

export function computeHits(allFiles: string[], query: string, limit = 100): string[] {
  const q = query.trim().toLowerCase()
  if (!q || !allFiles.length) return []
  const starts: string[] = []
  const names: string[] = []
  const paths: string[] = []
  for (const f of allFiles) {
    const name = f.slice(f.lastIndexOf('/') + 1).toLowerCase()
    if (name.startsWith(q)) starts.push(f)
    else if (name.includes(q)) names.push(f)
    else if (f.toLowerCase().includes(q)) paths.push(f)
    if (starts.length >= limit) break
  }
  return [...starts, ...names, ...paths].slice(0, limit)
}

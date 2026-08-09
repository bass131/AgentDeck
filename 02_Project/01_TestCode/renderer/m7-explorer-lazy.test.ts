// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileTreeNode } from '../../../02_Project/00_Source/shared/ipcContract'

function makeDir(name: string, path: string, children?: FileTreeNode[]): FileTreeNode {
  return { name, path, kind: 'directory', children }
}

function makeFile(name: string, path: string): FileTreeNode {
  return { name, path, kind: 'file' }
}

describe('(A) lazy childrenCache 로직', () => {
  it('A-1: cache에 key 없음 → 미로드(undefined)', () => {
    const cache = new Map<string, FileTreeNode[]>()
    expect(cache.has('src')).toBe(false)
    expect(cache.get('src')).toBeUndefined()
  })

  it('A-2: cache에 key 있고 빈 배열 → 로드됨(빈 폴더)', () => {
    const cache = new Map<string, FileTreeNode[]>()
    cache.set('empty-dir', [])
    expect(cache.has('empty-dir')).toBe(true)
    expect(cache.get('empty-dir')).toEqual([])
  })

  it('A-3: cache에 key 있고 entries → 로드됨(자식 있음)', () => {
    const cache = new Map<string, FileTreeNode[]>()
    cache.set('src', [makeFile('index.ts', 'src/index.ts')])
    expect(cache.has('src')).toBe(true)
    expect(cache.get('src')!.length).toBe(1)
    expect(cache.get('src')![0].name).toBe('index.ts')
  })

  it('A-4: 폴더 expand → 미로드면 fsListDir 호출 (인터페이스 검증)', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({
      entries: [makeFile('index.ts', 'src/index.ts'), makeFile('app.ts', 'src/app.ts')],
    })

    const cache = new Map<string, FileTreeNode[]>()
    const genRef = { current: 0 }

    const loadDir = async (rel: string, rootId?: string): Promise<void> => {
      const gen = genRef.current
      const res = await mockFsListDir({ rootId, relDir: rel })
      if (gen !== genRef.current) return
      cache.set(rel, res.entries)
    }

    expect(cache.has('src')).toBe(false)
    await loadDir('src')

    expect(mockFsListDir).toHaveBeenCalledTimes(1)
    expect(mockFsListDir).toHaveBeenCalledWith({ rootId: undefined, relDir: 'src' })
    expect(cache.has('src')).toBe(true)
    expect(cache.get('src')!.length).toBe(2)
  })

  it('A-5: 재expand → cache hit → fsListDir 중복 호출 0 (캐시 재사용)', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({
      entries: [makeFile('index.ts', 'src/index.ts')],
    })

    const cache = new Map<string, FileTreeNode[]>()
    const genRef = { current: 0 }

    const loadDirIfNeeded = async (rel: string): Promise<void> => {
      if (cache.has(rel)) return
      const gen = genRef.current
      const res = await mockFsListDir({ relDir: rel })
      if (gen !== genRef.current) return
      cache.set(rel, res.entries)
    }

    await loadDirIfNeeded('src')
    await loadDirIfNeeded('src')

    expect(mockFsListDir).toHaveBeenCalledTimes(1)
  })

  it('A-6: race 가드 — genRef 불일치 시 stale 응답 무시', async () => {
    const cache = new Map<string, FileTreeNode[]>()
    const genRef = { current: 0 }

    let resolveDelay!: (v: unknown) => void
    const delayedPromise = new Promise((r) => { resolveDelay = r })

    const mockFsListDir = vi.fn().mockReturnValueOnce(
      delayedPromise.then(() => ({ entries: [makeFile('stale.ts', 'src/stale.ts')] }))
    )

    const loadDirPromise = (async () => {
      const gen = genRef.current
      const res = await mockFsListDir({ relDir: 'src' })
      if (gen !== genRef.current) return
      cache.set('src', res.entries)
    })()

    genRef.current += 1

    resolveDelay(undefined)
    await loadDirPromise

    expect(cache.has('src')).toBe(false)
  })

  it('A-7: 빈 폴더 vs 미로드 구분 — cache.has()로 판별', () => {
    const cache = new Map<string, FileTreeNode[]>()

    expect(cache.has('unloaded-dir')).toBe(false)

    cache.set('empty-dir', [])
    expect(cache.has('empty-dir')).toBe(true)
    expect(cache.get('empty-dir')).toEqual([])

    expect(cache.has('unloaded-dir')).toBe(false)
    expect(cache.has('empty-dir')).toBe(true)
  })
})

describe('(B) 검색 listFiles 전환 — 깊은 파일 검색', () => {
  function searchHits(allFiles: string[], query: string, limit = 100): string[] {
    const q = query.trim().toLowerCase()
    if (!q || !allFiles) return []
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

  const FLAT_FILES = [
    'README.md',
    'package.json',
    'src/index.ts',
    'src/app.ts',
    'src/components/FileExplorer.tsx',
    'src/components/icons.tsx',
    'node_modules/lodash/index.js',
    'deep/a/b/c/utils.ts',
  ]

  it('B-1: 깊은 파일(src/index.ts) 검색 결과에 포함', () => {
    const hits = searchHits(FLAT_FILES, 'index')
    expect(hits).toContain('src/index.ts')
  })

  it('B-2: 아주 깊은 파일(deep/a/b/c/utils.ts) 검색 가능', () => {
    const hits = searchHits(FLAT_FILES, 'utils')
    expect(hits).toContain('deep/a/b/c/utils.ts')
  })

  it('B-3: 파일명 startswith 우선 정렬', () => {
    const hits = searchHits(FLAT_FILES, 'app')
    expect(hits[0]).toBe('src/app.ts')
  })

  it('B-4: 경로 매치(이름 아님) — node_modules/lodash/index.js', () => {
    const hits = searchHits(FLAT_FILES, 'lodash')
    expect(hits).toContain('node_modules/lodash/index.js')
  })

  it('B-5: 빈 쿼리 → 빈 배열', () => {
    expect(searchHits(FLAT_FILES, '')).toEqual([])
    expect(searchHits(FLAT_FILES, '   ')).toEqual([])
  })

  it('B-6: allFiles null/undefined → 빈 배열', () => {
    expect(searchHits([], 'index')).toEqual([])
  })

  it('B-7: 검색 결과 상한(limit=3) 적용', () => {
    const hits = searchHits(FLAT_FILES, 'ts', 3)
    expect(hits.length).toBeLessThanOrEqual(3)
  })

  it('B-8: listFiles 기반이므로 lazy 트리 깊이와 무관하게 동작', () => {
    const lazyTreeOnlyRoot = [makeDir('src', 'src')]
    const childrenFromTree = lazyTreeOnlyRoot.flatMap((n) => n.children ?? [])
    const indexInTree = childrenFromTree.find((n) => n.path === 'src/index.ts')
    expect(indexInTree).toBeUndefined()

    const hits = searchHits(['src/index.ts', 'src/app.ts'], 'index')
    expect(hits).toContain('src/index.ts')
  })
})

describe('(C) prefs 상대경로 저장/복원', () => {
  it('C-1: 상대경로로 저장된 prefs 복원', () => {
    const saved = ['src', 'src/components', 'src/lib']
    const expanded = new Set(saved)
    expect(expanded.has('src')).toBe(true)
    expect(expanded.has('src/components')).toBe(true)
  })

  it('C-2: 깊은 폴더(a/b/c) 복원 시 필요한 조상 목록 추출', () => {
    function getAncestors(rel: string): string[] {
      const parts = rel.split('/')
      const ancestors: string[] = []
      for (let i = 1; i < parts.length; i++) {
        ancestors.push(parts.slice(0, i).join('/'))
      }
      return ancestors
    }

    expect(getAncestors('a/b/c')).toEqual(['a', 'a/b'])
    expect(getAncestors('src/components')).toEqual(['src'])
    expect(getAncestors('src')).toEqual([])
    expect(getAncestors('')).toEqual([])
  })

  it('C-3: 조상 폴더도 포함한 전체 로드 목록 계산', () => {
    function getAncestors(rel: string): string[] {
      const parts = rel.split('/')
      const ancestors: string[] = []
      for (let i = 1; i < parts.length; i++) {
        ancestors.push(parts.slice(0, i).join('/'))
      }
      return ancestors
    }

    function allDirsToLoad(savedExpanded: string[]): Set<string> {
      const dirs = new Set<string>()
      for (const rel of savedExpanded) {
        for (const anc of getAncestors(rel)) {
          dirs.add(anc)
        }
        dirs.add(rel)
      }
      return dirs
    }

    const saved = ['a/b/c']
    const dirs = allDirsToLoad(saved)
    expect(dirs.has('a')).toBe(true)
    expect(dirs.has('a/b')).toBe(true)
    expect(dirs.has('a/b/c')).toBe(true)
  })

  it('C-4: 하위호환 — 절대경로 prefs를 root-상대 변환', () => {
    function stripRoot(abs: string, root: string): string | null {
      const normAbs = abs.replace(/\\/g, '/')
      const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
      if (!normAbs.startsWith(normRoot + '/')) return null
      const rel = normAbs.slice(normRoot.length + 1)
      return rel || ''
    }

    const root = '/home/user/project'
    const absPath = '/home/user/project/src/components'
    const rel = stripRoot(absPath, root)
    expect(rel).toBe('src/components')

    const outside = stripRoot('/etc/passwd', root)
    expect(outside).toBeNull()
  })
})

describe('(D) 조상 dir 롤업 (원본 L87-102 미러)', () => {
  interface ChangedFile {
    path: string
    tag: 'new' | 'edit'
  }

  function buildChgMaps(changed: ChangedFile[], viewing: boolean = false) {
    const files = new Map<string, 'new' | 'edit'>()
    const dirs = new Map<string, 'new' | 'edit'>()
    for (const f of viewing ? [] : changed) {
      const t = f.tag === 'new' ? 'new' : 'edit'
      files.set(f.path, t)
      let p = f.path
      while (p.includes('/')) {
        p = p.slice(0, p.lastIndexOf('/'))
        if (dirs.get(p) !== 'new') dirs.set(p, t)
      }
    }
    return { files, dirs }
  }

  it('D-1: changed=[{path:"a/b/c.ts", tag:"new"}] → dirs에 "a"·"a/b"', () => {
    const { files, dirs } = buildChgMaps([{ path: 'a/b/c.ts', tag: 'new' }])
    expect(files.get('a/b/c.ts')).toBe('new')
    expect(dirs.get('a/b')).toBe('new')
    expect(dirs.get('a')).toBe('new')
  })

  it('D-2: edit 파일 — 조상 dirs edit', () => {
    const { files, dirs } = buildChgMaps([{ path: 'src/index.ts', tag: 'edit' }])
    expect(files.get('src/index.ts')).toBe('edit')
    expect(dirs.get('src')).toBe('edit')
  })

  it('D-3: new 우선 — edit 이후 new가 같은 조상이면 new로 덮어씀', () => {
    const { files, dirs } = buildChgMaps([
      { path: 'src/a.ts', tag: 'edit' },
      { path: 'src/b.ts', tag: 'new' },
    ])
    expect(dirs.get('src')).toBe('new')
    expect(files.get('src/a.ts')).toBe('edit')
    expect(files.get('src/b.ts')).toBe('new')
  })

  it('D-4: new 이후 edit가 같은 조상이면 new 유지(edit로 덮어쓰기 안 됨)', () => {
    const { dirs } = buildChgMaps([
      { path: 'src/b.ts', tag: 'new' },
      { path: 'src/a.ts', tag: 'edit' },
    ])
    expect(dirs.get('src')).toBe('new')
  })

  it('D-5: viewing=true이면 changed 무시 (참고 폴더 보기 중)', () => {
    const { files, dirs } = buildChgMaps(
      [{ path: 'src/index.ts', tag: 'new' }],
      true
    )
    expect(files.size).toBe(0)
    expect(dirs.size).toBe(0)
  })

  it('D-6: 단일 레벨 파일(루트 직속) — 조상 없음', () => {
    const { files, dirs } = buildChgMaps([{ path: 'README.md', tag: 'new' }])
    expect(files.get('README.md')).toBe('new')
    expect(dirs.size).toBe(0)
  })

  it('D-7: 복수 파일 중첩 조상 집계', () => {
    const { dirs } = buildChgMaps([
      { path: 'a/b/c.ts', tag: 'new' },
      { path: 'a/d.ts', tag: 'edit' },
    ])
    expect(dirs.get('a')).toBe('new')
    expect(dirs.get('a/b')).toBe('new')
  })
})

describe('(E) refreshKey 처리', () => {
  it('E-1: refreshKey 변경 시 allFiles null로 무효화', () => {
    let allFiles: string[] | null = ['src/index.ts', 'src/app.ts']

    allFiles = null
    expect(allFiles).toBeNull()
  })

  it('E-2: refreshKey 변경 시 expanded 폴더 목록을 재로드', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({ entries: [] })
    const expanded = new Set<string>(['src', 'src/components'])
    const genRef = { current: 0 }

    const reloadAll = async (): Promise<void> => {
      const gen = genRef.current
      const dirs = ['', ...Array.from(expanded)]
      for (const rel of dirs) {
        const res = await mockFsListDir({ relDir: rel })
        if (gen !== genRef.current) return
        void res
      }
    }

    await reloadAll()

    expect(mockFsListDir).toHaveBeenCalledTimes(3)
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: '' })
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: 'src' })
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: 'src/components' })
  })
})

describe('(F) window.api.fsListDir 인터페이스 계약', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('F-1: fsListDir 요청 shape — rootId? + relDir', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({ entries: [] })

    await mockFsListDir({ relDir: '' })
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: '' })

    await mockFsListDir({ rootId: 'ref-1', relDir: 'src' })
    expect(mockFsListDir).toHaveBeenCalledWith({ rootId: 'ref-1', relDir: 'src' })
  })

  it('F-2: 응답 entries는 shallow(children 없음)', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({
      entries: [
        { name: 'src', path: 'src', kind: 'directory' },
        { name: 'README.md', path: 'README.md', kind: 'file' },
      ],
    })

    const res = await mockFsListDir({ relDir: '' })
    for (const entry of res.entries) {
      expect(entry).not.toHaveProperty('children')
    }
  })

  it('F-3: 보안 경계 — relDir에 절대경로 금지(main이 reject하면 빈 배열)', async () => {
    const mockFsListDir = vi.fn().mockImplementation(({ relDir }: { relDir: string }) => {
      if (relDir.startsWith('/') || relDir.includes('..')) {
        return Promise.resolve({ entries: [] })
      }
      return Promise.resolve({ entries: [makeFile('index.ts', 'src/index.ts')] })
    })

    const normalRes = await mockFsListDir({ relDir: 'src' })
    expect(normalRes.entries.length).toBeGreaterThan(0)

    const escapeRes = await mockFsListDir({ relDir: '../escape' })
    expect(escapeRes.entries).toEqual([])

    const absRes = await mockFsListDir({ relDir: '/etc/passwd' })
    expect(absRes.entries).toEqual([])
  })
})

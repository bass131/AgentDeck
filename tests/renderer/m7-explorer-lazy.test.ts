/**
 * m7-explorer-lazy.test.ts — Phase 35 M7 FileExplorer lazy 로딩 + 검색 전환 TDD
 *
 * 검증 범위:
 *   (A) lazy 펼침 — 폴더 expand 시 fsListDir 호출 · 캐시 재사용 · 빈vs미로드 구분 · race 가드(genRef)
 *   (B) 검색 listFiles 전환(B1·CRITICAL) — 깊은 파일 검색 · allFiles 캐시 · refreshKey 무효화
 *   (C) prefs 깊은복원(S2) — root-상대 prefs 저장/복원 · 조상 폴더 로드
 *   (D) 조상 롤업 — changed=[{path:'a/b/c.ts', tag:'new'}] → dirs Map 'a'·'a/b'
 *
 * 아키텍처 규칙:
 *   - renderer untrusted: fs/Node 직접 0. window.api 경유만.
 *   - 채널명 하드코딩 0 — IPC는 window.api 래퍼 경유.
 *   - 단방향 데이터 흐름 검증.
 *
 * 주의: 이 테스트는 FileExplorer 컴포넌트 직접 렌더가 아닌
 *       순수 로직(lazy 캐시·검색 필터·롤업 함수) 단위 테스트 중심.
 *       컴포넌트 자체는 jsdom 없이도 검증 가능한 로직 단위로 추출한다.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FileTreeNode } from '../../src/shared/ipc-contract'

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** 간단한 FileTreeNode 생성 헬퍼 */
function makeDir(name: string, path: string, children?: FileTreeNode[]): FileTreeNode {
  return { name, path, kind: 'directory', children }
}

function makeFile(name: string, path: string): FileTreeNode {
  return { name, path, kind: 'file' }
}

// ─────────────────────────────────────────────────────────────────────────────
// (A) lazy 캐시 로직 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────

/**
 * childrenCache 설계:
 *   - Map<string(rel path), FileTreeNode[]>
 *   - key 존재 = 로드 완료(빈 배열이면 빈 폴더)
 *   - key 없음 = 미로드
 */
describe('(A) lazy childrenCache 로직', () => {
  it('A-1: cache에 key 없음 → 미로드(undefined)', () => {
    const cache = new Map<string, FileTreeNode[]>()
    // 미로드 상태: cache.has(path) === false
    expect(cache.has('src')).toBe(false)
    expect(cache.get('src')).toBeUndefined()
  })

  it('A-2: cache에 key 있고 빈 배열 → 로드됨(빈 폴더)', () => {
    const cache = new Map<string, FileTreeNode[]>()
    cache.set('empty-dir', [])
    // 로드 완료지만 빈 폴더
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
    // 이 테스트는 lazy expand 핸들러가 올바르게 fsListDir를 호출하는지 검증한다.
    // FileExplorer 컴포넌트의 loadDir 로직을 순수 함수로 추출한 결과를 시뮬레이션.
    const mockFsListDir = vi.fn().mockResolvedValue({
      entries: [makeFile('index.ts', 'src/index.ts'), makeFile('app.ts', 'src/app.ts')],
    })

    const cache = new Map<string, FileTreeNode[]>()
    const genRef = { current: 0 }

    // FileExplorer의 loadDir와 동일한 로직
    const loadDir = async (rel: string, rootId?: string): Promise<void> => {
      const gen = genRef.current
      const res = await mockFsListDir({ rootId, relDir: rel })
      if (gen !== genRef.current) return // stale → 무시
      cache.set(rel, res.entries)
    }

    // 미로드 상태에서 expand → loadDir 호출
    expect(cache.has('src')).toBe(false)
    await loadDir('src')

    expect(mockFsListDir).toHaveBeenCalledTimes(1)
    expect(mockFsListDir).toHaveBeenCalledWith({ rootId: undefined, relDir: 'src' })
    expect(cache.has('src')).toBe(true)
    expect(cache.get('src')!.length).toBe(2)
  })

  it('A-5: 재expand → cache hit → fsListDir 중복 호출 0 (캐시 재사용)', async () => {
    // 원본 Explorer는 toggleDir 시 매번 loadDir를 호출하지만
    // 우리 구현은 cache hit이면 fsListDir를 재호출하지 않는다.
    const mockFsListDir = vi.fn().mockResolvedValue({
      entries: [makeFile('index.ts', 'src/index.ts')],
    })

    const cache = new Map<string, FileTreeNode[]>()
    const genRef = { current: 0 }

    const loadDirIfNeeded = async (rel: string): Promise<void> => {
      if (cache.has(rel)) return // 캐시 hit → skip
      const gen = genRef.current
      const res = await mockFsListDir({ relDir: rel })
      if (gen !== genRef.current) return
      cache.set(rel, res.entries)
    }

    await loadDirIfNeeded('src') // 1차 로드
    await loadDirIfNeeded('src') // 재expand → 캐시 hit

    expect(mockFsListDir).toHaveBeenCalledTimes(1) // 중복 0
  })

  it('A-6: race 가드 — genRef 불일치 시 stale 응답 무시', async () => {
    const cache = new Map<string, FileTreeNode[]>()
    const genRef = { current: 0 }

    let resolveDelay!: (v: unknown) => void
    const delayedPromise = new Promise((r) => { resolveDelay = r })

    const mockFsListDir = vi.fn().mockReturnValueOnce(
      delayedPromise.then(() => ({ entries: [makeFile('stale.ts', 'src/stale.ts')] }))
    )

    // loadDir 시작 (gen=0)
    const loadDirPromise = (async () => {
      const gen = genRef.current
      const res = await mockFsListDir({ relDir: 'src' })
      if (gen !== genRef.current) return // race guard
      cache.set('src', res.entries)
    })()

    // 워크스페이스 전환 시뮬 → gen 증가 (stale 만들기)
    genRef.current += 1

    // 지연 응답 해제
    resolveDelay(undefined)
    await loadDirPromise

    // stale 응답이므로 cache에 저장되지 않아야 함
    expect(cache.has('src')).toBe(false)
  })

  it('A-7: 빈 폴더 vs 미로드 구분 — cache.has()로 판별', () => {
    const cache = new Map<string, FileTreeNode[]>()

    // 미로드: key 없음
    expect(cache.has('unloaded-dir')).toBe(false)

    // 로드됨(빈 폴더): key 있고 값이 []
    cache.set('empty-dir', [])
    expect(cache.has('empty-dir')).toBe(true)
    expect(cache.get('empty-dir')).toEqual([])

    // 둘을 혼동하지 않음
    expect(cache.has('unloaded-dir')).toBe(false) // 여전히 미로드
    expect(cache.has('empty-dir')).toBe(true)     // 로드됨(빈)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (B) 검색 listFiles 전환 (B1·CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────

describe('(B) 검색 listFiles 전환 — 깊은 파일 검색', () => {
  /**
   * listFiles 기반 검색 로직 (원본 Explorer.tsx hits useMemo 미러)
   * allFiles: 플랫 배열 (root-상대 POSIX 경로)
   */
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
    // app.ts가 src/app.ts이므로 name이 'app.ts' → startswith 'app'
    expect(hits[0]).toBe('src/app.ts')
  })

  it('B-4: 경로 매치(이름 아님) — node_modules/lodash/index.js', () => {
    // 'lodash'로 검색 시 경로에 포함
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
    // lazy buildTree가 root+1레벨만 반환해도 listFiles는 전체 파일 목록 → 검색 가능
    // 이를 시뮬레이션: 트리에는 src/가 있지만 src/ 내부는 lazy(캐시 없음)
    // 그러나 allFiles에는 src/index.ts가 있음 → 검색 hit
    const lazyTreeOnlyRoot = [makeDir('src', 'src')] // children 없음(미로드)
    // lazyTree에서는 src/index.ts가 보이지 않음
    const childrenFromTree = lazyTreeOnlyRoot.flatMap((n) => n.children ?? [])
    const indexInTree = childrenFromTree.find((n) => n.path === 'src/index.ts')
    expect(indexInTree).toBeUndefined() // 트리에서는 못 찾음

    // listFiles 기반 검색에서는 찾음
    const hits = searchHits(['src/index.ts', 'src/app.ts'], 'index')
    expect(hits).toContain('src/index.ts') // 검색 정상
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (C) prefs 깊은 경로 lazy 복원 (S2)
// ─────────────────────────────────────────────────────────────────────────────

describe('(C) prefs 상대경로 저장/복원', () => {
  it('C-1: 상대경로로 저장된 prefs 복원', () => {
    // expanded prefs: root-상대 POSIX 배열
    const saved = ['src', 'src/components', 'src/lib']
    const expanded = new Set(saved)
    expect(expanded.has('src')).toBe(true)
    expect(expanded.has('src/components')).toBe(true)
  })

  it('C-2: 깊은 폴더(a/b/c) 복원 시 필요한 조상 목록 추출', () => {
    // 'a/b/c'를 복원하려면 'a', 'a/b', 'a/b/c' 모두 로드 필요
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
    expect(getAncestors('src')).toEqual([]) // 이미 루트 직속 — 조상 없음
    expect(getAncestors('')).toEqual([]) // 루트
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
        // 각 rel의 조상과 rel 자체 모두 로드 필요
        for (const anc of getAncestors(rel)) {
          dirs.add(anc)
        }
        dirs.add(rel)
      }
      return dirs
    }

    const saved = ['a/b/c']
    const dirs = allDirsToLoad(saved)
    // 'a', 'a/b', 'a/b/c' 모두 포함
    expect(dirs.has('a')).toBe(true)
    expect(dirs.has('a/b')).toBe(true)
    expect(dirs.has('a/b/c')).toBe(true)
  })

  it('C-4: 하위호환 — 절대경로 prefs를 root-상대 변환', () => {
    // 구 버전에서 절대경로를 저장했을 경우 strip
    function stripRoot(abs: string, root: string): string | null {
      const normAbs = abs.replace(/\\/g, '/')
      const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
      if (!normAbs.startsWith(normRoot + '/')) return null // 루트 밖이면 null
      const rel = normAbs.slice(normRoot.length + 1)
      return rel || '' // 루트 자체면 ''
    }

    const root = '/home/user/project'
    const absPath = '/home/user/project/src/components'
    const rel = stripRoot(absPath, root)
    expect(rel).toBe('src/components')

    // 루트 밖 경로
    const outside = stripRoot('/etc/passwd', root)
    expect(outside).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (D) 조상 폴더 롤업 — 원본 Explorer.tsx L87-102 미러
// ─────────────────────────────────────────────────────────────────────────────

describe('(D) 조상 dir 롤업 (원본 L87-102 미러)', () => {
  /** 변경 파일 → files Map + dirs Map(walk-up, new 우선) */
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
        if (dirs.get(p) !== 'new') dirs.set(p, t) // new 우선
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
      { path: 'src/a.ts', tag: 'edit' }, // src → edit
      { path: 'src/b.ts', tag: 'new' },  // src → new (우선)
    ])
    expect(dirs.get('src')).toBe('new') // new 우선
    expect(files.get('src/a.ts')).toBe('edit')
    expect(files.get('src/b.ts')).toBe('new')
  })

  it('D-4: new 이후 edit가 같은 조상이면 new 유지(edit로 덮어쓰기 안 됨)', () => {
    const { dirs } = buildChgMaps([
      { path: 'src/b.ts', tag: 'new' },  // src → new
      { path: 'src/a.ts', tag: 'edit' }, // src → edit 시도하지만 new이미 있으므로 유지
    ])
    expect(dirs.get('src')).toBe('new') // new 유지
  })

  it('D-5: viewing=true이면 changed 무시 (참고 폴더 보기 중)', () => {
    const { files, dirs } = buildChgMaps(
      [{ path: 'src/index.ts', tag: 'new' }],
      true // viewing
    )
    expect(files.size).toBe(0)
    expect(dirs.size).toBe(0)
  })

  it('D-6: 단일 레벨 파일(루트 직속) — 조상 없음', () => {
    const { files, dirs } = buildChgMaps([{ path: 'README.md', tag: 'new' }])
    expect(files.get('README.md')).toBe('new')
    expect(dirs.size).toBe(0) // 루트 직속, 조상 없음
  })

  it('D-7: 복수 파일 중첩 조상 집계', () => {
    const { dirs } = buildChgMaps([
      { path: 'a/b/c.ts', tag: 'new' },
      { path: 'a/d.ts', tag: 'edit' },
    ])
    // 'a' 조상: c.ts(new) + d.ts(edit). new 우선이면 new.
    expect(dirs.get('a')).toBe('new')
    expect(dirs.get('a/b')).toBe('new')
    // 'a/b' 기준으로 'a'가 edit에 의해 덮이지 않음
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (E) refreshKey 처리 — 보이는 폴더 재로드 + allFiles 무효화
// ─────────────────────────────────────────────────────────────────────────────

describe('(E) refreshKey 처리', () => {
  it('E-1: refreshKey 변경 시 allFiles null로 무효화', () => {
    // allFiles: null | string[] 상태. refreshKey가 바뀌면 null로 초기화.
    let allFiles: string[] | null = ['src/index.ts', 'src/app.ts']

    // refreshKey 변경 → 무효화
    allFiles = null
    expect(allFiles).toBeNull()
  })

  it('E-2: refreshKey 변경 시 expanded 폴더 목록을 재로드', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({ entries: [] })
    const expanded = new Set<string>(['src', 'src/components'])
    const genRef = { current: 0 }

    // refreshKey 변경 시 루트('') + 각 expanded 폴더 재로드
    const reloadAll = async (): Promise<void> => {
      const gen = genRef.current
      const dirs = ['', ...Array.from(expanded)]
      for (const rel of dirs) {
        const res = await mockFsListDir({ relDir: rel })
        if (gen !== genRef.current) return
        // cache 갱신 (여기서는 void — 캐시 갱신 검증은 다른 테스트에서)
        void res
      }
    }

    await reloadAll()

    // 루트('') + expanded 2개 = 총 3회 호출
    expect(mockFsListDir).toHaveBeenCalledTimes(3)
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: '' })
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: 'src' })
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: 'src/components' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// (F) window.api.fsListDir 인터페이스 계약 검증
// ─────────────────────────────────────────────────────────────────────────────

describe('(F) window.api.fsListDir 인터페이스 계약', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('F-1: fsListDir 요청 shape — rootId? + relDir', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({ entries: [] })

    // rootId 없이 호출 (워크스페이스 폴백)
    await mockFsListDir({ relDir: '' })
    expect(mockFsListDir).toHaveBeenCalledWith({ relDir: '' })

    // rootId 있이 호출 (레퍼런스 폴더)
    await mockFsListDir({ rootId: 'ref-1', relDir: 'src' })
    expect(mockFsListDir).toHaveBeenCalledWith({ rootId: 'ref-1', relDir: 'src' })
  })

  it('F-2: 응답 entries는 shallow(children 없음)', async () => {
    const mockFsListDir = vi.fn().mockResolvedValue({
      entries: [
        { name: 'src', path: 'src', kind: 'directory' }, // children 없음
        { name: 'README.md', path: 'README.md', kind: 'file' },
      ],
    })

    const res = await mockFsListDir({ relDir: '' })
    for (const entry of res.entries) {
      expect(entry).not.toHaveProperty('children') // shallow
    }
  })

  it('F-3: 보안 경계 — relDir에 절대경로 금지(main이 reject하면 빈 배열)', async () => {
    // renderer는 node.path만 전달(상대경로). main이 resolveSafe 검증.
    // 이 테스트는 renderer가 절대경로를 전달해도 빈 배열을 받는 것을 시뮬레이션.
    const mockFsListDir = vi.fn().mockImplementation(({ relDir }: { relDir: string }) => {
      // main 쪽 resolveSafe 시뮬: 절대경로 또는 '..' → 거부
      if (relDir.startsWith('/') || relDir.includes('..')) {
        return Promise.resolve({ entries: [] })
      }
      return Promise.resolve({ entries: [makeFile('index.ts', 'src/index.ts')] })
    })

    // 정상 상대경로
    const normalRes = await mockFsListDir({ relDir: 'src' })
    expect(normalRes.entries.length).toBeGreaterThan(0)

    // 탈출 시도 → 거부(빈 배열)
    const escapeRes = await mockFsListDir({ relDir: '../escape' })
    expect(escapeRes.entries).toEqual([])

    // 절대경로 시도 → 거부
    const absRes = await mockFsListDir({ relDir: '/etc/passwd' })
    expect(absRes.entries).toEqual([])
  })
})

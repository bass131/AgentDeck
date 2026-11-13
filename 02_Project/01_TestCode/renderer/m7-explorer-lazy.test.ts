// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { FileTreeNode } from '../../../02_Project/00_Source/shared/ipcContract'
import {
  computeHits,
  getAncestors,
  allDirsToLoad,
  normalizeToRel,
  buildChgMaps,
} from '../../../02_Project/00_Source/renderer/src/features/file/FileExplorer'

function makeDir(name: string, path: string, children?: FileTreeNode[]): FileTreeNode {
  return { name, path, kind: 'directory', children }
}

describe('(B) 검색 listFiles 전환 — 깊은 파일 검색 (computeHits)', () => {
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
    const hits = computeHits(FLAT_FILES, 'index')
    expect(hits).toContain('src/index.ts')
  })

  it('B-2: 아주 깊은 파일(deep/a/b/c/utils.ts) 검색 가능', () => {
    const hits = computeHits(FLAT_FILES, 'utils')
    expect(hits).toContain('deep/a/b/c/utils.ts')
  })

  it('B-3: 파일명 startswith 우선 정렬', () => {
    const hits = computeHits(FLAT_FILES, 'app')
    expect(hits[0]).toBe('src/app.ts')
  })

  it('B-4: 경로 매치(이름 아님) — node_modules/lodash/index.js', () => {
    const hits = computeHits(FLAT_FILES, 'lodash')
    expect(hits).toContain('node_modules/lodash/index.js')
  })

  it('B-5: 빈 쿼리 → 빈 배열', () => {
    expect(computeHits(FLAT_FILES, '')).toEqual([])
    expect(computeHits(FLAT_FILES, '   ')).toEqual([])
  })

  it('B-6: allFiles가 빈 배열 → 빈 배열 (null은 호출부가 먼저 거른다)', () => {
    expect(computeHits([], 'index')).toEqual([])
  })

  it('B-7: 검색 결과 상한(limit=3) 적용', () => {
    const hits = computeHits(FLAT_FILES, 'ts', 3)
    expect(hits.length).toBeLessThanOrEqual(3)
  })

  it('B-8: listFiles 기반이므로 lazy 트리 깊이와 무관하게 동작', () => {
    const lazyTreeOnlyRoot = [makeDir('src', 'src')]
    const childrenFromTree = lazyTreeOnlyRoot.flatMap((n) => n.children ?? [])
    const indexInTree = childrenFromTree.find((n) => n.path === 'src/index.ts')
    expect(indexInTree).toBeUndefined()

    const hits = computeHits(['src/index.ts', 'src/app.ts'], 'index')
    expect(hits).toContain('src/index.ts')
  })
})

describe('(C) prefs 상대경로 저장/복원', () => {
  it('C-2: 깊은 폴더(a/b/c) 복원 시 필요한 조상 목록 추출 (getAncestors)', () => {
    expect(getAncestors('a/b/c')).toEqual(['a', 'a/b'])
    expect(getAncestors('src/components')).toEqual(['src'])
    expect(getAncestors('src')).toEqual([])
    expect(getAncestors('')).toEqual([])
  })

  it('C-3: 조상 폴더도 포함한 전체 로드 목록 계산 (allDirsToLoad — 중복 없는 배열)', () => {
    const dirs = allDirsToLoad(['a/b/c'])
    expect(dirs).toContain('a')
    expect(dirs).toContain('a/b')
    expect(dirs).toContain('a/b/c')
    expect(dirs).toHaveLength(3)

    const overlapped = allDirsToLoad(['a/b', 'a/b/c'])
    expect(new Set(overlapped).size).toBe(overlapped.length)
    expect(overlapped).toHaveLength(3)
  })

  it('C-4: 하위호환 — 절대경로 prefs를 root-상대 변환 (normalizeToRel)', () => {
    const root = '/home/user/project'
    expect(normalizeToRel(['/home/user/project/src/components'], root)).toEqual(['src/components'])

    // 루트 밖 절대경로·상위 탈출 경로는 결과에서 빠진다
    expect(normalizeToRel(['/etc/passwd'], root)).toEqual([])
    expect(normalizeToRel(['../escape'], root)).toEqual([])

    // 이미 상대경로로 저장된 값은 그대로 남는다
    expect(normalizeToRel(['src/lib'], root)).toEqual(['src/lib'])
  })

  it('C-5: Windows 구분자와 루트 끝 슬래시를 정규화한다', () => {
    expect(normalizeToRel(['C:\\work\\proj\\src\\lib'], 'C:\\work\\proj\\')).toEqual(['src/lib'])
  })
})

describe('(D) 조상 dir 롤업 (buildChgMaps)', () => {
  type Tag = 'new' | 'edit'
  function tagged(entries: Array<[string, Tag]>): { changed: Set<string>; tags: Map<string, Tag> } {
    return { changed: new Set(entries.map(([p]) => p)), tags: new Map(entries) }
  }

  it('D-1: changed=[{path:"a/b/c.ts", tag:"new"}] → dirs에 "a"·"a/b"', () => {
    const { changed, tags } = tagged([['a/b/c.ts', 'new']])
    const { files, dirs } = buildChgMaps(changed, tags, false)
    expect(files.get('a/b/c.ts')).toBe('new')
    expect(dirs.get('a/b')).toBe('new')
    expect(dirs.get('a')).toBe('new')
  })

  it('D-2: edit 파일 — 조상 dirs edit', () => {
    const { changed, tags } = tagged([['src/index.ts', 'edit']])
    const { files, dirs } = buildChgMaps(changed, tags, false)
    expect(files.get('src/index.ts')).toBe('edit')
    expect(dirs.get('src')).toBe('edit')
  })

  it('D-3: new 우선 — edit 이후 new가 같은 조상이면 new로 덮어씀', () => {
    const { changed, tags } = tagged([
      ['src/a.ts', 'edit'],
      ['src/b.ts', 'new'],
    ])
    const { files, dirs } = buildChgMaps(changed, tags, false)
    expect(dirs.get('src')).toBe('new')
    expect(files.get('src/a.ts')).toBe('edit')
    expect(files.get('src/b.ts')).toBe('new')
  })

  it('D-4: new 이후 edit가 같은 조상이면 new 유지(edit로 덮어쓰기 안 됨)', () => {
    const { changed, tags } = tagged([
      ['src/b.ts', 'new'],
      ['src/a.ts', 'edit'],
    ])
    const { dirs } = buildChgMaps(changed, tags, false)
    expect(dirs.get('src')).toBe('new')
  })

  it('D-5: viewing=true이면 changed 무시 (참고 폴더 보기 중)', () => {
    const { changed, tags } = tagged([['src/index.ts', 'new']])
    const { files, dirs } = buildChgMaps(changed, tags, true)
    expect(files.size).toBe(0)
    expect(dirs.size).toBe(0)
  })

  it('D-6: 단일 레벨 파일(루트 직속) — 조상 없음', () => {
    const { changed, tags } = tagged([['README.md', 'new']])
    const { files, dirs } = buildChgMaps(changed, tags, false)
    expect(files.get('README.md')).toBe('new')
    expect(dirs.size).toBe(0)
  })

  it('D-7: 복수 파일 중첩 조상 집계', () => {
    const { changed, tags } = tagged([
      ['a/b/c.ts', 'new'],
      ['a/d.ts', 'edit'],
    ])
    const { dirs } = buildChgMaps(changed, tags, false)
    expect(dirs.get('a')).toBe('new')
    expect(dirs.get('a/b')).toBe('new')
  })

  it('D-8: 태그 맵이 비면 changed 집합 전부를 edit로 롤업한다', () => {
    const { files, dirs } = buildChgMaps(new Set(['a/b/c.ts', 'x.ts']), new Map(), false)
    expect(files.get('a/b/c.ts')).toBe('edit')
    expect(files.get('x.ts')).toBe('edit')
    expect(dirs.get('a')).toBe('edit')
    expect(dirs.get('a/b')).toBe('edit')
  })
})

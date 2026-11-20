// 작업 ID: m7 · 옛 이름 m7-explorer-lazy.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { FileTreeNode } from '../../../../02_Project/00_Source/shared/ipcContract'
import {
  computeHits,
  getAncestors,
  allDirsToLoad,
  normalizeToRel,
  buildChgMaps,
} from '@renderer/07_Workspace/file/explorerTree'

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

  // M11 G2 — M05 Backlog 25. 루트 밖 Windows 절대 경로(다른 드라이브·UNC)가 상대 경로로 남아 통과하던 틈.
  it('C-6: 루트 밖 Windows 절대 경로(드라이브·UNC)는 빠지고, `..`로 시작하는 이름만인 폴더는 남는다', () => {
    const root = 'C:\\work\\proj'
    expect(normalizeToRel(['D:\\other\\src'], root)).toEqual([])
    expect(normalizeToRel(['C:\\elsewhere\\src'], root)).toEqual([])
    expect(normalizeToRel(['\\\\server\\share\\src'], root)).toEqual([])
    expect(normalizeToRel(['c:\\work\\proj\\src'], root)).toEqual(['src'])
    expect(normalizeToRel(['..cache/x'], root)).toEqual(['..cache/x'])
    expect(normalizeToRel(['..', '../up'], root)).toEqual([])
  })
})

// 앱의 변경 표시는 모두 edit(M)이다 — 닿지 않던 'new' 우선 규칙은 지웠다(M05 Backlog 20).
describe('(D) 조상 dir 롤업 (buildChgMaps)', () => {
  it('D-2: edit 파일 — 조상 dirs edit', () => {
    const { files, dirs } = buildChgMaps(new Set(['src/index.ts']), false)
    expect(files.get('src/index.ts')).toBe('edit')
    expect(dirs.get('src')).toBe('edit')
  })

  it('D-5: viewing=true이면 changed 무시 (참고 폴더 보기 중)', () => {
    const { files, dirs } = buildChgMaps(new Set(['src/index.ts']), true)
    expect(files.size).toBe(0)
    expect(dirs.size).toBe(0)
  })

  it('D-6: 단일 레벨 파일(루트 직속) — 조상 없음', () => {
    const { files, dirs } = buildChgMaps(new Set(['README.md']), false)
    expect(files.get('README.md')).toBe('edit')
    expect(dirs.size).toBe(0)
  })

  it('D-8: changed 집합 전부를 edit로 롤업한다(중첩 조상 포함)', () => {
    const { files, dirs } = buildChgMaps(new Set(['a/b/c.ts', 'a/d.ts', 'x.ts']), false)
    expect([...files.keys()].sort()).toEqual(['a/b/c.ts', 'a/d.ts', 'x.ts'])
    expect([...dirs.entries()].sort()).toEqual([['a', 'edit'], ['a/b', 'edit']])
  })
})

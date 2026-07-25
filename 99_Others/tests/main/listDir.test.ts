/**
 * listDir.test.ts — listDir + FS_LIST_DIR rootId 게이트 단위 테스트 (Phase 35 TDD)
 *
 * 신뢰경계(CRITICAL):
 *   - listDir(root, '../escape') → [] (resolveSafe null → 거부)
 *   - 절대경로 relDir → []
 *   - 정상 rel → 1레벨 entries, path=root-상대 POSIX, 폴더우선 알파벳 정렬
 *
 * rootId 게이트 — ipc 핸들러는 vitest에서 직접 테스트 불가(electron 의존).
 *   대신 listDir 순수 함수 + resolveSafe containment를 집중 테스트.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { listDir } from '../../../02.Source/main/02_fs/workspace'

// ── 임시 파일 트리 픽스처 ─────────────────────────────────────────────────────
// 구조:
//   root/
//     a.ts          (파일)
//     b.txt         (파일)
//     alpha/        (디렉토리)
//       nested.ts
//     zeta/         (디렉토리)
//       deep.ts
//     node_modules/ (디렉토리 — 필터 없이 표시)
//       pkg.js
let tmpRoot: string

beforeAll(() => {
  tmpRoot = join(tmpdir(), `agentdeck-listdir-test-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })

  // 루트 파일
  writeFileSync(join(tmpRoot, 'a.ts'), 'export const a = 1')
  writeFileSync(join(tmpRoot, 'b.txt'), 'hello')

  // 디렉토리들
  mkdirSync(join(tmpRoot, 'alpha'), { recursive: true })
  writeFileSync(join(tmpRoot, 'alpha', 'nested.ts'), '')

  mkdirSync(join(tmpRoot, 'zeta'), { recursive: true })
  writeFileSync(join(tmpRoot, 'zeta', 'deep.ts'), '')

  // node_modules — 탐색기는 필터 없이 표시(원본 fidelity)
  mkdirSync(join(tmpRoot, 'node_modules'), { recursive: true })
  writeFileSync(join(tmpRoot, 'node_modules', 'pkg.js'), '')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ── 신뢰경계: resolveSafe containment ────────────────────────────────────────

describe('listDir — resolveSafe containment (신뢰경계 CRITICAL)', () => {
  it('../escape 상대경로 탈출 → [] 반환', async () => {
    const result = await listDir(tmpRoot, '../escape')
    expect(result).toEqual([])
  })

  it('절대경로 relDir → [] 반환', async () => {
    // Windows: C:/Windows, POSIX: /etc
    const absPath = process.platform === 'win32' ? 'C:/Windows' : '/etc'
    const result = await listDir(tmpRoot, absPath)
    expect(result).toEqual([])
  })

  it('.. 단독 → [] 반환', async () => {
    const result = await listDir(tmpRoot, '..')
    expect(result).toEqual([])
  })

  it('sub/../../escape 형태 → [] 반환', async () => {
    const result = await listDir(tmpRoot, 'alpha/../../escape')
    expect(result).toEqual([])
  })
})

// ── 정상 동작: 1레벨 entries ──────────────────────────────────────────────────

describe('listDir — 정상 1레벨 entries', () => {
  it('빈 rel("") → 루트 1레벨 반환 (얕은)', async () => {
    const entries = await listDir(tmpRoot, '')
    expect(entries.length).toBeGreaterThan(0)
    // children 없어야 함 (shallow)
    for (const e of entries) {
      expect(e.children).toBeUndefined()
    }
  })

  it('루트 entries에 a.ts, b.txt, alpha, zeta, node_modules 포함', async () => {
    const entries = await listDir(tmpRoot, '')
    const names = entries.map((e) => e.name)
    expect(names).toContain('a.ts')
    expect(names).toContain('b.txt')
    expect(names).toContain('alpha')
    expect(names).toContain('zeta')
    expect(names).toContain('node_modules') // 필터 없이 표시
  })

  it('node_modules가 필터 없이 표시됨 (원본 fidelity — 탐색기는 실트리)', async () => {
    const entries = await listDir(tmpRoot, '')
    const names = entries.map((e) => e.name)
    expect(names).toContain('node_modules')
  })

  it('서브 폴더 rel 지정 → 해당 폴더 1레벨 entries', async () => {
    const entries = await listDir(tmpRoot, 'alpha')
    const names = entries.map((e) => e.name)
    expect(names).toContain('nested.ts')
  })
})

// ── path = root-상대 POSIX (S4) ────────────────────────────────────────────────

describe('listDir — path = root-상대 POSIX (S4)', () => {
  it('루트 entries의 path = 파일명 (rel 없음)', async () => {
    const entries = await listDir(tmpRoot, '')
    const aNode = entries.find((e) => e.name === 'a.ts')
    expect(aNode?.path).toBe('a.ts')
  })

  it('서브폴더 entries의 path = rel+"/"+name', async () => {
    const entries = await listDir(tmpRoot, 'alpha')
    const nested = entries.find((e) => e.name === 'nested.ts')
    expect(nested?.path).toBe('alpha/nested.ts')
  })

  it('path에 백슬래시 없음 (POSIX 슬래시 전용)', async () => {
    const entries = await listDir(tmpRoot, 'alpha')
    for (const e of entries) {
      expect(e.path).not.toContain('\\')
    }
  })
})

// ── 폴더우선 알파벳 정렬 ─────────────────────────────────────────────────────

describe('listDir — 폴더우선 알파벳 정렬', () => {
  it('디렉토리가 파일보다 먼저 등장', async () => {
    const entries = await listDir(tmpRoot, '')
    const firstFileIdx = entries.findIndex((e) => e.kind === 'file')
    const lastDirIdx = entries.map((e) => e.kind).lastIndexOf('directory')

    // 디렉토리가 있고 파일이 있는 경우: 마지막 dir이 첫 file보다 앞에 있어야 함
    if (firstFileIdx !== -1 && lastDirIdx !== -1) {
      expect(lastDirIdx).toBeLessThan(firstFileIdx)
    }
  })

  it('같은 kind 내에서 알파벳순 정렬', async () => {
    const entries = await listDir(tmpRoot, '')
    const dirs = entries.filter((e) => e.kind === 'directory').map((e) => e.name)
    // alpha < node_modules < zeta 순 (알파벳 case-insensitive)
    const alphaIdx = dirs.indexOf('alpha')
    const zetaIdx = dirs.indexOf('zeta')
    if (alphaIdx !== -1 && zetaIdx !== -1) {
      expect(alphaIdx).toBeLessThan(zetaIdx)
    }
  })
})

// ── shallow (children 없음) ───────────────────────────────────────────────────

describe('listDir — shallow (children 미포함)', () => {
  it('directory entry에 children 없음', async () => {
    const entries = await listDir(tmpRoot, '')
    const dirEntries = entries.filter((e) => e.kind === 'directory')
    for (const d of dirEntries) {
      expect(d.children).toBeUndefined()
    }
  })
})

// ── 에러 처리 ─────────────────────────────────────────────────────────────────

describe('listDir — 에러 처리', () => {
  it('존재하지 않는 rel → [] (unreadable graceful)', async () => {
    const entries = await listDir(tmpRoot, 'nonexistent-folder')
    expect(entries).toEqual([])
  })
})

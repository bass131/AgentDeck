/**
 * list-files.test.ts — listProjectFiles 단위 테스트
 *
 * TDD: 먼저 RED(실패) → 구현 후 GREEN.
 * electron을 import하지 않는 순수 모듈 → node 환경에서 직접 실행 가능.
 *
 * 검증 항목:
 *   - 정상 중첩 트리에서 파일 포함/제외 규칙 (SKIP_DIRS, KEEP_DOT_DIRS)
 *   - 경로 형식: 워크스페이스 루트 기준 상대 POSIX 경로 (슬래시 구분자)
 *   - 빈 입력 → []
 *   - .claude 등 KEEP_DOT_DIRS는 포함
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 구현 모듈 — 이 시점엔 아직 없음 → RED (import 오류)
import { listProjectFiles } from '../../src/main/02_fs/listFiles'

// ── 임시 파일 트리 픽스처 ──────────────────────────────────────────────────────
let tmpRoot: string

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'agentdeck-listfiles-'))

  // 정상 소스 파일
  writeFileSync(join(tmpRoot, 'a.ts'), 'export const a = 1')

  // 중첩 디렉토리
  mkdirSync(join(tmpRoot, 'sub'), { recursive: true })
  writeFileSync(join(tmpRoot, 'sub', 'b.ts'), 'export const b = 2')

  // SKIP_DIRS — node_modules (제외 대상)
  mkdirSync(join(tmpRoot, 'node_modules', 'some-pkg'), { recursive: true })
  writeFileSync(join(tmpRoot, 'node_modules', 'some-pkg', 'x.js'), 'module.exports = {}')

  // SKIP_DIRS — .git (제외 대상)
  mkdirSync(join(tmpRoot, '.git'), { recursive: true })
  writeFileSync(join(tmpRoot, '.git', 'y'), 'ref: refs/heads/main')

  // SKIP_DIRS — dist (제외 대상)
  mkdirSync(join(tmpRoot, 'dist'), { recursive: true })
  writeFileSync(join(tmpRoot, 'dist', 'bundle.js'), 'built')

  // SKIP_DIRS — .next (제외 대상)
  mkdirSync(join(tmpRoot, '.next'), { recursive: true })
  writeFileSync(join(tmpRoot, '.next', 'server.js'), 'built')

  // KEEP_DOT_DIRS — .claude (포함 대상)
  mkdirSync(join(tmpRoot, '.claude'), { recursive: true })
  writeFileSync(join(tmpRoot, '.claude', 'skill.md'), '# skill')

  // KEEP_DOT_DIRS — .github (포함 대상)
  mkdirSync(join(tmpRoot, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(tmpRoot, '.github', 'workflows', 'ci.yml'), 'name: CI')

  // 일반 숨김 디렉토리(KEEP_DOT_DIRS에 없음) — .hidden (제외 대상)
  mkdirSync(join(tmpRoot, '.hidden'), { recursive: true })
  writeFileSync(join(tmpRoot, '.hidden', 'secret.txt'), 'hidden')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ── listProjectFiles ───────────────────────────────────────────────────────────

describe('listProjectFiles', () => {
  it('최상위 파일을 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('a.ts')
  })

  it('중첩 파일을 POSIX 상대 경로로 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    // Windows OS에서도 슬래시 구분자여야 함
    expect(files).toContain('sub/b.ts')
  })

  it('node_modules 하위 파일은 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const nodeModulesFiles = files.filter((f) => f.startsWith('node_modules'))
    expect(nodeModulesFiles).toHaveLength(0)
  })

  it('.git 하위 파일은 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const gitFiles = files.filter((f) => f.startsWith('.git/'))
    expect(gitFiles).toHaveLength(0)
  })

  it('dist 하위 파일은 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const distFiles = files.filter((f) => f.startsWith('dist/'))
    expect(distFiles).toHaveLength(0)
  })

  it('.next 하위 파일은 제외한다 (SKIP_DIRS)', async () => {
    const files = await listProjectFiles(tmpRoot)
    const nextFiles = files.filter((f) => f.startsWith('.next/'))
    expect(nextFiles).toHaveLength(0)
  })

  it('KEEP_DOT_DIRS인 .claude 하위 파일은 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('.claude/skill.md')
  })

  it('KEEP_DOT_DIRS인 .github/workflows 파일은 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('.github/workflows/ci.yml')
  })

  it('KEEP_DOT_DIRS에 없는 숨김 디렉토리(.hidden)는 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const hiddenFiles = files.filter((f) => f.startsWith('.hidden/'))
    expect(hiddenFiles).toHaveLength(0)
  })

  it('경로 구분자는 항상 POSIX 슬래시다 (Windows 백슬래시 없음)', async () => {
    const files = await listProjectFiles(tmpRoot)
    const backslashFiles = files.filter((f) => f.includes('\\'))
    expect(backslashFiles).toHaveLength(0)
  })

  it('빈 문자열 입력은 [] 를 반환한다', async () => {
    const files = await listProjectFiles('')
    expect(files).toEqual([])
  })

  it('반환값은 배열이다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(Array.isArray(files)).toBe(true)
  })
})

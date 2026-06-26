/**
 * fs-diff-head.test.ts — FS_DIFF 핸들러 "빈 기준" 버그 수정 TDD
 *
 * 버그: 기존 ipc/index.ts FS_DIFF 핸들러는 snapshotContent='' 를 고정으로 사용하여
 *   변경 파일 전체가 add로 표시됨. 이 테스트가 HEAD 기준 diff를 강제한다.
 *
 * 전략:
 *   - resolveFsDiffLines(root, relPath) 순수 함수 단위 테스트
 *     (ipcMain.handle 없이 직접 호출 가능 → vitest node 환경)
 *   - 임시 git repo 픽스처 재사용 (git.test.ts 패턴과 동일)
 *   - 케이스 3종:
 *     A) 커밋 후 수정 → remove/add 존재, 전부 add X
 *     B) 새 파일(untracked) → 전부 add
 *     C) 비-git 디렉토리 → 전부 add (fallback)
 *
 * CRITICAL: electron import 없는 순수 모듈만 import.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

// 구현 대상: src/main/02_fs/diff.ts 에서 export될 함수
// 아직 없으면 RED (import 실패 → 테스트 실패)
import { resolveFsDiffLines } from '../../src/main/02_fs/diff'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

let repoDir: string
const TRACKED_FILE = 'sample.ts'

function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'agentdeck-fsdiff-'))

  sh('git', ['init'], repoDir)
  sh('git', ['config', 'user.email', 'test@agentdeck.test'], repoDir)
  sh('git', ['config', 'user.name', 'AgentDeck Test'], repoDir)

  // 초기 파일 커밋 (HEAD 스냅샷 기준)
  writeFileSync(join(repoDir, TRACKED_FILE), 'const a = 1\nconst b = 2\nconst c = 3\n')
  sh('git', ['add', TRACKED_FILE], repoDir)
  sh('git', ['commit', '-m', 'feat: initial commit'], repoDir)
})

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true })
})

// ── 케이스 A: 커밋된 파일 수정 → HEAD 기준 부분 diff ─────────────────────────

describe('resolveFsDiffLines — 커밋 후 수정 (HEAD 기준 diff)', () => {
  it('HEAD와 동일한 파일은 add/remove가 없다 (전부 context)', async () => {
    // 디스크 파일이 HEAD와 동일한 상태
    const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)
    const adds = lines.filter((l) => l.kind === 'add')
    const removes = lines.filter((l) => l.kind === 'remove')
    expect(adds).toHaveLength(0)
    expect(removes).toHaveLength(0)
  })

  it('파일을 수정하면 변경된 줄만 add/remove로 표시한다 (전부 add 아님)', async () => {
    // b 라인을 수정: HEAD는 'const b = 2', 디스크는 'const b = 999'
    const filePath = join(repoDir, TRACKED_FILE)
    writeFileSync(filePath, 'const a = 1\nconst b = 999\nconst c = 3\n')

    try {
      const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)

      // context 라인이 존재해야 한다 (a와 c는 변경 없음)
      const contexts = lines.filter((l) => l.kind === 'context')
      expect(contexts.length).toBeGreaterThan(0)

      // add가 존재해야 한다 (b = 999)
      const adds = lines.filter((l) => l.kind === 'add')
      expect(adds.length).toBeGreaterThan(0)

      // remove가 존재해야 한다 (b = 2 제거)
      const removes = lines.filter((l) => l.kind === 'remove')
      expect(removes.length).toBeGreaterThan(0)

      // 핵심 단언: 전부 add가 아니어야 한다 (빈 기준 버그 방지)
      const allAdd = lines.every((l) => l.kind === 'add')
      expect(allAdd).toBe(false)
    } finally {
      // HEAD 상태로 복원
      writeFileSync(filePath, 'const a = 1\nconst b = 2\nconst c = 3\n')
    }
  })

  it('add 라인 content에 수정된 값이 포함된다', async () => {
    const filePath = join(repoDir, TRACKED_FILE)
    writeFileSync(filePath, 'const a = 1\nconst b = 999\nconst c = 3\n')

    try {
      const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)
      const adds = lines.filter((l) => l.kind === 'add')
      const addContents = adds.map((l) => l.content)
      expect(addContents.some((c) => c.includes('999'))).toBe(true)
    } finally {
      writeFileSync(filePath, 'const a = 1\nconst b = 2\nconst c = 3\n')
    }
  })

  it('remove 라인 content에 이전 값이 포함된다', async () => {
    const filePath = join(repoDir, TRACKED_FILE)
    writeFileSync(filePath, 'const a = 1\nconst b = 999\nconst c = 3\n')

    try {
      const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)
      const removes = lines.filter((l) => l.kind === 'remove')
      const removeContents = removes.map((l) => l.content)
      // HEAD의 'const b = 2' 가 remove로 나와야 한다
      expect(removeContents.some((c) => c.includes('2'))).toBe(true)
    } finally {
      writeFileSync(filePath, 'const a = 1\nconst b = 2\nconst c = 3\n')
    }
  })
})

// ── 케이스 B: 새 파일 (untracked, HEAD에 없음) → 전부 add ─────────────────

describe('resolveFsDiffLines — 새 파일(untracked)', () => {
  it('HEAD에 없는 새 파일은 모든 라인이 add다', async () => {
    const newFile = 'brandnew.ts'
    const filePath = join(repoDir, newFile)
    writeFileSync(filePath, 'export const x = 1\nexport const y = 2\n')

    try {
      const lines = await resolveFsDiffLines(repoDir, newFile)
      expect(lines.length).toBeGreaterThan(0)
      // 전부 add여야 한다 (remove나 context 없음)
      expect(lines.every((l) => l.kind === 'add')).toBe(true)
    } finally {
      rmSync(filePath)
    }
  })
})

// ── 케이스 C: 비-git 디렉토리 → 전부 add (기존 동작 유지) ──────────────────

describe('resolveFsDiffLines — 비-git 디렉토리 (fallback)', () => {
  it('git repo가 아닌 디렉토리에서는 모든 라인이 add다', async () => {
    const nogitDir = mkdtempSync(join(tmpdir(), 'agentdeck-nogit-'))
    const testFile = 'test.ts'
    writeFileSync(join(nogitDir, testFile), 'const a = 1\nconst b = 2\n')

    try {
      const lines = await resolveFsDiffLines(nogitDir, testFile)
      expect(lines.length).toBeGreaterThan(0)
      // 비-git: snapshotContent='' 폴백 → 전부 add
      expect(lines.every((l) => l.kind === 'add')).toBe(true)
    } finally {
      rmSync(nogitDir, { recursive: true, force: true })
    }
  })
})

// ── DiffLine 타입 정합 ────────────────────────────────────────────────────────

describe('resolveFsDiffLines — 반환 타입', () => {
  it('반환값은 DiffLine[] 형태다', async () => {
    const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)
    expect(Array.isArray(lines)).toBe(true)
    for (const l of lines) {
      expect(['add', 'remove', 'context']).toContain(l.kind)
      expect(typeof l.content).toBe('string')
    }
  })

  it('존재하지 않는 파일은 빈 배열을 반환한다', async () => {
    const lines = await resolveFsDiffLines(repoDir, 'ghost.ts')
    expect(lines).toEqual([])
  })
})

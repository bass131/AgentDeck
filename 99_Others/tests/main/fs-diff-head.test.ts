import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

import { resolveFsDiffLines } from '../../../02_Source/main/02_fs/diff'

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

  writeFileSync(join(repoDir, TRACKED_FILE), 'const a = 1\nconst b = 2\nconst c = 3\n')
  sh('git', ['add', TRACKED_FILE], repoDir)
  sh('git', ['commit', '-m', 'feat: initial commit'], repoDir)
})

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true })
})

describe('resolveFsDiffLines — 커밋 후 수정 (HEAD 기준 diff)', () => {
  it('HEAD와 동일한 파일은 add/remove가 없다 (전부 context)', async () => {
    const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)
    const adds = lines.filter((l) => l.kind === 'add')
    const removes = lines.filter((l) => l.kind === 'remove')
    expect(adds).toHaveLength(0)
    expect(removes).toHaveLength(0)
  })

  it('파일을 수정하면 변경된 줄만 add/remove로 표시한다 (전부 add 아님)', async () => {
    const filePath = join(repoDir, TRACKED_FILE)
    writeFileSync(filePath, 'const a = 1\nconst b = 999\nconst c = 3\n')

    try {
      const lines = await resolveFsDiffLines(repoDir, TRACKED_FILE)

      const contexts = lines.filter((l) => l.kind === 'context')
      expect(contexts.length).toBeGreaterThan(0)

      const adds = lines.filter((l) => l.kind === 'add')
      expect(adds.length).toBeGreaterThan(0)

      const removes = lines.filter((l) => l.kind === 'remove')
      expect(removes.length).toBeGreaterThan(0)

      const allAdd = lines.every((l) => l.kind === 'add')
      expect(allAdd).toBe(false)
    } finally {
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
      expect(removeContents.some((c) => c.includes('2'))).toBe(true)
    } finally {
      writeFileSync(filePath, 'const a = 1\nconst b = 2\nconst c = 3\n')
    }
  })
})

describe('resolveFsDiffLines — 새 파일(untracked)', () => {
  it('HEAD에 없는 새 파일은 모든 라인이 add다', async () => {
    const newFile = 'brandnew.ts'
    const filePath = join(repoDir, newFile)
    writeFileSync(filePath, 'export const x = 1\nexport const y = 2\n')

    try {
      const lines = await resolveFsDiffLines(repoDir, newFile)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.every((l) => l.kind === 'add')).toBe(true)
    } finally {
      rmSync(filePath)
    }
  })
})

describe('resolveFsDiffLines — 비-git 디렉토리 (fallback)', () => {
  it('git repo가 아닌 디렉토리에서는 모든 라인이 add다', async () => {
    const nogitDir = mkdtempSync(join(tmpdir(), 'agentdeck-nogit-'))
    const testFile = 'test.ts'
    writeFileSync(join(nogitDir, testFile), 'const a = 1\nconst b = 2\n')

    try {
      const lines = await resolveFsDiffLines(nogitDir, testFile)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.every((l) => l.kind === 'add')).toBe(true)
    } finally {
      rmSync(nogitDir, { recursive: true, force: true })
    }
  })
})

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

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

import { resolveFsDiffLines } from '../../../02_Source/main/02_fs/diff'

let parentDir: string
let wsDir: string

const TRACKED_FILE = 'sample.ts'
const NESTED_FILE = 'sub/nested.ts'
const SECRET_FILE = 'outside-secret.txt'
const SECRET_MARK = 'TOP_SECRET_OUTSIDE_ROOT'

function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}

beforeAll(() => {
  parentDir = mkdtempSync(join(tmpdir(), 'agentdeck-fsdiff-containment-'))

  writeFileSync(join(parentDir, SECRET_FILE), `${SECRET_MARK}=1\nline2\nline3\n`)

  wsDir = join(parentDir, 'ws')
  mkdirSync(wsDir)
  mkdirSync(join(wsDir, 'sub'))

  sh('git', ['init'], wsDir)
  sh('git', ['config', 'user.email', 'test@agentdeck.test'], wsDir)
  sh('git', ['config', 'user.name', 'AgentDeck Test'], wsDir)

  writeFileSync(join(wsDir, TRACKED_FILE), 'const a = 1\nconst b = 2\nconst c = 3\n')
  writeFileSync(join(wsDir, 'sub', 'nested.ts'), 'export const n = 1\nexport const m = 2\n')
  sh('git', ['add', '-A'], wsDir)
  sh('git', ['commit', '-m', 'feat: fixture'], wsDir)
})

afterAll(() => {
  rmSync(parentDir, { recursive: true, force: true })
})

describe('resolveFsDiffLines — 경로 탈출 자체 재검증 (신뢰경계 CRITICAL, C1)', () => {
  it("[RED] '..' 한 단계 탈출은 거부되어 빈 배열을 반환한다", async () => {
    const lines = await resolveFsDiffLines(wsDir, `../${SECRET_FILE}`)
    expect(lines).toEqual([])
  })

  it('[RED] 루트 밖 파일 내용이 diff 라인으로 새지 않는다', async () => {
    const lines = await resolveFsDiffLines(wsDir, `../${SECRET_FILE}`)
    const leaked = lines.map((l) => l.content).join('\n')
    expect(leaked).not.toContain(SECRET_MARK)
  })

  it("[RED] 하위폴더를 경유한 중첩 탈출('sub/../../…')도 거부된다", async () => {
    const lines = await resolveFsDiffLines(wsDir, `sub/../../${SECRET_FILE}`)
    expect(lines).toEqual([])
  })

  it('[RED] 깊은 상위 탈출도 거부된다', async () => {
    const lines = await resolveFsDiffLines(wsDir, `sub/../sub/../../${SECRET_FILE}`)
    expect(lines).toEqual([])
  })

  it("[GREEN·성질핀] 백슬래시 탈출('..\\…')도 거부된다 (Windows 구분자 변형)", async () => {
    const lines = await resolveFsDiffLines(wsDir, `..\\${SECRET_FILE}`)
    expect(lines).toEqual([])
    expect(lines.map((l) => l.content).join('\n')).not.toContain(SECRET_MARK)
  })

  it('[GREEN·회귀가드] 루트 밖 절대경로는 (지금도) 빈 배열이며 방어 후에도 그대로다', async () => {
    const lines = await resolveFsDiffLines(wsDir, join(parentDir, SECRET_FILE))
    expect(lines).toEqual([])
  })
})

describe('resolveFsDiffLines — 정상 입력 거동 보존 (C1 방어가 깨면 안 되는 것)', () => {
  it('[GREEN] 루트 직하 추적 파일은 diff 라인을 반환한다(HEAD 동일 → 전부 context)', async () => {
    const lines = await resolveFsDiffLines(wsDir, TRACKED_FILE)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.kind === 'context')).toBe(true)
  })

  it('[GREEN] 하위폴더 파일(sub/nested.ts)도 정상 처리된다', async () => {
    const lines = await resolveFsDiffLines(wsDir, NESTED_FILE)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.kind === 'context')).toBe(true)
  })

  it('[GREEN] 수정된 파일은 add/remove/context가 함께 나온다', async () => {
    const filePath = join(wsDir, TRACKED_FILE)
    writeFileSync(filePath, 'const a = 1\nconst b = 999\nconst c = 3\n')
    try {
      const lines = await resolveFsDiffLines(wsDir, TRACKED_FILE)
      expect(lines.some((l) => l.kind === 'add')).toBe(true)
      expect(lines.some((l) => l.kind === 'remove')).toBe(true)
      expect(lines.some((l) => l.kind === 'context')).toBe(true)
    } finally {
      writeFileSync(filePath, 'const a = 1\nconst b = 2\nconst c = 3\n')
    }
  })

  it("[GREEN] './' 접두 상대경로는 탈출이 아니므로 거부되지 않는다", async () => {
    const lines = await resolveFsDiffLines(wsDir, `./${TRACKED_FILE}`)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('[GREEN] 루트에 뒤따르는 슬래시가 있어도 결과가 동일하다', async () => {
    const base = await resolveFsDiffLines(wsDir, TRACKED_FILE)
    const withSlash = await resolveFsDiffLines(`${wsDir}/`, TRACKED_FILE)
    expect(withSlash).toEqual(base)
  })

  it('[GREEN] 존재하지 않는 파일은 여전히 빈 배열이다', async () => {
    const lines = await resolveFsDiffLines(wsDir, 'ghost.ts')
    expect(lines).toEqual([])
  })
})

describe('resolveFsDiffLines — 거동 불변 핀 (구현 분기점, C1)', () => {
  it('[GREEN] 루트 *안쪽* 절대경로도 기존과 동일하게 빈 배열이다', async () => {
    const lines = await resolveFsDiffLines(wsDir, join(wsDir, TRACKED_FILE))
    expect(lines).toEqual([])
  })
})

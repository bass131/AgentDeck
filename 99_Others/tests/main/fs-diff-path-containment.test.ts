/**
 * fs-diff-path-containment.test.ts — RS1 Phase 07 / C1 심층방어 TDD (red 선행)
 *
 * 무엇을 강제하는가:
 *   `resolveFsDiffLines(root, relPath)` 는 상류(00_ipc/handlers/fs.ts)에서 이미
 *   `resolveSafe` 게이트를 통과한 경로를 받는다고 *전제*하고, 내부에서는
 *   문자열 결합만으로 절대경로를 만든다(diff.ts:169).
 *   → 전제가 깨지면(리팩토링·새 호출부) 경로 탈출이 그대로 통과한다.
 *   본 테스트는 함수가 *스스로* containment 를 재검증하도록 강제한다(defense in depth).
 *
 * 기대 계약(새 에러 형태를 발명하지 않는다):
 *   - `resolveSafe(root, relPath)` 가 null(= 루트 밖) 이면 이 함수는 `[]` 를 반환한다.
 *     기존 폴백(미존재 파일·바이너리)과 동일한 "빈 응답" 형태 — throw 하지 않는다.
 *     상류 핸들러도 탈출 시 `{ lines: [] }` 를 돌려주므로 응답 형태가 일치한다.
 *
 * red/green 라벨:
 *   [RED]   방어가 없는 현재 구현에서 실패해야 하는 단언.
 *   [GREEN] 지금도 통과하며 방어 추가 후에도 통과해야 하는 보존 단언(Phase 함정 절).
 *
 * 결정론:
 *   - 시간·랜덤·네트워크 의존 없음. 심볼릭 링크는 Windows에서 권한이 필요해
 *     플래키하므로 의도적으로 제외한다(resolveSafe 2단계는 workspace.test.ts 소관).
 *   - git 버전에 따라 `HEAD:./path` 해석이 갈릴 수 있는 단언은 피하고,
 *     "빈 배열인가 / 기준 호출과 동일한가" 처럼 버전 무관한 성질만 본다.
 *
 * CRITICAL: electron import 없는 순수 모듈만 import (vitest node 환경).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

import { resolveFsDiffLines } from '../../../02_Source/main/02_fs/diff'

// ── 픽스처 ────────────────────────────────────────────────────────────────────
//
//   parentDir/
//     outside-secret.txt   ← 루트 *밖* 파일 (탈출 표적)
//     ws/                  ← 워크스페이스 루트 (git repo)
//       sample.ts
//       sub/nested.ts

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

  // 루트 밖 표적 파일 — 탈출이 성공하면 이 내용이 diff 라인으로 새어 나온다.
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

// ── [RED] 경로 탈출 자체 재검증 ───────────────────────────────────────────────

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

  it('[GREEN·회귀가드] 루트 밖 절대경로는 (지금도) 빈 배열이며 방어 후에도 그대로다', async () => {
    // 현재는 문자열 결합이 `<ws>/<절대경로>` 라는 존재하지 않는 경로를 만들어
    // *우연히* 막힌다. 방어 추가 후에는 resolveSafe 가 명시적으로 막아야 한다.
    const lines = await resolveFsDiffLines(wsDir, join(parentDir, SECRET_FILE))
    expect(lines).toEqual([])
  })
})

// ── [GREEN] 정상 흐름 보존 (Phase 함정 절: 게이트 통과 입력의 거동 불변) ──────

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
    // containment 판정이 과하게 엄격해지면(예: relPath 문자열에 '.' 이 있으면 거부)
    // 여기서 잡힌다. git 버전별 `HEAD:./path` 차이에 걸리지 않게 "빈 배열이 아님"만 본다.
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

// ── [GREEN] 거동 불변 핀 — 구현 선택지가 갈리는 지점 ──────────────────────────

describe('resolveFsDiffLines — 거동 불변 핀 (구현 분기점, C1)', () => {
  it('[GREEN] 루트 *안쪽* 절대경로도 기존과 동일하게 빈 배열이다', async () => {
    // ⚠️ 구현 힌트: resolveSafe 는 "루트 안쪽 절대경로"를 정상으로 보고 non-null 을
    //    돌려준다. 따라서 반환값을 absPath 로 *대체*하면 이 입력이 [] → 실제 diff 로
    //    바뀌어 거동이 변한다(Phase 30번 항목 "거동 불변" 위반).
    //    거동을 보존하려면 resolveSafe 는 *게이트로만* 쓰고(null 이면 return []),
    //    absPath 계산은 기존 문자열 결합을 그대로 둔다.
    //    (상류 핸들러도 safePath 를 버리고 원본 relPath 를 넘기는 같은 형태다.)
    const lines = await resolveFsDiffLines(wsDir, join(wsDir, TRACKED_FILE))
    expect(lines).toEqual([])
  })
})

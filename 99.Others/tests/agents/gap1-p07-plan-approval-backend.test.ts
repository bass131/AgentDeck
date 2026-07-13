/**
 * gap1-p07-plan-approval-backend.test.ts — GAP1 P07 Plan 모드 승인 UI, 백엔드 RED(TDD 선행).
 *
 * 대상(R only, qa는 앱 소스 미편집): 02.Source/main/01_agents/permissionCoordinator.ts
 *   - permissionSummary('ExitPlanMode', {plan, planFilePath}) → generic 'ExitPlanMode 실행'이
 *     아니라 계획 요약(계획 제목/첫 줄 기반)을 표면화해야 한다(P07 (a) 분기).
 *   - makeCanUseTool 경로에서 ExitPlanMode 권한 요청이 발화될 때, push되는
 *     permission_request 이벤트가 planReview 필드(P03 계약, agent-events.ts:445 planReview?)를
 *     담아야 한다 — planReview.plan === input.plan, planReview.planFilePath === input.planFilePath.
 *   - 비-ExitPlanMode 도구(Bash 등)의 permission_request는 planReview 미부여(회귀 0).
 *
 * TDD 상태: RED. 구현 부재(현행 permissionSummary는 'ExitPlanMode 실행' 폴백,
 *   _requestPermission은 {type,requestId,toolName,summary}만 push). 구현 Worker(agent-backend)가
 *   여기 인터페이스에 맞춘다.
 *
 * fixture(실형상): 99.Others/tests/fixtures/gap1-p03/probe-3-exitplan-input.json
 *   = { toolName:'ExitPlanMode', input:{ plan:'# Plan: Print Hello...', planFilePath:'...md' } }
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PermissionCoordinator,
  permissionSummary,
} from '../../../02.Source/main/01_agents/permissionCoordinator'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── fixture 로드 (실형상 — probe③ ExitPlanMode input 캡처) ─────────────────────

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/gap1-p03/', import.meta.url))

interface ExitPlanFixture {
  toolName: string
  input: { plan?: string; planFilePath?: string }
  optsKeys?: string[]
}

function loadExitPlanFixture(): ExitPlanFixture {
  const raw = readFileSync(path.join(FIXTURE_DIR, 'probe-3-exitplan-input.json'), 'utf-8')
  return JSON.parse(raw) as ExitPlanFixture
}

/** push된 이벤트를 수집하는 코디네이터 + 버퍼 생성 (기존 permissionCoordinator.test.ts 패턴 재사용). */
function mk(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

/** permission_request 이벤트를 planReview 필드 접근이 가능한 형태로 좁힌다. */
type PermReqEvent = Extract<AgentEvent, { type: 'permission_request' }>

// ── (1) permissionSummary — ExitPlanMode 분기 ─────────────────────────────────

describe('GAP1 P07 — permissionSummary ExitPlanMode 분기 (RED)', () => {
  it("permissionSummary('ExitPlanMode', input) → generic 'ExitPlanMode 실행'이 아니다", () => {
    const { input } = loadExitPlanFixture()
    const summary = permissionSummary('ExitPlanMode', input as Record<string, unknown>)
    // 현행: 폴백 `${toolName} 실행` = 'ExitPlanMode 실행' → RED(구현 부재).
    expect(summary).not.toBe('ExitPlanMode 실행')
  })

  it("permissionSummary('ExitPlanMode', input) → 계획 본문에서 유래한 텍스트(제목 'Plan: Print Hello')를 포함한다", () => {
    const { input } = loadExitPlanFixture()
    const summary = permissionSummary('ExitPlanMode', input as Record<string, unknown>)
    // 계획 첫 줄/제목 '# Plan: Print Hello' → 요약이 'Plan: Print Hello'를 표면화해야 한다.
    expect(summary).toContain('Plan: Print Hello')
  })

  it('비-ExitPlanMode 도구는 기존 요약 규약 불변(회귀 0)', () => {
    // 회귀 가드(구현 후에도 green 유지) — plan 분기가 다른 도구 요약을 오염시키지 않아야 한다.
    expect(permissionSummary('Bash', { command: 'ls -la' })).toContain('명령 실행')
    expect(permissionSummary('Write', { file_path: '/a' })).toContain('파일 생성')
    expect(permissionSummary('Glob', {})).toBe('Glob 실행')
  })
})

// ── (2) makeCanUseTool — permission_request planReview payload ─────────────────

describe('GAP1 P07 — permission_request planReview payload (RED)', () => {
  it('ExitPlanMode(mode=plan) 권한 요청 → push된 permission_request가 planReview{plan,planFilePath}를 담는다', async () => {
    const { input } = loadExitPlanFixture()
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('plan', () => false)

    // _requestPermission은 push를 동기 실행 후 respond를 await한다(기존 테스트 패턴).
    const p = canUse('ExitPlanMode', input as Record<string, unknown>)
    expect(pushed.length).toBe(1)
    const req = pushed[0] as PermReqEvent
    expect(req.type).toBe('permission_request')
    expect(req.toolName).toBe('ExitPlanMode')

    // 핵심 단정(RED): planReview 구조화 재노출. 현행 push는 planReview 미포함 → undefined.
    expect(req.planReview).toBeDefined()
    expect(req.planReview?.plan).toBe(input.plan)
    expect(req.planReview?.planFilePath).toBe(input.planFilePath)

    // await가 매달리지 않도록 allow로 resolve.
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    const r = await p
    expect(r.behavior).toBe('allow')
  })

  it('비-ExitPlanMode 도구(Bash)의 permission_request는 planReview 미부여(회귀 0)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: 'ls' })
    const req = pushed[0] as PermReqEvent
    expect(req.type).toBe('permission_request')
    // planReview는 ExitPlanMode 전용 — Bash에는 절대 붙지 않는다.
    expect(req.planReview).toBeUndefined()
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    await p
  })
})

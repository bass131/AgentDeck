/**
 * gap1-p05-hook-cockpit.golden.test.ts — GAP1 P05 훅 콕핏 정규화 골든 (TDD RED)
 *
 * 목표: claude-stream.ts `mapClaudeStreamLine`이 현재 "그 외 system → []"(claude-stream.ts:624)로
 *   드롭하는 훅 콕핏 3종 SDK 원시 신호를, P03에서 선정의된 공통 AgentEvent로 정규화하는지
 *   고정한다. 구현은 후속 agent-backend Worker 몫 — 이 파일은 실패하는 계약(RED)을 먼저 못박는다.
 *   계약 타입(shared/agent-events.ts)은 그대로 소비(변경 금지).
 *
 * 커버 영역(Phase 05 (a)(b)(c)):
 *   (A) 훅 생명주기(S-04) — hook_started/hook_response → hook_lifecycle(phase로 통합).
 *       started↔response 페어링 키 = hook_id(probe① 실측). 실측 fixture probe-1-hooks.jsonl 사용.
 *   (B) informational(S-03) — content/level/prevent_continuation/tool_use_id → informational.
 *       level 리터럴 도메인 밖('bogus') 드롭. 합성 fixture(SDK 선언 유도).
 *   (C) permission_denied(S-07) — tool_name/decision_reason_type/decision_reason → permission_denied.
 *       message/tool_use_id/agent_id는 계약에 없어 미매핑. 합성 fixture(SDK 선언 유도).
 *
 * SDK 원시 타입 정본(node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts):
 *   SDKHookStartedMessage : 3682  SDKHookResponseMessage : 3667  SDKHookProgressMessage : 3654
 *   SDKInformationalMessage : 3695  SDKPermissionDeniedMessage : 3902
 * 합성 fixture(informational.jsonl·permission-denied.jsonl)는 위 선언에서만 유도(임의 발명 금지).
 * 훅 생명주기는 실측 fixture(probe-1-hooks.jsonl, 2026-07-13 includeHookEvents:true 캡처) 사용.
 *
 * 현재(RED) 이유: mapClaudeStreamLine의 system 분기가 hook_started/hook_response/informational/
 *   permission_denied subtype 전부를 "그 외 system → []"(claude-stream.ts:624)로 드롭한다 →
 *   각 필터 결과 []. 구현 후에는 아래 골든과 정확히 일치해야 한다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapClaudeStreamLine } from '../../../02.Source/main/01_agents/claude-stream'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// 실측 fixture: probe①(includeHookEvents:true) — SessionStart/UserPromptSubmit/PreToolUse/
// PostToolUse/Stop 생명주기 페어가 실재하는 캡처. 1번째 줄 hook_started ↔ 2번째 줄 hook_response가
// 동일 hook_id="072425c8-077c-41f5-98ef-a5270a3ef00e"를 공유(페어링 키 실측).
const PROBE_1 = fileURLToPath(
  new URL('../fixtures/gap1-p03/probe-1-hooks.jsonl', import.meta.url)
)
// 합성 fixture(SDK 선언 유도, 임의 발명 0).
const INFORMATIONAL = fileURLToPath(
  new URL('../fixtures/gap1-p05/informational.jsonl', import.meta.url)
)
const PERMISSION_DENIED = fileURLToPath(
  new URL('../fixtures/gap1-p05/permission-denied.jsonl', import.meta.url)
)

/** jsonl 한 줄씩 파싱해 mapClaudeStreamLine에 흘리고 평탄화한 AgentEvent[]를 반환. */
function mapFixture(path: string): AgentEvent[] {
  const raw = readFileSync(path, 'utf8')
  const events: AgentEvent[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    for (const ev of mapClaudeStreamLine(JSON.parse(trimmed))) events.push(ev)
  }
  return events
}

// 판별 predicate — filter가 배열 원소 타입을 좁히도록 명시.
type HookLifecycle = Extract<AgentEvent, { type: 'hook_lifecycle' }>
type Informational = Extract<AgentEvent, { type: 'informational' }>
type PermissionDenied = Extract<AgentEvent, { type: 'permission_denied' }>

const isHookLifecycle = (e: AgentEvent): e is HookLifecycle => e.type === 'hook_lifecycle'
const isInformational = (e: AgentEvent): e is Informational => e.type === 'informational'
const isPermissionDenied = (e: AgentEvent): e is PermissionDenied => e.type === 'permission_denied'

// SessionStart 페어(fixture 1·2번째 줄)의 공유 hook_id — 페어링 키 실측값.
const SESSION_START_HOOK_ID = '072425c8-077c-41f5-98ef-a5270a3ef00e'

// ── (A) 훅 생명주기 (S-04) ───────────────────────────────────────────────────────

describe('gap1-p05 hook_lifecycle 정규화 (S-04, probe① 실측)', () => {
  it('probe-1-hooks의 hook_started/hook_response 6+6쌍 → hook_lifecycle 12건', () => {
    const hooks = mapFixture(PROBE_1).filter(isHookLifecycle)
    // RED: 현재 hook_started/hook_response는 "그 외 system → []"(claude-stream.ts:624)로 드롭 → 0건.
    expect(hooks).toHaveLength(12)
    expect(hooks.filter((h) => h.phase === 'started')).toHaveLength(6)
    expect(hooks.filter((h) => h.phase === 'response')).toHaveLength(6)
  })

  it('SessionStart hook_started → phase:started + hook_id/hook_name/hook_event 정확 매핑', () => {
    const started = mapFixture(PROBE_1)
      .filter(isHookLifecycle)
      .filter((h) => h.phase === 'started' && h.hookId === SESSION_START_HOOK_ID)
    // RED: 드롭 중이라 [] → toEqual 실패.
    expect(started).toEqual<HookLifecycle[]>([
      {
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: SESSION_START_HOOK_ID,
        hookName: 'SessionStart:startup',
        hookEvent: 'SessionStart',
      },
    ])
  })

  it('SessionStart hook_response → phase:response + exitCode/outcome/stdout/stderr/output 매핑', () => {
    const response = mapFixture(PROBE_1)
      .filter(isHookLifecycle)
      .filter((h) => h.phase === 'response' && h.hookId === SESSION_START_HOOK_ID)
    // fixture 2번째 줄: output=""·stdout=""·stderr=""·exit_code=0·outcome="success".
    // SDK는 hook_response에서 output/stdout/stderr를 항상 문자열로 보낸다(sdk.d.ts:3673-3675) —
    // 빈 문자열도 유효값이라 그대로 실어 나른다(충실 매핑).
    // RED: 드롭 중이라 [] → toEqual 실패.
    expect(response).toEqual<HookLifecycle[]>([
      {
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: SESSION_START_HOOK_ID,
        hookName: 'SessionStart:startup',
        hookEvent: 'SessionStart',
        exitCode: 0,
        outcome: 'success',
        stdout: '',
        stderr: '',
        output: '',
      },
    ])
  })

  it('started↔response는 동일 hook_id로 페어링된다(모든 response의 hook_id ∈ started 집합)', () => {
    const hooks = mapFixture(PROBE_1).filter(isHookLifecycle)
    const startedIds = new Set(hooks.filter((h) => h.phase === 'started').map((h) => h.hookId))
    const responseIds = hooks.filter((h) => h.phase === 'response').map((h) => h.hookId)
    // RED: hooks가 []라 startedIds도 비고 responseIds도 비어 아래 단정 자체가 무의미 →
    //   최소 1건(SessionStart 페어) 이상을 요구해 RED를 확정한다.
    expect(startedIds.has(SESSION_START_HOOK_ID)).toBe(true)
    expect(responseIds).toContain(SESSION_START_HOOK_ID)
    for (const id of responseIds) {
      expect(startedIds.has(id)).toBe(true)
    }
  })
})

// ── (B) informational (S-03) ─────────────────────────────────────────────────────

describe('gap1-p05 informational 정규화 (S-03, 합성 fixture)', () => {
  it('informational.jsonl 4줄 중 유효 level 3건만 정규화(level:bogus 드롭)', () => {
    const infos = mapFixture(INFORMATIONAL).filter(isInformational)
    // RED: informational subtype은 현재 "그 외 system → []"로 드롭 → 0건.
    expect(infos).toHaveLength(3)
  })

  it("warning: content/level 정확 매핑 · preventContinuation·toolUseId 키 없음", () => {
    const warning = mapFixture(INFORMATIONAL)
      .filter(isInformational)
      .find((i) => i.level === 'warning')
    // toEqual로 추가 키(preventContinuation/toolUseId) 부재까지 고정.
    // RED: 드롭 중이라 undefined → 실패.
    expect(warning).toEqual<Informational>({
      type: 'informational',
      content: 'UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로',
      level: 'warning',
    })
  })

  it("notice: prevent_continuation → preventContinuation:true 매핑", () => {
    const notice = mapFixture(INFORMATIONAL)
      .filter(isInformational)
      .find((i) => i.level === 'notice')
    // RED: 드롭 중이라 undefined → 실패.
    expect(notice).toEqual<Informational>({
      type: 'informational',
      content: 'Stop 훅이 계속 진행을 거부했습니다',
      level: 'notice',
      preventContinuation: true,
    })
  })

  it("info: tool_use_id → toolUseId 매핑", () => {
    const info = mapFixture(INFORMATIONAL)
      .filter(isInformational)
      .find((i) => i.level === 'info')
    // RED: 드롭 중이라 undefined → 실패.
    expect(info).toEqual<Informational>({
      type: 'informational',
      content: 'slash command status',
      level: 'info',
      toolUseId: 'toolu_inf_001',
    })
  })

  it("level:'bogus'(리터럴 도메인 밖) 단일 라인 → [] (드롭 — 대조군 불변식)", () => {
    // 대조군: 이 단정은 지금도(드롭)·구현 후에도(리터럴 필터) GREEN이어야 한다.
    // 구현이 level 화이트리스트('info'|'notice'|'suggestion'|'warning')를 벗어난 값을
    // 조용히 드롭하는지 확인 — informational을 무지성으로 다 통과시키면 이 단정이 깨진다.
    const bogus = {
      type: 'system',
      subtype: 'informational',
      content: 'unknown level dropped',
      level: 'bogus',
      uuid: '00000000-0000-0000-0000-0000000000a4',
      session_id: 'sess-p05-inf',
    }
    expect(mapClaudeStreamLine(bogus)).toEqual<AgentEvent[]>([])
  })
})

// ── (C) permission_denied (S-07) ─────────────────────────────────────────────────

describe('gap1-p05 permission_denied 정규화 (S-07, 합성 fixture)', () => {
  it('permission-denied.jsonl 3줄 → permission_denied 3건', () => {
    const pds = mapFixture(PERMISSION_DENIED).filter(isPermissionDenied)
    // RED: permission_denied subtype은 현재 "그 외 system → []"로 드롭 → 0건.
    expect(pds).toHaveLength(3)
  })

  it("rule: decisionReasonType/decisionReason 충실 매핑 · message/tool_use_id/agent_id 미매핑", () => {
    const rule = mapFixture(PERMISSION_DENIED)
      .filter(isPermissionDenied)
      .find((p) => p.toolName === 'Bash')
    // deny 뭉뚱그림 금지: decisionReasonType='rule'과 사람이 읽는 decisionReason을 둘 다 전달.
    // toEqual로 message/tool_use_id/agent_id가 결과 객체에 없음을 함께 고정.
    // RED: 드롭 중이라 undefined → 실패.
    expect(rule).toEqual<PermissionDenied>({
      type: 'permission_denied',
      toolName: 'Bash',
      decisionReasonType: 'rule',
      decisionReason: 'deny 규칙에 의해 차단: Bash(rm:*)',
    })
    // 원시에 존재하나 계약에 없는 필드는 매핑되지 않는다(명시적 재확인).
    expect(rule && 'message' in rule).toBe(false)
    expect(rule && 'toolUseId' in rule).toBe(false)
    expect(rule && 'agentId' in rule).toBe(false)
  })

  it("classifier: decisionReasonType/decisionReason 매핑", () => {
    const classifier = mapFixture(PERMISSION_DENIED)
      .filter(isPermissionDenied)
      .find((p) => p.toolName === 'Write')
    // RED: 드롭 중이라 undefined → 실패.
    expect(classifier).toEqual<PermissionDenied>({
      type: 'permission_denied',
      toolName: 'Write',
      decisionReasonType: 'classifier',
      decisionReason: '자동 분류기가 위험으로 판정',
    })
  })

  it("mode: 원시에 decision_reason 없음 → decisionReason 키 부재", () => {
    const mode = mapFixture(PERMISSION_DENIED)
      .filter(isPermissionDenied)
      .find((p) => p.toolName === 'Edit')
    // decision_reason이 원시에 없으므로 decisionReason 키 자체를 만들지 않는다(P04 postTokens 관례).
    // RED: 드롭 중이라 undefined → 실패.
    expect(mode).toEqual<PermissionDenied>({
      type: 'permission_denied',
      toolName: 'Edit',
      decisionReasonType: 'mode',
    })
    expect(mode && 'decisionReason' in mode).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapClaudeStreamLine } from '../../../02_Source/main/01_agents/claudeStream'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

const PROBE_1 = fileURLToPath(
  new URL('../fixtures/gap1-p03/probe-1-hooks.jsonl', import.meta.url)
)
const INFORMATIONAL = fileURLToPath(
  new URL('../fixtures/gap1-p05/informational.jsonl', import.meta.url)
)
const PERMISSION_DENIED = fileURLToPath(
  new URL('../fixtures/gap1-p05/permission-denied.jsonl', import.meta.url)
)

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

type HookLifecycle = Extract<AgentEvent, { type: 'hook_lifecycle' }>
type Informational = Extract<AgentEvent, { type: 'informational' }>
type PermissionDenied = Extract<AgentEvent, { type: 'permission_denied' }>

const isHookLifecycle = (e: AgentEvent): e is HookLifecycle => e.type === 'hook_lifecycle'
const isInformational = (e: AgentEvent): e is Informational => e.type === 'informational'
const isPermissionDenied = (e: AgentEvent): e is PermissionDenied => e.type === 'permission_denied'

const SESSION_START_HOOK_ID = '072425c8-077c-41f5-98ef-a5270a3ef00e'

describe('gap1-p05 hook_lifecycle 정규화 (S-04, probe① 실측)', () => {
  it('probe-1-hooks의 hook_started/hook_response 6+6쌍 → hook_lifecycle 12건', () => {
    const hooks = mapFixture(PROBE_1).filter(isHookLifecycle)
    expect(hooks).toHaveLength(12)
    expect(hooks.filter((h) => h.phase === 'started')).toHaveLength(6)
    expect(hooks.filter((h) => h.phase === 'response')).toHaveLength(6)
  })

  it('SessionStart hook_started → phase:started + hook_id/hook_name/hook_event 정확 매핑', () => {
    const started = mapFixture(PROBE_1)
      .filter(isHookLifecycle)
      .filter((h) => h.phase === 'started' && h.hookId === SESSION_START_HOOK_ID)
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
    expect(startedIds.has(SESSION_START_HOOK_ID)).toBe(true)
    expect(responseIds).toContain(SESSION_START_HOOK_ID)
    for (const id of responseIds) {
      expect(startedIds.has(id)).toBe(true)
    }
  })
})

describe('gap1-p05 informational 정규화 (S-03, 합성 fixture)', () => {
  it('informational.jsonl 4줄 중 유효 level 3건만 정규화(level:bogus 드롭)', () => {
    const infos = mapFixture(INFORMATIONAL).filter(isInformational)
    expect(infos).toHaveLength(3)
  })

  it("warning: content/level 정확 매핑 · preventContinuation·toolUseId 키 없음", () => {
    const warning = mapFixture(INFORMATIONAL)
      .filter(isInformational)
      .find((i) => i.level === 'warning')
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
    expect(info).toEqual<Informational>({
      type: 'informational',
      content: 'slash command status',
      level: 'info',
      toolUseId: 'toolu_inf_001',
    })
  })

  it("level:'bogus'(리터럴 도메인 밖) 단일 라인 → [] (드롭 — 대조군 불변식)", () => {
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

describe('gap1-p05 permission_denied 정규화 (S-07, 합성 fixture)', () => {
  it('permission-denied.jsonl 3줄 → permission_denied 3건', () => {
    const pds = mapFixture(PERMISSION_DENIED).filter(isPermissionDenied)
    expect(pds).toHaveLength(3)
  })

  it("rule: decisionReasonType/decisionReason 충실 매핑 · message/tool_use_id/agent_id 미매핑", () => {
    const rule = mapFixture(PERMISSION_DENIED)
      .filter(isPermissionDenied)
      .find((p) => p.toolName === 'Bash')
    expect(rule).toEqual<PermissionDenied>({
      type: 'permission_denied',
      toolName: 'Bash',
      decisionReasonType: 'rule',
      decisionReason: 'deny 규칙에 의해 차단: Bash(rm:*)',
    })
    expect(rule && 'message' in rule).toBe(false)
    expect(rule && 'toolUseId' in rule).toBe(false)
    expect(rule && 'agentId' in rule).toBe(false)
  })

  it("classifier: decisionReasonType/decisionReason 매핑", () => {
    const classifier = mapFixture(PERMISSION_DENIED)
      .filter(isPermissionDenied)
      .find((p) => p.toolName === 'Write')
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
    expect(mode).toEqual<PermissionDenied>({
      type: 'permission_denied',
      toolName: 'Edit',
      decisionReasonType: 'mode',
    })
    expect(mode && 'decisionReason' in mode).toBe(false)
  })
})

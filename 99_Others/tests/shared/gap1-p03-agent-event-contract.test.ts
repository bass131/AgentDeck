/**
 * gap1-p03-agent-event-contract.test.ts — GAP1 P03 신규 AgentEvent 9종 계약 골든.
 *
 * 대상: 02.Source/shared/agent-events.ts
 *   - AgentEventHookLifecycle · AgentEventInformational · AgentEventPermissionDenied ·
 *     AgentEventApiRetry · AgentEventCompact · AgentEventSessionState ·
 *     AgentEventThinkingDelta · AgentEventBgTask · AgentEventSearchResult
 *   - AgentEventPermissionRequest.planReview (기존 타입 additive 확장)
 *
 * 설계 근거: 01.Phases/17_GAP1-core-parity/03-agent-event-contract.md (영호 GO 완료).
 * fixture: 99.Others/tests/fixtures/gap1-p03/probe-{1,2,2b,3,4}-*.jsonl
 *   (SDK query() 직접 호출 raw 캡처 — 앱 코드 미참조, 정규화기 구현은 이 Phase 범위 아님).
 *
 * 이 파일은 계약 *타입 shape*와 fixture 실형상의 정합만 검증한다 — 원시 SDK 메시지를
 * AgentEvent로 매핑하는 정규화기(어댑터 구현)는 후속 Phase(P04~P09) 몫이다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AgentEvent,
  AgentEventHookLifecycle,
  AgentEventInformational,
  AgentEventPermissionDenied,
  AgentEventApiRetry,
  AgentEventCompact,
  AgentEventSessionState,
  AgentEventThinkingDelta,
  AgentEventBgTask,
  AgentEventBgTaskPatch,
  AgentEventSearchResult,
  AgentEventPermissionRequest,
  PlanReviewPayload,
} from '../../../02.Source/shared/agent-events'

// ── fixture 로드 헬퍼 (테스트 파일 위치 기준 — cwd 비의존) ─────────────────────

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/gap1-p03/', import.meta.url))

function loadJsonl(filename: string): Record<string, unknown>[] {
  const raw = readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8')
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

function loadJson(filename: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8'))
}

// ── fixture 존재 + 기본 형상 확인 ───────────────────────────────────────────

describe('GAP1 P03 probe fixture 로드', () => {
  it('probe-1-hooks.jsonl이 로드되고 hook_started/hook_response를 포함한다', () => {
    const lines = loadJsonl('probe-1-hooks.jsonl')
    expect(lines.length).toBeGreaterThan(0)
    const subtypes = lines.map((l) => l['subtype'])
    expect(subtypes).toContain('hook_started')
    expect(subtypes).toContain('hook_response')
  })

  it('probe-2-session-state.jsonl(env 미설정)은 session_state_changed가 0건이다 — 미도달 실측', () => {
    const lines = loadJsonl('probe-2-session-state.jsonl')
    const stateChanges = lines.filter((l) => l['subtype'] === 'session_state_changed')
    expect(stateChanges).toHaveLength(0)
  })

  it('probe-2b-session-state-env.jsonl(env 옵트인)은 running→idle 페어를 포함한다 — 확정 실측', () => {
    const lines = loadJsonl('probe-2b-session-state-env.jsonl')
    const stateChanges = lines.filter((l) => l['subtype'] === 'session_state_changed')
    expect(stateChanges.map((l) => l['state'])).toEqual(['running', 'idle'])
  })

  it('probe-3-exitplan-input.json이 plan·planFilePath를 포함하고 allowedPrompts는 부재다', () => {
    const captured = loadJson('probe-3-exitplan-input.json') as {
      toolName: string
      input: { plan?: string; planFilePath?: string; allowedPrompts?: unknown }
    }
    expect(captured.toolName).toBe('ExitPlanMode')
    expect(typeof captured.input.plan).toBe('string')
    expect(typeof captured.input.planFilePath).toBe('string')
    expect(captured.input.allowedPrompts).toBeUndefined()
  })

  it('probe-4-bg-bash.jsonl이 task_started/task_updated/task_notification을 포함한다', () => {
    const lines = loadJsonl('probe-4-bg-bash.jsonl')
    const subtypes = lines.map((l) => l['subtype'])
    expect(subtypes).toContain('task_started')
    expect(subtypes).toContain('task_updated')
    expect(subtypes).toContain('task_notification')
  })
})

// ── AgentEventHookLifecycle — probe① 실측 정합 ──────────────────────────────

describe('AgentEventHookLifecycle 계약 (probe① 실측)', () => {
  it('hook_started/hook_response 실측 페어에서 hookId가 상관관계 키로 일치한다', () => {
    const lines = loadJsonl('probe-1-hooks.jsonl')
    const started = lines.find((l) => l['subtype'] === 'hook_started') as Record<string, string>
    const response = lines.find(
      (l) => l['subtype'] === 'hook_response' && l['hook_id'] === started['hook_id']
    ) as Record<string, string>
    expect(response).toBeDefined()

    // raw(snake_case) → 계약(camelCase) 매핑 — 정규화기의 최소 형상 검증
    const startedEvent: AgentEventHookLifecycle = {
      type: 'hook_lifecycle',
      phase: 'started',
      hookId: started['hook_id'],
      hookName: started['hook_name'],
      hookEvent: started['hook_event'],
    }
    const responseEvent: AgentEventHookLifecycle = {
      type: 'hook_lifecycle',
      phase: 'response',
      hookId: response['hook_id'],
      hookName: response['hook_name'],
      hookEvent: response['hook_event'],
      exitCode: Number(response['exit_code']),
      outcome: response['outcome'] as AgentEventHookLifecycle['outcome'],
      stdout: response['stdout'],
      stderr: response['stderr'],
      output: response['output'],
    }
    expect(startedEvent.hookId).toBe(responseEvent.hookId)
    expect(responseEvent.outcome).toBe('success')
  })

  it('hookName은 실측 두 포맷("{HookEvent}:{matcher}" 또는 "{HookEvent}")을 모두 허용한다', () => {
    const lines = loadJsonl('probe-1-hooks.jsonl')
    const names = lines
      .filter((l) => l['subtype'] === 'hook_started')
      .map((l) => l['hook_name'] as string)
    expect(names).toContain('SessionStart:startup') // matcher 있음
    expect(names).toContain('UserPromptSubmit') // matcher 없음(bare HookEvent)
  })

  it("phase='progress'는 예약(현재 fixture에서 0건 관측)이지만 타입은 허용한다", () => {
    const lines = [
      ...loadJsonl('probe-1-hooks.jsonl'),
      ...loadJsonl('probe-2-session-state.jsonl'),
      ...loadJsonl('probe-3-exitplan.jsonl'),
      ...loadJsonl('probe-4-bg-bash.jsonl'),
    ]
    expect(lines.filter((l) => l['subtype'] === 'hook_progress')).toHaveLength(0)

    const reserved: AgentEventHookLifecycle = {
      type: 'hook_lifecycle',
      phase: 'progress',
      hookId: 'reserved',
      hookName: 'Reserved',
      hookEvent: 'Reserved',
    }
    expect(reserved.phase).toBe('progress')
  })
})

// ── AgentEventSessionState — probe②/②b 실측 정합 (코디네이터 후속 업데이트) ───

describe('AgentEventSessionState 계약 (probe②b 실측 확정)', () => {
  it("running/idle 두 상태가 실측 fixture 값과 타입 계약 모두에서 허용된다", () => {
    const lines = loadJsonl('probe-2b-session-state-env.jsonl')
    const states = lines
      .filter((l) => l['subtype'] === 'session_state_changed')
      .map((l) => l['state'] as string)

    for (const state of states) {
      const event: AgentEventSessionState = {
        type: 'session_state',
        state: state as AgentEventSessionState['state'],
      }
      expect(['idle', 'running', 'requires_action']).toContain(event.state)
    }
    expect(states).toEqual(['running', 'idle'])
  })

  it("requires_action은 미재현이지만 타입 레벨에서는 허용된다(예약)", () => {
    const event: AgentEventSessionState = { type: 'session_state', state: 'requires_action' }
    expect(event.state).toBe('requires_action')
  })
})

// ── AgentEventBgTask — probe④ 실측 정합(run_in_background) + probe② 서브에이전트 ──

describe('AgentEventBgTask 계약 (probe④ 실측)', () => {
  it('task_started(local_bash) → task_updated(patch.status) → task_notification 3단계가 동일 taskId로 상관된다', () => {
    const lines = loadJsonl('probe-4-bg-bash.jsonl')
    const started = lines.find((l) => l['subtype'] === 'task_started') as Record<string, unknown>
    const updated = lines.find((l) => l['subtype'] === 'task_updated') as Record<string, unknown>
    const notification = lines.find((l) => l['subtype'] === 'task_notification') as Record<
      string,
      unknown
    >
    expect(started['task_id']).toBe(updated['task_id'])
    expect(started['task_id']).toBe(notification['task_id'])
    expect(started['task_type']).toBe('local_bash')

    const startedEvent: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'started',
      taskId: started['task_id'] as string,
      toolUseId: started['tool_use_id'] as string,
      taskType: started['task_type'] as AgentEventBgTask['taskType'],
      description: started['description'] as string,
    }
    const patch = updated['patch'] as { status?: string; end_time?: number }
    const updatedEvent: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'updated',
      taskId: updated['task_id'] as string,
      patch: { status: patch.status, endTime: patch.end_time } satisfies AgentEventBgTaskPatch,
    }
    const notificationEvent: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'notification',
      taskId: notification['task_id'] as string,
      toolUseId: notification['tool_use_id'] as string,
      status: notification['status'] as string,
      outputFile: notification['output_file'] as string,
      summary: notification['summary'] as string,
    }

    expect(startedEvent.taskId).toBe(updatedEvent.taskId)
    expect(updatedEvent.taskId).toBe(notificationEvent.taskId)
    expect(updatedEvent.patch?.status).toBe('killed')
    expect(notificationEvent.status).toBe('stopped')
  })

  it('taskId는 tool_result 최상위 tool_use_result.backgroundTaskId와 동일 값이다 (정본 상관관계 키)', () => {
    const lines = loadJsonl('probe-4-bg-bash.jsonl')
    const started = lines.find((l) => l['subtype'] === 'task_started') as Record<string, unknown>
    const toolResultMsg = lines.find((l) => {
      if (l['type'] !== 'user') return false
      const result = l['tool_use_result'] as { backgroundTaskId?: string } | undefined
      return typeof result?.backgroundTaskId === 'string'
    }) as Record<string, unknown>
    const backgroundTaskId = (toolResultMsg['tool_use_result'] as { backgroundTaskId: string })
      .backgroundTaskId
    expect(backgroundTaskId).toBe(started['task_id'])
  })

  it("taskType='local_agent'는 probe-2-session-state.jsonl 서브에이전트 실측에서 확인된다", () => {
    const lines = loadJsonl('probe-2-session-state.jsonl')
    const started = lines.find((l) => l['subtype'] === 'task_started') as Record<string, unknown>
    expect(started['task_type']).toBe('local_agent')

    const event: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'started',
      taskId: started['task_id'] as string,
      taskType: started['task_type'] as AgentEventBgTask['taskType'],
    }
    expect(event.taskType).toBe('local_agent')
  })

  it("taskType='local_workflow'는 probe 미관측이지만 타입 레벨에서는 허용된다(SDK 선언 근거)", () => {
    const event: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'started',
      taskId: 'reserved-workflow',
      taskType: 'local_workflow',
    }
    expect(event.taskType).toBe('local_workflow')
  })
})

// ── AgentEventPermissionRequest.planReview — probe③ 실측 정합 ────────────────

describe('AgentEventPermissionRequest.planReview 확장 (probe③ 실측)', () => {
  it('probe③ 캡처 input을 planReview로 구조화하면 plan·planFilePath가 실린다', () => {
    const captured = loadJson('probe-3-exitplan-input.json') as {
      input: { plan: string; planFilePath: string }
    }
    const planReview: PlanReviewPayload = {
      plan: captured.input.plan,
      planFilePath: captured.input.planFilePath,
    }
    const event: AgentEventPermissionRequest = {
      type: 'permission_request',
      requestId: 'pr-exitplan-1',
      toolName: 'ExitPlanMode',
      summary: '계획 승인 요청',
      planReview,
    }
    expect(event.planReview?.plan).toContain('Print Hello')
    expect(event.planReview?.planFilePath).toMatch(/\.md$/)
    expect(event.planReview?.allowedPrompts).toBeUndefined()
  })

  it('planReview 미부여는 기존 소비자와 하위호환된다(회귀 0)', () => {
    const event: AgentEventPermissionRequest = {
      type: 'permission_request',
      requestId: 'pr-1',
      toolName: 'Bash',
      summary: 'rm -rf /tmp',
    }
    expect(event.planReview).toBeUndefined()
  })

  it('allowedPrompts 항목은 tool="Bash" + prompt 두 필드로 구성된다(SDK 선언 미러)', () => {
    const planReview: PlanReviewPayload = {
      plan: '# Plan',
      allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }],
    }
    expect(planReview.allowedPrompts?.[0]).toEqual({ tool: 'Bash', prompt: 'run tests' })
  })
})

// ── AgentEventThinkingDelta — probe①~④·②b 전부에서 estimatedTokens 자연발생 관측 ──

describe('AgentEventThinkingDelta 계약 (thinking_tokens 서브타입 실측)', () => {
  it('probe 5종 전부에서 thinking_tokens 서브타입이 estimated_tokens를 동반한다', () => {
    const files = [
      'probe-1-hooks.jsonl',
      'probe-2-session-state.jsonl',
      'probe-2b-session-state-env.jsonl',
      'probe-3-exitplan.jsonl',
      'probe-4-bg-bash.jsonl',
    ]
    let totalObserved = 0
    for (const file of files) {
      const lines = loadJsonl(file)
      const tokenFrames = lines.filter((l) => l['subtype'] === 'thinking_tokens')
      expect(tokenFrames.length).toBeGreaterThan(0)
      for (const frame of tokenFrames) {
        expect(typeof frame['estimated_tokens']).toBe('number')
        const event: AgentEventThinkingDelta = {
          type: 'thinking_delta',
          estimatedTokens: frame['estimated_tokens'] as number,
        }
        expect(event.estimatedTokens).toBeGreaterThanOrEqual(0)
      }
      totalObserved += tokenFrames.length
    }
    expect(totalObserved).toBeGreaterThan(100) // 브리프 근거: "100건 이상 자연발생 관측"
  })

  it('text(원문 사고 증분)는 예약 필드다 — stream_event 자체가 0건이라 항상 미부여일 수 있다', () => {
    const files = [
      'probe-1-hooks.jsonl',
      'probe-2-session-state.jsonl',
      'probe-2b-session-state-env.jsonl',
      'probe-3-exitplan.jsonl',
      'probe-4-bg-bash.jsonl',
    ]
    for (const file of files) {
      const lines = loadJsonl(file)
      expect(lines.filter((l) => l['type'] === 'stream_event')).toHaveLength(0)
    }
    const reserved: AgentEventThinkingDelta = { type: 'thinking_delta', text: 'redacted 아님 예약' }
    expect(reserved.text).toBeDefined()
  })
})

// ── 미관측 이벤트(informational·permission_denied·api_retry·compact·search_result) ──
// SDK 타입 선언 기반 계약 — probe 범위 밖. 최소 샘플이 타입 계약을 충족하는지만 확인.

describe('SDK 타입 선언 기반 신규 이벤트 4종 (probe 미관측 — 타입 계약만)', () => {
  it('AgentEventInformational 최소 샘플이 타입 계약을 충족한다', () => {
    const event: AgentEventInformational = {
      type: 'informational',
      content: 'work-pin 자동 주입',
      level: 'notice',
    }
    expect(['info', 'notice', 'suggestion', 'warning']).toContain(event.level)
  })

  it('AgentEventPermissionDenied 최소 샘플이 타입 계약을 충족한다', () => {
    const event: AgentEventPermissionDenied = {
      type: 'permission_denied',
      toolName: 'Bash',
      decisionReasonType: 'classifier',
      decisionReason: '민감 경로 접근',
    }
    expect(event.toolName).toBe('Bash')
  })

  it('AgentEventApiRetry 최소 샘플이 타입 계약을 충족한다', () => {
    const event: AgentEventApiRetry = {
      type: 'api_retry',
      attempt: 1,
      maxRetries: 3,
      retryDelayMs: 1000,
      error: 'overloaded',
    }
    expect(event.attempt).toBeLessThanOrEqual(event.maxRetries)
  })

  it("AgentEventCompact kind='boundary'/'status' 두 형태가 모두 타입 계약을 충족한다", () => {
    const boundary: AgentEventCompact = {
      type: 'compact',
      kind: 'boundary',
      trigger: 'auto',
      preTokens: 180_000,
      postTokens: 40_000,
    }
    const status: AgentEventCompact = {
      type: 'compact',
      kind: 'status',
      status: 'requesting',
    }
    expect(boundary.kind).toBe('boundary')
    expect(status.status).toBe('requesting')
    // requesting과 compacting은 별개 상태 — 동시 값 혼동 방지 회귀 가드
    expect(status.status).not.toBe('compacting')
  })

  it('AgentEventSearchResult 최소 골격이 전 필드 optional로 구성된다(최소 표면 계약)', () => {
    const empty: AgentEventSearchResult = { type: 'search_result' }
    expect(Object.keys(empty)).toEqual(['type'])

    const filled: AgentEventSearchResult = {
      type: 'search_result',
      toolUseId: 'toolu_01',
      mode: 'content',
      matches: [{ path: 'src/main.ts', line: 10, text: 'const x = 1' }],
      total: 1,
      truncated: false,
    }
    expect(filled.matches?.[0].path).toBe('src/main.ts')
  })
})

// ── AgentEvent 유니온 합류 — narrowing 회귀 가드 ─────────────────────────────

describe('GAP1 P03 신규 이벤트 9종이 AgentEvent 유니온에 합류한다', () => {
  it('각 신규 타입이 discriminated union으로 narrowing된다', () => {
    const events: AgentEvent[] = [
      { type: 'hook_lifecycle', phase: 'started', hookId: 'h-1', hookName: 'Stop', hookEvent: 'Stop' },
      { type: 'informational', content: 'x', level: 'info' },
      { type: 'permission_denied', toolName: 'Write' },
      { type: 'api_retry', attempt: 1, maxRetries: 1, retryDelayMs: 0 },
      { type: 'compact', kind: 'status', status: null },
      { type: 'session_state', state: 'idle' },
      { type: 'thinking_delta', estimatedTokens: 1 },
      { type: 'bg_task', kind: 'notification', taskId: 't-1' },
      { type: 'search_result' },
    ]
    for (const event of events) {
      switch (event.type) {
        case 'hook_lifecycle':
          expect(event.phase).toBe('started')
          break
        case 'informational':
          expect(event.level).toBe('info')
          break
        case 'permission_denied':
          expect(event.toolName).toBe('Write')
          break
        case 'api_retry':
          expect(event.attempt).toBe(1)
          break
        case 'compact':
          expect(event.status).toBeNull()
          break
        case 'session_state':
          expect(event.state).toBe('idle')
          break
        case 'thinking_delta':
          expect(event.estimatedTokens).toBe(1)
          break
        case 'bg_task':
          expect(event.kind).toBe('notification')
          break
        case 'search_result':
          expect(event.type).toBe('search_result')
          break
        default:
          throw new Error(`예상치 못한 이벤트 타입: ${(event as AgentEvent).type}`)
      }
    }
  })
})

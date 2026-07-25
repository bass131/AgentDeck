/**
 * gap1-p04-turn-signals.golden.test.ts — GAP1 P04 턴 신뢰성 신호 정규화 골든 (TDD RED)
 *
 * 목표: claude-stream.ts `mapClaudeStreamLine`이 현재 드롭하는 SDK 원시 신호를
 *   P03에서 정의된 공통 AgentEvent로 정규화하는지 고정한다. 구현은 후속 agent-backend
 *   Worker 몫 — 이 파일은 실패하는 계약(RED)을 먼저 못박는다.
 *
 * 커버 영역(Phase 04 (b)(c)(d)(e)):
 *   1. session_state_changed → session_state (running/idle 실측 fixture + requires_action 합성)
 *   2. api_retry → api_retry (합성 — 실수신 fixture 없음)
 *   3. compact_boundary → compact(kind:'boundary')
 *   4. status → compact(kind:'status'): compacting / requesting(별개 상태) / null(해제)
 *   5. isReplay 가드 → replay tool_result 재방출 억제([]) + 일반 tool_result 불변(대조군)
 *
 * SDK 원시 타입 정본(node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts):
 *   SDKSessionStateChangedMessage : 4102  SDKAPIRetryMessage : 2750
 *   SDKCompactBoundaryMessage      : 2822  SDKStatusMessage   : 4130 (SDKStatus:4128)
 *   SDKUserMessageReplay           : 4334
 * 합성 fixture는 위 선언에서 유도(임의 발명 금지). session_state만 실측 fixture 사용.
 *
 * 현재(RED) 이유: mapClaudeStreamLine의 system 분기가 이 subtype들을 "그 외 system → []"
 *   (claude-stream.ts:554-555)로 드롭하고, case 'user'는 isReplay 가드 없이 mapUserContent로
 *   흘려 replay tool_result를 재방출한다(claude-stream.ts:501-508).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapClaudeStreamLine } from '../../../02.Source/main/01_agents/claude-stream'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// 실측 fixture: probe②b(env CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1 옵트인) —
// running→(작업)→idle 페어가 실재하는 유일한 캡처(3번째 줄 running, 14번째 줄 idle).
const PROBE_2B = fileURLToPath(
  new URL('../fixtures/gap1-p03/probe-2b-session-state-env.jsonl', import.meta.url)
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

// ── 1. session_state_changed (S-05) ────────────────────────────────────────────

describe('gap1-p04 session_state 정규화 (S-05)', () => {
  it('실측 fixture(probe-2b) running→idle 페어 → session_state 이벤트 2개', () => {
    const sessionStates = mapFixture(PROBE_2B).filter((e) => e.type === 'session_state')
    // RED: 현재 session_state_changed는 "그 외 system → []"로 드롭 → filter 결과 [].
    expect(sessionStates).toEqual<AgentEvent[]>([
      { type: 'session_state', state: 'running' },
      { type: 'session_state', state: 'idle' },
    ])
  })

  it('단일 running 라인 → [{session_state, running}]', () => {
    const obj = {
      type: 'system',
      subtype: 'session_state_changed',
      state: 'running',
      uuid: '387c0f11-6230-424c-9f7f-edefffd2df6f',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'session_state', state: 'running' },
    ])
  })

  it('단일 idle 라인 → [{session_state, idle}]', () => {
    const obj = {
      type: 'system',
      subtype: 'session_state_changed',
      state: 'idle',
      uuid: '5731ba2d-3e7f-49cd-b73c-227f208df0fc',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'session_state', state: 'idle' },
    ])
  })

  it('requires_action(합성 — fixture 미관측, sdk.d.ts:4105 선언에서 유도) → {session_state, requires_action}', () => {
    // SYNTHETIC: probe에서 재현 안 됨. state 도메인은 SDKSessionStateChangedMessage.state
    // ('idle'|'running'|'requires_action')에서 유도. requires_action도 그대로 표면화돼야 한다.
    const obj = {
      type: 'system',
      subtype: 'session_state_changed',
      state: 'requires_action',
      uuid: '00000000-0000-0000-0000-000000000001',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'session_state', state: 'requires_action' },
    ])
  })
})

// ── 2. api_retry (S-02) ─────────────────────────────────────────────────────────

describe('gap1-p04 api_retry 정규화 (S-02)', () => {
  it('SDKAPIRetryMessage(합성 — 실수신 fixture 없음, sdk.d.ts:2750) → api_retry(camelCase 매핑)', () => {
    // SYNTHETIC: 과부하 재시도는 자연발생이 드물어 캡처 없음. 형상은 SDKAPIRetryMessage
    // 선언(attempt·max_retries·retry_delay_ms·error_status·error)에서 유도.
    const obj = {
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_retries: 5,
      retry_delay_ms: 2000,
      error_status: 529,
      error: 'overloaded',
      uuid: '00000000-0000-0000-0000-000000000002',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    // RED: 현재 api_retry는 "그 외 system → []"로 드롭.
    // error_status는 계약에 없음(드롭), error 문자열만 전달.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'api_retry', attempt: 2, maxRetries: 5, retryDelayMs: 2000, error: 'overloaded' },
    ])
  })

  it('error_status=null(연결 오류)·error=rate_limit → error 문자열 매핑 유지', () => {
    // SYNTHETIC: error_status가 null인 연결오류 케이스(sdk.d.ts:2748 주석 유도).
    const obj = {
      type: 'system',
      subtype: 'api_retry',
      attempt: 1,
      max_retries: 8,
      retry_delay_ms: 500,
      error_status: null,
      error: 'rate_limit',
      uuid: '00000000-0000-0000-0000-000000000003',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual<AgentEvent>({
      type: 'api_retry',
      attempt: 1,
      maxRetries: 8,
      retryDelayMs: 500,
      error: 'rate_limit',
    })
  })
})

// ── 3. compact_boundary (S-01) ──────────────────────────────────────────────────

describe('gap1-p04 compact 경계 정규화 (S-01)', () => {
  it('compact_boundary auto + pre/post_tokens → compact(kind:boundary, camelCase)', () => {
    // SYNTHETIC: 4종 probe가 컴팩션 유발 컨텍스트를 채우지 않아 미관측.
    // 형상은 SDKCompactBoundaryMessage.compact_metadata(trigger·pre_tokens·post_tokens?) 유도.
    const obj = {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'auto', pre_tokens: 150000, post_tokens: 5000 },
      uuid: '00000000-0000-0000-0000-000000000004',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    // RED: 현재 compact_boundary는 "그 외 system → []"로 드롭.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'boundary', trigger: 'auto', preTokens: 150000, postTokens: 5000 },
    ])
  })

  it('compact_boundary manual + post_tokens 없음 → postTokens 키 미포함', () => {
    // SDK 선언상 post_tokens는 optional — 미제공 시 postTokens 키를 만들지 않는다.
    const obj = {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'manual', pre_tokens: 120000 },
      uuid: '00000000-0000-0000-0000-000000000005',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'boundary', trigger: 'manual', preTokens: 120000 },
    ])
  })
})

// ── 4. status: compacting / requesting / null (S-01, sdk.d.ts:4128) ──────────────

describe('gap1-p04 compact 상태 정규화 (S-01, requesting≠compacting·null 해제)', () => {
  it("status='compacting' → compact(kind:status, status:compacting)", () => {
    // SYNTHETIC: SDKStatusMessage.status 도메인('compacting'|'requesting'|null) 유도.
    const obj = {
      type: 'system',
      subtype: 'status',
      status: 'compacting',
      uuid: '00000000-0000-0000-0000-000000000006',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    // RED: 현재 status subtype은 "그 외 system → []"로 드롭.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'status', status: 'compacting' },
    ])
  })

  it("status='requesting' → compact(kind:status, status:requesting) — compacting과 별개 상태(혼동 방지)", () => {
    // requesting은 API 왕복 진행(압축과 무관)일 수 있어 compacting으로 뭉개면 안 된다.
    const obj = {
      type: 'system',
      subtype: 'status',
      status: 'requesting',
      uuid: '00000000-0000-0000-0000-000000000007',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'status', status: 'requesting' },
    ])
    // 단정: requesting이 compacting으로 붕괴되지 않는다.
    const status = (events[0] as AgentEvent & { type: 'compact' }).status
    expect(status).toBe('requesting')
    expect(status).not.toBe('compacting')
  })

  it('status=null → compact(kind:status, status:null) — 진행 해제 이벤트를 그대로 전달(소비측 clear)', () => {
    const obj = {
      type: 'system',
      subtype: 'status',
      status: null,
      uuid: '00000000-0000-0000-0000-000000000008',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    // RED: null도 드롭됨. 구현 후에는 status:null을 그대로 실어 소비측이 clear할 수 있어야 한다.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'status', status: null },
    ])
  })
})

// ── 5. isReplay 가드 (S-13) ─────────────────────────────────────────────────────

describe('gap1-p04 resume isReplay 가드 (S-13)', () => {
  it('isReplay=true user(tool_result) → 재방출 억제([]) — 트랜스크립트 중복 오염 방지', () => {
    // SDKUserMessageReplay(sdk.d.ts:4334): resume이 과거 tool_result를 다시 흘릴 때
    // isReplay:true로 표식된다. 가드 없으면 mapUserContent가 tool_result를 중복 재방출한다.
    const obj = {
      type: 'user',
      isReplay: true,
      parent_tool_use_id: null,
      tool_use_result: { ok: true },
      uuid: '00000000-0000-0000-0000-000000000009',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_replayed_001',
            content: [{ type: 'text', text: 'replayed output' }],
          },
        ],
      },
    }
    // RED: 현재 case 'user'는 isReplay 가드가 없어 tool_result를 그대로 emit한다.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
  })

  it('대조군: isReplay 없는 일반 user(tool_result) → 정상 tool_result emit(기존 동작 불변)', () => {
    // 이 케이스는 지금도·구현 후에도 GREEN(불변식). 가드가 replay에만 적용됨을 대비 확인.
    const obj = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_live_001',
            content: [{ type: 'text', text: 'live output' }],
          },
        ],
      },
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      {
        type: 'tool_result',
        id: 'toolu_live_001',
        ok: true,
        output: [{ type: 'text', text: 'live output' }],
      },
    ])
  })
})

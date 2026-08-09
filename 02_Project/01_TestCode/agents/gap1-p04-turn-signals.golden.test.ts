import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapClaudeStreamLine } from '../../../02_Project/00_Source/main/01_agents/claudeStream'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

const PROBE_2B = fileURLToPath(
  new URL('../fixtures/gap1-p03/probe-2b-session-state-env.jsonl', import.meta.url)
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

describe('gap1-p04 session_state 정규화 (S-05)', () => {
  it('실측 fixture(probe-2b) running→idle 페어 → session_state 이벤트 2개', () => {
    const sessionStates = mapFixture(PROBE_2B).filter((e) => e.type === 'session_state')
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

describe('gap1-p04 api_retry 정규화 (S-02)', () => {
  it('SDKAPIRetryMessage(합성 — 실수신 fixture 없음, sdk.d.ts:2750) → api_retry(camelCase 매핑)', () => {
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
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'api_retry', attempt: 2, maxRetries: 5, retryDelayMs: 2000, error: 'overloaded' },
    ])
  })

  it('error_status=null(연결 오류)·error=rate_limit → error 문자열 매핑 유지', () => {
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

describe('gap1-p04 compact 경계 정규화 (S-01)', () => {
  it('compact_boundary auto + pre/post_tokens → compact(kind:boundary, camelCase)', () => {
    const obj = {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'auto', pre_tokens: 150000, post_tokens: 5000 },
      uuid: '00000000-0000-0000-0000-000000000004',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'boundary', trigger: 'auto', preTokens: 150000, postTokens: 5000 },
    ])
  })

  it('compact_boundary manual + post_tokens 없음 → postTokens 키 미포함', () => {
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

describe('gap1-p04 compact 상태 정규화 (S-01, requesting≠compacting·null 해제)', () => {
  it("status='compacting' → compact(kind:status, status:compacting)", () => {
    const obj = {
      type: 'system',
      subtype: 'status',
      status: 'compacting',
      uuid: '00000000-0000-0000-0000-000000000006',
      session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'status', status: 'compacting' },
    ])
  })

  it("status='requesting' → compact(kind:status, status:requesting) — compacting과 별개 상태(혼동 방지)", () => {
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
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'compact', kind: 'status', status: null },
    ])
  })
})

describe('gap1-p04 resume isReplay 가드 (S-13)', () => {
  it('isReplay=true user(tool_result) → 재방출 억제([]) — 트랜스크립트 중복 오염 방지', () => {
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
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
  })

  it('대조군: isReplay 없는 일반 user(tool_result) → 정상 tool_result emit(기존 동작 불변)', () => {
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

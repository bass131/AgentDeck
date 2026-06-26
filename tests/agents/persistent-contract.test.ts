/**
 * persistent-contract.test.ts — Phase 2 (0) shared 계약 단위 (REPL 지속세션 옵트인).
 *
 * (0)은 **중립 계약만** 추가한다(동작은 (1)/(2)): persistent/sessionKey 운반 +
 * AgentRun.interrupt()(턴 중단, 세션 유지) + AgentEventDone.origin(cron-turn 귀속).
 *
 * 검증:
 *   PC1: ClaudeCodeBackend run.interrupt() 존재 + query 전/멱등 안전 no-op.
 *   PC2: EchoBackend run.interrupt() 안전 no-op.
 *   PC3: persistent/sessionKey 전달이 run을 깨지 않음(가산·회귀0, sdkOptions 불변).
 *   PC4: AgentEventDone origin('user'|'cron') 타입+런타임 수용(미지정 하위호환).
 *
 * 신뢰경계: 실 SDK 호출 0. persistent→엔진 매핑은 어댑터 내부((1)/(2), ADR-003).
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/01_agents/ClaudeCodeBackend'
import { EchoBackend } from '../../src/main/01_agents/EchoBackend'
import type { AgentRunInput } from '../../src/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventDone } from '../../src/shared/agent-events'

function resultMsg() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 0,
    result: '',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test',
  }
}

describe('(0) AgentRun.interrupt() — 턴 중단(세션 유지) 계약', () => {
  it('PC1: ClaudeCodeBackend run.interrupt() 존재 + query 전/멱등 안전 no-op', async () => {
    const queryFn: QueryFn = async function* () { yield resultMsg() }
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })
    expect(typeof run.interrupt).toBe('function')
    // query 핸들 캡처 전에 호출해도 안전(no-op) + 멱등
    expect(() => run.interrupt()).not.toThrow()
    expect(() => run.interrupt()).not.toThrow()
    for await (const _ of run.events) void _
  })

  it('PC2: EchoBackend run.interrupt() 안전 no-op', async () => {
    const run = new EchoBackend().start({ messages: [{ role: 'user', content: 'hi' }] })
    expect(typeof run.interrupt).toBe('function')
    expect(() => run.interrupt()).not.toThrow()
    for await (const _ of run.events) void _
  })
})

describe('(0) persistent/sessionKey 중립 계약 — 가산·회귀0', () => {
  it('PC3: persistent/sessionKey 전달이 run을 깨지 않음(sdkOptions 불변)', async () => {
    const captured: { value?: Record<string, unknown> } = {}
    const queryFn: QueryFn = async function* (p: { prompt: string; options?: unknown }) {
      captured.value = p.options as Record<string, unknown>
      yield resultMsg()
    }
    const input: AgentRunInput = {
      messages: [{ role: 'user', content: 'hi' }],
      persistent: true,
      sessionKey: 'conv-1',
    }
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start(input)
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)
    // (0): persistent는 sdkOptions를 바꾸지 않는다(동작은 (1)/(2)). done 정상 종료만 단정.
    expect(events.some((e) => e.type === 'done')).toBe(true)
    expect('persistent' in (captured.value ?? {})).toBe(false)
  })
})

describe('(0) AgentEventDone.origin — cron-turn 귀속 필드', () => {
  it('PC4: done에 origin 부여 가능(타입+런타임, 미지정 하위호환)', () => {
    const cronDone: AgentEventDone = { type: 'done', origin: 'cron' }
    const userDone: AgentEventDone = { type: 'done', origin: 'user' }
    const legacyDone: AgentEventDone = { type: 'done' }
    expect(cronDone.origin).toBe('cron')
    expect(userDone.origin).toBe('user')
    expect(legacyDone.origin).toBeUndefined()
  })
})

/**
 * resume-session.test.ts — Phase 1 맥락 복구(REPL_TRANSITION) 백엔드 단위.
 *
 * 검증:
 *   R1: resumeSessionId 전달 → sdkOptions.resume === resumeSessionId
 *   R2: resumeSessionId 미전달 → sdkOptions에 resume 키 없음(하위호환 회귀 0)
 *   R3: system/init(session_id) → backend가 session 이벤트 emit (다음 턴 resume용)
 *
 * 신뢰경계: 실 SDK 호출 0. queryFn은 mock. resume *옵션 매핑*은 어댑터 내부(ADR-003).
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

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

function makeCaptureQuery(captured: { value?: Record<string, unknown> }): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    captured.value = params.options as Record<string, unknown>
    yield resultMsg()
  }
}

async function captureSdkOptions(input: Parameters<ClaudeCodeBackend['start']>[0]): Promise<Record<string, unknown>> {
  const captured: { value?: Record<string, unknown> } = {}
  const backend = new ClaudeCodeBackend(makeCaptureQuery(captured))
  const run = backend.start(input)
  for await (const _ of run.events) { void _ }
  return captured.value ?? {}
}

describe('ClaudeCodeBackend — resume 옵션 매핑 (Phase 1)', () => {
  it('R1: resumeSessionId 전달 → sdkOptions.resume === resumeSessionId', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      resumeSessionId: 'sess-abc-123',
    })
    expect(opts['resume']).toBe('sess-abc-123')
  })

  it('R2: resumeSessionId 미전달 → resume 키 없음 (회귀 0)', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect('resume' in opts).toBe(false)
  })

  it('R2b: resumeSessionId 빈 문자열 → resume 키 없음', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      resumeSessionId: '',
    })
    expect('resume' in opts).toBe(false)
  })
})

describe('ClaudeCodeBackend — session 이벤트 emit (Phase 1)', () => {
  it('R3: system/init(session_id) → session 이벤트 emit', async () => {
    const queryFn: QueryFn = async function* () {
      yield { type: 'system' as const, subtype: 'init' as const, session_id: 'sess-xyz-789' } as unknown as ReturnType<typeof resultMsg>
      yield resultMsg()
    }
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const sessionEvent = events.find((e) => e.type === 'session')
    expect(sessionEvent).toEqual({ type: 'session', sessionId: 'sess-xyz-789' })
  })
})

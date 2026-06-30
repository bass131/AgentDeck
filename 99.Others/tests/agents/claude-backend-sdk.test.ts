/**
 * claude-backend-sdk.test.ts — ClaudeCodeBackend SDK 전환 단위 테스트 (Phase 21b TDD)
 *
 * mock queryFn으로 fixture SDKMessage[]를 yield — 실 네트워크 0.
 * lazy query injection 패턴 검증 (결정 #8).
 *
 * 완료조건 검증:
 * ② mock query → AgentEvent 스트림 (text→tool_call→tool_result→done+usage+contextWindow)
 * ② stream_event yield 무시
 * ③ is_error=true → error+done
 * ④ abort 멱등 + signal 관찰 mock generator 종료
 * ⑤ canUseTool 자동허용 (readonly/auto/bypass/normal/plan/acceptEdits)
 * ⑥ TODO(M4-4) 마커 소스 존재
 * isAvailable / version 타입
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 픽스처 SDKMessage 헬퍼 ─────────────────────────────────────────────────────

/** SDK system/init 메시지 픽스처 */
function mkInit(sessionId = 'test-session-001') {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: sessionId,
    model: 'claude-haiku-4-5-20251001',
    tools: ['Bash', 'Read'],
    cwd: '/workspace',
    apiKeySource: 'user' as const,
    betas: [],
    claude_code_version: '1.0.0',
    mcp_servers: [],
    permissionMode: 'acceptEdits' as const,
    slash_commands: [],
    output_style: 'stream-json',
    skills: [],
    plugins: [],
    uuid: 'uuid-init-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

/** SDK assistant 메시지 픽스처 (텍스트 + tool_use) */
function mkAssistant(text: string, toolUse?: { id: string; name: string; input: unknown }) {
  const content: unknown[] = []
  if (text) content.push({ type: 'text', text })
  if (toolUse) content.push({ type: 'tool_use', id: toolUse.id, name: toolUse.name, input: toolUse.input })
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content,
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-001',
  }
}

/** SDK user 메시지 픽스처 (tool_result) */
function mkToolResult(toolUseId: string, output: unknown, isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: isError,
          content: output
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: 'uuid-user-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-001',
  }
}

/** SDK result 메시지 픽스처 (성공) */
function mkResultSuccess(opts: { modelUsage?: Record<string, { contextWindow: number; [k: string]: unknown }> } = {}) {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 100,
    duration_api_ms: 80,
    num_turns: 1,
    result: 'Done',
    stop_reason: 'end_turn',
    total_cost_usd: 0.001,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    },
    modelUsage: opts.modelUsage ?? {
      'claude-haiku-4-5-20251001': {
        contextWindow: 200000,
        inputTokens: 100,
        outputTokens: 20,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0.001,
        maxOutputTokens: 8096
      }
    },
    permission_denials: [],
    errors: [],
    uuid: 'uuid-rslt-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-001',
  }
}

/** SDK result 메시지 픽스처 (실패) */
function mkResultError(subtype: 'error_during_execution' | 'error_max_turns' = 'error_during_execution') {
  return {
    type: 'result' as const,
    subtype,
    is_error: true,
    duration_ms: 100,
    duration_api_ms: 80,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: {
      input_tokens: 50,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    },
    modelUsage: {},
    permission_denials: [],
    errors: ['Tool execution failed: something went wrong'],
    uuid: 'uuid-rerr-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-001',
  }
}

/** stream_event 픽스처 (partial, 이 phase 무시) */
function mkStreamEvent() {
  return {
    type: 'stream_event' as const,
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
    parent_tool_use_id: null,
    uuid: 'uuid-strm-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-001',
  }
}

/**
 * mock queryFn 생성.
 * messages 배열을 async generator로 yield.
 * abortController.signal.aborted가 되면 중단.
 */
function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) {
        return
      }
      yield msg
    }
  }
}

// ── ClaudeCodeBackend 테스트 ───────────────────────────────────────────────────

describe('ClaudeCodeBackend — SDK query 전환 (Phase 21b)', () => {
  describe('② 정상 실행 — mock query → AgentEvent 스트림', () => {
    it('init→assistant(text+tool_use)→user(tool_result)→result → text,tool_call,tool_result,done', async () => {
      const toolId = 'toolu_test_001'
      const messages = [
        mkInit(),
        mkAssistant('I will help you.', { id: toolId, name: 'Bash', input: { command: 'ls' } }),
        mkToolResult(toolId, [{ type: 'text', text: 'file1.ts\nfile2.ts' }]),
        mkResultSuccess({
          modelUsage: {
            'claude-haiku-4-5-20251001': {
              contextWindow: 200000,
              inputTokens: 100,
              outputTokens: 20,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
              webSearchRequests: 0,
              costUSD: 0.001,
              maxOutputTokens: 8096
            }
          }
        })
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({
        messages: [{ role: 'user', content: 'run ls' }]
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      // text 이벤트
      const textEvents = events.filter(e => e.type === 'text')
      expect(textEvents).toHaveLength(1)
      expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('I will help you.')

      // tool_call 이벤트
      const toolCalls = events.filter(e => e.type === 'tool_call')
      expect(toolCalls).toHaveLength(1)
      expect((toolCalls[0] as { type: 'tool_call'; name: string }).name).toBe('Bash')

      // tool_result 이벤트
      const toolResults = events.filter(e => e.type === 'tool_result')
      expect(toolResults).toHaveLength(1)
      expect((toolResults[0] as { type: 'tool_result'; ok: boolean }).ok).toBe(true)

      // done 이벤트
      const doneEvents = events.filter(e => e.type === 'done')
      expect(doneEvents).toHaveLength(1)
      const done = doneEvents[0] as { type: 'done'; contextWindow?: number; usage?: { inputTokens: number } }
      expect(done.contextWindow).toBe(200000)
      expect(done.usage?.inputTokens).toBe(100)

      // 마지막 이벤트는 done
      expect(events[events.length - 1].type).toBe('done')

      // error 이벤트 없음
      expect(events.filter(e => e.type === 'error')).toHaveLength(0)
    })

    it('② stream_event는 AgentEvent로 정규화됨 (Phase 33 M5: text_delta → text 이벤트)', async () => {
      // Phase 33 M5: stream_event content_block_delta text_delta → text 이벤트 emit.
      // mkStreamEvent() = { type:'stream_event', event:{type:'content_block_delta', delta:{type:'text_delta', text:'partial'}} }
      // full assistant 메시지 'Hello!'는 delta가 수신됐으므로 suppress됨(_streamedThisMsg=true).
      const messages = [
        mkInit(),
        mkStreamEvent(), // 이제 text 이벤트(delta:'partial')를 emit
        mkAssistant('Hello!'), // 델타 수신 후 → suppress
        mkStreamEvent(), // 두 번째 assistant 경계 후이므로 — 이 경우는 _streamedThisMsg=false로 리셋 후 delta
        mkResultSuccess()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      // stream_event raw 타입이 없어야 함 (정규화됨)
      expect(events.filter(e => (e as { type: string }).type === 'stream_event')).toHaveLength(0)
      // text는 있어야 함 (델타에서 emit)
      expect(events.filter(e => e.type === 'text').length).toBeGreaterThanOrEqual(1)
      // done 있어야 함
      expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    })
  })

  describe('③ result is_error=true → error+done', () => {
    it('error_during_execution → error + done', async () => {
      const messages = [
        mkInit(),
        mkResultError('error_during_execution')
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'do something' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.filter(e => e.type === 'error')).toHaveLength(1)
      expect(events[events.length - 1].type).toBe('done')
    })

    it('error_max_turns → error + done', async () => {
      const messages = [
        mkInit(),
        mkResultError('error_max_turns')
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'long task' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.filter(e => e.type === 'error')).toHaveLength(1)
      expect(events[events.length - 1].type).toBe('done')
    })
  })

  describe('④ abort 멱등 + signal 관찰', () => {
    it('abort() 두 번 호출해도 예외 없음 (멱등)', async () => {
      const backend = new ClaudeCodeBackend(makeMockQueryFn([mkInit(), mkResultSuccess()]))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

      expect(() => {
        run.abort()
        run.abort()
      }).not.toThrow()

      // drain (abort 이후에도 안전하게 소비)
      for await (const _ of run.events) { /* drain */ }
    })

    it('abort 즉시 호출 → events iterable이 종료된다', async () => {
      // abort controller signal을 관찰하는 느린 generator
      const slowQuery: QueryFn = async function* (params) {
        const opts = params.options as { abortController?: AbortController } | undefined
        const signal = opts?.abortController?.signal
        for (let i = 0; i < 100; i++) {
          if (signal?.aborted) return
          yield mkAssistant(`chunk ${i}`)
          await new Promise(r => setTimeout(r, 1))
        }
        yield mkResultSuccess()
      }

      const backend = new ClaudeCodeBackend(slowQuery)
      const run = backend.start({ messages: [{ role: 'user', content: 'test abort' }] })

      // 첫 번째 이벤트를 가져온 후 abort
      const events: AgentEvent[] = []
      const iterator = (run.events as AsyncIterable<AgentEvent>)[Symbol.asyncIterator]()
      const first = await iterator.next()
      if (!first.done) events.push(first.value)
      run.abort()

      // abort 후 generator가 종료되어야 함 (무한 대기 X)
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('timeout: iterable did not terminate after abort')), 3000)
      )
      const drainPromise = (async () => {
        let next = await iterator.next()
        while (!next.done) {
          if (next.value) events.push(next.value)
          next = await iterator.next()
        }
      })()

      await Promise.race([drainPromise, timeoutPromise])
      // abort 후 종료됨 (무한 루프 없음)
      expect(true).toBe(true)
    }, 5000)

    it('events는 AsyncIterable (abort 전후 모두)', async () => {
      const backend = new ClaudeCodeBackend(makeMockQueryFn([mkInit(), mkResultSuccess()]))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

      expect(Symbol.asyncIterator in run.events).toBe(true)
      run.abort()
      expect(Symbol.asyncIterator in run.events).toBe(true)
      // drain
      for await (const _ of run.events) { /* drain */ }
    })
  })

  // ⑤는 Phase 24c에서 사양이 바뀌었다(M4-1 "자동허용" → 부수효과 도구는 사용자에게 발화).
  // readonly·auto/bypass는 여전히 자동 허용. Bash/Write/Edit 등 부수효과는 발화(대기)하므로
  // default 모드에서 즉시 allow하지 않는다. 발화 자체의 deny/allow/allow_always 검증은
  // claude-permission.test.ts(권한 양방향 흐름)에서 수행한다.
  describe('⑤ canUseTool 권한 게이트 (Phase 24c)', () => {
    it('readonly 도구는 default 모드에서도 즉시 allow', async () => {
      let capturedCanUseTool: ((toolName: string, input: Record<string, unknown>, opts: { signal: AbortSignal; toolUseID: string }) => Promise<{ behavior: string; updatedInput: unknown }>) | undefined

      const captureQuery: QueryFn = async function* (params) {
        const opts = params.options as { canUseTool?: unknown } | undefined
        capturedCanUseTool = opts?.canUseTool as typeof capturedCanUseTool
        yield mkResultSuccess()
      }

      const backend = new ClaudeCodeBackend(captureQuery)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { /* drain */ }

      expect(capturedCanUseTool).toBeDefined()
      if (capturedCanUseTool) {
        const signal = new AbortController().signal
        for (const tool of ['Read', 'Glob', 'Grep', 'WebFetch']) {
          const result = await capturedCanUseTool(tool, {}, { signal, toolUseID: 'test' })
          expect(result.behavior).toBe('allow')
        }
      }
    })

    it('auto/bypass(picker id) 모드는 부수효과 도구도 즉시 allow', async () => {
      let capturedCanUseTool: ((toolName: string, input: Record<string, unknown>, opts: { signal: AbortSignal; toolUseID: string }) => Promise<{ behavior: string; updatedInput: unknown }>) | undefined

      const captureQuery: QueryFn = async function* (params) {
        const opts = params.options as { canUseTool?: unknown } | undefined
        capturedCanUseTool = opts?.canUseTool as typeof capturedCanUseTool
        yield mkResultSuccess()
      }

      const backend = new ClaudeCodeBackend(captureQuery)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }], mode: 'auto' })
      for await (const _ of run.events) { /* drain */ }

      if (capturedCanUseTool) {
        const signal = new AbortController().signal
        for (const tool of ['Bash', 'Write', 'Edit']) {
          const result = await capturedCanUseTool(tool, { command: 'x' }, { signal, toolUseID: 'test' })
          expect(result.behavior).toBe('allow')
        }
      }
    })
  })

  describe('⑥ AskUserQuestion 질문카드 구현 완료 (Phase 24d)', () => {
    it('ClaudeCodeBackend.ts 소스에 _handleAskQuestion 구현이 있음', async () => {
      const fs = await import('node:fs')
      const src = fs.readFileSync('02.Source/main/01_agents/ClaudeCodeBackend.ts', 'utf8')
      // Phase 24d 구현 완료: _handleAskQuestion, parseQuestions, formatAnswers
      expect(src).toContain('_handleAskQuestion')
      expect(src).toContain('parseQuestions')
      expect(src).toContain('formatAnswers')
    })
  })

  describe('isAvailable / version', () => {
    it('isAvailable()이 Promise<boolean>을 반환한다', async () => {
      const backend = new ClaudeCodeBackend()
      const result = backend.isAvailable()
      expect(result).toBeInstanceOf(Promise)
      const value = await result
      expect(typeof value).toBe('boolean')
    })

    it('version()이 Promise<string|null>을 반환한다', async () => {
      const backend = new ClaudeCodeBackend()
      const result = backend.version()
      expect(result).toBeInstanceOf(Promise)
      const value = await result
      expect(value === null || typeof value === 'string').toBe(true)
    })

    it('id가 "claude-code"다', async () => {
      const backend = new ClaudeCodeBackend()
      expect(backend.id).toBe('claude-code')
    })
  })

  describe('user 메시지 없을 때', () => {
    it('user 메시지 없으면 error + done을 yield한다', async () => {
      const backend = new ClaudeCodeBackend(makeMockQueryFn([]))
      const run = backend.start({
        messages: [] // user 메시지 없음
      })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      // user 메시지 없으면 error + done
      expect(events.some(e => e.type === 'error')).toBe(true)
      expect(events[events.length - 1].type).toBe('done')
    })
  })

  describe('queryFn 예외 처리', () => {
    it('queryFn throw → error + done', async () => {
      const throwingQuery: QueryFn = async function* (_params) {
        throw new Error('SDK connection failed')
        // eslint-disable-next-line no-unreachable
        yield {} // unreachable - satisfies generator return type
      }

      const backend = new ClaudeCodeBackend(throwingQuery)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

      const events: AgentEvent[] = []
      for await (const event of run.events) {
        events.push(event)
      }

      expect(events.some(e => e.type === 'error')).toBe(true)
      expect(events[events.length - 1].type).toBe('done')
    })
  })
})

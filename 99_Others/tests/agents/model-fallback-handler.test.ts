/**
 * model-fallback-handler.test.ts — Phase 32 TDD: onUserDialog emit + system dedup 통합 테스트
 *
 * makeCaptureQuery 패턴으로 opts.onUserDialog 캡처 후 실제 펌프 통과 검증.
 * 합성 dialog/system 주입 — 실 Fable 거부는 비결정이라 합성 사용(그 사실 명시).
 *
 * 검증 항목(3케이스):
 *  H1. dialog-only → emit 1회(retractMessageId=_curTextId 또는 null) + return {behavior:'completed',result:'retry_fallback'}
 *  H2. system-only(model_refusal_fallback) → emit 1회(retractMessageId=null)
 *  H3. dialog+system → dedup으로 총 emit 1회(pendingFallbackNotices 카운터 동작)
 *
 * 추가 검증:
 *  H4. dialogKind !== 'refusal_fallback_prompt' → {behavior:'cancelled'} 반환, emit 0
 *  H5. dialog emit 시 retractMessageId = _curTextId (텍스트 스트리밍 중이던 버블 제거)
 *  H6. system emit 시 retractMessageId = null (turn 끝 stream id 재사용 금지)
 *  H7. supportedDialogKinds 옵션에 'refusal_fallback_prompt' 포함됨
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

type OnUserDialog = (dlg: {
  dialogKind: string
  payload?: Record<string, unknown>
}) => Promise<{ behavior: string; result?: string }>

interface Captured {
  onUserDialog?: OnUserDialog
  supportedDialogKinds?: string[]
  options?: Record<string, unknown>
}

/**
 * makeCaptureQuery: claude-question.test.ts L49-67 패턴 재사용.
 * opts.onUserDialog를 캡처하고, 지정된 messages를 yield.
 * runWithCapture: onUserDialog 캡처 후, 메시지 yield 전에 실행할 콜백.
 */
function makeCaptureQuery(
  messages: unknown[],
  cap: Captured,
  runWithCapture?: () => Promise<void>
): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    cap.options = opts
    cap.onUserDialog = opts?.onUserDialog as OnUserDialog | undefined
    cap.supportedDialogKinds = opts?.supportedDialogKinds as string[] | undefined
    if (runWithCapture) {
      await runWithCapture()
    }
    for (const msg of messages) {
      const ab = opts?.abortController as AbortController | undefined
      if (ab?.signal.aborted) return
      yield msg
    }
  }
}

function mkResult() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    usage: { input_tokens: 1, output_tokens: 1 },
    modelUsage: {},
    errors: [],
  }
}

function mkSystemFallback(
  originalModel = 'claude-fable-5',
  fallbackModel = 'claude-opus-4-8',
  apiRefusalCategory?: string
) {
  return {
    type: 'system',
    subtype: 'model_refusal_fallback',
    original_model: originalModel,
    fallback_model: fallbackModel,
    ...(apiRefusalCategory !== undefined ? { api_refusal_category: apiRefusalCategory } : {}),
  }
}

function makeBackend(queryFn: QueryFn): ClaudeCodeBackend {
  return new ClaudeCodeBackend(queryFn, () => null, () => null)
}

function getFallbackEvents(events: AgentEvent[]) {
  return events.filter(
    (e): e is Extract<AgentEvent, { type: 'model-fallback' }> => e.type === 'model-fallback'
  )
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('model-fallback 핸들러 통합(합성 주입)', () => {
  it('H7. sdkOptions에 supportedDialogKinds:[refusal_fallback_prompt] 포함', async () => {
    const cap: Captured = {}
    const queryFn = makeCaptureQuery([mkResult()], cap)
    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    await drain(run.events)

    expect(cap.supportedDialogKinds).toContain('refusal_fallback_prompt')
  })

  it('H1. dialog-only: emit 1회, behavior=completed, result=retry_fallback', async () => {
    const cap: Captured = {}

    // onUserDialog 호출 결과를 저장
    let dialogResult: { behavior: string; result?: string } | undefined

    const queryFn = makeCaptureQuery(
      [mkResult()],
      cap,
      async () => {
        // onUserDialog 캡처 후 즉시 호출
        if (cap.onUserDialog) {
          dialogResult = await cap.onUserDialog({
            dialogKind: 'refusal_fallback_prompt',
            payload: {
              originalModel: 'claude-fable-5',
              fallbackModel: 'claude-opus-4-8',
            },
          })
        }
      }
    )

    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    // emit 1회
    expect(fallbacks).toHaveLength(1)
    // behavior=completed, result=retry_fallback
    expect(dialogResult?.behavior).toBe('completed')
    expect(dialogResult?.result).toBe('retry_fallback')
    // fromModel/toModel 정확
    expect(fallbacks[0].fromModel).toBe('claude-fable-5')
    expect(fallbacks[0].toModel).toBe('claude-opus-4-8')
  })

  it('H2. system-only: emit 1회, retractMessageId=null', async () => {
    const cap: Captured = {}
    // system 메시지만 포함 (dialog 없음)
    const messages = [
      mkSystemFallback('claude-fable-5', 'claude-opus-4-8', 'cyber'),
      mkResult(),
    ]

    const queryFn = makeCaptureQuery(messages, cap)
    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    // emit 1회
    expect(fallbacks).toHaveLength(1)
    // system 경로: retractMessageId=null
    expect(fallbacks[0].retractMessageId).toBeNull()
    // fromModel=snake_case 필드에서 추출
    expect(fallbacks[0].fromModel).toBe('claude-fable-5')
    expect(fallbacks[0].toModel).toBe('claude-opus-4-8')
  })

  it('H3. dialog+system: dedup으로 총 emit 1회(_pendingFallbackNotices)', async () => {
    const cap: Captured = {}

    // dialog를 먼저 호출하고, 그 다음 system 메시지도 yield
    const queryFn = makeCaptureQuery(
      [
        // system 메시지: _pendingFallbackNotices>0이면 카운터 감소만 (emit 없음)
        mkSystemFallback('claude-fable-5', 'claude-opus-4-8'),
        mkResult(),
      ],
      cap,
      async () => {
        // dialog를 먼저 호출 → _pendingFallbackNotices++, emit 1회
        if (cap.onUserDialog) {
          await cap.onUserDialog({
            dialogKind: 'refusal_fallback_prompt',
            payload: {
              originalModel: 'claude-fable-5',
              fallbackModel: 'claude-opus-4-8',
            },
          })
        }
      }
    )

    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    // dedup: dialog emit 1회 + system이 카운터 감소만 → 총 1회
    expect(fallbacks).toHaveLength(1)
  })

  it('H4. dialogKind !== refusal_fallback_prompt → {behavior:cancelled}, emit 0', async () => {
    const cap: Captured = {}

    let dialogResult: { behavior: string } | undefined

    const queryFn = makeCaptureQuery(
      [mkResult()],
      cap,
      async () => {
        if (cap.onUserDialog) {
          dialogResult = await cap.onUserDialog({
            dialogKind: 'some_other_dialog',
            payload: { someField: 'value' },
          })
        }
      }
    )

    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    // emit 0
    expect(fallbacks).toHaveLength(0)
    // behavior=cancelled
    expect(dialogResult?.behavior).toBe('cancelled')
  })

  it('H5. dialog 후 retractMessageId: text 스트리밍 없으면 null', async () => {
    const cap: Captured = {}

    const queryFn = makeCaptureQuery(
      [mkResult()],
      cap,
      async () => {
        // text 이벤트 없이 dialog → _curTextId=null → retractMessageId=null
        if (cap.onUserDialog) {
          await cap.onUserDialog({
            dialogKind: 'refusal_fallback_prompt',
            payload: { originalModel: 'claude-fable-5', fallbackModel: 'claude-opus-4-8' },
          })
        }
      }
    )

    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    expect(fallbacks).toHaveLength(1)
    // text 없으면 _curTextId=null → retractMessageId=null
    expect(fallbacks[0].retractMessageId).toBeNull()
  })

  it('H6. system 경로는 항상 retractMessageId=null (전용 경로 보증)', async () => {
    const cap: Captured = {}
    // text assistant 메시지가 있어도 system 경로는 retract=null
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: '일부 답변...' }],
          usage: { input_tokens: 5, output_tokens: 5 },
        },
      },
      mkSystemFallback('claude-fable-5', 'claude-opus-4-8'),
      mkResult(),
    ]

    const queryFn = makeCaptureQuery(messages, cap)
    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    expect(fallbacks).toHaveLength(1)
    expect(fallbacks[0].retractMessageId).toBeNull()
  })

  it('H8. system msg에서 fromModel/toModel은 snake_case 필드로 추출', async () => {
    const cap: Captured = {}
    const messages = [
      {
        type: 'system',
        subtype: 'model_refusal_fallback',
        original_model: 'claude-fable-5',
        fallback_model: 'claude-opus-4-8',
        api_refusal_category: 'bio',
      },
      mkResult(),
    ]

    const queryFn = makeCaptureQuery(messages, cap)
    const backend = makeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '테스트' }],
      model: 'claude-sonnet-4-6',
      mode: 'normal',
    })
    const events = await drain(run.events)
    const fallbacks = getFallbackEvents(events)

    expect(fallbacks).toHaveLength(1)
    expect(fallbacks[0].fromModel).toBe('claude-fable-5')
    expect(fallbacks[0].toModel).toBe('claude-opus-4-8')
    // text에 생물학 포함
    expect(fallbacks[0].text).toContain('생물학')
  })
})

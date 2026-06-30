/**
 * model-fallback-notice.test.ts — Phase 32 TDD: fallbackNotice 텍스트 단위 테스트
 *
 * 검증 항목:
 *  N1. from/to/category 모두 있을 때 — 한국어 문구 + 분류 괄호.
 *  N2. category 없으면(빈 문자열) — 분류 괄호 생략.
 *  N3. category=undefined → 괄호 생략.
 *  N4. 빈 from → modelDisplay graceful degrade('다른 모델').
 *  N5. 빈 to → modelDisplay graceful degrade('다른 모델').
 *  N6. 알 수 없는 모델 ID → 문자열 그대로 표시.
 *  N7. REFUSAL_CATEGORY_LABEL 매핑: 'cyber'→'사이버 보안', 'bio'→'생물학'.
 *  N8. 알 수 없는 category 코드 → 코드 그대로 표시.
 *
 * modelDisplay: 'claude-fable-5' → 'Fable 5', 'claude-opus-4-8' → 'Opus 4.8'
 * fallbackNotice: 내보내지 않는 내부 함수이므로 ClaudeCodeBackend 통합으로 간접 검증.
 * 단, ClaudeCodeBackend는 testable export가 없으므로 emit된 text 필드로 검증한다.
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

/**
 * dialog 이벤트를 캡처해 onUserDialog를 호출하는 mock queryFn.
 * refusal_fallback_prompt dialog를 시뮬레이션한다.
 */
function makeDialogQueryFn(
  dialogPayload: Record<string, unknown>
): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    const onUserDialog = opts?.onUserDialog as
      | ((dlg: { dialogKind: string; payload?: Record<string, unknown> }) => Promise<unknown>)
      | undefined

    if (onUserDialog) {
      await onUserDialog({
        dialogKind: 'refusal_fallback_prompt',
        payload: dialogPayload,
      })
    }

    // dialog-only: system 메시지 없이 result만 yield
    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      usage: { input_tokens: 1, output_tokens: 1 },
      modelUsage: {},
      errors: [],
    }
  }
}

function makeBackend(queryFn: QueryFn): ClaudeCodeBackend {
  return new ClaudeCodeBackend(
    queryFn,
    () => null,
    () => null
  )
}

async function collectFallbackEvents(queryFn: QueryFn): Promise<Extract<AgentEvent, { type: 'model-fallback' }>[]> {
  const backend = makeBackend(queryFn)
  const run = backend.start({
    messages: [{ role: 'user', content: '테스트' }],
    model: 'claude-sonnet-4-6',
    mode: 'normal',
  })
  const events = await drain(run.events)
  return events.filter(
    (e): e is Extract<AgentEvent, { type: 'model-fallback' }> => e.type === 'model-fallback'
  )
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('fallbackNotice 텍스트 단위', () => {
  it('N1. from/to/category 모두 있을 때 — 분류 괄호 포함', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
        apiRefusalCategory: 'cyber',
      })
    )
    expect(events).toHaveLength(1)
    const text = events[0].text
    // 폴백 모델 표시 이름 포함
    expect(text).toContain('Fable 5')
    expect(text).toContain('Opus 4.8')
    // 분류 괄호 포함
    expect(text).toContain('사이버 보안')
    // 한국어 문구 키워드
    expect(text).toContain('안전 정책')
    expect(text).toContain('자동 전환')
  })

  it('N2. category 없으면(빈 문자열) — 분류 괄호 생략', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
        apiRefusalCategory: '',
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].text).not.toContain('감지 분류')
    expect(events[0].text).not.toContain('(')
  })

  it('N3. category=undefined → 괄호 생략', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
        // apiRefusalCategory 미전달
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].text).not.toContain('감지 분류')
  })

  it('N4. 빈 from → modelDisplay graceful degrade("다른 모델")', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: '',
        fallbackModel: 'claude-opus-4-8',
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('다른 모델')
    expect(events[0].fromModel).toBe('')
  })

  it('N5. 빈 to → modelDisplay graceful degrade("다른 모델")', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: '',
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('다른 모델')
    expect(events[0].toModel).toBe('')
  })

  it('N6. 알 수 없는 모델 ID → 문자열 그대로 표시', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'some-unknown-model',
        fallbackModel: 'another-unknown',
      })
    )
    expect(events).toHaveLength(1)
    // modelDisplay가 패턴 매칭 실패 → raw string 그대로
    expect(events[0].text).toContain('some-unknown-model')
    expect(events[0].text).toContain('another-unknown')
  })

  it('N7. REFUSAL_CATEGORY_LABEL 매핑: bio → 생물학', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
        apiRefusalCategory: 'bio',
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('생물학')
  })

  it('N8. 알 수 없는 category 코드 → 코드 그대로 표시', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
        apiRefusalCategory: 'weapons',
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('weapons')
  })

  it('N9. fromModel/toModel 필드는 raw 모델 ID string(typeof 가드 통과)', async () => {
    const events = await collectFallbackEvents(
      makeDialogQueryFn({
        originalModel: 'claude-fable-5',
        fallbackModel: 'claude-opus-4-8',
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0].fromModel).toBe('claude-fable-5')
    expect(events[0].toModel).toBe('claude-opus-4-8')
  })
})

/**
 * uc1-p10-orchestration-denied.test.ts — UC1 Phase 10: orchestration_denied 시스템 라인 표시.
 *
 * ADR-032 개정 v2 ④ — OFF 턴에 모델이 Workflow를 자발 호출해 canUseTool G4가 즉시 거부하면
 * (P08 계약·P09 방출) renderer가 대화 thread에 시스템 라인(kind:'notice', 기존 model-fallback과
 * 동일 관례)으로 표시한다. 새 시각 문법 0 — 기존 NoticeItem(경고색 notice-row) 재사용.
 *
 * 검증 범위:
 *   R1. orchestration_denied 이벤트('orchestration-off') → thread에 kind:'notice' 아이템 push.
 *   R2. 표시 카피는 reason별 매핑(copyForOrchestrationDenied) — 알려진 reason 정확 문구.
 *   R3. 알 수 없는 reason → 기본 카피로 안전 폴백(예외 없이).
 *   R4. dedup: 직전 thread 아이템이 동일 reason의 denied 라인이면 스킵(라인 도배 방지).
 *   R5. dedup: reason이 다르면 스킵하지 않음(각각 별개 라인).
 *   R6. dedup: 사이에 다른 아이템(msg 등)이 끼면 다시 push(인접 비교만 — 과설계 방지).
 *   R7. notice id 접두사는 'dn'이고 seq+1을 사용(다른 id 접두사와 충돌 0).
 */
import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'
import {
  copyForOrchestrationDenied,
  ORCHESTRATION_DENIED_COPY,
  DEFAULT_ORCHESTRATION_DENIED_COPY,
} from '../../../02.Source/renderer/src/lib/orchestrationDeniedCopy'

const runId = 'run-denied'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

function deniedEvent(id: string, reason = 'orchestration-off') {
  return { type: 'orchestration_denied' as const, id, reason: reason as 'orchestration-off' }
}

function noticeItems(state: AppState): Extract<ThreadItem, { kind: 'notice' }>[] {
  return state.thread.filter(
    (item): item is Extract<ThreadItem, { kind: 'notice' }> => item.kind === 'notice'
  )
}

// ── R2/R3: 카피 매핑 (순수 함수 단위 테스트) ─────────────────────────────────────

describe('copyForOrchestrationDenied — reason → 카피 매핑', () => {
  it('R2. 알려진 reason(orchestration-off) → 등록된 정확 문구', () => {
    expect(copyForOrchestrationDenied('orchestration-off')).toBe(
      ORCHESTRATION_DENIED_COPY['orchestration-off']
    )
    expect(copyForOrchestrationDenied('orchestration-off')).toContain('UltraCode')
  })

  it('R3. 알 수 없는 reason → 기본 카피로 폴백(예외 없음)', () => {
    expect(copyForOrchestrationDenied('some-future-reason')).toBe(
      DEFAULT_ORCHESTRATION_DENIED_COPY
    )
  })
})

// ── R1/R7: reducer → thread 아이템 생성 ──────────────────────────────────────────

describe('applyAgentEvent: orchestration_denied — R1/R7 thread push', () => {
  it('R1. 이벤트 → thread에 kind:\'notice\' 아이템 1개 push', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(deniedEvent('tool-1')))

    const notices = noticeItems(s1)
    expect(notices).toHaveLength(1)
    expect(notices[0].text).toBe(ORCHESTRATION_DENIED_COPY['orchestration-off'])
  })

  it('R7. notice id는 dn+(seq+1) 형식이고 seq가 증가한다', () => {
    const base = makeInitialState()
    const withSeq: AppState = { ...base, seq: 3 }

    const s1 = applyAgentEvent(withSeq, payload(deniedEvent('tool-1')))

    const notices = noticeItems(s1)
    expect(notices[0].id).toBe('dn4')
    expect(s1.seq).toBe(4)
  })

  it('알 수 없는 reason 이벤트도 thread에 기본 카피로 push된다(안전 처리)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload(deniedEvent('tool-x', 'some-future-reason'))
    )

    const notices = noticeItems(s1)
    expect(notices).toHaveLength(1)
    expect(notices[0].text).toBe(DEFAULT_ORCHESTRATION_DENIED_COPY)
  })
})

// ── R4/R5/R6: dedup 규칙 ────────────────────────────────────────────────────────

describe('applyAgentEvent: orchestration_denied — dedup 규칙', () => {
  it('R4. 직전 아이템이 동일 reason의 denied 라인이면 연속 이벤트를 스킵', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(deniedEvent('tool-1')))
    const s2 = applyAgentEvent(s1, payload(deniedEvent('tool-2'))) // 같은 reason, 다른 도구 id

    expect(noticeItems(s2)).toHaveLength(1)
    // seq도 두 번째 이벤트에서 증가하지 않아야 함(no-op)
    expect(s2.seq).toBe(s1.seq)
  })

  it('R5. reason이 다르면 dedup되지 않고 별개 라인으로 push', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(deniedEvent('tool-1', 'orchestration-off')))
    const s2 = applyAgentEvent(s1, payload(deniedEvent('tool-2', 'some-other-reason')))

    expect(noticeItems(s2)).toHaveLength(2)
  })

  it('R6. 사이에 다른 thread 아이템(msg)이 끼면 인접이 아니므로 다시 push', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(deniedEvent('tool-1')))
    const withMsg: AppState = {
      ...s1,
      thread: [...s1.thread, { kind: 'msg', id: 'm1', role: 'assistant', text: '중간 답변' }],
    }
    const s2 = applyAgentEvent(withMsg, payload(deniedEvent('tool-2')))

    expect(noticeItems(s2)).toHaveLength(2)
  })

  it('model-fallback notice 뒤에 온 denied는 dedup 대상 아님(denyReason 미지정과 비교)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'model-fallback',
        fromModel: 'A',
        toModel: 'B',
        text: '폴백 알림',
        retractMessageId: null,
      } as AgentEventPayload['event'])
    )
    const s2 = applyAgentEvent(s1, payload(deniedEvent('tool-1')))

    expect(noticeItems(s2)).toHaveLength(2)
  })
})

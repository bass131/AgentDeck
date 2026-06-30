/**
 * panel-session.test.ts — panelApply 순수 리듀서 단위 테스트 (TDD-first).
 *
 * Node 환경(window.api 불필요). 완전 순수 함수 — AgentEventPayload를
 * PanelSessionState에 적용하는 panelApply를 검증한다.
 *
 * Phase A-2 이행: streamingText/toolCards/messages deprecated 필드 제거.
 * panelApply는 applyAgentEvent를 위임하므로 thread 모델로 동작.
 *
 * 검증 범위:
 *   (1) 자기 runId 일치 + text 이벤트 → thread에 assistant msg 누적
 *   (2) 타 runId payload → state 불변 (타 패널 무시)
 *   (3) done 이벤트 → thread의 assistant msg 보존 + isRunning false + openMsgId/openGroupId null
 *   (4) error 이벤트 → errorMessage 설정 + isRunning false
 *   (5) panelApply는 원본 state를 변경하지 않는다 (순수함수)
 */
import { describe, it, expect } from 'vitest'
import {
  panelApply,
  makePanelInitialState,
} from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../../02.Source/renderer/src/store/panelSession'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function mkPayload(runId: string, event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

/** thread에서 마지막 assistant msg 텍스트 추출 */
function lastAssistantText(state: PanelSessionState): string {
  const msgs = state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'assistant'
    )
  return msgs[msgs.length - 1]?.text ?? ''
}

/** thread에서 모든 toolgroup의 카드 목록 */
function allToolCards(state: PanelSessionState) {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools)
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (1) 자기 runId 일치 + text 이벤트 → thread에 assistant msg 누적', () => {
  it('currentRunId=r1 + payload{runId:r1, text} → thread에 assistant msg 추가', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'hi' }))
    expect(lastAssistantText(s1)).toBe('hi')
  })

  it('text 이벤트 2회 → thread assistant msg에 연속 누적', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'hello' }))
    const s2 = panelApply(s1, mkPayload('r1', { type: 'text', delta: ' world' }))
    expect(lastAssistantText(s2)).toBe('hello world')
  })

  it('text 이벤트 후 isRunning=true', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'x' }))
    expect(s1.isRunning).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (2) 타 runId payload → state 불변 (타 패널 무시)', () => {
  it('currentRunId=r1 + payload{runId:r2} → state 그대로 반환', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r2', { type: 'text', delta: 'ignored' }))
    expect(s1).toBe(s0) // 동일 참조 — state 미변경
  })

  it('타 runId의 tool_call 이벤트도 무시된다 → thread에 toolgroup 없음', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(
      s0,
      mkPayload('r99', { type: 'tool_call', id: 'tc-x', name: 'bash', input: {} })
    )
    expect(allToolCards(s1)).toHaveLength(0)
  })

  it('currentRunId=null → 모든 runId payload 무시', () => {
    const s0 = makePanelInitialState() // currentRunId: null
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'x' }))
    expect(s1).toBe(s0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (3) done 이벤트 → thread assistant msg 보존 + isRunning false', () => {
  it('done 이벤트 → isRunning false', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      isRunning: true,
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    expect(s1.isRunning).toBe(false)
  })

  it('done 이벤트 → thread의 assistant msg 보존(Phase A-2: text 즉시 thread에 들어감)', () => {
    // text 이벤트 후 done → thread의 assistant msg가 보존됨(구 done-dance 제거)
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'assistant reply', messageId: 'msg-1' }))
    const s2 = panelApply(s1, mkPayload('r1', { type: 'done' }))
    // done 후에도 thread에 assistant msg가 보존됨
    expect(lastAssistantText(s2)).toBe('assistant reply')
    // done 후 openMsgId/openGroupId 리셋
    expect(s2.openMsgId).toBeNull()
    expect(s2.openGroupId).toBeNull()
  })

  it('done 이벤트 + 텍스트 없으면 thread에 assistant msg 없음', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    const assistantMsgs = s1.thread.filter(
      (item): item is Extract<ThreadItem, { kind: 'msg' }> =>
        item.kind === 'msg' && item.role === 'assistant'
    )
    expect(assistantMsgs).toHaveLength(0)
  })

  it('done 이벤트 → 기존 thread에 user msg가 있으면 보존된다', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      thread: [{ kind: 'msg' as const, id: 'u1', role: 'user' as const, text: 'hello' }],
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'reply', messageId: 'msg-a' }))
    const s2 = panelApply(s1, mkPayload('r1', { type: 'done' }))
    // user msg + assistant msg 2개 보존
    const msgs = s2.thread.filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    expect(msgs).toHaveLength(2)
    expect(msgs[1].role).toBe('assistant')
  })

  it('done 이벤트 + usage → lastUsage 저장', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(
      s0,
      mkPayload('r1', { type: 'done', usage: { inputTokens: 100, outputTokens: 50 } })
    )
    expect(s1.lastUsage?.inputTokens).toBe(100)
    expect(s1.lastUsage?.outputTokens).toBe(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (4) error 이벤트 → errorMessage 설정 + isRunning false', () => {
  it('error 이벤트 → errorMessage 설정', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1', isRunning: true }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'error', message: '엔진 오류' }))
    expect(s1.errorMessage).toBe('엔진 오류')
  })

  it('error 이벤트 → isRunning false', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1', isRunning: true }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'error', message: 'fail' }))
    expect(s1.isRunning).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (5) 순수함수 (원본 state 불변)', () => {
  it('panelApply는 원본 state를 변경하지 않는다', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const frozen = Object.freeze({ ...s0, thread: Object.freeze([...s0.thread]) as typeof s0.thread })
    // freeze된 상태에 적용해도 에러 없이 새 state 반환
    const s1 = panelApply(
      frozen as typeof s0,
      mkPayload('r1', { type: 'text', delta: 'x' })
    )
    expect(s1).not.toBe(frozen)
    // 원본 thread는 여전히 빈 배열 (불변)
    expect(frozen.thread).toHaveLength(0)
  })

  it('타 runId 이벤트 시 동일 참조 반환 (최적화 검증)', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r2', { type: 'text', delta: 'x' }))
    // 동일 참조 반환(타 패널 이벤트 최적화)
    expect(s1).toBe(s0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — runId 필터 불변식', () => {
  it('자기 runId와 다른 runId가 교차해도 자기 runId만 처리된다', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'my-run' }

    // 타 runId 이벤트 → 무시
    const s1 = panelApply(s0, mkPayload('other-run', { type: 'text', delta: '타 패널' }))
    expect(s1).toBe(s0)

    // 자기 runId 이벤트 → 처리
    const s2 = panelApply(s0, mkPayload('my-run', { type: 'text', delta: '내 패널' }))
    expect(lastAssistantText(s2)).toBe('내 패널')
  })
})

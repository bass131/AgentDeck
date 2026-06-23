/**
 * panel-session.test.ts — panelApply 순수 리듀서 단위 테스트 (TDD-first).
 *
 * Node 환경(window.api 불필요). 완전 순수 함수 — AgentEventPayload를
 * PanelSessionState에 적용하는 panelApply를 검증한다.
 *
 * 검증 범위:
 *   (1) 자기 runId 일치 + text 이벤트 → streamingText 누적
 *   (2) 타 runId payload → state 불변 (타 패널 무시)
 *   (3) done 이벤트 → streamingText 확정 messages 추가 + streamingText 리셋 + isRunning false
 *   (4) error 이벤트 → errorMessage 설정 + isRunning false
 *   (5) panelApply는 원본 state를 변경하지 않는다 (순수함수)
 */
import { describe, it, expect } from 'vitest'
import {
  panelApply,
  makePanelInitialState,
} from '../../src/renderer/src/store/panelSession'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function mkPayload(runId: string, event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (1) 자기 runId 일치 + text 이벤트 → streamingText 누적', () => {
  it('currentRunId=r1 + payload{runId:r1, text} → streamingText 누적', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'hi' }))
    expect(s1.streamingText).toBe('hi')
  })

  it('text 이벤트 2회 → 연속 누적', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'hello' }))
    const s2 = panelApply(s1, mkPayload('r1', { type: 'text', delta: ' world' }))
    expect(s2.streamingText).toBe('hello world')
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

  it('타 runId의 tool_call 이벤트도 무시된다', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1' }
    const s1 = panelApply(
      s0,
      mkPayload('r99', { type: 'tool_call', id: 'tc-x', name: 'bash', input: {} })
    )
    expect(s1.toolCards).toHaveLength(0)
  })

  it('currentRunId=null → 모든 runId payload 무시', () => {
    const s0 = makePanelInitialState() // currentRunId: null
    const s1 = panelApply(s0, mkPayload('r1', { type: 'text', delta: 'x' }))
    expect(s1).toBe(s0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('panelApply — (3) done 이벤트 → messages 확정 + streamingText 리셋 + isRunning false', () => {
  it('done 이벤트 → isRunning false', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      isRunning: true,
      streamingText: 'some text',
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    expect(s1.isRunning).toBe(false)
  })

  it('done 이벤트 → streamingText 리셋(빈 문자열)', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      streamingText: 'accumulated text',
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    expect(s1.streamingText).toBe('')
  })

  it('done 이벤트 + streamingText>0 → messages에 assistant 항목 추가', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      streamingText: 'assistant reply',
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    expect(s1.messages).toHaveLength(1)
    expect(s1.messages[0].role).toBe('assistant')
    expect(s1.messages[0].content).toBe('assistant reply')
  })

  it('done 이벤트 + streamingText="" → messages에 추가하지 않음', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      streamingText: '',
      messages: [],
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    expect(s1.messages).toHaveLength(0)
  })

  it('done 이벤트 → 기존 messages 뒤에 assistant 항목 append', () => {
    const s0 = {
      ...makePanelInitialState(),
      currentRunId: 'r1',
      streamingText: 'reply',
      messages: [{ id: 'u1', role: 'user' as const, content: 'hello' }],
    }
    const s1 = panelApply(s0, mkPayload('r1', { type: 'done' }))
    expect(s1.messages).toHaveLength(2)
    expect(s1.messages[1].role).toBe('assistant')
  })

  it('done 이벤트 + usage → lastUsage 저장', () => {
    const s0 = { ...makePanelInitialState(), currentRunId: 'r1', streamingText: 'x' }
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
    const frozen = Object.freeze({ ...s0, messages: Object.freeze([...s0.messages]) })
    // freeze된 상태에 적용해도 에러 없이 새 state 반환
    const s1 = panelApply(
      frozen as typeof s0,
      mkPayload('r1', { type: 'text', delta: 'x' })
    )
    expect(s1).not.toBe(frozen)
    expect(frozen.streamingText).toBe('')
  })
})

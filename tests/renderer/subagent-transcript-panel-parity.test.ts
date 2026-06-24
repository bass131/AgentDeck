/**
 * subagent-transcript-panel-parity.test.ts — Phase 37 #3: panelSession 동반 TDD RED
 *
 * 검증 대상: panelApply — TR1/TR5와 동일 시퀀스를 통해
 *   단일 reducer(applyAgentEvent)와 동일하게 transcript가 채워지는지.
 *   snapshotForPersist는 msg-only(transcript 휘발) 단정.
 *
 * 현재 구현: runtime RED(transcript 채움 로직 미구현).
 *
 * PA1: panelApply TR1 동일 시퀀스 → transcript 채워짐 (단일 reducer 정합)
 * PA2: panelApply TR5 동일 시퀀스 → transcript 시간순 [text,thinking,text]
 * PA3: snapshotForPersist → transcript 휘발(msg-only)
 */
import { describe, it, expect } from 'vitest'
import {
  panelApply,
  makePanelInitialState,
  snapshotForPersist,
} from '../../src/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../src/renderer/src/store/panelSession'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

const runId = 'run-37-panel-parity'

function mkPayload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

// ── 초기화 헬퍼: sa1 서브에이전트 있는 PanelSessionState ──────────────────────

function panelStateWithSa1(): PanelSessionState {
  const s0: PanelSessionState = {
    ...makePanelInitialState(),
    currentRunId: runId,
  }

  // subagent 이벤트로 sa1 생성
  return panelApply(
    s0,
    mkPayload({
      type: 'subagent',
      subagent: {
        id: 'toolu_sa1',
        name: 'explorer',
        role: 'x',
        status: 'running',
        tools: [],
      },
    })
  )
}

// ── PA1: panelApply TR1 동일 시퀀스 → transcript 채워짐 ──────────────────────

describe('PA1 — panelApply TR1 동일 시퀀스 → transcript 채워짐 (단일 reducer 정합)', () => {
  it('panelApply parentToolId="toolu_sa1" text → subagents[toolu_sa1].transcript에 {kind:"text", text:"hello"} append', () => {
    const s1 = panelStateWithSa1()
    const threadLenBefore = s1.thread.length

    const s2 = panelApply(
      s1,
      mkPayload({
        type: 'text',
        delta: 'hello',
        parentToolId: 'toolu_sa1',
      })
    )

    // 메인 thread 길이 불변(버그수정 핵심 단정)
    expect(s2.thread.length).toBe(threadLenBefore)

    // subagent transcript append
    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1).toBeDefined()

    const transcript = sa1!.transcript as Array<{ kind: string; text?: string }>
    expect(transcript).toBeDefined()
    expect(transcript).toHaveLength(1)
    expect(transcript[0].kind).toBe('text')
    expect(transcript[0].text).toBe('hello')
  })

  it('panelApply 타 runId 이벤트 → transcript 미관여', () => {
    const s1 = panelStateWithSa1()

    // 타 runId payload
    const s2 = panelApply(
      s1,
      { runId: 'OTHER_RUN', event: {
        type: 'text',
        delta: 'ignored',
        parentToolId: 'toolu_sa1',
      } }
    )

    // state 동일 참조 반환
    expect(s2).toBe(s1)
  })
})

// ── PA2: panelApply TR5 동일 시퀀스 → transcript 시간순 ──────────────────────

describe('PA2 — panelApply TR5 text→thinking→text 시퀀스 → transcript 시간순', () => {
  it('panelApply text→thinking→text 순 parentToolId 이벤트 → transcript = [text,thinking,text]', () => {
    const s1 = panelStateWithSa1()

    const s2 = panelApply(
      s1,
      mkPayload({
        type: 'text',
        delta: '첫 번째',
        parentToolId: 'toolu_sa1',
      })
    )

    const s3 = panelApply(
      s2,
      mkPayload({
        type: 'thinking',
        text: '사고',
        parentToolId: 'toolu_sa1',
      })
    )

    const s4 = panelApply(
      s3,
      mkPayload({
        type: 'text',
        delta: '두 번째',
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1 = s4.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as Array<{ kind: string; text?: string }>
    expect(transcript).toHaveLength(3)
    expect(transcript[0].kind).toBe('text')
    expect(transcript[0].text).toBe('첫 번째')
    expect(transcript[1].kind).toBe('thinking')
    expect(transcript[1].text).toBe('사고')
    expect(transcript[2].kind).toBe('text')
    expect(transcript[2].text).toBe('두 번째')
  })

  it('panelApply parentToolId 이벤트 → 메인 thread 불변(panelSession도 동일)', () => {
    const s1 = panelStateWithSa1()
    const threadLen0 = s1.thread.length

    const s2 = panelApply(
      s1,
      mkPayload({
        type: 'text',
        delta: 'sub content',
        parentToolId: 'toolu_sa1',
      })
    )

    expect(s2.thread.length).toBe(threadLen0)
  })
})

// ── PA3: snapshotForPersist → transcript 휘발(msg-only) ──────────────────────

describe('PA3 — snapshotForPersist → transcript 휘발(msg-only 단정)', () => {
  it('transcript 있는 상태 → snapshotForPersist.messages에 transcript 없음', () => {
    // 메인 msg도 추가해서 스냅샷에 포함되는지 확인
    const s0: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: runId,
    }

    // sa1 생성
    const s1 = panelApply(
      s0,
      mkPayload({
        type: 'subagent',
        subagent: { id: 'toolu_sa1', name: 'explorer', role: 'x', status: 'running', tools: [] },
      })
    )

    // transcript 추가 (parentToolId text)
    const s2 = panelApply(
      s1,
      mkPayload({
        type: 'text',
        delta: 'sub content',
        parentToolId: 'toolu_sa1',
      })
    )

    // 메인 msg 추가
    const s3 = panelApply(
      s2,
      mkPayload({ type: 'text', delta: '메인 응답', messageId: 'msg-main-001' })
    )

    const snapshot = snapshotForPersist(s3)

    // snapshot.messages는 msg-only
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0].role).toBe('assistant')
    expect(snapshot.messages[0].text).toBe('메인 응답')

    // transcript 관련 필드가 snapshot에 없음
    expect(snapshot).not.toHaveProperty('transcript')
    expect(snapshot).not.toHaveProperty('subagents')
  })

  it('snapshotForPersist에 서브에이전트 transcript가 persisted되지 않음(휘발 단정)', () => {
    const s0: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: runId,
    }

    const s1 = panelApply(
      s0,
      mkPayload({
        type: 'subagent',
        subagent: { id: 'toolu_sa1', name: 'x', role: 'y', status: 'running', tools: [] },
      })
    )

    const s2 = panelApply(
      s1,
      mkPayload({
        type: 'text',
        delta: 'sub',
        parentToolId: 'toolu_sa1',
      })
    )

    const snapshot = snapshotForPersist(s2)

    // messages 빈 배열(메인 msg 없음)
    expect(snapshot.messages).toHaveLength(0)

    // transcript가 snapshot에 포함 안 됨
    const snapshotStr = JSON.stringify(snapshot)
    expect(snapshotStr).not.toContain('transcript')
  })
})

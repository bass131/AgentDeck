import { describe, it, expect } from 'vitest'
import {
  panelApply,
  makePanelInitialState,
  snapshotForPersist,
} from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../../02_Source/renderer/src/store/panelSession'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

const runId = 'run-37-panel-parity'

function mkPayload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

function panelStateWithSa1(): PanelSessionState {
  const s0: PanelSessionState = {
    ...makePanelInitialState(),
    currentRunId: runId,
  }

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

    expect(s2.thread.length).toBe(threadLenBefore)

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

    const s2 = panelApply(
      s1,
      { runId: 'OTHER_RUN', event: {
        type: 'text',
        delta: 'ignored',
        parentToolId: 'toolu_sa1',
      } }
    )

    expect(s2).toBe(s1)
  })
})

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

describe('PA3 — snapshotForPersist → transcript 휘발(msg-only 단정)', () => {
  it('transcript 있는 상태 → snapshotForPersist.messages에 transcript 없음', () => {
    const s0: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: runId,
    }

    const s1 = panelApply(
      s0,
      mkPayload({
        type: 'subagent',
        subagent: { id: 'toolu_sa1', name: 'explorer', role: 'x', status: 'running', tools: [] },
      })
    )

    const s2 = panelApply(
      s1,
      mkPayload({
        type: 'text',
        delta: 'sub content',
        parentToolId: 'toolu_sa1',
      })
    )

    const s3 = panelApply(
      s2,
      mkPayload({ type: 'text', delta: '메인 응답', messageId: 'msg-main-001' })
    )

    const snapshot = snapshotForPersist(s3)

    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0].role).toBe('assistant')
    expect(snapshot.messages[0].text).toBe('메인 응답')

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

    expect(snapshot.messages).toHaveLength(0)

    const snapshotStr = JSON.stringify(snapshot)
    expect(snapshotStr).not.toContain('transcript')
  })
})

import { describe, it, expect } from 'vitest'
import {
  panelApply,
  makePanelInitialState,
  snapshotForPersist,
} from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../../02_Source/renderer/src/store/panelSession'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

function reducerPayload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId: 'run-panel', event }
}

function panelPayload(runId: string, event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

function mkOrchEvent(opts: { id: string; name: string; phases?: string[] }) {
  return {
      type: 'orchestration' as const,
    id: opts.id,
    name: opts.name,
    ...(opts.phases !== undefined ? { phases: opts.phases } : {}),
  }
}

function orchCards(thread: ThreadItem[]) {
  return thread.filter((item: ThreadItem) => item.kind === 'orchestration')
}

describe('panelSession — PB1 orchestration push: panelApply === 단일 reducer', () => {
  it('PB1-a: panelApply로 orchestration push → thread에 orchestration 카드 1개', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(panelState, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))

    const orchs = orchCards(s1.thread)
    expect(orchs).toHaveLength(1)
  })

  it('PB1-b: panelApply orchestration push → running:true', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(panelState, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))

    const orchs = orchCards(s1.thread)
      expect(orchs[0].running).toBe(true)
  })

  it('PB1-c: panelApply vs 단일 reducer — 동일 orchestration push 결과', () => {
    const appState0 = makeInitialState()
    const appState1 = applyAgentEvent(appState0, reducerPayload(mkOrchEvent({ id: 'wf1', name: 'flow', phases: ['A', 'B'] })))

    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const panelState1 = panelApply(panelState, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow', phases: ['A', 'B'] })))

    const appOrch = orchCards(appState1.thread)
    const panelOrch = orchCards(panelState1.thread)

    expect(appOrch).toHaveLength(1)
    expect(panelOrch).toHaveLength(1)
      expect(panelOrch[0].id).toBe(appOrch[0].id)
      expect(panelOrch[0].name).toBe(appOrch[0].name)
      expect(panelOrch[0].running).toBe(appOrch[0].running)
  })

  it('PB1-d: panelApply orchestration push 후 openMsgId=null, openGroupId=null (B-1 포인터)', () => {
    const panelState: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: 'run-panel',
    }
    const s1 = panelApply(panelState, panelPayload('run-panel', { type: 'text', delta: 'hi', messageId: 'msg-a' }))
    expect(s1.openMsgId).toBe('msg-a')

    const s2 = panelApply(s1, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))
    expect(s2.openMsgId).toBeNull()
    expect(s2.openGroupId).toBeNull()
  })
})

describe('panelSession — PB2 done 매칭: panelApply === 단일 reducer', () => {
  it('PB2-a: panelApply orchestration push + tool_result(ok:true) → running:false', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(panelState, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const s2 = panelApply(s1, panelPayload('run-panel', { type: 'tool_result', id: 'wf1', ok: true, output: '완료결과' }))

    const orchs = orchCards(s2.thread)
      expect(orchs[0].running).toBe(false)
      expect(orchs[0].result).toBe('완료결과')
  })

  it('PB2-b: panelApply vs 단일 reducer — 동일 done 매칭 결과', () => {
    const appState0 = makeInitialState()
    const appState1 = applyAgentEvent(appState0, reducerPayload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const appState2 = applyAgentEvent(appState1, reducerPayload({ type: 'tool_result', id: 'wf1', ok: true, output: '결과' }))

    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const panelState1 = panelApply(panelState, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const panelState2 = panelApply(panelState1, panelPayload('run-panel', { type: 'tool_result', id: 'wf1', ok: true, output: '결과' }))

    const appOrch = orchCards(appState2.thread)
    const panelOrch = orchCards(panelState2.thread)

      expect(panelOrch[0].running).toBe(appOrch[0].running)
      expect(panelOrch[0].result).toBe(appOrch[0].result)
  })

  it('PB2-c: panelApply tool_result(ok:false) → failed:true', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(panelState, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const s2 = panelApply(s1, panelPayload('run-panel', { type: 'tool_result', id: 'wf1', ok: false, output: '오류' }))

    const orchs = orchCards(s2.thread)
      expect(orchs[0].failed).toBe(true)
      expect(orchs[0].running).toBe(false)
  })
})

describe('panelSession — PB3 snapshotForPersist orchestration 직렬화 제외', () => {
  it('PB3-a: orchestration 카드 있는 state → snapshotForPersist에서 제외(msg만)', () => {
    const panelState: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: 'run-panel',
      thread: [
        { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
              { kind: 'orchestration', id: 'wf1', name: 'flow', running: true },
      ] as ThreadItem[],
    }

    const snapshot = snapshotForPersist(panelState)
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0].role).toBe('user')
  })

  it('PB3-b: orchestration + msg 혼합 → snapshot.messages에 msg만', () => {
    const panelState: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: null,
      thread: [
        { kind: 'msg', id: 'u1', role: 'user', text: '첫 메시지' },
              { kind: 'orchestration', id: 'wf1', name: 'flow-1', running: false, result: '완료' },
        { kind: 'msg', id: 'a1', role: 'assistant', text: '답변' },
              { kind: 'orchestration', id: 'wf2', name: 'flow-2', running: true },
      ] as ThreadItem[],
    }

    const snapshot = snapshotForPersist(panelState)
    expect(snapshot.messages).toHaveLength(2)
    expect(snapshot.messages[0].text).toBe('첫 메시지')
    expect(snapshot.messages[1].text).toBe('답변')
  })

  it('PB3-c: panelApply로 orchestration 추가 후 snapshotForPersist → orchestration 제외', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(panelState, panelPayload('run-panel', { type: 'text', delta: '안녕', messageId: 'msg-a' }))
    const s2 = panelApply(s1, panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'flow' })))

    expect(s2.thread.length).toBe(2)

    const snapshot = snapshotForPersist(s2)
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0].text).toBe('안녕')
  })
})

describe('panelSession — PB4 running orchestration 제외', () => {
  it('PB4-a: running:true orchestration → snapshotForPersist 제외(영구 스피너 방지)', () => {
    const panelState: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: null,
      thread: [
              { kind: 'orchestration', id: 'wf1', name: 'flow', running: true },
      ] as ThreadItem[],
    }

    const snapshot = snapshotForPersist(panelState)
    expect(snapshot.messages).toHaveLength(0)
  })

  it('PB4-b: running:false orchestration도 제외(orchestration은 항상 휘발)', () => {
    const panelState: PanelSessionState = {
      ...makePanelInitialState(),
      currentRunId: null,
      thread: [
              { kind: 'orchestration', id: 'wf1', name: 'flow', running: false, result: '완료' },
      ] as ThreadItem[],
    }

    const snapshot = snapshotForPersist(panelState)
    expect(snapshot.messages).toHaveLength(0)
  })
})

describe('panelSession — PB5 runId 필터', () => {
  it('PB5-a: 타 runId orchestration 이벤트 → panelState 불변', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(
      panelState,
      panelPayload('other-run', mkOrchEvent({ id: 'wf-other', name: 'other-flow' }))
    )

    expect(s1).toBe(panelState)
    expect(orchCards(s1.thread)).toHaveLength(0)
  })

  it('PB5-b: 자기 runId orchestration 이벤트 → 정상 처리', () => {
    const panelState: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'run-panel' }
    const s1 = panelApply(
      panelState,
      panelPayload('run-panel', mkOrchEvent({ id: 'wf1', name: 'my-flow' }))
    )

    expect(s1).not.toBe(panelState)
    expect(orchCards(s1.thread)).toHaveLength(1)
  })
})

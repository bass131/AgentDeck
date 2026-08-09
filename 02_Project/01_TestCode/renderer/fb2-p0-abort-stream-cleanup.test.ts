import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'
import {
  closeAbortedCommandCard,
  closeAbortedOrchestrationCards,
} from '../../../02_Project/00_Source/renderer/src/store/reducer/helpers'
import { makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import { panelReducerFn } from '../../../02_Project/00_Source/renderer/src/store/panelSession'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'

let agentAbortCallCount = 0

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async (_req: { runId: string }) => {
    agentAbortCallCount += 1
    return { accepted: true }
  },
  agentInterrupt: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

function goalCard(id: string): Extract<ThreadItem, { kind: 'cmdresult' }> {
  return {
    kind: 'cmdresult',
    id,
    name: 'goal',
    title: '목표를 향해 자율 반복 중…',
    sub: '테스트 목표',
    running: true,
    time: '오후 1:00',
  }
}

function orchCard(id: string, running = true): Extract<ThreadItem, { kind: 'orchestration' }> {
  return {
    kind: 'orchestration',
    id,
    name: '서브에이전트 팀',
    running,
    time: '오후 1:00',
  }
}

describe('appStore abortRun — 스트리밍 중단 시 죽은 상태 청소 (FB2 육안 게이트 P0)', () => {
  beforeEach(() => {
    agentAbortCallCount = 0
    useAppStore.setState({
      queue: [],
      currentRunId: null,
      isRunning: false,
      thinkingText: null,
      pendingPermission: null,
      pendingQuestion: null,
      pendingCommand: null,
      activeLoops: [],
      loopsStoppedNotice: false,
      thread: [],
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('일반 스트리밍 중 abort → isRunning/currentRunId/thinkingText가 즉시 로컬 정리된다', async () => {
    useAppStore.setState({
      currentRunId: 'run-live',
      isRunning: true,
      thinkingText: '분석 중…',
      pendingPermission: { runId: 'run-live', requestId: 'req-1', toolName: 'bash', summary: 's' },
      pendingQuestion: { runId: 'run-live', requestId: 'req-2', questions: [] },
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    const s = useAppStore.getState()
    expect(s.isRunning).toBe(false)
    expect(s.currentRunId).toBeNull()
    expect(s.thinkingText).toBeNull()
    expect(s.pendingPermission).toBeNull()
    expect(s.pendingQuestion).toBeNull()
  })

  it('/goal 진행 중 abort → pendingCommand 해제 + cmdresult 카드가 "중단됨"으로 닫힌다', async () => {
    useAppStore.setState({
      currentRunId: 'run-goal',
      isRunning: true,
      thinkingText: '목표를 향해 진행 중…',
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3, detail: '테스트 목표' },
      thread: [goalCard('cmd-1')],
      activeLoops: [],
      loopsStoppedNotice: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    const s = useAppStore.getState()
    expect(s.isRunning).toBe(false)
    expect(s.currentRunId).toBeNull()
    expect(s.pendingCommand).toBeNull()
    expect(s.loopsStoppedNotice).toBe(true)
    const card = s.thread.find((i) => i.kind === 'cmdresult' && i.id === 'cmd-1')
    expect(card).toBeDefined()
    if (card && card.kind === 'cmdresult') {
      expect(card.running).toBe(false)
      expect(card.title).not.toBe('목표를 향해 자율 반복 중…')
    }
  })

  it('goal + orchestration(서브에이전트) 동시 진행 중 abort → 두 카드 모두 "중단됨"으로 닫힌다 (reviewer 🟡 봉합)', async () => {
    useAppStore.setState({
      currentRunId: 'run-goal-orch',
      isRunning: true,
      thinkingText: '서브에이전트 작업 중…',
      pendingCommand: { name: 'goal', cardId: 'cmd-2', beforeMsgs: 0, turns: 1, detail: '테스트 목표' },
      thread: [goalCard('cmd-2'), orchCard('orch-1')],
      activeLoops: [],
      loopsStoppedNotice: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    const s = useAppStore.getState()
    const cmd = s.thread.find((i) => i.kind === 'cmdresult' && i.id === 'cmd-2')
    const orch = s.thread.find((i) => i.kind === 'orchestration' && i.id === 'orch-1')
    expect(cmd && cmd.kind === 'cmdresult' ? cmd.running : undefined).toBe(false)
    expect(orch && orch.kind === 'orchestration' ? orch.running : undefined).toBe(false)
    expect(orch && orch.kind === 'orchestration' ? orch.failed : undefined).toBeUndefined()
  })

  it('죽은 run에 대한 재클릭(abortRun 재호출)은 currentRunId가 이미 null이라 no-op — 죽은 IPC 왕복 0', async () => {
    useAppStore.setState({ currentRunId: 'run-goal', isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().currentRunId).toBeNull()
    expect(agentAbortCallCount).toBe(1)

    await useAppStore.getState().abortRun()
    expect(agentAbortCallCount).toBe(1)
  })
})

describe('panelReducerFn CLEAR_LOOPS — 패널(멀티워크스페이스) abort도 동형 정리 (FB2 육안 게이트 P0)', () => {
  it('스트리밍 중 CLEAR_LOOPS → isRunning/currentRunId/thinkingText/pendingCommand 해제', () => {
    const base = {
      ...makeInitialState(),
      currentRunId: 'p-run-1',
      isRunning: true,
      thinkingText: '생각 중…',
      pendingCommand: { name: 'goal', cardId: 'pcmd-1', beforeMsgs: 0, turns: 1, detail: '패널 목표' },
      thread: [goalCard('pcmd-1')],
    }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.isRunning).toBe(false)
    expect(next.currentRunId).toBeNull()
    expect(next.thinkingText).toBeNull()
    expect(next.pendingCommand).toBeNull()
    expect(next.loopsStoppedNotice).toBe(true)
    const card = next.thread.find((i) => i.kind === 'cmdresult' && i.id === 'pcmd-1')
    expect(card && card.kind === 'cmdresult' ? card.running : undefined).toBe(false)
  })

  it('pendingCommand/activeLoops 둘 다 없는 일반 스트리밍 CLEAR_LOOPS → loopsStoppedNotice는 그대로(오표시 금지)', () => {
    const base = { ...makeInitialState(), currentRunId: 'p-run-2', isRunning: true, thinkingText: '응답 중…' }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.isRunning).toBe(false)
    expect(next.currentRunId).toBeNull()
    expect(next.thinkingText).toBeNull()
    expect(next.loopsStoppedNotice).toBe(false)
  })

  it('goal + orchestration(서브에이전트) 동시 진행 중 CLEAR_LOOPS → orchestration 카드도 닫힌다 (reviewer 🟡 봉합)', () => {
    const base = {
      ...makeInitialState(),
      currentRunId: 'p-run-3',
      isRunning: true,
      pendingCommand: { name: 'goal', cardId: 'pcmd-2', beforeMsgs: 0, turns: 1, detail: '패널 목표' },
      thread: [goalCard('pcmd-2'), orchCard('porch-1')],
    }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    const cmd = next.thread.find((i) => i.kind === 'cmdresult' && i.id === 'pcmd-2')
    const orch = next.thread.find((i) => i.kind === 'orchestration' && i.id === 'porch-1')
    expect(cmd && cmd.kind === 'cmdresult' ? cmd.running : undefined).toBe(false)
    expect(orch && orch.kind === 'orchestration' ? orch.running : undefined).toBe(false)
  })
})

describe('closeAbortedCommandCard — 순수 헬퍼 단위 테스트', () => {
  it('cardId 없으면 thread 참조를 그대로 반환(no-op, 불필요 리렌더 방지)', () => {
    const thread: ThreadItem[] = [goalCard('cmd-x')]
    expect(closeAbortedCommandCard(thread, undefined)).toBe(thread)
    expect(closeAbortedCommandCard(thread, null)).toBe(thread)
  })

  it('cardId 일치 카드만 running:false + title 교체, 나머지 항목은 그대로', () => {
    const other: ThreadItem = { kind: 'msg', id: 'm1', role: 'user', text: 'hi' }
    const thread: ThreadItem[] = [other, goalCard('cmd-y')]
    const next = closeAbortedCommandCard(thread, 'cmd-y')
    expect(next[0]).toBe(other)
    const card = next[1]
    expect(card.kind === 'cmdresult' && card.running).toBe(false)
    expect(card.kind === 'cmdresult' && card.title).toBe('중단했어요')
  })
})

describe('closeAbortedOrchestrationCards — 순수 헬퍼 단위 테스트 (reviewer 🟡 봉합)', () => {
  it('running orchestration 항목이 없으면 thread 참조를 그대로 반환(no-op)', () => {
    const thread: ThreadItem[] = [orchCard('o1', false)]
    expect(closeAbortedOrchestrationCards(thread)).toBe(thread)
  })

  it('running orchestration 항목을 running:false로 닫는다 — closeOrch(handleDone) 동형, failed 미변경', () => {
    const other: ThreadItem = { kind: 'msg', id: 'm1', role: 'user', text: 'hi' }
    const thread: ThreadItem[] = [other, orchCard('o2', true)]
    const next = closeAbortedOrchestrationCards(thread)
    expect(next[0]).toBe(other)
    const card = next[1]
    expect(card.kind === 'orchestration' && card.running).toBe(false)
    expect(card.kind === 'orchestration' && card.failed).toBeUndefined()
  })

  it('여러 개의 running orchestration이 있으면 전부 닫는다', () => {
    const thread: ThreadItem[] = [orchCard('o3', true), orchCard('o4', true)]
    const next = closeAbortedOrchestrationCards(thread)
    expect(next.every((i) => i.kind === 'orchestration' && !i.running)).toBe(true)
  })
})

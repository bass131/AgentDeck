/**
 * fb2-p0-abort-stream-cleanup.test.ts — FB2 육안 게이트 P0 회귀 재현·수리 검증.
 *
 * 증상(영호 실측, 2026-07-04): 클로드가 스트리밍 응답 중일 때 loop/goal 정지 버튼을
 * 누르면 ① 응답 전 추론(thinking) GUI가 무한정 계속 뜨고 ② 채팅창 인터럽트 버튼이 더
 * 이상 작동하지 않는다.
 *
 * 원인(파일:라인):
 *   - main(02.Source/main/00_ipc/agent-runs.ts) RunManager.abort()는 abortFn() 호출 *전에*
 *     cleanup()으로 activeRun.done=true를 세팅한다(agent-runs.ts:241-253). 이후 소비 루프
 *     (agent-runs.ts:206-224)는 activeRun.done이 true면 'loops' 타입 이벤트만 통과시키고
 *     done/error를 포함한 나머지는 전부 드롭한다 — 의도적 설계(activeLoops 로컬 리셋과
 *     동일 전제: "renderer가 로컬로 이미 정리했다").
 *   - 그런데 renderer의 abortRun()(slices/runtime.ts, 수정 전)과 CLEAR_LOOPS
 *     (panelSession.ts, 수정 전)는 activeLoops/queue만 로컬 리셋하고 isRunning/
 *     thinkingText/currentRunId/pendingCommand는 그대로 두었다 — done/error가 영원히
 *     오지 않으므로(위 main 설계) handleDone/handleError(reducer/lifecycle.ts)가 그 필드를
 *     해제할 기회가 원천 차단되어 영구 잔존한다.
 *   - isRunning 고착 → WorkingIndicator(증상①의 "thinking GUI") 무한 표시.
 *     pendingCommand(goal) 고착 → resolveLoopStatus가 계속 'goal'을 반환해 LoopStatusBanner도
 *     무한 표시(증상① 실체 2). currentRunId 고착(죽은 runId) → 이후 재클릭 시 main의
 *     activeRuns.get(runId)가 undefined라 abort()/interrupt() 모두 false 반환(증상②).
 *
 * 수정: abortRun()·CLEAR_LOOPS 모두 handleDone과 동형으로 로컬 정리를 확장
 * (isRunning/currentRunId/thinkingText/pendingPermission/pendingQuestion/pendingCommand
 * + closeAbortedCommandCard로 진행 중이던 슬래시 카드까지 "중단됨" 처리).
 *
 * reviewer 🟡 후속 봉합(동일 버그 클래스): closeAbortedCommandCard는 cmdresult(슬래시 카드)만
 * 닫고 orchestration(멀티에이전트 블랙박스, Phase 37 #4b) 카드는 다루지 않았다 — handleDone/
 * handleError(lifecycle.ts closeOrch/closeOrchFailed)는 둘 다 닫는데 abort 로컬 정리만
 * cmdresult에 그쳐, goal/loop가 서브에이전트를 띄운 채 정지되면 orchestration 스피너가
 * 영구 잔존하는 경로가 남아 있었다. closeAbortedOrchestrationCards(closeOrch 동형)로 봉합.
 *
 * 이 테스트들은 수정 전에는 실패(red)한다 — 수정 후 green.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import {
  closeAbortedCommandCard,
  closeAbortedOrchestrationCards,
} from '../../../02.Source/renderer/src/store/reducer/helpers'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import { panelReducerFn } from '../../../02.Source/renderer/src/store/panelSession'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

// agentAbort 호출 횟수 카운터 — "죽은 runId 재클릭이 IPC를 왕복하지 않는다" 검증용.
let agentAbortCallCount = 0

// window.api 최소 stub (store 로딩 + abortRun의 window.api.agentAbort 호출에 필요)
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
    // main은 abort 후 done/error를 영원히 보내지 않으므로(agent-runs.ts:206-224 필터),
    // 이 필드들은 이 로컬 set() 호출 자체가 유일한 정리 경로다.
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
    // goal은 loop과 동형의 self-re-arm — 정지 확인 배너(LR3-06)도 함께 점화.
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
    // handleDone의 closeOrch와 동형 — running:false만 전환(failed는 abort 사유가 아니므로 미변경).
    expect(orch && orch.kind === 'orchestration' ? orch.running : undefined).toBe(false)
    expect(orch && orch.kind === 'orchestration' ? orch.failed : undefined).toBeUndefined()
  })

  it('죽은 run에 대한 재클릭(abortRun 재호출)은 currentRunId가 이미 null이라 no-op — 죽은 IPC 왕복 0', async () => {
    useAppStore.setState({ currentRunId: 'run-goal', isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().currentRunId).toBeNull()
    expect(agentAbortCallCount).toBe(1)

    // 수정 전에는 currentRunId가 죽은 runId로 고착돼 있어 재클릭이 다시 IPC를 왕복했다
    // (main에서는 이미 정리된 runId라 no-op이지만 UI는 "정지가 안 먹는다"로 체감).
    // 수정 후에는 currentRunId===null → early return으로 그 자체가 차단된다.
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
    expect(next.loopsStoppedNotice).toBe(true) // goal self-re-arm → 정지 확인 배너
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
    expect(next[0]).toBe(other) // 무관 항목은 참조도 불변
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
    expect(next[0]).toBe(other) // 무관 항목은 참조도 불변
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

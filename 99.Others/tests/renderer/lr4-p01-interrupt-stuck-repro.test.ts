/**
 * lr4-p01-interrupt-stuck-repro.test.ts — LR4 Phase 01(c) 재현 → P04 GREEN 계약.
 *
 * main의 agent.interrupt 응답이 accepted:false이면 currentRunId는 이미 없거나 완료된
 * 죽은 run이다. P04는 done/error가 다시 오지 않는 이 경우만 로컬 실행 표지를 정리한다.
 * accepted:true인 정상 세션과, 응답 대기 중 새 run으로 교체된 상태는 보존해야 한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { ConversationRunState } from '../../../02.Source/renderer/src/store/slices/types'
import {
  __resetSessionLoopDisplayForTests,
  lookupConversationForRun,
  registerConversationRun,
  sessionLoopDisplayRegistry,
} from '../../../02.Source/renderer/src/store/slices/loopDisplay'

const TARGET_CONVERSATION = 'conv-interrupt-target'
const OTHER_CONVERSATION = 'conv-interrupt-other'
const PERSISTENT_RUN = 'run-persistent'
const OLD_GENERATION = 'generation-old'
const NEW_GENERATION = 'generation-new'

const activeLoop = { id: 'loop-lr4', summary: '상태 점검', interval: 'Every minute' }
const pendingCommand = {
  name: 'goal',
  cardId: 'cmd-lr4-goal',
  beforeMsgs: 0,
  turns: 2,
  detail: '세션 안정화',
}

function runningThread(suffix = 'old'): ThreadItem[] {
  return [
    {
      kind: 'cmdresult',
      id: pendingCommand.cardId,
      name: 'goal',
      title: '목표를 향해 자율 반복 중…',
      sub: '세션 안정화',
      running: true,
      time: '오후 1:00',
    },
    {
      kind: 'orchestration',
      id: `orch-${suffix}`,
      name: '서브에이전트 팀',
      running: true,
      time: '오후 1:00',
    },
  ]
}

function makeRunningSnapshot(overrides: Partial<ConversationRunState> = {}): ConversationRunState {
  return {
    ...makeInitialState(),
    currentRunId: PERSISTENT_RUN,
    runGeneration: OLD_GENERATION,
    isRunning: true,
    thinkingText: '끝나지 않는 표시',
    pendingPermission: {
      runId: PERSISTENT_RUN,
      requestId: 'permission-old',
      toolName: 'Bash',
      summary: '명령 실행',
    },
    pendingQuestion: {
      runId: PERSISTENT_RUN,
      requestId: 'question-old',
      questions: [],
    },
    pendingCommand,
    openMsgId: 'msg-open-old',
    openGroupId: 'group-open-old',
    activeLoops: [activeLoop],
    thread: runningThread(),
    sessionId: 'sdk-session-old',
    messages: [],
    workspaceRoot: null,
    attachedImages: [],
    restoredSession: false,
    ...overrides,
  }
}

function expectDeadRunClosed(state: ConversationRunState): void {
  expect(state.isRunning).toBe(false)
  expect(state.currentRunId).toBeNull()
  expect(state.runGeneration).toBeNull()
  expect(state.thinkingText).toBeNull()
  expect(state.pendingPermission).toBeNull()
  expect(state.pendingQuestion).toBeNull()
  expect(state.pendingCommand).toBeNull()
  expect(state.openMsgId).toBeNull()
  expect(state.openGroupId).toBeNull()
  expect(state.activeLoops).toEqual([])
  expect(state.loopsStoppedNotice).toBe(true)

  const commandCard = state.thread.find((item) => item.kind === 'cmdresult')
  const orchestrationCard = state.thread.find((item) => item.kind === 'orchestration')
  expect(commandCard).toMatchObject({ running: false, title: '중단했어요' })
  expect(orchestrationCard).toMatchObject({ running: false })
}

function primeLoopDisplay(snapshot: ConversationRunState): void {
  sessionLoopDisplayRegistry.sync(TARGET_CONVERSATION, {
    activeLoops: snapshot.activeLoops,
    loopsStoppedNotice: snapshot.loopsStoppedNotice,
    pendingCommand: snapshot.pendingCommand,
  })
  registerConversationRun(PERSISTENT_RUN, TARGET_CONVERSATION)
}

function expectLoopDisplayTerminal(): void {
  expect(sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)).toEqual({
    activeLoops: [],
    loopsStoppedNotice: true,
    pendingCommand: null,
  })
  expect(lookupConversationForRun(PERSISTENT_RUN)).toBeUndefined()
}

const mockInterrupt = vi.fn(async () => ({ accepted: false }))
const mockAgentRun = vi.fn(async () => ({ runId: PERSISTENT_RUN }))
const mockAbort = vi.fn(async () => ({ accepted: true }))

Object.defineProperty(globalThis, 'window', {
  value: {
    api: {
      conversationLoad: async () => ({ conversations: [] }),
      conversationSave: async () => ({ id: 'cv-1' }),
      agentRun: mockAgentRun,
      agentAbort: mockAbort,
      agentInterrupt: mockInterrupt,
      onAgentEvent: () => () => {},
      listFiles: async () => ({ files: [] }),
      pathForFile: () => '',
      workspaceOpen: async () => ({ rootPath: null, tree: null }),
      referenceList: async () => ({ references: [] }),
      referenceTree: async () => ({ tree: null }),
      referenceAdd: async () => ({ reference: null }),
      fsRead: async () => ({ kind: 'not-found' }),
    },
  },
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

function deferredInterruptResponse(): {
  promise: Promise<{ accepted: boolean }>
  resolve: (value: { accepted: boolean }) => void
} {
  let resolve!: (value: { accepted: boolean }) => void
  const promise = new Promise<{ accepted: boolean }>((r) => { resolve = r })
  return { promise, resolve }
}

function deferredAgentRunResponse(): {
  promise: Promise<{ runId: string }>
  resolve: (value: { runId: string }) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: { runId: string }) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<{ runId: string }>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('LR4-P01 — 죽은 run interrupt의 renderer stuck', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    mockInterrupt.mockReset()
    mockInterrupt.mockResolvedValue({ accepted: false })
    mockAgentRun.mockReset()
    mockAgentRun.mockResolvedValue({ runId: PERSISTENT_RUN })
    mockAbort.mockReset()
    mockAbort.mockResolvedValue({ accepted: true })
    __resetSessionLoopDisplayForTests()
    const snapshot = makeRunningSnapshot()
    useAppStore.setState({
      ...snapshot,
      conversationId: TARGET_CONVERSATION,
      currentSessionKey: 'session-key-preserved',
      replMode: false,
      queue: [{ id: 'q-old', text: '예약 메시지', images: [] }],
      bgRuns: {},
    } as Parameters<typeof useAppStore.setState>[0])
  })

  function prepareIdleHeldOpen(): void {
    useAppStore.setState({
      currentRunId: PERSISTENT_RUN,
      runGeneration: OLD_GENERATION,
      isRunning: false,
      thinkingText: null,
      pendingPermission: null,
      pendingQuestion: null,
      pendingCommand: null,
      openMsgId: null,
      openGroupId: null,
      activeLoops: [],
      loopsStoppedNotice: false,
      errorMessage: undefined,
      thread: [],
      messages: [],
      queue: [],
      conversationId: TARGET_CONVERSATION,
      currentSessionKey: 'session-key-preserved',
      replMode: false,
      bgRuns: {},
    } as Parameters<typeof useAppStore.setState>[0])
  }

  it('(1) 전경 accepted:false는 terminal 상태·카드·루프 표시를 정리하고 queue/session은 보존한다', async () => {
    const queueBefore = useAppStore.getState().queue
    const sessionKeyBefore = useAppStore.getState().currentSessionKey
    const sessionIdBefore = useAppStore.getState().sessionId
    primeLoopDisplay(useAppStore.getState())

    await useAppStore.getState().interruptRun()

    expect(mockInterrupt).toHaveBeenCalledWith({ runId: PERSISTENT_RUN })
    const state = useAppStore.getState()
    expectDeadRunClosed(state)
    expect(state.queue).toBe(queueBefore)
    expect(state.currentSessionKey).toBe(sessionKeyBefore)
    expect(state.sessionId).toBe(sessionIdBefore)
    expectLoopDisplayTerminal()
  })

  it('(2) accepted:true인 정상 interrupt는 Zustand 상태·루프 레지스트리·라우팅을 완전히 변경하지 않는다', async () => {
    mockInterrupt.mockResolvedValueOnce({ accepted: true })
    primeLoopDisplay(useAppStore.getState())
    const stateBefore = useAppStore.getState()
    const displayBefore = sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)

    await useAppStore.getState().interruptRun()

    expect(mockInterrupt).toHaveBeenCalledWith({ runId: PERSISTENT_RUN })
    expect(useAppStore.getState()).toBe(stateBefore)
    expect(sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)).toBe(displayBefore)
    expect(lookupConversationForRun(PERSISTENT_RUN)).toBe(TARGET_CONVERSATION)
  })

  it('(3) 같은 persistent runId라도 새 generation의 turn은 오래된 accepted:false로 오염되지 않는다', async () => {
    const gate = deferredInterruptResponse()
    mockInterrupt.mockImplementationOnce(() => gate.promise)

    const oldInterrupt = useAppStore.getState().interruptRun()
    expect(mockInterrupt).toHaveBeenCalledWith({ runId: PERSISTENT_RUN })

    const newQueue = [{ id: 'q-lr4-new', text: '새 run 예약', images: [] }]
    const newThread = runningThread('new-generation')
    useAppStore.setState({
      currentRunId: PERSISTENT_RUN,
      runGeneration: NEW_GENERATION,
      isRunning: true,
      thinkingText: '같은 세션의 새 turn 처리 중',
      thread: newThread,
      queue: newQueue,
    } as Parameters<typeof useAppStore.setState>[0])
    const newTurnState = useAppStore.getState()
    primeLoopDisplay(newTurnState)
    const newDisplay = sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)

    // 실제 시간 대신 응답 순서를 직접 제어: 같은 runId의 새 generation 설치 후 old 응답 해제.
    gate.resolve({ accepted: false })
    await oldInterrupt

    const state = useAppStore.getState()
    expect(state).toBe(newTurnState)
    expect(state.currentRunId).toBe(PERSISTENT_RUN)
    expect(state.runGeneration).toBe(NEW_GENERATION)
    expect(state.thinkingText).toBe('같은 세션의 새 turn 처리 중')
    expect(state.thread).toBe(newThread)
    expect(state.queue).toBe(newQueue)
    expect(sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)).toBe(newDisplay)
    expect(lookupConversationForRun(PERSISTENT_RUN)).toBe(TARGET_CONVERSATION)
  })

  it('(4) 요청 뒤 다른 대화로 전환되면 대상 bgRuns만 terminal 정리하고 현재 전경은 보존한다', async () => {
    const gate = deferredInterruptResponse()
    mockInterrupt.mockImplementationOnce(() => gate.promise)
    const oldInterrupt = useAppStore.getState().interruptRun()

    const oldBackground = makeRunningSnapshot()
    const currentForeground = makeRunningSnapshot({
      currentRunId: 'run-other',
      runGeneration: 'generation-other',
      thinkingText: '다른 대화 처리 중',
      thread: runningThread('other-conversation'),
      sessionId: 'sdk-session-other',
    })
    useAppStore.setState({
      ...currentForeground,
      conversationId: OTHER_CONVERSATION,
      currentSessionKey: 'session-key-other',
      queue: [{ id: 'q-other', text: '다른 대화 예약', images: [] }],
      bgRuns: { [TARGET_CONVERSATION]: oldBackground },
    } as Parameters<typeof useAppStore.setState>[0])
    const foregroundBefore = useAppStore.getState()
    primeLoopDisplay(oldBackground)

    gate.resolve({ accepted: false })
    await oldInterrupt

    const state = useAppStore.getState()
    expect(state.conversationId).toBe(OTHER_CONVERSATION)
    expect(state.currentRunId).toBe('run-other')
    expect(state.runGeneration).toBe('generation-other')
    expect(state.isRunning).toBe(true)
    expect(state.thinkingText).toBe('다른 대화 처리 중')
    expect(state.currentSessionKey).toBe('session-key-other')
    expect(state.queue).toBe(foregroundBefore.queue)
    expect(state.thread).toBe(foregroundBefore.thread)
    expect(state.pendingPermission).toBe(foregroundBefore.pendingPermission)
    expect(state.pendingQuestion).toBe(foregroundBefore.pendingQuestion)
    expect(state.pendingCommand).toBe(foregroundBefore.pendingCommand)
    expect(state.activeLoops).toBe(foregroundBefore.activeLoops)

    const cleanedBackground = state.bgRuns[TARGET_CONVERSATION]
    expectDeadRunClosed(cleanedBackground)
    expect(cleanedBackground.sessionId).toBe('sdk-session-old')
    expectLoopDisplayTerminal()
  })

  it('(5) 전환 중 전경과 bgRuns에 같은 old snapshot이 공존하면 양쪽을 함께 terminal 정리한다', async () => {
    const gate = deferredInterruptResponse()
    mockInterrupt.mockImplementationOnce(() => gate.promise)
    const oldInterrupt = useAppStore.getState().interruptRun()

    const duplicateBackground = makeRunningSnapshot({ thread: runningThread('background-copy') })
    useAppStore.setState({
      bgRuns: { [TARGET_CONVERSATION]: duplicateBackground },
    } as Parameters<typeof useAppStore.setState>[0])
    primeLoopDisplay(duplicateBackground)

    gate.resolve({ accepted: false })
    await oldInterrupt

    const state = useAppStore.getState()
    expect(state.conversationId).toBe(TARGET_CONVERSATION)
    expectDeadRunClosed(state)
    expectDeadRunClosed(state.bgRuns[TARGET_CONVERSATION])
    expect(state.queue).toEqual([{ id: 'q-old', text: '예약 메시지', images: [] }])
    expect(state.currentSessionKey).toBe('session-key-preserved')
    expect(state.bgRuns[TARGET_CONVERSATION].sessionId).toBe('sdk-session-old')
    expectLoopDisplayTerminal()
  })

  it('(6) 실제 sendMessage의 agentRun pending 창에서는 interrupt·abort IPC와 optimistic 상태 변경이 없다', async () => {
    prepareIdleHeldOpen()
    const gate = deferredAgentRunResponse()
    mockAgentRun.mockImplementationOnce(() => gate.promise)

    const sendPromise = useAppStore.getState().sendMessage('pending 창 재현')
    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const optimisticState = useAppStore.getState()
    expect(optimisticState.isRunning).toBe(true)
    expect(optimisticState.currentRunId).toBe(PERSISTENT_RUN)
    expect(optimisticState.runGeneration).not.toBeNull()
    expect(optimisticState.runGeneration).not.toBe(OLD_GENERATION)

    await useAppStore.getState().interruptRun()
    await useAppStore.getState().abortRun()

    expect(mockInterrupt).not.toHaveBeenCalled()
    expect(mockAbort).not.toHaveBeenCalled()
    expect(useAppStore.getState()).toBe(optimisticState)

    gate.resolve({ runId: PERSISTENT_RUN })
    await sendPromise
    await flushMicrotasks()
  })

  it('(7) 같은 runId 성공 응답 후 pending 차단이 해제되어 interrupt가 정상 호출된다', async () => {
    prepareIdleHeldOpen()
    mockInterrupt.mockResolvedValueOnce({ accepted: true })

    await useAppStore.getState().sendMessage('같은 세션 새 turn')
    await flushMicrotasks()
    const established = useAppStore.getState()
    expect(established.currentRunId).toBe(PERSISTENT_RUN)
    expect(established.runGeneration).not.toBeNull()
    expect(established.runGeneration).not.toBe(OLD_GENERATION)

    await useAppStore.getState().interruptRun()

    expect(mockInterrupt).toHaveBeenCalledTimes(1)
    expect(mockInterrupt).toHaveBeenCalledWith({ runId: PERSISTENT_RUN })
  })

  it('(8) agentRun reject는 pending 차단을 해제하고 이전 generation 복원·오류 terminal로 전이한다', async () => {
    prepareIdleHeldOpen()
    mockAgentRun.mockRejectedValueOnce(new Error('agentRun rejected'))
    mockInterrupt.mockResolvedValueOnce({ accepted: true })

    await useAppStore.getState().sendMessage('실패할 turn')

    const failed = useAppStore.getState()
    expect(failed.isRunning).toBe(false)
    expect(failed.currentRunId).toBe(PERSISTENT_RUN)
    expect(failed.runGeneration).toBe(OLD_GENERATION)
    expect(failed.errorMessage).toBe('agentRun rejected')

    await useAppStore.getState().interruptRun()
    expect(mockInterrupt).toHaveBeenCalledWith({ runId: PERSISTENT_RUN })
  })

  it('(9) 같은 대화 foreground gen B + bg gen A에서는 old false가 bg만 닫고 새 표시·라우팅을 보존한다', async () => {
    const gate = deferredInterruptResponse()
    mockInterrupt.mockImplementationOnce(() => gate.promise)
    const oldInterrupt = useAppStore.getState().interruptRun()

    const oldBackground = makeRunningSnapshot()
    const newForeground = makeRunningSnapshot({
      currentRunId: PERSISTENT_RUN,
      runGeneration: NEW_GENERATION,
      thinkingText: '새 generation 처리 중',
      thread: runningThread('new-foreground'),
      sessionId: 'sdk-session-new',
    })
    useAppStore.setState({
      ...newForeground,
      conversationId: TARGET_CONVERSATION,
      currentSessionKey: 'session-key-new',
      queue: [{ id: 'q-new-foreground', text: '새 generation 예약', images: [] }],
      bgRuns: { [TARGET_CONVERSATION]: oldBackground },
    } as Parameters<typeof useAppStore.setState>[0])
    const foregroundBefore = useAppStore.getState()
    primeLoopDisplay(newForeground)
    const displayBefore = sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)

    gate.resolve({ accepted: false })
    await oldInterrupt

    const state = useAppStore.getState()
    expect(state.currentRunId).toBe(PERSISTENT_RUN)
    expect(state.runGeneration).toBe(NEW_GENERATION)
    expect(state.isRunning).toBe(true)
    expect(state.thinkingText).toBe('새 generation 처리 중')
    expect(state.thread).toBe(foregroundBefore.thread)
    expect(state.queue).toBe(foregroundBefore.queue)
    expectDeadRunClosed(state.bgRuns[TARGET_CONVERSATION])
    expect(sessionLoopDisplayRegistry.read(TARGET_CONVERSATION)).toBe(displayBefore)
    expect(lookupConversationForRun(PERSISTENT_RUN)).toBe(TARGET_CONVERSATION)
  })

  it('(10) established run abort는 terminal 정리와 함께 runGeneration을 null로 폐기한다', async () => {
    await useAppStore.getState().abortRun()

    expect(mockAbort).toHaveBeenCalledWith({ runId: PERSISTENT_RUN })
    const state = useAppStore.getState()
    expectDeadRunClosed(state)
    expect(state.runGeneration).toBeNull()
    expect(state.queue).toEqual([])
  })
})

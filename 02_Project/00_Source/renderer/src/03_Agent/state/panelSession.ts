import { useCallback, useSyncExternalStore } from 'react'
import type {
  AgentEventPayload,
  PanelThreadSnapshot,
  PermissionResponse,
  PersistedMsg,
} from '@shared/ipcContract'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'
import type { AppState } from '@renderer/05_Conversation/state/reducer'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import type { QueuedMessage } from '@renderer/00_App/state/types'
import { nextMsgId } from '@renderer/00_App/state/ids'
import { getReplModeDefault } from '@renderer/05_Conversation/replModeDefault'
import { isStaleNow } from './staleWatchdog'
import { createRunCore, enginePromptFor, isRunningRetained, pickEvictions } from './runCore'
import type { RunCore, RunTarget, SendOptions } from './runCore'
import { runReducer } from './runReducer'
import type { RunAction } from './runReducer'
import { keyKind, panelKey, panelPrefix } from './sessionKeys'
import { sessionRegistry } from './sessionRegistry'

// 멀티(패널) 어댑터 — 실행 동작은 runCore에, 상태의 거처는 세션 레지스트리에 있다(G9c).
// 여기는 패널 종류의 정책(dispatch마다 루프 표시 sync, 상한과 마운트 보호, 폐기 시 중단)과 패널 전용 액션만 둔다.

export { buildAgentRunArgs } from './runCore'
export type { SendOptions } from './runCore'

export interface PanelSessionState extends AppState {
  currentRunId: string | null
  replMode: boolean
  enginePickerMode?: string | null
  // 실행 세대(E2) — 전송마다 새로 달리고, agentRun 대기 창의 중단·interrupt를 막는다. 영속하지 않는다.
  runGeneration?: string | null
  // 대기열(C1·C2·E9) — 영속하지 않는다.
  queue: QueuedMessage[]
}

export function makePanelInitialState(snapshot?: PanelThreadSnapshot): PanelSessionState {
  if (!snapshot || snapshot.messages.length === 0) {
    return {
      ...makeInitialState(),
      currentRunId: null,
      runGeneration: null,
      replMode: typeof snapshot?.replMode === 'boolean' ? snapshot.replMode : getReplModeDefault(),
      enginePickerMode: null,
      queue: [],
    }
  }

  // 복원 메시지는 앱 공용 생성기에서 새 id를 받는다 — 이후 발급분과 겹치지 않는다(E7, B5).
  const restoredThread: ThreadItem[] = snapshot.messages.map((msg: PersistedMsg): ThreadItem => ({
    kind: 'msg',
    id: nextMsgId(),
    role: msg.role,
    text: msg.text,
    ...(msg.error !== undefined ? { error: msg.error } : {}),
    ...(msg.images !== undefined ? { images: msg.images } : {}),
  }))

  const base = makeInitialState()
  return {
    ...base,
    thread: restoredThread,
    seq: snapshot.seq,
    lastUsage: snapshot.lastUsage,
    lastContextWindow: snapshot.lastContextWindow,
    sessionId: snapshot.sessionId,
    currentRunId: null,
    runGeneration: null,
    replMode: typeof snapshot.replMode === 'boolean' ? snapshot.replMode : getReplModeDefault(),
    enginePickerMode: null,
    queue: [],
  }
}

export function snapshotForPersist(state: PanelSessionState): PanelThreadSnapshot {
  const messages: PersistedMsg[] = state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((msg): PersistedMsg => {
      const persisted: PersistedMsg = {
        id: msg.id,
        role: msg.role,
        text: msg.text,
      }
      if (msg.error !== undefined) persisted.error = msg.error
      if (msg.images !== undefined) persisted.images = msg.images
      return persisted
    })

  const snapshot: PanelThreadSnapshot = {
    messages,
    seq: state.seq,
  }
  if (state.lastUsage !== undefined) snapshot.lastUsage = state.lastUsage
  if (state.lastContextWindow !== undefined) snapshot.lastContextWindow = state.lastContextWindow
  if (state.sessionId !== undefined && state.sessionId.length > 0) snapshot.sessionId = state.sessionId
  snapshot.replMode = state.replMode

  return snapshot
}

function preservePanelLocalFields(
  state: PanelSessionState
): Pick<PanelSessionState, 'currentRunId' | 'replMode' | 'enginePickerMode'> {
  return {
    currentRunId: state.currentRunId,
    replMode: state.replMode,
    enginePickerMode: state.enginePickerMode,
  }
}

export function panelApply(state: PanelSessionState, payload: AgentEventPayload, time?: string, nowMs?: number): PanelSessionState {
  if (state.currentRunId === null || payload.runId !== state.currentRunId) {
    return state
  }

  // permission_mode는 여기서 다루지 않는다 — 코어가 onPermissionMode 포트로 보낸다(E15, 단일 의미).
  const next = runReducer(state, { type: 'APPLY_EVENT', payload, time, nowMs })
  return {
    ...next,
    ...preservePanelLocalFields(state),
  }
}

type PanelAddUserMessage = Omit<Extract<RunAction, { type: 'ADD_USER_MESSAGE' }>, 'id'> & { id?: string }

type PanelAction =
  | Exclude<RunAction, { type: 'ADD_USER_MESSAGE' }>
  | PanelAddUserMessage
  | { type: 'RESTORE'; snapshot: PanelThreadSnapshot }
  | { type: 'DISMISS_LOOPS_STOPPED' }
  | { type: 'SET_REPL_MODE'; on: boolean }
  | { type: 'SET_ENGINE_PICKER_MODE'; mode: string }
  | { type: 'DISMISS_GOAL_STALE' }
  | { type: 'CLEAR_CONVERSATION' }

// 실행 액션은 공용 runReducer로 넘기고, 패널 전용 액션(복원·REPL 토글·배너 닫기·지우기)만 여기서 처리한다.
function panelReducer(state: PanelSessionState, action: PanelAction): PanelSessionState {
  switch (action.type) {
    // 패널 /clear(C6) — 빈 초기 상태로 돌린다. 이어갈 sessionId도 버려 다음 전송은 새 엔진 세션이다.
    // REPL 토글은 패널 설정이라 유지한다.
    case 'CLEAR_CONVERSATION':
      return { ...makePanelInitialState(), replMode: state.replMode }

    case 'ADD_USER_MESSAGE':
      return runReducer(state, { ...action, id: action.id ?? nextMsgId() })

    case 'APPLY_EVENT':
      return panelApply(state, action.payload, action.time, action.nowMs)

    case 'DISMISS_LOOPS_STOPPED':
      return { ...state, loopsStoppedNotice: false }

    case 'DISMISS_GOAL_STALE':
      return { ...state, staleDismissed: true }

    case 'RESTORE':
      return makePanelInitialState(action.snapshot)

    case 'SET_REPL_MODE':
      return { ...state, replMode: action.on }

    case 'SET_ENGINE_PICKER_MODE':
      return { ...state, enginePickerMode: action.mode }

    default:
      return runReducer(state, action)
  }
}

export { panelReducer as panelReducerFn }

// 실행 대상(E5, 단일 규칙) — REPL이면 패널 자기 키로 persistent 실행, 아니면 단발. 호출부는 키를 넘기지 않는다.
function panelRunTarget(key: string, before: PanelSessionState): RunTarget {
  return {
    resumeSessionId: before.sessionId,
    ...(before.replMode ? { persistent: true, sessionKey: key } : {}),
  }
}

// 패널 send가 받는 옵션 — 실행 대상(세션키·이어갈 세션)은 어댑터가 정하므로 받지 않는다.
export type PanelSendOptions = Omit<SendOptions, 'persistent' | 'sessionKey' | 'resumeSessionId'>

export interface PanelSessionHookResult {
  // 이 패널의 세션 레지스트리 키(= REPL 세션키, UltraCode 범위). 하네스의 가짜 세션은 생략할 수 있다.
  key?: string
  state: PanelSessionState
  send: (text: string, opts?: PanelSendOptions) => Promise<void>
  abort: () => Promise<void>
  // REPL 정지(E11) — 응답이 거절이면 죽은 run으로 정리한다(단일 interruptRun과 같은 코어 구현).
  interrupt: () => Promise<void>
  restore: (snapshot: PanelThreadSnapshot) => void
  dismissLoopsStopped: () => void
  respondPermission: (behavior: PermissionResponse['behavior']) => Promise<void>
  // 질문 응답(E13) — 코어 경로. 패널 화면(PanelView)의 QuestionModal이 이 경로로 답한다(G9b).
  respondQuestion: (answers: string[][] | null) => Promise<void>
  setReplMode: (on: boolean) => void
  dismissGoalStale: () => void
  // 대기열(C1·C2) — 실행 중 Enter로 예약하고, 실행이 끝나면 맨 앞부터 보낸다. 중단은 비운다(E9).
  enqueue: (item: QueuedMessage) => void
  dequeue: () => QueuedMessage | undefined
  removeQueued: (id: string) => void
  // 패널 /clear(C6) — 대화를 비우고 다음 전송이 새 엔진 세션으로 시작하게 한다.
  clear: () => void
}

// 패널 키별 상태·키 구독자·runId 라우팅·루프 표시·stale 타이머·이벤트 구독은 세션 레지스트리 한 벌에 산다(G9c).
const registry = sessionRegistry

function panelStateOf(key: string): PanelSessionState | undefined {
  return registry.get<PanelSessionState>(key)
}

registry.defineKind('panel', {
  markStale: (key) => dispatchToPanelManager(key, { type: 'MARK_GOAL_STALE' }),
  handleEvent: (payload) => {
    const key = registry.lookup(payload.runId)
    if (!key || keyKind(key) !== 'panel') return
    panelCore(key).handleEvent(payload)
  },
})

function refreshPanelStaleWatchdog(key: string): void {
  registry.refreshStale(key, panelStateOf(key))
}

const PANEL_MANAGER_CAP = 32

// 패널 키 하나(E5) — 상태 Map·루프 표시·ultracode 범위·REPL 세션키가 모두 이 형식을 쓴다.
// 형식의 거처는 sessionKeys다. 두 이름은 기존 호출부를 위한 별칭이다.
export function makePanelSlotKey(sessionId: string, slot: number): string {
  return panelKey(sessionId, slot)
}

export function panelSlotKeyPrefix(sessionId: string): string {
  return panelPrefix(sessionId)
}

// 축출 정리(패널 정책) — 상태·키 구독자·라우팅·타이머를 지운다. 루프 표시는 남겨 다시 열 때 복원한다.
function forgetPanelKey(key: string): void {
  registry.forget(key)
}

function capPanelManagerStates(): void {
  const panels = registry.entries<PanelSessionState>('panel')
  const evicted = pickEvictions(
    panels,
    panels.length,
    PANEL_MANAGER_CAP,
    // 실행 중(E17 공용 규칙)이거나 화면에 마운트된 패널은 보호한다.
    (k, s) => isRunningRetained(k, s) || registry.keyListenerCount(k) > 0,
  )
  for (const k of evicted) forgetPanelKey(k)
}

function getPanelManagerState(key: string): PanelSessionState {
  let s = panelStateOf(key)
  if (!s) {
    s = makePanelInitialState()
    const saved = registry.loopDisplay.read(key)
    if (saved) {
      const restoredAutonomyActive = saved.autonomyActive ?? false
      const restoredLastActivityAt = saved.lastActivityAt ?? null
      const restoredGoalRun = saved.goalRun ?? null
      s = {
        ...s,
        activeLoops: saved.activeLoops,
        loopsStoppedNotice: saved.loopsStoppedNotice,
        pendingCommand: saved.pendingCommand ?? null,
        autonomyActive: restoredAutonomyActive,
        lastActivityAt: restoredLastActivityAt,
        goalRun: restoredGoalRun,
        bannerStale: restoredGoalRun !== null && isStaleNow(restoredLastActivityAt, Date.now()),
      }
    }
    registry.set(key, s)
    capPanelManagerStates()
    refreshPanelStaleWatchdog(key)
  }
  return s
}

function dispatchToPanelManager(key: string, action: PanelAction): void {
  const cur = getPanelManagerState(key)
  let next = panelReducer(cur, action)
  if (action.type === 'RESTORE') {
    const saved = registry.loopDisplay.read(key)
    if (saved) {
      const restoredAutonomyActive = saved.autonomyActive ?? false
      const restoredLastActivityAt = saved.lastActivityAt ?? null
      const restoredGoalRun = saved.goalRun ?? null
      next = {
        ...next,
        activeLoops: saved.activeLoops,
        loopsStoppedNotice: saved.loopsStoppedNotice,
        pendingCommand: saved.pendingCommand ?? null,
        autonomyActive: restoredAutonomyActive,
        lastActivityAt: restoredLastActivityAt,
        goalRun: restoredGoalRun,
        bannerStale: restoredGoalRun !== null && isStaleNow(restoredLastActivityAt, Date.now()),
      }
    }
  }
  // 라우팅(패널 정책) — 새 run이 붙으면 그 패널의 앞 run 라우팅만 지운다.
  if (action.type === 'SET_RUN_ID') {
    if (cur.currentRunId && cur.currentRunId !== action.runId) {
      registry.unroute(cur.currentRunId)
    }
    registry.route(action.runId, key)
  }
  if (next === cur) return
  registry.set(key, next)
  // 루프 표시 sync 시점(패널 정책) — dispatch마다.
  registry.loopDisplay.sync(key, {
    activeLoops: next.activeLoops,
    loopsStoppedNotice: next.loopsStoppedNotice,
    pendingCommand: next.pendingCommand,
    autonomyActive: next.autonomyActive,
    lastActivityAt: next.lastActivityAt,
    goalRun: next.goalRun,
  })
  registry.notifyKey(key)
  refreshPanelStaleWatchdog(key)
}

function panelCore(key: string): RunCore {
  return createRunCore<PanelSessionState>({
    readState: () => getPanelManagerState(key),
    dispatch: (action) => dispatchToPanelManager(key, action),
    refreshStale: () => refreshPanelStaleWatchdog(key),
    resolveRunTarget: (before) => panelRunTarget(key, before),
    onPermissionMode: (mode) => dispatchToPanelManager(key, { type: 'SET_ENGINE_PICKER_MODE', mode }),
    // 폐기 포트(Backlog 46) — forget(폐기·축출)이 올리는 키 생애. 전송 중에 폐기되면 코어가 run을 끊는다.
    life: () => registry.life(key),
  })
}

// 패널 몫의 이벤트 구독 — 첫 마운트 때 잡고 앱 수명 동안 놓지 않는다(언마운트 뒤에도 스트림을 받는다).
let releasePanelEvents: (() => void) | null = null

function ensurePanelManagerSubscribed(): void {
  if (releasePanelEvents) {
    registry.rebindIfChanged()
    return
  }
  releasePanelEvents = registry.acquireEvents('panel', { rebind: false })
}

// 패널 /clear(C6, 사용자 결정) — 기존 IPC만 쓴다. REPL run의 runId는 세션키(=패널 키)라서, 그 키로
// agentAbort를 보내면 main이 살아 있는 persistent 세션을 끝내고 persistentRuns에서 지운다. 같은 키로 다음
// 전송이 오면 main은 새 세션을 연다. 키 형식(multi:<id>:slot:<n>)은 그대로라 범위 정리·폐기가 그대로 먹는다.
function clearPanelConversation(key: string): void {
  void window.api.agentAbort({ runId: key }).catch(() => {})
  registry.unrouteKey(key)
  registry.loopDisplay.clear(key)
  dispatchToPanelManager(key, { type: 'CLEAR_CONVERSATION' })
}

export function disposePanelManagerSession(key: string): void {
  const s = panelStateOf(key)
  if (s?.currentRunId) {
    void window.api.agentAbort({ runId: s.currentRunId }).catch(() => {})
  }
  forgetPanelKey(key)
  registry.loopDisplay.clear(key)
}

export function disposePanelManagerSessionsByPrefix(prefix: string): void {
  for (const [key] of registry.entries('panel')) {
    if (key.startsWith(prefix)) disposePanelManagerSession(key)
  }
  registry.loopDisplay.clearByPrefix(prefix)
}

// 패널 몫만 비운다 — 대화 쪽 상태와 구독 몫은 건드리지 않는다.
export function __resetPanelSessionManagerForTests(): void {
  registry.__resetKindForTests('panel')
  if (releasePanelEvents) releasePanelEvents()
  releasePanelEvents = null
}

export function __getPanelManagerSizesForTests(): { states: number; listeners: number; runIds: number; loopDisplay: number } {
  return {
    states: registry.size('panel'),
    listeners: registry.__keyListenerKeyCountForTests('panel'),
    runIds: registry.__routeCountForTests('panel'),
    loopDisplay: registry.__loopDisplayCountForTests('panel'),
  }
}

async function performManagedSend(key: string, text: string, opts?: PanelSendOptions): Promise<void> {
  const imgs = opts?.images ?? []
  await panelCore(key).send({
    text,
    engineText: enginePromptFor(text, imgs.map((i) => i.path)),
    displayImages: imgs.map((i) => i.dataUrl),
    // 실행 대상(세션키·이어갈 세션)은 panelRunTarget만 정한다 — 호출부 값은 싣지 않는다(E5).
    options: {
      picker: opts?.picker,
      workspaceRoot: opts?.workspaceRoot,
      sysPrompt: opts?.sysPrompt,
      orchestration: opts?.orchestration,
    },
  })
}

async function performManagedAbort(key: string): Promise<void> {
  await panelCore(key).abort()
}

async function performManagedRespondPermission(key: string, behavior: PermissionResponse['behavior']): Promise<void> {
  await panelCore(key).respondPermission(behavior)
}

export function usePanelSlot(sessionKey: string, slot: number): PanelSessionHookResult {
  const key = makePanelSlotKey(sessionKey, slot)

  const subscribe = useCallback((onStoreChange: () => void): (() => void) => {
    ensurePanelManagerSubscribed()
    return registry.subscribeKey(key, onStoreChange)
  }, [key])

  const getSnapshot = useCallback(() => getPanelManagerState(key), [key])

  const state = useSyncExternalStore(subscribe, getSnapshot)

  const send = useCallback(async (text: string, opts?: PanelSendOptions): Promise<void> => {
    await performManagedSend(key, text, opts)
  }, [key])

  const abort = useCallback(async (): Promise<void> => {
    await performManagedAbort(key)
  }, [key])

  const interrupt = useCallback(async (): Promise<void> => {
    await panelCore(key).interrupt()
  }, [key])

  const restore = useCallback((snapshot: PanelThreadSnapshot): void => {
    dispatchToPanelManager(key, { type: 'RESTORE', snapshot })
  }, [key])

  const dismissLoopsStopped = useCallback((): void => {
    dispatchToPanelManager(key, { type: 'DISMISS_LOOPS_STOPPED' })
  }, [key])

  const respondPermission = useCallback(async (behavior: PermissionResponse['behavior']): Promise<void> => {
    await performManagedRespondPermission(key, behavior)
  }, [key])

  const respondQuestion = useCallback(async (answers: string[][] | null): Promise<void> => {
    await panelCore(key).respondQuestion(answers)
  }, [key])

  const setReplMode = useCallback((on: boolean): void => {
    dispatchToPanelManager(key, { type: 'SET_REPL_MODE', on })
  }, [key])

  const dismissGoalStale = useCallback((): void => {
    dispatchToPanelManager(key, { type: 'DISMISS_GOAL_STALE' })
  }, [key])

  const enqueue = useCallback((item: QueuedMessage): void => {
    dispatchToPanelManager(key, { type: 'ENQUEUE', item })
  }, [key])

  const dequeue = useCallback((): QueuedMessage | undefined => {
    const first = getPanelManagerState(key).queue[0]
    if (!first) return undefined
    dispatchToPanelManager(key, { type: 'DEQUEUE' })
    return first
  }, [key])

  const removeQueued = useCallback((id: string): void => {
    dispatchToPanelManager(key, { type: 'REMOVE_QUEUED', id })
  }, [key])

  const clear = useCallback((): void => {
    clearPanelConversation(key)
  }, [key])

  return {
    key,
    state,
    send,
    abort,
    interrupt,
    restore,
    dismissLoopsStopped,
    respondPermission,
    respondQuestion,
    setReplMode,
    dismissGoalStale,
    enqueue,
    dequeue,
    removeQueued,
    clear,
  }
}

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
import { nextMsgId } from '@renderer/00_App/state/ids'
import { createLoopDisplayRegistry } from './loopDisplayRegistry'
import { getReplModeDefault } from '@renderer/05_Conversation/replModeDefault'
import { isStaleNow } from './staleWatchdog'
import { createRunCore, createStaleWatchdogs, enginePromptFor, pickEvictions } from './runCore'
import type { RunCore, RunTarget, SendOptions } from './runCore'
import { runReducer } from './runReducer'
import type { RunAction } from './runReducer'

// 멀티(패널) 어댑터 — 실행 동작은 runCore에 있고, 여기는 패널 키별 상태 Map 읽기·쓰기, runId 라우팅,
// 루프 표시 보존, 폐기(dispose) 같은 패널 전용 부수효과만 둔다.

export { buildAgentRunArgs } from './runCore'
export type { SendOptions } from './runCore'

export interface PanelSessionState extends AppState {
  currentRunId: string | null
  replMode: boolean
  enginePickerMode?: string | null
  // 실행 세대(E2) — 전송마다 새로 달리고, agentRun 대기 창의 중단·interrupt를 막는다. 영속하지 않는다.
  runGeneration?: string | null
}

export function makePanelInitialState(snapshot?: PanelThreadSnapshot): PanelSessionState {
  if (!snapshot || snapshot.messages.length === 0) {
    return {
      ...makeInitialState(),
      currentRunId: null,
      runGeneration: null,
      replMode: typeof snapshot?.replMode === 'boolean' ? snapshot.replMode : getReplModeDefault(),
      enginePickerMode: null,
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

// 실행 액션은 공용 runReducer로 넘기고, 패널 전용 액션(복원·REPL 토글·배너 닫기)만 여기서 처리한다.
function panelReducer(state: PanelSessionState, action: PanelAction): PanelSessionState {
  switch (action.type) {
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
  state: PanelSessionState
  send: (text: string, opts?: PanelSendOptions) => Promise<void>
  abort: () => Promise<void>
  // REPL 정지(E11) — 응답이 거절이면 죽은 run으로 정리한다(단일 interruptRun과 같은 코어 구현).
  interrupt: () => Promise<void>
  restore: (snapshot: PanelThreadSnapshot) => void
  dismissLoopsStopped: () => void
  respondPermission: (behavior: PermissionResponse['behavior']) => Promise<void>
  // 질문 응답(E13) — 코어 경로만 있다. 패널 화면은 아직 QuestionModal을 띄우지 않는다(G9b).
  respondQuestion: (answers: string[][] | null) => Promise<void>
  setReplMode: (on: boolean) => void
  dismissGoalStale: () => void
}

const panelManagerStates = new Map<string, PanelSessionState>()
const panelManagerListeners = new Map<string, Set<() => void>>()
const runIdToPanelKey = new Map<string, string>()

const panelLoopDisplayRegistry = createLoopDisplayRegistry()

const panelStaleWatchdogs = createStaleWatchdogs({
  markStale: (key) => dispatchToPanelManager(key, { type: 'MARK_GOAL_STALE' }),
})

function refreshPanelStaleWatchdog(key: string): void {
  panelStaleWatchdogs.refresh(key, panelManagerStates.get(key))
}

const PANEL_MANAGER_CAP = 32

// 패널 키 하나(E5) — 상태 Map·루프 표시·ultracode 범위·REPL 세션키가 모두 이 형식을 쓴다.
export function makePanelSlotKey(sessionId: string, slot: number): string {
  return `${panelSlotKeyPrefix(sessionId)}${slot}`
}

export function panelSlotKeyPrefix(sessionId: string): string {
  return `multi:${sessionId}:slot:`
}

function forgetPanelKey(key: string): void {
  panelManagerStates.delete(key)
  panelManagerListeners.delete(key)
  for (const [rid, kk] of runIdToPanelKey) {
    if (kk === key) runIdToPanelKey.delete(rid)
  }
  panelStaleWatchdogs.dispose(key)
}

function capPanelManagerStates(): void {
  const evicted = pickEvictions(
    panelManagerStates,
    panelManagerStates.size,
    PANEL_MANAGER_CAP,
    (k, s) => s.isRunning || (panelManagerListeners.get(k)?.size ?? 0) > 0,
  )
  for (const k of evicted) forgetPanelKey(k)
}

function getPanelManagerState(key: string): PanelSessionState {
  let s = panelManagerStates.get(key)
  if (!s) {
    s = makePanelInitialState()
    const saved = panelLoopDisplayRegistry.read(key)
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
    panelManagerStates.set(key, s)
    capPanelManagerStates()
    refreshPanelStaleWatchdog(key)
  }
  return s
}

function notifyPanelManagerListeners(key: string): void {
  const ls = panelManagerListeners.get(key)
  if (!ls) return
  for (const l of ls) l()
}

function dispatchToPanelManager(key: string, action: PanelAction): void {
  const cur = getPanelManagerState(key)
  let next = panelReducer(cur, action)
  if (action.type === 'RESTORE') {
    const saved = panelLoopDisplayRegistry.read(key)
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
  if (action.type === 'SET_RUN_ID') {
    if (cur.currentRunId && cur.currentRunId !== action.runId) {
      runIdToPanelKey.delete(cur.currentRunId)
    }
    runIdToPanelKey.set(action.runId, key)
  }
  if (next === cur) return
  panelManagerStates.set(key, next)
  panelLoopDisplayRegistry.sync(key, {
    activeLoops: next.activeLoops,
    loopsStoppedNotice: next.loopsStoppedNotice,
    pendingCommand: next.pendingCommand,
    autonomyActive: next.autonomyActive,
    lastActivityAt: next.lastActivityAt,
    goalRun: next.goalRun,
  })
  notifyPanelManagerListeners(key)
  refreshPanelStaleWatchdog(key)
}

function panelCore(key: string): RunCore {
  return createRunCore<PanelSessionState>({
    readState: () => getPanelManagerState(key),
    dispatch: (action) => dispatchToPanelManager(key, action),
    refreshStale: () => refreshPanelStaleWatchdog(key),
    resolveRunTarget: (before) => panelRunTarget(key, before),
    onPermissionMode: (mode) => dispatchToPanelManager(key, { type: 'SET_ENGINE_PICKER_MODE', mode }),
  })
}

let panelManagerUnsubscribe: (() => void) | null = null

function ensurePanelManagerSubscribed(): void {
  if (panelManagerUnsubscribe) return
  panelManagerUnsubscribe = window.api.onAgentEvent((payload) => {
    const agentPayload = payload as AgentEventPayload
    const key = runIdToPanelKey.get(agentPayload.runId)
    if (!key) return
    panelCore(key).handleEvent(agentPayload)
  })
}

export function disposePanelManagerSession(key: string): void {
  const s = panelManagerStates.get(key)
  if (s?.currentRunId) {
    void window.api.agentAbort({ runId: s.currentRunId }).catch(() => {})
  }
  forgetPanelKey(key)
  panelLoopDisplayRegistry.clear(key)
}

export function disposePanelManagerSessionsByPrefix(prefix: string): void {
  for (const key of Array.from(panelManagerStates.keys())) {
    if (key.startsWith(prefix)) disposePanelManagerSession(key)
  }
  panelLoopDisplayRegistry.clearByPrefix(prefix)
}

export function __resetPanelSessionManagerForTests(): void {
  panelManagerStates.clear()
  panelManagerListeners.clear()
  runIdToPanelKey.clear()
  panelLoopDisplayRegistry.__resetForTests()
  panelStaleWatchdogs.disposeAll()
  if (panelManagerUnsubscribe) {
    panelManagerUnsubscribe()
  }
  panelManagerUnsubscribe = null
}

export function __getPanelManagerSizesForTests(): { states: number; listeners: number; runIds: number; loopDisplay: number } {
  return {
    states: panelManagerStates.size,
    listeners: panelManagerListeners.size,
    runIds: runIdToPanelKey.size,
    loopDisplay: panelLoopDisplayRegistry.__sizeForTests(),
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
    let set = panelManagerListeners.get(key)
    if (!set) {
      set = new Set()
      panelManagerListeners.set(key, set)
    }
    set.add(onStoreChange)
    return () => {
      const s = panelManagerListeners.get(key)
      if (!s) return
      s.delete(onStoreChange)
      if (s.size === 0) panelManagerListeners.delete(key)
    }
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

  return { state, send, abort, interrupt, restore, dismissLoopsStopped, respondPermission, respondQuestion, setReplMode, dismissGoalStale }
}

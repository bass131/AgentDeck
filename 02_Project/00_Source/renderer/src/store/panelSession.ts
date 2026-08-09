import { useReducer, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import type {
  AgentEventPayload,
  AgentRunRequest,
  ConversationMessage,
  PanelThreadSnapshot,
  PermissionResponse,
  PersistedMsg,
} from '../../../shared/ipcContract'
import { applyAgentEvent, applyBeginCommand, makeInitialState } from './reducer'
import type { AppState } from './reducer'
import type { ThreadItem } from './threadTypes'
import { closeAbortedCommandCard, closeAbortedOrchestrationCards, terminalResetFields } from './reducer/helpers'
import { handleError } from './reducer/lifecycle'
import { commandOf, goalDetailOf } from '../lib/cmdCards'
import { nowTimeKo } from '../lib/time'
import type { AttachedImage } from '../store/appStore'
import { buildEnginePrompt } from '../lib/composerNotes'
import { createLoopDisplayRegistry } from './loopDisplayRegistry'
import { getReplModeDefault } from '../lib/replModeDefault'
import { createStaleTimer, isStaleNow, remainingStaleMs } from './staleWatchdog'
import type { StaleTimerHandle } from './staleWatchdog'

export interface PanelSessionState extends AppState {
  currentRunId: string | null
  replMode: boolean
  enginePickerMode?: string | null
}

export interface SendOptions {
  picker?: { model: string; effort: string; mode: string }
  workspaceRoot?: string
  sysPrompt?: string
  orchestration?: boolean
  images?: AttachedImage[]
  resumeSessionId?: string
  persistent?: boolean
  sessionKey?: string
}

export function buildAgentRunArgs(
  history: ConversationMessage[],
  opts?: SendOptions
): AgentRunRequest {
  return {
    messages: history,
    workspaceRoot: opts?.workspaceRoot,
    model: opts?.picker?.model,
    effort: opts?.picker?.effort,
    mode: opts?.picker?.mode,
    systemPrompt: opts?.sysPrompt,
    orchestration: opts?.orchestration,
    resumeSessionId: opts?.resumeSessionId,
    ...(opts?.persistent ? { persistent: true } : {}),
    ...(opts?.sessionKey !== undefined ? { sessionKey: opts.sessionKey } : {}),
  }
}

let _idCounter = 0

export function nextId(): string {
  _idCounter += 1
  return `pmsg-${_idCounter}`
}

function seedCounter(minValue: number): void {
  if (_idCounter < minValue) {
    _idCounter = minValue
  }
}

export function makePanelInitialState(snapshot?: PanelThreadSnapshot): PanelSessionState {
  if (!snapshot || snapshot.messages.length === 0) {
    return {
      ...makeInitialState(),
      currentRunId: null,
      replMode: typeof snapshot?.replMode === 'boolean' ? snapshot.replMode : getReplModeDefault(),
      enginePickerMode: null,
    }
  }

  seedCounter(snapshot.seq + snapshot.messages.length)

  const restoredThread: ThreadItem[] = snapshot.messages.map((msg: PersistedMsg): ThreadItem => ({
    kind: 'msg',
    id: nextId(),
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

  const nextAppState = applyAgentEvent(state as AppState, payload, time, nowMs)
  return {
    ...nextAppState,
    ...preservePanelLocalFields(state),
    ...(payload.event.type === 'permission_mode'
      ? { enginePickerMode: payload.event.mode }
      : {}),
  }
}

type PanelAction =
  | { type: 'SET_RUN_ID'; runId: string }
  | {
      type: 'ADD_USER_MESSAGE'
      content: string
      time?: string
      images?: string[]
    }
  | {
      type: 'APPLY_EVENT'
      payload: AgentEventPayload
      time?: string
      nowMs?: number
    }
  | { type: 'RESTORE'; snapshot: PanelThreadSnapshot }
  | { type: 'ADD_COMMAND_CARD'; name: string; cardId: string; time: string; detail?: string | null; nowMs?: number }
  | { type: 'CLEAR_LOOPS' }
  | { type: 'DISMISS_LOOPS_STOPPED' }
  | { type: 'CLEAR_PENDING_PERMISSION' }
  | { type: 'RUN_FAILED'; message: string }
  | { type: 'SET_REPL_MODE'; on: boolean }
  | { type: 'MARK_GOAL_STALE' }
  | { type: 'DISMISS_GOAL_STALE' }

function panelReducer(state: PanelSessionState, action: PanelAction): PanelSessionState {
  switch (action.type) {
    case 'SET_RUN_ID':
      return { ...state, currentRunId: action.runId, loopsStoppedNotice: false }

    case 'ADD_USER_MESSAGE': {
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: nextId(),
        role: 'user',
        text: action.content,
        ...(action.time !== undefined ? { time: action.time } : {}),
        ...(action.images && action.images.length > 0 ? { images: action.images } : {}),
      }
      return {
        ...state,
        thread: [...state.thread, userThreadItem],
        isRunning: true,
      }
    }

    case 'ADD_COMMAND_CARD': {
      const nextAppState = applyBeginCommand(state as AppState, {
        type: 'begin-command',
        name: action.name,
        cardId: action.cardId,
        time: action.time,
        ...(action.nowMs !== undefined ? { nowMs: action.nowMs } : {}),
        ...(action.detail ? { detail: action.detail } : {}),
      })
      return {
        ...nextAppState,
        ...preservePanelLocalFields(state),
        isRunning: true,
      }
    }

    case 'CLEAR_LOOPS': {
      return {
        ...state,
        ...terminalResetFields(state),
        thread: closeAbortedOrchestrationCards(
          closeAbortedCommandCard(state.thread, state.pendingCommand?.cardId)
        ),
      }
    }

    case 'DISMISS_LOOPS_STOPPED':
      return { ...state, loopsStoppedNotice: false }

    case 'CLEAR_PENDING_PERMISSION':
      return { ...state, pendingPermission: null }

    case 'RUN_FAILED': {
      const nextAppState = handleError(state as AppState, { type: 'error', message: action.message })
      return {
        ...nextAppState,
        ...preservePanelLocalFields(state),
      }
    }

    case 'APPLY_EVENT':
      return panelApply(state, action.payload, action.time, action.nowMs)

    case 'MARK_GOAL_STALE':
      return { ...state, bannerStale: true }

    case 'DISMISS_GOAL_STALE':
      return { ...state, staleDismissed: true }

    case 'RESTORE':
      return makePanelInitialState(action.snapshot)

    case 'SET_REPL_MODE':
      return { ...state, replMode: action.on }

    default:
      return state
  }
}

export { panelReducer as panelReducerFn }

interface PanelSendPorts {
  readState: () => PanelSessionState
  dispatch: (action: PanelAction) => void
}

interface PanelSendCoreOptions {
  fallbackSessionKey: () => string
}

async function performPanelSend(
  ports: PanelSendPorts,
  coreOpts: PanelSendCoreOptions,
  text: string,
  opts?: SendOptions,
): Promise<void> {
  const snapshot = ports.readState()

  const imgs = opts?.images ?? []
  const displayImages = imgs.map((i) => i.dataUrl)
  const imagePaths = imgs.map((i) => i.path)

  const cmdName = commandOf(text)
  if (cmdName) {
    _idCounter += 1
    const cardId = `pcmd-${_idCounter}`
    const cmdDetail = goalDetailOf(cmdName, text)
    ports.dispatch({
      type: 'ADD_COMMAND_CARD',
      name: cmdName,
      cardId,
      time: nowTimeKo(),
      nowMs: Date.now(),
      ...(cmdDetail ? { detail: cmdDetail } : {}),
    })
  } else {
    ports.dispatch({
      type: 'ADD_USER_MESSAGE',
      content: text,
      time: nowTimeKo(),
      ...(displayImages.length > 0 ? { images: displayImages } : {}),
    })
  }

  const isCommand = !!cmdName
  const contentForEngine =
    !isCommand && imagePaths.length > 0
      ? buildEnginePrompt(text, { mentions: [], images: imagePaths })
      : text

  const history: ConversationMessage[] = [
    ...snapshot.thread
      .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
      .map((m) => ({ role: m.role, content: m.text })),
    { role: 'user' as const, content: contentForEngine },
  ]

  const effectiveOpts: SendOptions = { ...opts }
  if (effectiveOpts.persistent === undefined && effectiveOpts.sessionKey === undefined && snapshot.replMode) {
    effectiveOpts.persistent = true
    effectiveOpts.sessionKey = coreOpts.fallbackSessionKey()
  }

  let res: Awaited<ReturnType<typeof window.api.agentRun>>
  try {
    res = await window.api.agentRun(
      buildAgentRunArgs(history, { ...effectiveOpts, resumeSessionId: effectiveOpts.resumeSessionId ?? snapshot.sessionId }),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ports.dispatch({ type: 'RUN_FAILED', message })
    return
  }

  ports.dispatch({ type: 'SET_RUN_ID', runId: res.runId })
}

export interface PanelSessionHookResult {
  state: PanelSessionState
  send: (text: string, opts?: SendOptions) => Promise<void>
  abort: () => Promise<void>
  restore: (snapshot: PanelThreadSnapshot) => void
  dismissLoopsStopped: () => void
  respondPermission: (behavior: PermissionResponse['behavior']) => Promise<void>
  setReplMode: (on: boolean) => void
  dismissGoalStale: () => void
}

export function usePanelSession(): PanelSessionHookResult {
  const [state, dispatch] = useReducer(panelReducer, undefined, makePanelInitialState)

  const stateRef = useRef(state)
  stateRef.current = state

  const sessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onAgentEvent((payload) => {
      const t = nowTimeKo()
      dispatch({ type: 'APPLY_EVENT', payload: payload as AgentEventPayload, time: t, nowMs: Date.now() })
    })
    return unsubscribe
  }, [])

  const send = useCallback(async (text: string, opts?: SendOptions): Promise<void> => {
    await performPanelSend(
      { readState: () => stateRef.current, dispatch },
      {
        fallbackSessionKey: () => {
          if (!sessionKeyRef.current) sessionKeyRef.current = crypto.randomUUID()
          return sessionKeyRef.current
        },
      },
      text,
      opts,
    )
  }, [])

  const abort = useCallback(async (): Promise<void> => {
    const { currentRunId } = stateRef.current
    if (!currentRunId) return
    dispatch({ type: 'CLEAR_LOOPS' })
    await window.api.agentAbort({ runId: currentRunId })
  }, [])

  const restore = useCallback((snapshot: PanelThreadSnapshot): void => {
    dispatch({ type: 'RESTORE', snapshot })
  }, [])

  const dismissLoopsStopped = useCallback((): void => {
    dispatch({ type: 'DISMISS_LOOPS_STOPPED' })
  }, [])

  const respondPermission = useCallback(async (behavior: PermissionResponse['behavior']): Promise<void> => {
    const { pendingPermission } = stateRef.current
    if (!pendingPermission) return

    dispatch({ type: 'CLEAR_PENDING_PERMISSION' })

    try {
      await window.api.permissionRespond({
        runId: pendingPermission.runId,
        requestId: pendingPermission.requestId,
        behavior,
      })
    } catch {
    }
  }, [])

  const setReplMode = useCallback((on: boolean): void => {
    dispatch({ type: 'SET_REPL_MODE', on })
  }, [])

  const dismissGoalStale = useCallback((): void => {
    dispatch({ type: 'DISMISS_GOAL_STALE' })
  }, [])

  return { state, send, abort, restore, dismissLoopsStopped, respondPermission, setReplMode, dismissGoalStale }
}

const panelManagerStates = new Map<string, PanelSessionState>()
const panelManagerListeners = new Map<string, Set<() => void>>()
const runIdToPanelKey = new Map<string, string>()

const panelLoopDisplayRegistry = createLoopDisplayRegistry()

const panelStaleTimers = new Map<string, StaleTimerHandle>()

function getOrCreatePanelStaleTimer(key: string): StaleTimerHandle {
  let t = panelStaleTimers.get(key)
  if (!t) {
    t = createStaleTimer(() => {
      dispatchToPanelManager(key, { type: 'MARK_GOAL_STALE' })
    })
    panelStaleTimers.set(key, t)
  }
  return t
}

function refreshPanelStaleWatchdog(key: string): void {
  const s = panelManagerStates.get(key)
  if (!s) return
  const timer = getOrCreatePanelStaleTimer(key)
  if (!s.goalRun || s.lastActivityAt === null) {
    timer.dispose()
    return
  }
  const now = Date.now()
  if (isStaleNow(s.lastActivityAt, now)) {
    timer.dispose()
    if (!s.bannerStale) dispatchToPanelManager(key, { type: 'MARK_GOAL_STALE' })
    return
  }
  timer.arm(remainingStaleMs(s.lastActivityAt, now))
}

function disposePanelStaleTimer(key: string): void {
  const t = panelStaleTimers.get(key)
  if (t) {
    t.dispose()
    panelStaleTimers.delete(key)
  }
}

const PANEL_MANAGER_CAP = 32

export function makePanelSlotKey(sessionId: string, slot: number): string {
  return `${sessionId}::${slot}`
}

export function panelSlotKeyPrefix(sessionId: string): string {
  return `${sessionId}::`
}

function capPanelManagerStates(): void {
  if (panelManagerStates.size <= PANEL_MANAGER_CAP) return
  for (const [k, s] of panelManagerStates) {
    if (panelManagerStates.size <= PANEL_MANAGER_CAP) break
    if (s.isRunning || (panelManagerListeners.get(k)?.size ?? 0) > 0) continue
    panelManagerStates.delete(k)
    panelManagerListeners.delete(k)
    for (const [rid, kk] of runIdToPanelKey) {
      if (kk === k) runIdToPanelKey.delete(rid)
    }
    disposePanelStaleTimer(k)
  }
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

let panelManagerUnsubscribe: (() => void) | null = null

function ensurePanelManagerSubscribed(): void {
  if (panelManagerUnsubscribe) return
  panelManagerUnsubscribe = window.api.onAgentEvent((payload) => {
    const agentPayload = payload as AgentEventPayload
    const key = runIdToPanelKey.get(agentPayload.runId)
    if (!key) return
    dispatchToPanelManager(key, { type: 'APPLY_EVENT', payload: agentPayload, time: nowTimeKo(), nowMs: Date.now() })
  })
}

export function disposePanelManagerSession(key: string): void {
  const s = panelManagerStates.get(key)
  if (s?.currentRunId) {
    void window.api.agentAbort({ runId: s.currentRunId }).catch(() => {})
  }
  for (const [rid, kk] of runIdToPanelKey) {
    if (kk === key) runIdToPanelKey.delete(rid)
  }
  panelManagerStates.delete(key)
  panelManagerListeners.delete(key)
  panelLoopDisplayRegistry.clear(key)
  disposePanelStaleTimer(key)
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
  for (const t of panelStaleTimers.values()) t.dispose()
  panelStaleTimers.clear()
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

async function performManagedSend(key: string, text: string, opts?: SendOptions): Promise<void> {
  await performPanelSend(
    {
      readState: () => getPanelManagerState(key),
      dispatch: (action) => dispatchToPanelManager(key, action),
    },
    { fallbackSessionKey: () => key },
    text,
    opts,
  )
}

async function performManagedAbort(key: string): Promise<void> {
  const { currentRunId } = getPanelManagerState(key)
  if (!currentRunId) return
  dispatchToPanelManager(key, { type: 'CLEAR_LOOPS' })
  await window.api.agentAbort({ runId: currentRunId })
}

async function performManagedRespondPermission(key: string, behavior: PermissionResponse['behavior']): Promise<void> {
  const { pendingPermission } = getPanelManagerState(key)
  if (!pendingPermission) return

  dispatchToPanelManager(key, { type: 'CLEAR_PENDING_PERMISSION' })

  try {
    await window.api.permissionRespond({
      runId: pendingPermission.runId,
      requestId: pendingPermission.requestId,
      behavior,
    })
  } catch {
  }
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

  const send = useCallback(async (text: string, opts?: SendOptions): Promise<void> => {
    await performManagedSend(key, text, opts)
  }, [key])

  const abort = useCallback(async (): Promise<void> => {
    await performManagedAbort(key)
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

  const setReplMode = useCallback((on: boolean): void => {
    dispatchToPanelManager(key, { type: 'SET_REPL_MODE', on })
  }, [key])

  const dismissGoalStale = useCallback((): void => {
    dispatchToPanelManager(key, { type: 'DISMISS_GOAL_STALE' })
  }, [key])

  return { state, send, abort, restore, dismissLoopsStopped, respondPermission, setReplMode, dismissGoalStale }
}

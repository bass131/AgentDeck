// `api.<묶음>.<동작>` → 채널의 단일 원천. preload가 이 표를 순회해 함수를 만들고 IpcApi 타입도 여기서 유도한다.
import { IPC_CHANNELS } from '../ipcContract'
import type { ArgsOf, InvokeChannel, PayloadOf, PushChannel, ResOf, VoidReqChannel } from './channelMap'

type ReqChannel = Exclude<InvokeChannel, VoidReqChannel>

interface CallRoute<C extends ReqChannel = ReqChannel> {
  readonly kind: 'call'
  readonly channel: C
}
interface Call0Route<C extends VoidReqChannel = VoidReqChannel> {
  readonly kind: 'call0'
  readonly channel: C
}
interface PushRoute<C extends PushChannel = PushChannel> {
  readonly kind: 'push'
  readonly channel: C
}
export type ApiRoute = CallRoute | Call0Route | PushRoute

export function call<C extends ReqChannel>(channel: C): CallRoute<C> {
  return { kind: 'call', channel }
}
export function call0<C extends VoidReqChannel>(channel: C): Call0Route<C> {
  return { kind: 'call0', channel }
}
export function push<C extends PushChannel>(channel: C): PushRoute<C> {
  return { kind: 'push', channel }
}

export const API_ROUTES = {
  agent: {
    run: call(IPC_CHANNELS.AGENT_RUN),
    abort: call(IPC_CHANNELS.AGENT_ABORT),
    interrupt: call(IPC_CHANNELS.AGENT_INTERRUPT),
    taskStop: call(IPC_CHANNELS.AGENT_TASK_STOP),
    setMode: call(IPC_CHANNELS.AGENT_SET_MODE),
    setModel: call(IPC_CHANNELS.AGENT_SET_MODEL),
    setEffort: call(IPC_CHANNELS.AGENT_SET_EFFORT),
    listModels: call0(IPC_CHANNELS.AGENT_LIST_MODELS),
    permissionRespond: call(IPC_CHANNELS.PERMISSION_RESPOND),
    questionRespond: call(IPC_CHANNELS.QUESTION_RESPOND),
    onEvent: push(IPC_CHANNELS.AGENT_EVENT),
  },
  sessions: {
    load: call(IPC_CHANNELS.CONVERSATION_LOAD),
    save: call(IPC_CHANNELS.CONVERSATION_SAVE),
    delete: call(IPC_CHANNELS.CONVERSATION_DELETE),
    rename: call(IPC_CHANNELS.CONVERSATION_RENAME),
  },
  workspace: {
    open: call(IPC_CHANNELS.WORKSPACE_OPEN),
    tree: call(IPC_CHANNELS.WORKSPACE_TREE),
    diff: call(IPC_CHANNELS.FS_DIFF),
    read: call(IPC_CHANNELS.FS_READ),
    listFiles: call(IPC_CHANNELS.LIST_FILES),
    listDir: call(IPC_CHANNELS.FS_LIST_DIR),
    saveImage: call(IPC_CHANNELS.SAVE_IMAGE_DATA),
    pickFolder: call0(IPC_CHANNELS.DIALOG_PICK_FOLDER),
    referenceAdd: call(IPC_CHANNELS.REFERENCE_ADD),
    referenceList: call(IPC_CHANNELS.REFERENCE_LIST),
    referenceTree: call(IPC_CHANNELS.REFERENCE_TREE),
  },
  git: {
    root: call(IPC_CHANNELS.GIT_ROOT),
    status: call(IPC_CHANNELS.GIT_STATUS),
    log: call(IPC_CHANNELS.GIT_LOG),
    commitDetail: call(IPC_CHANNELS.GIT_COMMIT_DETAIL),
    fileAt: call(IPC_CHANNELS.GIT_FILE_AT),
    workingFile: call(IPC_CHANNELS.GIT_WORKING_FILE),
    commit: call(IPC_CHANNELS.GIT_COMMIT),
    push: call(IPC_CHANNELS.GIT_PUSH),
    pull: call(IPC_CHANNELS.GIT_PULL),
    prRead: call(IPC_CHANNELS.GIT_PR_READ),
    prMerge: call(IPC_CHANNELS.GIT_PR_MERGE),
  },
  lsp: {
    status: call(IPC_CHANNELS.LSP_STATUS),
    hover: call(IPC_CHANNELS.LSP_HOVER),
    definition: call(IPC_CHANNELS.LSP_DEFINITION),
    semanticTokens: call(IPC_CHANNELS.LSP_SEMANTIC_TOKENS),
    cachedTokens: call(IPC_CHANNELS.LSP_CACHED_TOKENS),
  },
  engine: {
    appVersion: call0(IPC_CHANNELS.APP_VERSION),
    state: call0(IPC_CHANNELS.ENGINE_STATE),
    checkUpdate: call0(IPC_CHANNELS.ENGINE_CHECK_UPDATE),
    listBackends: call0(IPC_CHANNELS.BACKEND_LIST),
    install: call(IPC_CHANNELS.ENGINE_INSTALL),
    setActive: call(IPC_CHANNELS.ENGINE_SET_ACTIVE),
    onInstallProgress: push(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS),
    usage: call0(IPC_CHANNELS.USAGE_GET),
  },
  settings: {
    listCommands: call(IPC_CHANNELS.COMMAND_LIST),
    listMcp: call0(IPC_CHANNELS.MCP_LIST),
    setMcpEnabled: call(IPC_CHANNELS.MCP_SET_ENABLED),
    listSkills: call(IPC_CHANNELS.SKILL_LIST),
    setSkillEnabled: call(IPC_CHANNELS.SKILL_SET_ENABLED),
    controlsState: call0(IPC_CHANNELS.CONTROLS_STATE),
    setControlEnabled: call(IPC_CHANNELS.CONTROLS_SET_ENABLED),
    confirmControls: call(IPC_CHANNELS.CONTROLS_CONFIRM),
    getProfile: call0(IPC_CHANNELS.PROFILE_GET),
    setProfile: call(IPC_CHANNELS.PROFILE_SET),
    getUiPrefs: call0(IPC_CHANNELS.UI_PREFS_GET),
    setUiPref: call(IPC_CHANNELS.UI_PREFS_SET),
  },
  window: {
    minimize: call0(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximizeToggle: call0(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),
    close: call0(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: call0(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    dragStart: call0(IPC_CHANNELS.WINDOW_DRAG_START),
    dragEnd: call0(IPC_CHANNELS.WINDOW_DRAG_END),
    resizeStart: call(IPC_CHANNELS.WINDOW_RESIZE_START),
    resizeEnd: call0(IPC_CHANNELS.WINDOW_RESIZE_END),
    onState: push(IPC_CHANNELS.WINDOW_STATE),
  },
  loop: {
    open: call(IPC_CHANNELS.LOOP_OPEN),
    start: call(IPC_CHANNELS.LOOP_START),
    status: call(IPC_CHANNELS.LOOP_STATUS),
    decide: call(IPC_CHANNELS.LOOP_DECIDE),
    answerCard: call(IPC_CHANNELS.LOOP_ANSWER_CARD),
    cancelSession: call(IPC_CHANNELS.LOOP_CANCEL_SESSION),
    releaseLatch: call(IPC_CHANNELS.LOOP_RELEASE_LATCH),
    close: call(IPC_CHANNELS.LOOP_CLOSE),
    onState: push(IPC_CHANNELS.LOOP_STATE),
    mainRead: call(IPC_CHANNELS.LOOP_MAIN_READ),
    mainSend: call(IPC_CHANNELS.LOOP_MAIN_SEND),
    mainNew: call(IPC_CHANNELS.LOOP_MAIN_NEW),
    onMainState: push(IPC_CHANNELS.LOOP_MAIN_STATE),
    onSessionEvent: push(IPC_CHANNELS.LOOP_SESSION_EVENT),
    lowerFlag: call(IPC_CHANNELS.LOOP_LOWER_FLAG),
    sessionLog: call(IPC_CHANNELS.LOOP_SESSION_LOG),
    mainArchives: call(IPC_CHANNELS.LOOP_MAIN_ARCHIVES),
    graph: call(IPC_CHANNELS.LOOP_GRAPH),
    alerts: call0(IPC_CHANNELS.LOOP_ALERTS),
    onAlerts: push(IPC_CHANNELS.LOOP_ALERTS_STATE),
    onAlertOpen: push(IPC_CHANNELS.LOOP_ALERT_OPEN),
    listDir: call(IPC_CHANNELS.LOOP_LIST_DIR),
  },
  taste: {
    read: call(IPC_CHANNELS.TASTE_READ),
  },
} as const

type ApiRoutes = typeof API_ROUTES

type RouteFn<R> = R extends CallRoute<infer C>
  ? (...args: ArgsOf<C>) => Promise<ResOf<C>>
  : R extends Call0Route<infer C>
    ? () => Promise<ResOf<C>>
    : R extends PushRoute<infer C>
      ? (cb: (payload: PayloadOf<C>) => void) => () => void
      : never

export type RoutedApi<T extends Record<string, Record<string, ApiRoute>> = ApiRoutes> = {
  [G in keyof T]: { [A in keyof T[G]]: RouteFn<T[G][A]> }
}

// IPC가 아닌 preload 노출(webUtils·webFrame)이라 표 밖에서 손으로 붙인다.
interface BridgeExtras {
  workspace: { pathForFile: (file: File) => string }
  window: { getZoomFactor: () => number; setZoomFactor: (factor: number) => void }
}

export type IpcApi = {
  [G in keyof RoutedApi]: RoutedApi[G] & (G extends keyof BridgeExtras ? BridgeExtras[G] : unknown)
}

// 표가 모든 채널을 정확히 한 번 덮는지 — 빠진 채널·없는 채널은 타입 오류다.
type RoutedChannel = {
  [G in keyof ApiRoutes]: { [A in keyof ApiRoutes[G]]: ApiRoutes[G][A] extends { channel: infer C } ? C : never }[keyof ApiRoutes[G]]
}[keyof ApiRoutes]
const _routesCoverChannels: [Exclude<InvokeChannel | PushChannel, RoutedChannel>] extends [never] ? true : false = true
void _routesCoverChannels

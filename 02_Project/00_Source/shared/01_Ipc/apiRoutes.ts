// preload API의 묶음 라우트 표 (M05 G10) — `api.<묶음>.<동작>`이 어느 채널로 가는지의 단일 원천이다.
// preload는 이 표를 순회해 invoke·구독 함수를 만들고, 노출 타입(IpcApi)도 이 표에서 유도한다.
import { IPC_CHANNELS } from '../ipcContract'
import type { ArgsOf, InvokeChannel, PayloadOf, PushChannel, ResOf, VoidReqChannel } from './channelMap'

export type ReqChannel = Exclude<InvokeChannel, VoidReqChannel>

export interface CallRoute<C extends ReqChannel = ReqChannel> {
  readonly kind: 'call'
  readonly channel: C
}
export interface Call0Route<C extends VoidReqChannel = VoidReqChannel> {
  readonly kind: 'call0'
  readonly channel: C
}
export interface PushRoute<C extends PushChannel = PushChannel> {
  readonly kind: 'push'
  readonly channel: C
}
export type ApiRoute = CallRoute | Call0Route | PushRoute

// 요청 하나를 받는 채널 — invoke(ch, req). 인자 없는 채널에 쓰면 타입 오류다.
export function call<C extends ReqChannel>(channel: C): CallRoute<C> {
  return { kind: 'call', channel }
}
// 인자 없는 채널 — invoke(ch). 요청이 필요한 채널에 쓰면 타입 오류다.
export function call0<C extends VoidReqChannel>(channel: C): Call0Route<C> {
  return { kind: 'call0', channel }
}
// main → renderer push 구독.
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
    multiLoad: call0(IPC_CHANNELS.MULTI_SESSION_LOAD),
    multiUpsert: call(IPC_CHANNELS.MULTI_CMD_UPSERT),
    multiCreate: call0(IPC_CHANNELS.MULTI_CMD_CREATE),
    multiDelete: call(IPC_CHANNELS.MULTI_CMD_DELETE),
    multiRename: call(IPC_CHANNELS.MULTI_CMD_RENAME),
    multiSelect: call(IPC_CHANNELS.MULTI_CMD_SELECT),
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
} as const

export type ApiRoutes = typeof API_ROUTES

// 라우트 하나 → 노출 함수 타입.
export type RouteFn<R> = R extends CallRoute<infer C>
  ? (...args: ArgsOf<C>) => Promise<ResOf<C>>
  : R extends Call0Route<infer C>
    ? () => Promise<ResOf<C>>
    : R extends PushRoute<infer C>
      ? (cb: (payload: PayloadOf<C>) => void) => () => void
      : never

export type RoutedApi<T extends Record<string, Record<string, ApiRoute>> = ApiRoutes> = {
  [G in keyof T]: { [A in keyof T[G]]: RouteFn<T[G][A]> }
}

// IPC가 아닌 preload 노출 — 파일 경로(webUtils)와 화면 배율(webFrame). 손으로 붙인다.
export interface BridgeExtras {
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

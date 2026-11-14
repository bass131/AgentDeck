import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { IPC_CHANNELS, ZOOM_FACTOR_RANGE } from '../shared/ipcContract'
import type {
  ArgsOf,
  InvokeChannel,
  PayloadOf,
  PushChannel,
  ReqOf,
  ResOf,
  VoidReqChannel,
} from '../shared/ipcContract'

// preload 노출의 타입은 채널 맵에서 유도한다 (M05 G10) — 맵과 어긋난 선언은 typecheck가 잡는다.
type ReqChannel = Exclude<InvokeChannel, VoidReqChannel>

// 요청 하나를 그대로 넘긴다 — 생략 가능한 요청도 invoke(ch, undefined)로 넘어간다(기존 거동).
function call<C extends ReqChannel>(channel: C): (...args: ArgsOf<C>) => Promise<ResOf<C>> {
  return ((req?: ReqOf<C>) => ipcRenderer.invoke(channel, req)) as (...args: ArgsOf<C>) => Promise<ResOf<C>>
}

// 인자 없는 채널 — invoke(ch)로 부른다.
function call0<C extends VoidReqChannel>(channel: C): () => Promise<ResOf<C>> {
  return () => ipcRenderer.invoke(channel)
}

function subscribe<C extends PushChannel>(channel: C): (cb: (payload: PayloadOf<C>) => void) => () => void {
  return (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PayloadOf<C>): void => {
      cb(payload)
    }
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

const api = {

  workspaceOpen: call(IPC_CHANNELS.WORKSPACE_OPEN),

  workspaceTree: call(IPC_CHANNELS.WORKSPACE_TREE),

  agentRun: call(IPC_CHANNELS.AGENT_RUN),

  agentAbort: call(IPC_CHANNELS.AGENT_ABORT),

  agentInterrupt: call(IPC_CHANNELS.AGENT_INTERRUPT),

  agentTaskStop: call(IPC_CHANNELS.AGENT_TASK_STOP),

  agentSetMode: call(IPC_CHANNELS.AGENT_SET_MODE),

  agentSetModel: call(IPC_CHANNELS.AGENT_SET_MODEL),

  permissionRespond: call(IPC_CHANNELS.PERMISSION_RESPOND),

  questionRespond: call(IPC_CHANNELS.QUESTION_RESPOND),

  onAgentEvent: subscribe(IPC_CHANNELS.AGENT_EVENT),

  fsDiff: call(IPC_CHANNELS.FS_DIFF),

  fsRead: call(IPC_CHANNELS.FS_READ),

  listFiles: (req?: ReqOf<typeof IPC_CHANNELS.LIST_FILES>): Promise<ResOf<typeof IPC_CHANNELS.LIST_FILES>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_FILES, req ?? {}),

  fsListDir: call(IPC_CHANNELS.FS_LIST_DIR),

  saveImageData: call(IPC_CHANNELS.SAVE_IMAGE_DATA),

  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  conversationLoad: call(IPC_CHANNELS.CONVERSATION_LOAD),

  conversationSave: call(IPC_CHANNELS.CONVERSATION_SAVE),

  conversationDelete: call(IPC_CHANNELS.CONVERSATION_DELETE),

  conversationRename: call(IPC_CHANNELS.CONVERSATION_RENAME),

  referenceAdd: call(IPC_CHANNELS.REFERENCE_ADD),

  referenceList: call(IPC_CHANNELS.REFERENCE_LIST),

  referenceTree: call(IPC_CHANNELS.REFERENCE_TREE),

  windowMinimize: call0(IPC_CHANNELS.WINDOW_MINIMIZE),

  windowMaximizeToggle: call0(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),

  windowClose: call0(IPC_CHANNELS.WINDOW_CLOSE),

  windowIsMaximized: call0(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

  windowGetBounds: call0(IPC_CHANNELS.WINDOW_GET_BOUNDS),

  windowSetBounds: call(IPC_CHANNELS.WINDOW_SET_BOUNDS),

  windowDragStart: call0(IPC_CHANNELS.WINDOW_DRAG_START),

  windowDragEnd: call0(IPC_CHANNELS.WINDOW_DRAG_END),

  windowResizeStart: (edge: ReqOf<typeof IPC_CHANNELS.WINDOW_RESIZE_START>['edge']): Promise<ResOf<typeof IPC_CHANNELS.WINDOW_RESIZE_START>> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE_START, { edge }),

  windowResizeEnd: call0(IPC_CHANNELS.WINDOW_RESIZE_END),

  onWindowState: subscribe(IPC_CHANNELS.WINDOW_STATE),

  getUsage: call0(IPC_CHANNELS.USAGE_GET),

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
  },

  lsp: {
    status: call(IPC_CHANNELS.LSP_STATUS),

    hover: call(IPC_CHANNELS.LSP_HOVER),

    definition: call(IPC_CHANNELS.LSP_DEFINITION),

    semanticTokens: call(IPC_CHANNELS.LSP_SEMANTIC_TOKENS),

    cachedTokens: call(IPC_CHANNELS.LSP_CACHED_TOKENS),
  },

  getProfile: call0(IPC_CHANNELS.PROFILE_GET),

  setProfile: call(IPC_CHANNELS.PROFILE_SET),

  getUiPrefs: call0(IPC_CHANNELS.UI_PREFS_GET),

  setUiPref: call(IPC_CHANNELS.UI_PREFS_SET),

  getZoomFactor: (): number => webFrame.getZoomFactor(),

  setZoomFactor: (factor: number): void => {
    if (typeof factor !== 'number' || !Number.isFinite(factor)) return
    const clamped = Math.min(ZOOM_FACTOR_RANGE.MAX, Math.max(ZOOM_FACTOR_RANGE.MIN, factor))
    webFrame.setZoomFactor(clamped)
  },

  getAppVersion: call0(IPC_CHANNELS.APP_VERSION),

  getEngineState: call0(IPC_CHANNELS.ENGINE_STATE),

  checkEngineUpdate: call0(IPC_CHANNELS.ENGINE_CHECK_UPDATE),

  listBackends: call0(IPC_CHANNELS.BACKEND_LIST),

  installEngine: (version: ReqOf<typeof IPC_CHANNELS.ENGINE_INSTALL>['version']): Promise<ResOf<typeof IPC_CHANNELS.ENGINE_INSTALL>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_INSTALL, { version } satisfies ReqOf<typeof IPC_CHANNELS.ENGINE_INSTALL>),

  setActiveEngine: (version: ReqOf<typeof IPC_CHANNELS.ENGINE_SET_ACTIVE>['version']): Promise<ResOf<typeof IPC_CHANNELS.ENGINE_SET_ACTIVE>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_SET_ACTIVE, { version } satisfies ReqOf<typeof IPC_CHANNELS.ENGINE_SET_ACTIVE>),

  getEngineVersionState: call0(IPC_CHANNELS.ENGINE_VERSION_STATE),

  onEngineInstallProgress: subscribe(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS),

  listSkills: call(IPC_CHANNELS.SKILL_LIST),

  setSkillEnabled: call(IPC_CHANNELS.SKILL_SET_ENABLED),

  listSlashCommands: call(IPC_CHANNELS.COMMAND_LIST),

  listMcpServers: call0(IPC_CHANNELS.MCP_LIST),

  setMcpEnabled: call(IPC_CHANNELS.MCP_SET_ENABLED),

  pickFolder: call0(IPC_CHANNELS.DIALOG_PICK_FOLDER),

  multiSessionLoad: call0(IPC_CHANNELS.MULTI_SESSION_LOAD),

  multiCmdUpsert: (session: ReqOf<typeof IPC_CHANNELS.MULTI_CMD_UPSERT>['session']): Promise<ResOf<typeof IPC_CHANNELS.MULTI_CMD_UPSERT>> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_UPSERT, { session }),

  multiCmdCreate: call0(IPC_CHANNELS.MULTI_CMD_CREATE),

  multiCmdDelete: (id: ReqOf<typeof IPC_CHANNELS.MULTI_CMD_DELETE>['id']): Promise<ResOf<typeof IPC_CHANNELS.MULTI_CMD_DELETE>> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_DELETE, { id }),

  multiCmdRename: (
    id: ReqOf<typeof IPC_CHANNELS.MULTI_CMD_RENAME>['id'],
    title: ReqOf<typeof IPC_CHANNELS.MULTI_CMD_RENAME>['title'],
  ): Promise<ResOf<typeof IPC_CHANNELS.MULTI_CMD_RENAME>> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_RENAME, { id, title }),

  multiCmdSelect: (id: ReqOf<typeof IPC_CHANNELS.MULTI_CMD_SELECT>['id']): Promise<ResOf<typeof IPC_CHANNELS.MULTI_CMD_SELECT>> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_SELECT, { id }),
} as const

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('[preload] exposeInMainWorld 실패:', error)
}

export type Api = typeof api

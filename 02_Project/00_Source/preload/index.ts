import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { IPC_CHANNELS, ZOOM_FACTOR_RANGE } from '../shared/ipcContract'
import type {
  McpServerInfo,
  McpSetEnabledReq,
  SkillInfo,
  SkillListRequest,
  SkillSetEnabledReq,
  SlashCommandInfo,
  CommandListRequest,
  MultiSessionLoadResponse,
  MultiCmdUpsertRequest,
  MultiCmdUpsertResponse,
  MultiCmdCreateResponse,
  MultiCmdDeleteRequest,
  MultiCmdDeleteResponse,
  MultiCmdRenameRequest,
  MultiCmdRenameResponse,
  MultiCmdSelectRequest,
  MultiCmdSelectResponse,
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeRequest,
  WorkspaceTreeResponse,
  AgentRunRequest,
  AgentRunResponse,
  AgentAbortRequest,
  AgentAbortResponse,
  AgentInterruptRequest,
  AgentInterruptResponse,
  TaskStopRequest,
  TaskStopResponse,
  SetModeRequest,
  SetModeResponse,
  SetModelRequest,
  SetModelResponse,
  AgentEventPayload,
  PermissionResponse,
  QuestionResponse,
  FsDiffRequest,
  FsDiffResponse,
  FsReadRequest,
  FsReadResponse,
  ListFilesRequest,
  ListFilesResponse,
  FsListDirRequest,
  FsListDirResponse,
  SaveImageDataRequest,
  SaveImageDataResponse,
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ConversationDeleteRequest,
  ConversationDeleteResponse,
  ConversationRenameRequest,
  ConversationRenameResponse,
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListRequest,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
  WindowBounds,
  ResizeEdge,
  WindowMaximizedResponse,
  WindowStatePayload,
  GitRootRequest,
  GitRootResponse,
  GitStatusRequest,
  GitStatusResponse,
  GitLogRequest,
  GitLogResponse,
  GitCommitDetailRequest,
  GitCommitDetailResponse,
  GitFileAtRequest,
  GitFileAtResponse,
  GitWorkingFileRequest,
  GitWorkingFileResponse,
  GitCommitRequest,
  GitCommitResponse,
  GitPushRequest,
  GitPushResponse,
  GitPullRequest,
  GitPullResponse,
  UsageInfo,
  LspDocReq,
  LspPosReq,
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  UiPrefs,
  UiPrefsSetReq,
  Profile,
  EngineState,
  EngineUpdateInfo,
  BackendStatus,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  EngineVersionState,
  PickFolderResponse,
} from '../shared/ipcContract'

const api = {

  workspaceOpen: (
    req: WorkspaceOpenRequest
  ): Promise<WorkspaceOpenResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_OPEN, req),

  workspaceTree: (
    req: WorkspaceTreeRequest
  ): Promise<WorkspaceTreeResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TREE, req),

  agentRun: (req: AgentRunRequest): Promise<AgentRunResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN, req),

  agentAbort: (req: AgentAbortRequest): Promise<AgentAbortResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_ABORT, req),

  agentInterrupt: (req: AgentInterruptRequest): Promise<AgentInterruptResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_INTERRUPT, req),

  agentTaskStop: (req: TaskStopRequest): Promise<TaskStopResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_TASK_STOP, req),

  agentSetMode: (req: SetModeRequest): Promise<SetModeResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_SET_MODE, req),

  agentSetModel: (req: SetModelRequest): Promise<SetModelResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_SET_MODEL, req),

  permissionRespond: (req: PermissionResponse): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_RESPOND, req),

  questionRespond: (req: QuestionResponse): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.QUESTION_RESPOND, req),

  onAgentEvent: (
    cb: (payload: AgentEventPayload) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: AgentEventPayload
    ): void => {
      cb(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler)
    }
  },

  fsDiff: (req: FsDiffRequest): Promise<FsDiffResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_DIFF, req),

  fsRead: (req: FsReadRequest): Promise<FsReadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_READ, req),

  listFiles: (req?: ListFilesRequest): Promise<ListFilesResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_FILES, req ?? {}),

  fsListDir: (req: FsListDirRequest): Promise<FsListDirResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIR, req),

  saveImageData: (req: SaveImageDataRequest): Promise<SaveImageDataResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_IMAGE_DATA, req),

  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  conversationLoad: (
    req: ConversationLoadRequest
  ): Promise<ConversationLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LOAD, req),

  conversationSave: (
    req: ConversationSaveRequest
  ): Promise<ConversationSaveResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SAVE, req),

  conversationDelete: (
    req: ConversationDeleteRequest
  ): Promise<ConversationDeleteResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, req),

  conversationRename: (
    req: ConversationRenameRequest
  ): Promise<ConversationRenameResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_RENAME, req),

  referenceAdd: (
    req: ReferenceAddRequest
  ): Promise<ReferenceAddResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.REFERENCE_ADD, req),

  referenceList: (
    req: ReferenceListRequest
  ): Promise<ReferenceListResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.REFERENCE_LIST, req),

  referenceTree: (
    req: ReferenceTreeRequest
  ): Promise<ReferenceTreeResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.REFERENCE_TREE, req),

  windowMinimize: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),

  windowMaximizeToggle: (): Promise<WindowMaximizedResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),

  windowClose: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  windowIsMaximized: (): Promise<WindowMaximizedResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

  windowGetBounds: (): Promise<WindowBounds> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_BOUNDS),

  windowSetBounds: (bounds: WindowBounds): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_BOUNDS, bounds),

  windowDragStart: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_DRAG_START),

  windowDragEnd: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_DRAG_END),

  windowResizeStart: (edge: ResizeEdge): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE_START, { edge }),

  windowResizeEnd: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE_END),

  onWindowState: (
    cb: (payload: WindowStatePayload) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: WindowStatePayload
    ): void => {
      cb(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE, handler)
    }
  },

  getUsage: (): Promise<UsageInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.USAGE_GET),

  git: {
    root: (req: GitRootRequest): Promise<GitRootResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_ROOT, req),

    status: (req: GitStatusRequest): Promise<GitStatusResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, req),

    log: (req: GitLogRequest): Promise<GitLogResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_LOG, req),

    commitDetail: (req: GitCommitDetailRequest): Promise<GitCommitDetailResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT_DETAIL, req),

    fileAt: (req: GitFileAtRequest): Promise<GitFileAtResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FILE_AT, req),

    workingFile: (req: GitWorkingFileRequest): Promise<GitWorkingFileResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKING_FILE, req),

    commit: (req: GitCommitRequest): Promise<GitCommitResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMMIT, req),

    push: (req: GitPushRequest): Promise<GitPushResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, req),

    pull: (req: GitPullRequest): Promise<GitPullResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, req),
  },

  lsp: {
    status: (req: LspDocReq): Promise<LspStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_STATUS, req),

    hover: (req: LspPosReq): Promise<LspHoverResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_HOVER, req),

    definition: (req: LspPosReq): Promise<LspLocation[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_DEFINITION, req),

    semanticTokens: (req: LspDocReq): Promise<LspSemanticTokens | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_SEMANTIC_TOKENS, req),

    cachedTokens: (req: LspDocReq): Promise<LspSemanticTokens | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LSP_CACHED_TOKENS, req),
  },

  getProfile: (): Promise<Profile | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET),

  setProfile: (p: Profile): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROFILE_SET, p),

  getUiPrefs: (): Promise<UiPrefs> =>
    ipcRenderer.invoke(IPC_CHANNELS.UI_PREFS_GET),

  setUiPref: (req: UiPrefsSetReq): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.UI_PREFS_SET, req),

  getZoomFactor: (): number => webFrame.getZoomFactor(),

  setZoomFactor: (factor: number): void => {
    if (typeof factor !== 'number' || !Number.isFinite(factor)) return
    const clamped = Math.min(ZOOM_FACTOR_RANGE.MAX, Math.max(ZOOM_FACTOR_RANGE.MIN, factor))
    webFrame.setZoomFactor(clamped)
  },

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  getEngineState: (): Promise<EngineState> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_STATE),

  checkEngineUpdate: (): Promise<EngineUpdateInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_CHECK_UPDATE),

  listBackends: (): Promise<BackendStatus[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKEND_LIST),

  installEngine: (version: string): Promise<EngineInstallResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_INSTALL, { version } satisfies EngineInstallRequest),

  setActiveEngine: (version: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_SET_ACTIVE, { version } satisfies EngineSetActiveRequest),

  getEngineVersionState: (): Promise<EngineVersionState> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENGINE_VERSION_STATE),

  onEngineInstallProgress: (
    cb: (p: EngineInstallProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      p: EngineInstallProgress
    ): void => {
      cb(p)
    }
    ipcRenderer.on(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, handler)
    }
  },

  listSkills: (req?: SkillListRequest): Promise<SkillInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST, req),

  setSkillEnabled: (req: SkillSetEnabledReq): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SET_ENABLED, req),

  listSlashCommands: (req?: CommandListRequest): Promise<SlashCommandInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMAND_LIST, req),

  listMcpServers: (): Promise<McpServerInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST),

  setMcpEnabled: (req: McpSetEnabledReq): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_SET_ENABLED, req),

  pickFolder: (): Promise<PickFolderResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_PICK_FOLDER),

  multiSessionLoad: (): Promise<MultiSessionLoadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_SESSION_LOAD),

  multiCmdUpsert: (session: MultiCmdUpsertRequest['session']): Promise<MultiCmdUpsertResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_UPSERT, { session }),

  multiCmdCreate: (): Promise<MultiCmdCreateResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_CREATE),

  multiCmdDelete: (id: MultiCmdDeleteRequest['id']): Promise<MultiCmdDeleteResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_DELETE, { id }),

  multiCmdRename: (
    id: MultiCmdRenameRequest['id'],
    title: MultiCmdRenameRequest['title'],
  ): Promise<MultiCmdRenameResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_RENAME, { id, title }),

  multiCmdSelect: (id: MultiCmdSelectRequest['id']): Promise<MultiCmdSelectResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MULTI_CMD_SELECT, { id }),
} as const

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('[preload] exposeInMainWorld 실패:', error)
}

export type Api = typeof api

// IPC 채널 타입 맵 (M05 G10) — 채널 이름 → 요청·응답 타입의 단일 원천이다.
// main 등록(`handle`)·push 송신(`sendPush`)·preload 노출이 모두 이 맵에서 타입을 유도한다.
// 채널 문자열의 런타임 원천은 여전히 `IPC_CHANNELS`이고, 맵 키와의 일치는 아래 양방향 검사가 지킨다.
import type { IPC_CHANNELS } from '../ipcContract'
import type {
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
  PermissionResponse,
  QuestionResponse,
  AgentEventPayload,
  ModelListResponse,
} from '../03_Agent/agent'
import type {
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ConversationDeleteRequest,
  ConversationDeleteResponse,
  ConversationRenameRequest,
  ConversationRenameResponse,
} from '../06_Sessions/conversation'
import type {
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeRequest,
  WorkspaceTreeResponse,
} from '../07_Workspace/workspace'
import type {
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
  PickFolderResponse,
} from '../07_Workspace/fs'
import type {
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListRequest,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
} from '../07_Workspace/reference'
import type {
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
  PrReadRequest,
  PrReadResponse,
  PrMergeRequest,
  PrMergeResponse,
} from '../08_Git/git'
import type { LspDocReq, LspPosReq, LspStatus, LspHoverResult, LspLocation, LspSemanticTokens } from '../09_Lsp/lsp'
import type {
  EngineState,
  EngineUpdateInfo,
  BackendStatus,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  UsageInfo,
} from '../10_Engine/engine'
import type {
  SkillListRequest,
  SkillInfo,
  SkillSetEnabledReq,
  McpServerInfo,
  McpSetEnabledReq,
  CommandListRequest,
  SlashCommandInfo,
  ControlsState,
  ControlSetEnabledReq,
  ControlConfirmReq,
} from '../11_Settings/settings'
import type { Profile, UiPrefs, UiPrefsSetReq } from '../11_Settings/personalization'
import type {
  LoopAnswerCardRequest,
  LoopCwdRequest,
  LoopDecideRequest,
  LoopDecideResponse,
  LoopOkResponse,
  LoopOpenRequest,
  LoopReleaseLatchRequest,
  LoopReleaseLatchResponse,
  LoopStartRequest,
  LoopStatus,
} from '../13_Loop/loop'
import type { Ack } from '../02_Common/common'
import type {
  WindowMaximizedResponse,
  WindowResizeStartRequest,
  WindowStatePayload,
} from '../12_Window/window'

// 이름 없던 확인 응답 `{ ok }` 자리는 G10 ack 통일로 공용 Ack { ok, error? }를 쓴다 (02_Common/common.ts).

// renderer → main 요청-응답 채널. `req: void`는 인자 없이 부르는 채널, `| undefined`는 생략 가능한 요청이다.
export interface IpcInvokeMap {
  'workspace.open': { req: WorkspaceOpenRequest; res: WorkspaceOpenResponse }
  'workspace.tree': { req: WorkspaceTreeRequest; res: WorkspaceTreeResponse }

  'agent.run': { req: AgentRunRequest; res: AgentRunResponse }
  'agent.abort': { req: AgentAbortRequest; res: AgentAbortResponse }
  'agent.interrupt': { req: AgentInterruptRequest; res: AgentInterruptResponse }
  'agent.taskStop': { req: TaskStopRequest; res: TaskStopResponse }
  'agent.setMode': { req: SetModeRequest; res: SetModeResponse }
  'agent.setModel': { req: SetModelRequest; res: SetModelResponse }
  'agent.listModels': { req: void; res: ModelListResponse }
  'agent.permissionRespond': { req: PermissionResponse; res: Ack }
  'agent.questionRespond': { req: QuestionResponse; res: Ack }

  'fs.diff': { req: FsDiffRequest; res: FsDiffResponse }
  'fs.read': { req: FsReadRequest; res: FsReadResponse }
  'fs.listFiles': { req: ListFilesRequest; res: ListFilesResponse }
  'fs.listDir': { req: FsListDirRequest; res: FsListDirResponse }
  'workspace.saveImage': { req: SaveImageDataRequest; res: SaveImageDataResponse }
  'workspace.pickFolder': { req: void; res: PickFolderResponse }

  'conversation.load': { req: ConversationLoadRequest; res: ConversationLoadResponse }
  'conversation.save': { req: ConversationSaveRequest; res: ConversationSaveResponse }
  'conversation.delete': { req: ConversationDeleteRequest; res: ConversationDeleteResponse }
  'conversation.rename': { req: ConversationRenameRequest; res: ConversationRenameResponse }

  'reference.add': { req: ReferenceAddRequest; res: ReferenceAddResponse }
  'reference.list': { req: ReferenceListRequest; res: ReferenceListResponse }
  'reference.tree': { req: ReferenceTreeRequest; res: ReferenceTreeResponse }

  'git.root': { req: GitRootRequest; res: GitRootResponse }
  'git.status': { req: GitStatusRequest; res: GitStatusResponse }
  'git.log': { req: GitLogRequest; res: GitLogResponse }
  'git.commitDetail': { req: GitCommitDetailRequest; res: GitCommitDetailResponse }
  'git.fileAt': { req: GitFileAtRequest; res: GitFileAtResponse }
  'git.workingFile': { req: GitWorkingFileRequest; res: GitWorkingFileResponse }
  'git.commit': { req: GitCommitRequest; res: GitCommitResponse }
  'git.push': { req: GitPushRequest; res: GitPushResponse }
  'git.pull': { req: GitPullRequest; res: GitPullResponse }
  'git.prRead': { req: PrReadRequest; res: PrReadResponse }
  'git.prMerge': { req: PrMergeRequest; res: PrMergeResponse }

  'lsp.status': { req: LspDocReq; res: LspStatus }
  'lsp.hover': { req: LspPosReq; res: LspHoverResult | null }
  'lsp.definition': { req: LspPosReq; res: LspLocation[] }
  'lsp.semanticTokens': { req: LspDocReq; res: LspSemanticTokens | null }
  'lsp.cachedTokens': { req: LspDocReq; res: LspSemanticTokens | null }

  'engine.appVersion': { req: void; res: string }
  'engine.install': { req: EngineInstallRequest; res: EngineInstallResult }
  'engine.setActive': { req: EngineSetActiveRequest; res: Ack }
  'engine.state': { req: void; res: EngineState }
  'engine.checkUpdate': { req: void; res: EngineUpdateInfo }
  'engine.listBackends': { req: void; res: BackendStatus[] }
  'engine.usage': { req: void; res: UsageInfo }

  'settings.listCommands': { req: CommandListRequest | undefined; res: SlashCommandInfo[] }
  'settings.listMcp': { req: void; res: McpServerInfo[] }
  'settings.setMcpEnabled': { req: McpSetEnabledReq; res: Ack }
  'settings.listSkills': { req: SkillListRequest | undefined; res: SkillInfo[] }
  'settings.setSkillEnabled': { req: SkillSetEnabledReq; res: Ack }
  'settings.controlsState': { req: void; res: ControlsState }
  'settings.setControlEnabled': { req: ControlSetEnabledReq; res: Ack }
  'settings.confirmControls': { req: ControlConfirmReq; res: Ack }
  'settings.getProfile': { req: void; res: Profile | null }
  'settings.setProfile': { req: Profile; res: Ack }
  'settings.getUiPrefs': { req: void; res: UiPrefs }
  'settings.setUiPref': { req: UiPrefsSetReq; res: Ack }

  'window.minimize': { req: void; res: void }
  'window.maximizeToggle': { req: void; res: WindowMaximizedResponse }
  'window.close': { req: void; res: void }
  'window.isMaximized': { req: void; res: WindowMaximizedResponse }
  'window.dragStart': { req: void; res: void }
  'window.dragEnd': { req: void; res: void }
  'window.resizeStart': { req: WindowResizeStartRequest; res: void }
  'window.resizeEnd': { req: void; res: void }

  // M09 G4 — 앱 안 루프(main/05_Loop/loopDriver.ts)
  'loop.open': { req: LoopOpenRequest; res: LoopStatus }
  'loop.start': { req: LoopStartRequest; res: LoopStatus }
  'loop.status': { req: LoopCwdRequest; res: LoopStatus }
  'loop.decide': { req: LoopDecideRequest; res: LoopDecideResponse }
  'loop.answerCard': { req: LoopAnswerCardRequest; res: LoopOkResponse }
  'loop.cancelSession': { req: LoopCwdRequest; res: LoopOkResponse }
  'loop.releaseLatch': { req: LoopReleaseLatchRequest; res: LoopReleaseLatchResponse }
  'loop.close': { req: LoopCwdRequest; res: LoopOkResponse }
}

// main → renderer push 채널. 값은 payload 타입이다.
export interface IpcPushMap {
  'agent.event': AgentEventPayload
  'engine.installProgress': EngineInstallProgress
  'window.state': WindowStatePayload
  'loop.state': LoopStatus
}

export type InvokeChannel = keyof IpcInvokeMap
export type PushChannel = keyof IpcPushMap
export type ReqOf<C extends InvokeChannel> = IpcInvokeMap[C]['req']
export type ResOf<C extends InvokeChannel> = IpcInvokeMap[C]['res']
export type PayloadOf<C extends PushChannel> = IpcPushMap[C]

// 인자 없이 부르는 채널 — `req`가 정확히 void인 것만. `X | undefined`(생략 가능)는 여기 들지 않는다.
export type VoidReqChannel = {
  [C in InvokeChannel]: [ReqOf<C>] extends [void] ? ([void] extends [ReqOf<C>] ? C : never) : never
}[InvokeChannel]

// 요청 인자 목록 — void면 없음, `X | undefined`면 생략 가능, 그 밖은 필수 하나.
export type ArgsOf<C extends InvokeChannel> = C extends VoidReqChannel
  ? []
  : undefined extends ReqOf<C>
    ? [req?: Exclude<ReqOf<C>, undefined>]
    : [req: ReqOf<C>]

// 두 키 집합이 같은지 — 어긋나면 남는 쪽 이름을 담은 튜플 타입이 되어 `true` 대입이 실패한다.
export type SameKeys<A extends string, B extends string> = [Exclude<A, B>, Exclude<B, A>] extends [never, never]
  ? true
  : ['맵과 IPC_CHANNELS가 어긋남 — [맵에만, IPC_CHANNELS에만]', Exclude<A, B>, Exclude<B, A>]

type ChannelValue = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
const _mapMatchesChannels: SameKeys<InvokeChannel | PushChannel, ChannelValue> = true
void _mapMatchesChannels

// invoke와 push가 같은 이름을 함께 쓰지 않는다.
const _invokePushDisjoint: [Extract<InvokeChannel, PushChannel>] extends [never] ? true : false = true
void _invokePushDisjoint

// main push 송신 — webContents·event.sender처럼 `send`를 가진 대상이면 된다. 감싸지 않고 그대로 보낸다.
export interface PushTarget {
  send(channel: string, ...args: unknown[]): void
}

export function sendPush<C extends PushChannel>(target: PushTarget, channel: C, payload: PayloadOf<C>): void {
  target.send(channel, payload)
}

import type { AgentEvent } from '../../shared/agentEvents'
import type { BackendId, ConversationMessage, SlashCommandInfo } from '../../shared/ipcContract'

export interface AgentRunInput {
  messages: ConversationMessage[]
  workspaceRoot?: string
  model?: string
  effort?: string
  mode?: string
  systemPrompt?: string
  orchestration?: boolean
  resumeSessionId?: string
  persistent?: boolean
  sessionKey?: string
  // 기록을 다시 실을 때의 예산
  contextWindow?: number
  // 아래 세 칸은 루프 세션 전용이다. IPC 요청은 이 칸을 옮기지 않아 화면이 고를 수 없다.
  // 없으면 이 프로세스의 환경이다
  env?: NodeJS.ProcessEnv
  // 있으면 루프 잠금 노드를 PreToolUse 맨 앞에 붙이고 사용자 MCP 서버를 읽지 않는다
  loopLock?: { repoRoot: string; appLoopDir: string; readOnly?: boolean; mainChat?: { toolServer: string; canWrite: () => boolean | Promise<boolean> } }
  // 메인 대화의 앱 안 도구 서버. loopLock이 있을 때만 SDK 옵션 mcpServers로 실린다
  loopMcpServers?: Record<string, unknown>
}

export type RunResponse =
  | { kind: 'permission'; behavior: 'allow' | 'allow_always' | 'deny' }
  | { kind: 'question'; answers: string[][] | null }

export interface AgentRun {
  readonly events: AsyncIterable<AgentEvent>
  abort(): void
  interrupt(): void
  push(content: string): void
  setOrchestration?(value: boolean): void
  onSessionClosing?(cb: () => void): void
  stopTask?(taskId: string): void
  setPermissionMode?(modeId: string): void
  setModel?(modelId: string): void
  setEffort?(effort: string): void
  respond(requestId: string, response: RunResponse): void
}

export interface AgentBackend {
  readonly id: BackendId

  isAvailable(): Promise<boolean>

  version(): Promise<string | null>

  latestVersion(): Promise<string | null>

  start(req: AgentRunInput): AgentRun

  listSupportedCommands(workspaceRoot?: string | null): SlashCommandInfo[]
}

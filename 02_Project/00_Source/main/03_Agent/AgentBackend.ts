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
  // 대화가 마지막으로 잰 컨텍스트 창 — 기록을 다시 실을 때의 예산에 쓴다 (M06 G4)
  contextWindow?: number
  // M09 G2 — 앱 안 루프의 작업 노드 세션 전용 두 칸. IPC 요청(01_Ipc/handlers/agent.ts)은 이 칸을 옮기지 않는다 — 화면이 고를 수 없다.
  // env: 세션 프로세스의 환경(자격 없는 자식 환경). 없으면 이 프로세스의 환경이다.
  env?: NodeJS.ProcessEnv
  // loopLock: 있으면 루프 잠금 노드(04_Claude/permission/loopLock.ts)를 PreToolUse 맨 앞에 붙이고, 사용자 MCP 서버를 읽지 않는다(G4).
  // readOnly: 검수 세션의 읽기 전용 꼴(G4)
  loopLock?: { repoRoot: string; appLoopDir: string; readOnly?: boolean }
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

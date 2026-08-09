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

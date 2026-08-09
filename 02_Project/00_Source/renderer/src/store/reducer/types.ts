import type { TokenUsage, TodoItem, SubAgentInfo, DiffLine, LoopInfo, PlanReviewPayload, AgentEventSearchResult } from '../../../../shared/agentEvents'
import type { ThreadItem } from '../threadTypes'

export interface FileDiffEntry {
  add: number
  del: number
  lines: DiffLine[]
}

export interface PendingPermission {
  runId: string
  requestId: string
  toolName: string
  summary: string
  planReview?: PlanReviewPayload
}

export interface PendingQuestion {
  runId: string
  requestId: string
  questions: import('../../../../shared/agentEvents').AgentQuestion[]
}

export type ToolCardStatus = 'running' | 'done' | 'error'

export interface BgTaskState {
  taskId: string
  toolUseId?: string
  description?: string
  status: string
  tail: string
  truncated?: boolean
}

export interface ToolCard {
  id: string
  name: string
  input: unknown
  status: ToolCardStatus
  result?: unknown
  searchResult?: AgentEventSearchResult
  background?: boolean
  bgTask?: BgTaskState
}

export interface AppState {
  currentRunId: string | null

  thread: ThreadItem[]
  openGroupId: string | null
  openMsgId: string | null
  seq: number

  changedFiles: Set<string>
  fileDiffs: Record<string, FileDiffEntry>
  isRunning: boolean
  lastUsage?: TokenUsage
  lastContextWindow?: number
  sessionId?: string
  activeLoops: LoopInfo[]
  loopsStoppedNotice: boolean
  errorMessage?: string
  thinkingText: string | null
  thinkingStartedAt: number | null
  todos: TodoItem[]
  subagents: SubAgentInfo[]
  pendingPermission: PendingPermission | null
  pendingQuestion: PendingQuestion | null

  pendingCommand?: { name: string; cardId: string; beforeMsgs: number; turns?: number; detail?: string | null } | null

  autonomyActive: boolean

  lastActivityAt: number | null
  bannerStale: boolean
  staleDismissed: boolean

  goalRun: { detail: string | null; turns: number; startedAt: number } | null

  apiRetry: { attempt: number; maxRetries: number; retryDelayMs: number } | null

  compacting: 'compacting' | 'requesting' | null

  sdkSessionState: 'idle' | 'running' | 'requires_action' | null

  hookRuns: HookRun[]
}

export interface HookRun {
  hookId: string
  hookName: string
  hookEvent: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  exitCode?: number
  stdout?: string
  stderr?: string
  output?: string
  time?: string
  runId?: string
}

export interface BeginCommandAction {
  type: 'begin-command'
  name: string
  cardId: string
  time: string
  detail?: string | null
  nowMs?: number
}

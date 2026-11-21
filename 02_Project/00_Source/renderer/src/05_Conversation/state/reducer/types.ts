import type { TokenUsage, TodoItem, SubAgentInfo, DiffLine, LoopInfo, PlanReviewPayload, AgentEventSearchResult } from '@shared/agentEvents'
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
  // 모드와 관계없이 사람에게 올린 호출의 표지와 사유 원문(없을 수 있다). 표지가 있으면 카드가 명령 전문을 보이고 「항상 허용」을 숨긴다.
  escalated?: true
  askReason?: string
  // 보이는 카드 뒤에 줄 선 요청 — 응답해 지우면 맨 앞이 올라온다
  behind?: PendingPermission[]
}

export interface PendingQuestion {
  runId: string
  requestId: string
  questions: import('@shared/agentEvents').AgentQuestion[]
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
  // 'after-turn' — 턴 도중에 모델을 바꿨다. 그 턴의 done은 옛 모델의 창이라 내리지 않는다
  contextWindowStale: boolean | 'after-turn'
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
  // SDK 자동 압축의 켜짐과 문턱 — 실행이 첫 턴 뒤 한 번 알린다
  autoCompact: { enabled: boolean; thresholdTokens?: number } | null

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

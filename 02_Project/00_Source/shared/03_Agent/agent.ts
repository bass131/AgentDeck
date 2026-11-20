import type { AgentEvent } from '../agentEvents'
import type { Ack, BackendId } from '../02_Common/common'

export const AGENT_CHANNELS = {
  AGENT_RUN: 'agent.run',
  AGENT_ABORT: 'agent.abort',
  AGENT_INTERRUPT: 'agent.interrupt',
  AGENT_TASK_STOP: 'agent.taskStop',
  AGENT_SET_MODE: 'agent.setMode',
  AGENT_SET_MODEL: 'agent.setModel',
  AGENT_SET_EFFORT: 'agent.setEffort',
  AGENT_LIST_MODELS: 'agent.listModels',
  AGENT_EVENT: 'agent.event',
  PERMISSION_RESPOND: 'agent.permissionRespond',
  QUESTION_RESPOND: 'agent.questionRespond',
} as const

type MessageRole ='user' | 'assistant'

export interface ConversationMessage {
  role: MessageRole
  content: string
}

export interface AgentRunRequest {
  messages: ConversationMessage[]
  backendId?: BackendId
  workspaceRoot?: string
  model?: string
  effort?: string
  mode?: string
  systemPrompt?: string
  orchestration?: boolean
  resumeSessionId?: string
  persistent?: boolean
  sessionKey?: string
  // 대화가 마지막으로 잰 컨텍스트 창 — main이 기록 재적재 예산을 정한다 (M06 G4)
  contextWindow?: number
}

// 첫 턴 전의 컨텍스트 창 기본값 하나 (M06 G4) — 턴이 끝나면 결과의 modelUsage.contextWindow가 대신한다.
// 모델별 손 표는 두지 않는다.
export const DEFAULT_CONTEXT_WINDOW = 1_000_000

// agent.listModels 응답 — main 공급자가 SDK 목록·캐시·최소 목록 가운데 하나를 준다.
export type { ModelRow, ModelListResponse, ModelListSource } from './models/modelList'

export interface AgentRunResponse {
  runId: string
}

export interface AgentAbortRequest {
  runId: string
}

// M05 G10 ack 통일: 아래 5개 응답은 옛 { accepted }에서 공용 Ack { ok }로 바뀌었다. 이름은 별칭으로 남긴다.
export type AgentAbortResponse = Ack

export interface AgentInterruptRequest {
  runId: string
}

export type AgentInterruptResponse = Ack

export interface TaskStopRequest {
  runId: string
  taskId: string
}

export type TaskStopResponse = Ack

export interface SetModeRequest {
  runId: string
  mode: string
}

export type SetModeResponse = Ack

export interface SetModelRequest {
  runId: string
  model: string
}

export type SetModelResponse = Ack

export interface SetEffortRequest {
  runId: string
  effort: string
}

export type SetEffortResponse = Ack

export interface PermissionResponse {
  runId: string
  requestId: string
  behavior: 'allow' | 'allow_always' | 'deny'
}

export interface QuestionResponse {
  runId: string
  requestId: string
  answers: string[][] | null
}

export interface AgentEventPayload {
  runId: string
  event: AgentEvent
}

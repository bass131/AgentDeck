export interface AgentEventOrchestration {
  type: 'orchestration'
  id: string
  name: string
  description?: string
  phases?: string[]
  script?: string
}

export interface OrchestrationAgentProgress {
  label: string
  phase?: string
  state: 'queued' | 'running' | 'done'
  tokens?: number
  toolCalls?: number
  resultPreview?: string
}

export interface AgentEventOrchestrationProgress {
  type: 'orchestration_progress'
  id: string
  status: 'running' | 'completed' | 'failed'
  summary?: string
  phases?: string[]
  agents?: OrchestrationAgentProgress[]
}

export type OrchestrationDeniedReason = 'orchestration-off'

export interface AgentEventOrchestrationDenied {
  type: 'orchestration_denied'
  id: string
  reason: OrchestrationDeniedReason
}

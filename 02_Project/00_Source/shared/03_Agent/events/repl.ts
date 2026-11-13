export interface AgentEventSession {
  type: 'session'
  sessionId: string
}

export interface LoopInfo {
  id: string
  summary: string
  interval?: string
}

export interface AgentEventLoops {
  type: 'loops'
  loops: LoopInfo[]
}

export type AutonomyEndedReason = 'grace-expired' | 'cap-reached'

export interface AgentEventAutonomyStatus {
  type: 'autonomy_status'
  status: 'active' | 'ended'
  reason?: AutonomyEndedReason
}

import type { ToolCard } from './reducer'
import type { OrchestrationAgentProgress } from '../../../shared/agentEvents'

export type { ToolCard }

export type ThreadItem =
  | {
      kind: 'msg'
      id: string
      role: 'user' | 'assistant'
      text: string
      error?: boolean
      images?: string[]
      time?: string
      origin?: 'user' | 'cron'
      interrupted?: boolean
    }
  | {
      kind: 'thinking'
      id: string
      text: string
      estimatedTokens?: number
    }
  | {
      kind: 'toolgroup'
      id: string
      tools: ToolCard[]
      time?: string
    }
  | {
      kind: 'notice'
      id: string
      text: string
      time?: string
      denyReason?: string
    }
  | {
      kind: 'cmdresult'
      id: string
      name: string
      title: string
      sub?: string | null
      running: boolean
      failed?: boolean
      time?: string
    }
  | {
      kind: 'orchestration'
      id: string
      name: string
      description?: string
      phases?: string[]
      running: boolean
      failed?: boolean
      result?: string
      script?: string
      time?: string
      liveStatus?: 'running' | 'completed' | 'failed'
      liveSummary?: string
      livePhases?: string[]
      agents?: OrchestrationAgentProgress[]
    }
  | {
      kind: 'subagent'
      id: string
    }
  | {
      kind: 'compact-boundary'
      id: string
      trigger?: 'manual' | 'auto'
      preTokens?: number
      postTokens?: number
      time?: string
    }
  | {
      kind: 'informational'
      id: string
      content: string
      level: 'info' | 'notice' | 'suggestion' | 'warning'
      preventContinuation?: boolean
      toolUseId?: string
      time?: string
    }
  | {
      kind: 'permission-denied'
      id: string
      toolName: string
      decisionReasonType?: string
      decisionReason?: string
      time?: string
    }

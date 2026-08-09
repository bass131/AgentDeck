export interface SubAgentTranscriptItem {
  kind: 'text' | 'thinking' | 'tool'
  text?: string
  verb?: string
  target?: string
  status?: 'running' | 'done' | 'queued'
  id?: string
}

export interface SubAgentTool {
  id: string
  verb: string
  target: string
  status: 'running' | 'done' | 'queued'
}

export interface SubAgentInfo {
  id: string
  name: string
  role: string
  status: 'queued' | 'running' | 'done'
  activity?: string
  tools: SubAgentTool[]
  transcript?: SubAgentTranscriptItem[]
  model?: string
  displayName?: string
}

export interface AgentEventSubagent {
  type: 'subagent'
  subagent: SubAgentInfo
}

export interface TodoItem {
  id: string
  label: string
  status: 'done' | 'running' | 'planned'
}

export interface AgentEventTodos {
  type: 'todos'
  todos: TodoItem[]
}

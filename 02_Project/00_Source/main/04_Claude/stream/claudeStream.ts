import type { AgentEvent, AgentEventBgTaskPatch, SearchResultMatch, TodoItem, TokenUsage } from '../../shared/agentEvents'
import { parseOrchestrationMeta } from './orchestrationMeta'

function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function todoStatus(s: string): TodoItem['status'] {
  if (s === 'completed' || s === 'done') return 'done'
  if (s === 'in_progress' || s === 'running') return 'running'
  return 'planned'
}

function mapTaskProgress(obj: Record<string, unknown>): AgentEvent[] {
  const id = isString(obj['tool_use_id']) ? obj['tool_use_id'] : ''
  if (!id) return []

  const subtype = isString(obj['subtype']) ? obj['subtype'] : ''

  let status: 'running' | 'completed' | 'failed' = 'running'
  if (subtype === 'task_notification') {
    const s = isString(obj['status']) ? obj['status'] : ''
    status = s === 'completed' ? 'completed' : s === 'failed' ? 'failed' : 'running'
  }

  const wp = isArray(obj['workflow_progress']) ? obj['workflow_progress'] : []
  const phaseEntries: { index: number; title: string }[] = []
  const agentMap = new Map<string, {
    label: string; phase?: string; state: 'queued' | 'running' | 'done'
    tokens?: number; toolCalls?: number; resultPreview?: string
  }>()
  for (const entry of wp) {
    if (!isObject(entry)) continue
    const etype = entry['type']
    if (etype === 'workflow_phase') {
      const title = isString(entry['title']) ? entry['title'] : ''
      const index = typeof entry['index'] === 'number' ? entry['index'] : 0
      if (title) phaseEntries.push({ index, title })
    } else if (etype === 'workflow_agent') {
      const label = isString(entry['label']) ? entry['label'] : ''
      if (!label) continue
      const rawState = isString(entry['state']) ? entry['state'] : ''
      const state: 'queued' | 'running' | 'done' =
        rawState === 'done' ? 'done' : rawState === 'queued' ? 'queued' : 'running'
      const agent: { label: string; phase?: string; state: 'queued' | 'running' | 'done'; tokens?: number; toolCalls?: number; resultPreview?: string } = { label, state }
      if (isString(entry['phaseTitle'])) agent.phase = entry['phaseTitle']
      if (typeof entry['tokens'] === 'number') agent.tokens = entry['tokens']
      if (typeof entry['toolCalls'] === 'number') agent.toolCalls = entry['toolCalls']
      if (isString(entry['resultPreview'])) agent.resultPreview = entry['resultPreview']
      agentMap.set(label, agent)
    }
  }
  const phases = phaseEntries.sort((a, b) => a.index - b.index).map(p => p.title)
  const agents = [...agentMap.values()]

  const summary = isString(obj['summary']) ? obj['summary'] : ''

  const event: AgentEvent = {
    type: 'orchestration_progress',
    id,
    status,
    ...(summary ? { summary } : {}),
    ...(phases.length ? { phases } : {}),
    ...(agents.length ? { agents } : {}),
  }
  return [event]
}

function mapBgTask(obj: Record<string, unknown>): AgentEvent[] {
  const taskId = obj['task_id']
  if (!isString(taskId) || taskId.length === 0) return []
  const subtype = obj['subtype']
  const toolUseId = obj['tool_use_id']

  if (subtype === 'task_started') {
    const taskType = obj['task_type']
    const description = obj['description']
    return [{
      type: 'bg_task',
      kind: 'started',
      taskId,
      ...(isString(toolUseId) ? { toolUseId } : {}),
      ...(taskType === 'local_bash' || taskType === 'local_agent' || taskType === 'local_workflow'
        ? { taskType }
        : {}),
      ...(isString(description) ? { description } : {}),
    }]
  }

  if (subtype === 'task_updated') {
    const rawPatch = obj['patch']
    let patch: AgentEventBgTaskPatch | undefined
    if (isObject(rawPatch)) {
      const status = rawPatch['status']
      const endTime = rawPatch['end_time']
      patch = {
        ...(isString(status) ? { status } : {}),
        ...(isNumber(endTime) ? { endTime } : {}),
      }
    }
    return [{
      type: 'bg_task',
      kind: 'updated',
      taskId,
      ...(patch !== undefined ? { patch } : {}),
    }]
  }

  if (subtype === 'task_notification') {
    const status = obj['status']
    const outputFile = obj['output_file']
    const summary = obj['summary']
    return [{
      type: 'bg_task',
      kind: 'notification',
      taskId,
      ...(isString(toolUseId) ? { toolUseId } : {}),
      ...(isString(status) ? { status } : {}),
      ...(isString(outputFile) ? { outputFile } : {}),
      ...(isString(summary) ? { summary } : {}),
    }]
  }

  return []
}

const SDK_MODE_TO_PICKER: Record<string, string> = {
  default: 'normal',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'auto',
  bypassPermissions: 'bypass',
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function mapAssistantContent(content: unknown[], parentToolId?: string): AgentEvent[] {
  const events: AgentEvent[] = []
  let thinkingEmitted = false
  let thinkingCleared = false

  for (const block of content) {
    if (!isObject(block)) continue
    const blockType = block['type']

    if (blockType === 'thinking') {
      const thinking = block['thinking']
      if (isString(thinking) && thinking.trim().length > 0) {
        const text = parentToolId ? oneLine(thinking, 90) : thinking.trim()
        events.push({
          type: 'thinking',
          text,
          ...(parentToolId ? { parentToolId } : {})
        })
        thinkingEmitted = true
      }
    } else if (blockType === 'text') {
      const text = block['text']
      if (isString(text) && text.trim().length > 0) {
        if (thinkingEmitted && !thinkingCleared) {
          events.push({ type: 'thinking_clear' })
          thinkingCleared = true
        }
        events.push({ type: 'text', delta: text, ...(parentToolId ? { parentToolId } : {}) })
      }
    } else if (blockType === 'tool_use') {
      const id = block['id']
      const name = block['name']
      const input = block['input']
      if (isString(id) && isString(name)) {
        if (name === 'AskUserQuestion') continue
        if (name === 'Workflow') {
          const inp = isObject(input) ? input : {}
          const rawScript = isString(inp['script']) ? inp['script'] : ''
          const meta = parseOrchestrationMeta(rawScript)
          const cappedScript = rawScript.slice(0, 4096)
          events.push({
            type: 'orchestration',
            id,
            name: meta.name,
            ...(meta.description ? { description: meta.description } : {}),
            ...(meta.phases ? { phases: meta.phases } : {}),
            ...(cappedScript ? { script: cappedScript } : {})
          })
        } else if (name === 'TodoWrite') {
          const rawTodos = isObject(input) ? input['todos'] : undefined
          const todosArr = isArray(rawTodos) ? rawTodos : []
          const todos: TodoItem[] = todosArr.map((t, i) => {
            if (!isObject(t)) return { id: String(i + 1), label: '', status: 'planned' as const }
            const rawId = t['id']
            const todoId = isString(rawId) ? rawId : String(i + 1)
            const todoContent = isString(t['content']) ? t['content'] : ''
            const activeForm = isString(t['activeForm']) ? t['activeForm'] : undefined
            const statusRaw = isString(t['status']) ? t['status'] : 'pending'
            const status = todoStatus(statusRaw)
            const label = status === 'running' && activeForm ? activeForm : todoContent
            return { id: todoId, label, status }
          })
          events.push({ type: 'todos', todos })
        } else if ((name === 'Task' || name === 'Agent') && !parentToolId) {
          const inp = isObject(input) ? input : {}
          const subagentType = isString(inp['subagent_type']) ? inp['subagent_type'] : undefined
          const description = isString(inp['description']) ? inp['description'] : ''
          const inputName = isString(inp['name']) ? inp['name'] : undefined
          const inputModel = isString(inp['model']) ? inp['model'] : undefined
          events.push({
            type: 'subagent',
            subagent: {
              id,
              name: subagentType ?? 'subagent',
              role: oneLine(description, 40),
              status: 'running',
              tools: [],
              ...(inputName ? { displayName: inputName } : {}),
              ...(inputModel ? { model: inputModel } : {})
            }
          })
        } else {
          const isBackground = isObject(input) && input['run_in_background'] === true
          const toolCallEvent: AgentEvent = {
            type: 'tool_call',
            id,
            name,
            input: input !== undefined ? input : {},
            ...(parentToolId ? { parentToolId } : {}),
            ...(isBackground ? { background: true } : {})
          }
          events.push(toolCallEvent)
        }
      }
    }
  }
  return events
}

function mapUserContent(content: unknown[]): AgentEvent[] {
  const events: AgentEvent[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    const blockType = block['type']

    if (blockType === 'tool_result') {
      const id = block['tool_use_id']
      const isError = block['is_error']
      const blockContent = block['content']
      if (isString(id)) {
        events.push({
          type: 'tool_result',
          id,
          ok: isError !== true,
          output: blockContent !== undefined ? blockContent : null
        })
      }
    }
  }
  return events
}

function parseGrepContentMatches(content: string): SearchResultMatch[] {
  const matches: SearchResultMatch[] = []
  for (const rawLine of content.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed === '--') continue
    const m = /^(.+?):(\d+):(.*)$/.exec(line)
    if (!m) continue
    matches.push({ path: m[1], line: Number.parseInt(m[2], 10), text: m[3] })
  }
  return matches
}

function mapToolUseSearchResult(raw: unknown, toolUseId: string | undefined): AgentEvent[] {
  if (!isObject(raw)) return []
  const filenamesRaw = raw['filenames']
  const numFiles = raw['numFiles']
  if (!isArray(filenamesRaw) || !isNumber(numFiles)) return []
  const filenames = filenamesRaw.filter(isString)
  const mode = raw['mode']
  const numMatches = raw['numMatches']

  if (mode === 'content') {
    const content = raw['content']
    const parsed = isString(content) ? parseGrepContentMatches(content) : []
    const filenameSet = new Set(filenames)
    const matches = filenameSet.size === 0 ? parsed : parsed.filter((m) => filenameSet.has(m.path))
    if (matches.length === 0) return []
    const files: string[] = []
    for (const m of matches) {
      if (!files.includes(m.path)) files.push(m.path)
    }
    return [{
      type: 'search_result',
      ...(toolUseId ? { toolUseId } : {}),
      mode: 'content',
      matches,
      files,
      total: isNumber(numMatches) ? numMatches : matches.length
    }]
  }

  if (mode === 'files_with_matches' || mode === 'count') {
    return [{
      type: 'search_result',
      ...(toolUseId ? { toolUseId } : {}),
      mode,
      files: filenames,
      total: mode === 'count' && isNumber(numMatches) ? numMatches : numFiles
    }]
  }

  const truncated = raw['truncated']
  if (mode === undefined && isNumber(raw['durationMs']) && typeof truncated === 'boolean') {
    const totalMatches = raw['totalMatches']
    return [{
      type: 'search_result',
      ...(toolUseId ? { toolUseId } : {}),
      mode: 'glob',
      files: filenames,
      total: isNumber(totalMatches) ? totalMatches : numFiles,
      truncated
    }]
  }

  return []
}

function mapUsage(usageRaw: unknown): TokenUsage | undefined {
  if (!isObject(usageRaw)) return undefined
  const inputTokens = usageRaw['input_tokens']
  const outputTokens = usageRaw['output_tokens']
  if (!isNumber(inputTokens) || !isNumber(outputTokens)) return undefined

  const usage: TokenUsage = { inputTokens, outputTokens }

  const cacheCreation = usageRaw['cache_creation_input_tokens']
  if (isNumber(cacheCreation)) usage.cacheCreationTokens = cacheCreation

  const cacheRead = usageRaw['cache_read_input_tokens']
  if (isNumber(cacheRead)) usage.cacheReadTokens = cacheRead

  return usage
}

function windowFromModelUsage(modelUsage: unknown): number | undefined {
  if (!isObject(modelUsage)) return undefined
  let maxWindow: number | undefined
  for (const key of Object.keys(modelUsage)) {
    const entry = modelUsage[key]
    if (!isObject(entry)) continue
    const cw = entry['contextWindow']
    if (isNumber(cw)) {
      if (maxWindow === undefined || cw > maxWindow) {
        maxWindow = cw
      }
    }
  }
  return maxWindow
}

function isSuccess(obj: Record<string, unknown>): boolean {
  const isError = obj['is_error']
  if (typeof isError === 'boolean') {
    return !isError
  }
  const subtype = obj['subtype']
  return subtype === 'success'
}

function extractErrorMessage(obj: Record<string, unknown>): string {
  const errors = obj['errors']
  if (isArray(errors) && errors.length > 0) {
    const msgs = errors.filter(isString)
    if (msgs.length > 0) return msgs.join('; ')
  }
  const error = obj['error']
  if (isString(error) && error.length > 0) return error
  const subtype = obj['subtype']
  if (isString(subtype)) {
    return `Agent execution failed: ${subtype}`
  }
  return 'Unknown error from agent'
}

export function mapClaudeStreamLine(obj: unknown): AgentEvent[] {
  if (!isObject(obj)) return []

  const type = obj['type']
  if (!isString(type)) return []

  switch (type) {
    case 'assistant': {
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      const rawParentId = obj['parent_tool_use_id']
      const parentToolId = isString(rawParentId) ? rawParentId : undefined
      return mapAssistantContent(content, parentToolId)
    }

    case 'user': {
      if (obj['isReplay'] === true) {
        return []
      }
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      const events = mapUserContent(content)
      let toolUseId: string | undefined
      for (const e of events) {
        if (e.type === 'tool_result') {
          toolUseId = e.id
          break
        }
      }
      return [...events, ...mapToolUseSearchResult(obj['tool_use_result'], toolUseId)]
    }

    case 'result': {
      if (isSuccess(obj)) {
        const usage = mapUsage(obj['usage'])
        const contextWindow = windowFromModelUsage(obj['modelUsage'])
        const done: AgentEvent = {
          type: 'done',
          ...(usage ? { usage } : {}),
          ...(contextWindow !== undefined ? { contextWindow } : {})
        }
        return [done]
      } else {
        const message = extractErrorMessage(obj)
        return [
          { type: 'error', message },
          { type: 'done' }
        ]
      }
    }

    case 'system': {
      const subtype = obj['subtype']
      if (
        subtype === 'task_started' ||
        subtype === 'task_progress' ||
        subtype === 'task_notification'
      ) {
        return [...mapTaskProgress(obj), ...mapBgTask(obj)]
      }
      if (subtype === 'task_updated') {
        return mapBgTask(obj)
      }
      if (subtype === 'init') {
        const sid = obj['session_id']
        if (typeof sid === 'string' && sid.length > 0) {
          return [{ type: 'session', sessionId: sid }]
        }
        return []
      }
      if (subtype === 'session_state_changed') {
        const state = obj['state']
        if (state === 'idle' || state === 'running' || state === 'requires_action') {
          return [{ type: 'session_state', state }]
        }
        return []
      }
      if (subtype === 'api_retry') {
        const attempt = obj['attempt']
        const maxRetries = obj['max_retries']
        const retryDelayMs = obj['retry_delay_ms']
        const error = obj['error']
        if (isNumber(attempt) && isNumber(maxRetries) && isNumber(retryDelayMs)) {
          const event: AgentEvent = {
            type: 'api_retry',
            attempt,
            maxRetries,
            retryDelayMs,
            ...(isString(error) ? { error } : {})
          }
          return [event]
        }
        return []
      }
      if (subtype === 'compact_boundary') {
        const meta = obj['compact_metadata']
        if (isObject(meta)) {
          const trigger = meta['trigger']
          const preTokens = meta['pre_tokens']
          const postTokens = meta['post_tokens']
          if ((trigger === 'auto' || trigger === 'manual') && isNumber(preTokens)) {
            const event: AgentEvent = {
              type: 'compact',
              kind: 'boundary',
              trigger,
              preTokens,
              ...(isNumber(postTokens) ? { postTokens } : {})
            }
            return [event]
          }
        }
        return []
      }
      if (subtype === 'status') {
        const events: AgentEvent[] = []
        const status = obj['status']
        if (status === 'compacting' || status === 'requesting' || status === null) {
          events.push({ type: 'compact', kind: 'status', status })
        }
        const permissionMode = obj['permissionMode']
        const pickerId = isString(permissionMode) ? SDK_MODE_TO_PICKER[permissionMode] : undefined
        if (pickerId !== undefined) {
          events.push({ type: 'permission_mode', mode: pickerId })
        }
        return events
      }
      if (subtype === 'hook_started') {
        const hookId = obj['hook_id']
        const hookName = obj['hook_name']
        const hookEvent = obj['hook_event']
        if (isString(hookId) && isString(hookName) && isString(hookEvent)) {
          return [{ type: 'hook_lifecycle', phase: 'started', hookId, hookName, hookEvent }]
        }
        return []
      }
      if (subtype === 'hook_response') {
        const hookId = obj['hook_id']
        const hookName = obj['hook_name']
        const hookEvent = obj['hook_event']
        if (isString(hookId) && isString(hookName) && isString(hookEvent)) {
          const exitCode = obj['exit_code']
          const outcome = obj['outcome']
          const stdout = obj['stdout']
          const stderr = obj['stderr']
          const output = obj['output']
          const event: AgentEvent = {
            type: 'hook_lifecycle',
            phase: 'response',
            hookId,
            hookName,
            hookEvent,
            ...(isNumber(exitCode) ? { exitCode } : {}),
            ...(outcome === 'success' || outcome === 'error' || outcome === 'cancelled' ? { outcome } : {}),
            ...(isString(stdout) ? { stdout } : {}),
            ...(isString(stderr) ? { stderr } : {}),
            ...(isString(output) ? { output } : {})
          }
          return [event]
        }
        return []
      }
      if (subtype === 'hook_progress') {
        const hookId = obj['hook_id']
        const hookName = obj['hook_name']
        const hookEvent = obj['hook_event']
        if (isString(hookId) && isString(hookName) && isString(hookEvent)) {
          const stdout = obj['stdout']
          const stderr = obj['stderr']
          const output = obj['output']
          const event: AgentEvent = {
            type: 'hook_lifecycle',
            phase: 'progress',
            hookId,
            hookName,
            hookEvent,
            ...(isString(stdout) ? { stdout } : {}),
            ...(isString(stderr) ? { stderr } : {}),
            ...(isString(output) ? { output } : {})
          }
          return [event]
        }
        return []
      }
      if (subtype === 'informational') {
        const content = obj['content']
        const level = obj['level']
        if (
          isString(content) &&
          (level === 'info' || level === 'notice' || level === 'suggestion' || level === 'warning')
        ) {
          const toolUseId = obj['tool_use_id']
          const preventContinuation = obj['prevent_continuation']
          const event: AgentEvent = {
            type: 'informational',
            content,
            level,
            ...(isString(toolUseId) ? { toolUseId } : {}),
            ...(preventContinuation === true ? { preventContinuation: true } : {})
          }
          return [event]
        }
        return []
      }
      if (subtype === 'permission_denied') {
        const toolName = obj['tool_name']
        if (isString(toolName)) {
          const decisionReasonType = obj['decision_reason_type']
          const decisionReason = obj['decision_reason']
          const event: AgentEvent = {
            type: 'permission_denied',
            toolName,
            ...(isString(decisionReasonType) ? { decisionReasonType } : {}),
            ...(isString(decisionReason) ? { decisionReason } : {})
          }
          return [event]
        }
        return []
      }
      if (subtype === 'thinking_tokens') {
        const estimatedTokens = obj['estimated_tokens']
        if (isNumber(estimatedTokens)) {
          return [{ type: 'thinking_delta', estimatedTokens }]
        }
        return []
      }
      return []
    }

    case 'stream_event': {
      const ev = obj['event']
      if (
        isObject(ev) &&
        ev['type'] === 'content_block_delta'
      ) {
        const delta = ev['delta']
        if (isObject(delta)) {
          if (
            delta['type'] === 'text_delta' &&
            isString(delta['text']) &&
            delta['text'].length > 0
          ) {
            return [{ type: 'text', delta: delta['text'] }]
          }
          if (
            delta['type'] === 'thinking_delta' &&
            isString(delta['thinking']) &&
            delta['thinking'].length > 0
          ) {
            return [{ type: 'thinking_delta', text: delta['thinking'] }]
          }
        }
      }
      return []
    }

    default:
      return []
  }
}

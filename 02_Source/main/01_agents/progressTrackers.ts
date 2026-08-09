import { sanitizeDescription } from './descriptionUtils'
import type { AgentEvent, LoopInfo } from '../../shared/agentEvents'

const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList'])

export class TaskTracker {
  private _taskMap = new Map<string, { id: string; label: string; status: 'planned' | 'running' | 'done' }>()
  private _taskSeq = 0
  private _taskToolIds = new Set<string>()

  isTaskTool(name: string): boolean {
    return TASK_TOOLS.has(name)
  }

  isTaskResult(id: string): boolean {
    return this._taskToolIds.has(id)
  }

  handle(id: string, name: string, input: unknown): AgentEvent[] {
    this._taskToolIds.add(id)

    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    if (name === 'TaskCreate') {
      const subject = String(inp['subject'] ?? inp['description'] ?? '').trim()
      if (subject) {
        const tid = String(++this._taskSeq)
        this._taskMap.set(tid, { id: tid, label: subject, status: 'planned' })
      }
    } else if (name === 'TaskUpdate') {
      const tid = String(inp['taskId'] ?? inp['task_id'] ?? inp['id'] ?? '').trim()
      const status = String(inp['status'] ?? '').trim()
      const task = this._taskMap.get(tid)
      if (task) {
        if (status === 'deleted') {
          this._taskMap.delete(tid)
        } else {
          if (status) task.status = TaskTracker._mapTaskStatus(status)
          if (inp['subject']) task.label = String(inp['subject'])
        }
      }
    }

    const todos = [...this._taskMap.values()].map(t => ({ ...t }))
    return [{ type: 'todos', todos }]
  }

  clear(): void {
    this._taskMap.clear()
    this._taskToolIds.clear()
  }

  private static _mapTaskStatus(s: string): 'done' | 'running' | 'planned' {
    if (s === 'completed' || s === 'done') return 'done'
    if (s === 'in_progress' || s === 'running') return 'running'
    return 'planned'
  }
}

const CRON_CREATE_TOOLS = new Set(['CronCreate', 'CronUpdate'])

const WAKEUP_TOOL = 'ScheduleWakeup'

const WAKEUP_LOOP_ID = 'wakeup'

function formatWakeupInterval(delaySeconds: number): string {
  const total = Math.round(delaySeconds)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes > 0 && seconds > 0) return `self-paced ~${minutes}분 ${seconds}초`
  if (minutes > 0) return `self-paced ~${minutes}분`
  return `self-paced ~${seconds}초`
}

export class CronTracker {
  private _activeLoops = new Map<string, LoopInfo>()
  private _cronPending = new Map<string, { summary: string; cron: string }>()

  private _wakeupPending = new Map<string, { summary: string; interval?: string }>()
  private _wakeupArmedThisTurn = false

  isCronCreate(name: string): boolean {
    return CRON_CREATE_TOOLS.has(name)
  }

  isCronDelete(name: string): boolean {
    return name === 'CronDelete'
  }

  hasPending(id: string): boolean {
    return this._cronPending.has(id)
  }

  hasActiveLoops(): boolean {
    return this._activeLoops.size > 0
  }

  hasActivity(): boolean {
    return this._activeLoops.size > 0 || this._cronPending.size > 0 || this._wakeupPending.size > 0
  }

  recordPending(id: string, input: unknown): void {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}
    const rawPrompt = typeof inp['prompt'] === 'string' ? inp['prompt'] : ''
    const summary = sanitizeDescription(rawPrompt)
    const cron = typeof inp['cron'] === 'string' ? inp['cron'] : ''
    this._cronPending.set(id, { summary, cron })
  }

  resolvePending(id: string, output: unknown, ok?: boolean): AgentEvent[] {
    const pending = this._cronPending.get(id)
    this._cronPending.delete(id)
    if (!pending) return []
    if (ok === false) return []

    const content = typeof output === 'string' ? output : ''
    const idMatch = content ? /\bjob\s+([0-9a-f]+)\b/i.exec(content) : null
    if (!idMatch) {
      this._activeLoops.set(id, { id, summary: pending.summary })
      return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
    }
    const cronId = idMatch[1]

    const intervalMatch = /\(([^)]+)\)/.exec(content)
    const interval = intervalMatch
      ? intervalMatch[1].replace(/[\r\n]+/g, ' ').trim().slice(0, 64)
      : undefined

    this._activeLoops.set(cronId, {
      id: cronId,
      summary: pending.summary,
      ...(interval ? { interval } : {})
    })

    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  handleDelete(input: unknown): AgentEvent[] {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawId =
      typeof inp['id'] === 'string' ? inp['id'] :
      typeof inp['cronId'] === 'string' ? inp['cronId'] :
      typeof inp['jobId'] === 'string' ? inp['jobId'] :
      ''

    if (!rawId) return []
    if (!this._activeLoops.has(rawId)) return []

    this._activeLoops.delete(rawId)
    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  isWakeupCall(name: string): boolean {
    return name === WAKEUP_TOOL
  }

  hasWakeupPending(id: string): boolean {
    return this._wakeupPending.has(id)
  }

  recordWakeupPending(id: string, input: unknown): void {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawReason = typeof inp['reason'] === 'string' ? inp['reason'] : ''
    const rawPrompt = typeof inp['prompt'] === 'string' ? inp['prompt'] : ''
    const summary = sanitizeDescription(rawReason || rawPrompt)

    const rawDelay = inp['delaySeconds']
    const delaySeconds = (typeof rawDelay === 'number' && Number.isFinite(rawDelay) && rawDelay > 0)
      ? rawDelay
      : null
    const interval = delaySeconds !== null ? formatWakeupInterval(delaySeconds) : undefined

    this._wakeupPending.set(id, { summary, ...(interval ? { interval } : {}) })
  }

  resolveWakeupPending(id: string, ok: boolean): AgentEvent[] {
    const pending = this._wakeupPending.get(id)
    this._wakeupPending.delete(id)
    if (!pending) return []
    if (!ok) return []

    this._activeLoops.set(WAKEUP_LOOP_ID, {
      id: WAKEUP_LOOP_ID,
      summary: pending.summary,
      ...(pending.interval ? { interval: pending.interval } : {})
    })
    this._wakeupArmedThisTurn = true

    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  onTurnEnd(origin: 'user' | 'cron' = 'cron'): AgentEvent[] {
    const armedThisTurn = this._wakeupArmedThisTurn
    this._wakeupArmedThisTurn = false

    if (origin === 'user') return []

    const staleArmed = this._activeLoops.has(WAKEUP_LOOP_ID) && !armedThisTurn
    if (!staleArmed) return []

    this._activeLoops.delete(WAKEUP_LOOP_ID)
    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  clear(): void {
    this._activeLoops.clear()
    this._cronPending.clear()
    this._wakeupPending.clear()
    this._wakeupArmedThisTurn = false
  }
}

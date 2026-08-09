import { startBgTaskTail } from './bgTaskTail'
import type { BgTaskTailHandle } from './bgTaskTail'
import type { AgentEvent, AgentEventBgTask } from '../../shared/agentEvents'

export function extractBgOutputPath(m: Record<string, unknown>): string | null {
  const message = m['message']
  if (message === null || typeof message !== 'object') return null
  const content = (message as Record<string, unknown>)['content']
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b['type'] !== 'tool_result') continue
    const raw = b['content']
    let text = ''
    if (typeof raw === 'string') {
      text = raw
    } else if (Array.isArray(raw)) {
      text = raw
        .map((part) =>
          part !== null && typeof part === 'object' && typeof (part as Record<string, unknown>)['text'] === 'string'
            ? ((part as Record<string, unknown>)['text'] as string)
            : ''
        )
        .join('')
    }
    if (text.length === 0) continue
    const match = /Output is being written to:\s*(.+?\.output)/.exec(text)
    if (match) return match[1]
  }
  return null
}

export class BgTaskObserver {
  private readonly _tasks = new Map<string, { outputFile?: string; tail: BgTaskTailHandle | null }>()

  constructor(private readonly _emit: (ev: AgentEventBgTask) => void) {}

  gateOpen(): boolean {
    return this._tasks.size === 0
  }

  observeEvent(e: AgentEvent): void {
    if (e.type !== 'bg_task') return
    if (e.kind === 'started') {
      if (!this._tasks.has(e.taskId)) {
        this._tasks.set(e.taskId, { tail: null })
      }
      return
    }
    if (e.kind === 'notification') {
      const entry = this._tasks.get(e.taskId)
      if (!entry) return
      this._tasks.delete(e.taskId)
      if (entry.tail) {
        const pathAgrees =
          entry.outputFile === undefined ||
          e.outputFile === undefined ||
          entry.outputFile === e.outputFile
        entry.tail.stop(pathAgrees).catch(() => {})
      }
    }
  }

  maybeStartTail(msg: unknown): void {
    if (msg === null || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>
    if (m['type'] !== 'user') return
    const tur = m['tool_use_result']
    if (tur === null || typeof tur !== 'object' || Array.isArray(tur)) return
    const taskId = (tur as Record<string, unknown>)['backgroundTaskId']
    if (typeof taskId !== 'string' || taskId.length === 0) return

    const entry = this._tasks.get(taskId)
    if (!entry || entry.tail !== null) return

    const outputFile = extractBgOutputPath(m)
    if (outputFile === null) return

    entry.outputFile = outputFile
    entry.tail = startBgTaskTail({
      taskId,
      outputFile,
      emit: (ev) => this._emit(ev),
    })
  }

  stopAll(): void {
    for (const entry of this._tasks.values()) {
      if (entry.tail) entry.tail.stop(false).catch(() => {})
    }
    this._tasks.clear()
  }
}

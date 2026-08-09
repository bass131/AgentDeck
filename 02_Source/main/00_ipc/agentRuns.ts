import { randomUUID } from 'node:crypto'
import type { AgentBackend, AgentRunInput, RunResponse } from '../01_agents/AgentBackend'
import type { AgentEvent } from '../../shared/agentEvents'

interface ActiveRun {
  runId: string
  abortFn: () => void
  interruptFn: () => void
  stopTaskFn: (taskId: string) => void
  setPermissionModeFn: (modeId: string) => void
  respondFn: (requestId: string, response: RunResponse) => void
  done: boolean
  persistent: boolean
  pushFn?: (content: string) => void
  setOrchestrationFn?: (value: boolean) => void
  setModelFn: (modelId: string) => void
}

export interface RunManager {
  start(
    backend: AgentBackend,
    req: AgentRunInput,
    onEvent: (event: AgentEvent, runId: string) => void
  ): Promise<string>

  abort(runId: string): boolean

  interrupt(runId: string): boolean

  taskStop(runId: string, taskId: string): boolean

  setMode(runId: string, mode: string): boolean

  setModel(runId: string, model: string): boolean

  respond(runId: string, requestId: string, response: RunResponse): boolean

  closeAll(): number
}

export function createRunManager(): RunManager {
  const activeRuns = new Map<string, ActiveRun>()
  const persistentRuns = new Map<string, ActiveRun>()

  function lastUserContent(req: AgentRunInput): string | null {
    const m = req.messages.filter((x) => x.role === 'user').at(-1)
    return m ? m.content : null
  }

  function cleanup(activeRun: ActiveRun): void {
    activeRun.done = true
    if (activeRuns.get(activeRun.runId) === activeRun) activeRuns.delete(activeRun.runId)
    if (activeRun.persistent && persistentRuns.get(activeRun.runId) === activeRun) {
      persistentRuns.delete(activeRun.runId)
    }
  }

  return {
    async start(
      backend: AgentBackend,
      req: AgentRunInput,
      onEvent: (event: AgentEvent, runId: string) => void
    ): Promise<string> {
      const sessionKey = req.persistent === true && typeof req.sessionKey === 'string' && req.sessionKey.length > 0
        ? req.sessionKey
        : null

      if (sessionKey) {
        const existing = persistentRuns.get(sessionKey)
        if (existing && !existing.done) {
          existing.setOrchestrationFn?.(req.orchestration === true)
          if (typeof req.model === 'string') existing.setModelFn?.(req.model)
          const content = lastUserContent(req)
          if (content !== null) existing.pushFn?.(content)
          return existing.runId
        }
      }

      const runId = sessionKey ?? randomUUID()

      const run = backend.start(req)

      const activeRun: ActiveRun = {
        runId,
        abortFn: () => run.abort(),
        interruptFn: () => run.interrupt(),
        stopTaskFn: (taskId) => run.stopTask?.(taskId),
        setPermissionModeFn: (modeId) => run.setPermissionMode?.(modeId),
        respondFn: (rid, res) => run.respond(rid, res),
        pushFn: (content) => run.push(content),
        setOrchestrationFn: (value) => run.setOrchestration?.(value),
        setModelFn: (modelId) => run.setModel?.(modelId),
        persistent: sessionKey !== null,
        done: false
      }

      activeRuns.set(runId, activeRun)
      if (sessionKey) persistentRuns.set(sessionKey, activeRun)

      if (sessionKey) {
        run.onSessionClosing?.(() => {
          if (persistentRuns.get(activeRun.runId) === activeRun) {
            persistentRuns.delete(activeRun.runId)
          }
        })
      }

      void (async () => {
        try {
          for await (const event of run.events) {
            if (activeRun.done) {
              if (event.type === 'loops') onEvent(event, runId)
              continue
            }
            onEvent(event, runId)

            const terminal = event.type === 'error' || (event.type === 'done' && !activeRun.persistent)
            if (terminal) {
              cleanup(activeRun)
              if (event.type === 'error') {
                activeRun.abortFn()
              } else {
                break
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          onEvent({ type: 'error', message }, runId)
          cleanup(activeRun)
          activeRun.abortFn()
        } finally {
          if (!activeRun.done) {
            cleanup(activeRun)
          }
        }
      })()

      return runId
    },

    abort(runId: string): boolean {
      const activeRun = activeRuns.get(runId)

      if (!activeRun || activeRun.done) {
        return false
      }

      cleanup(activeRun)
      activeRun.abortFn()

      return true
    },

    interrupt(runId: string): boolean {
      const activeRun = activeRuns.get(runId)
      if (!activeRun || activeRun.done) {
        return false
      }
      activeRun.interruptFn()
      return true
    },

    taskStop(runId: string, taskId: string): boolean {
      const activeRun = activeRuns.get(runId)

      if (!activeRun || activeRun.done) {
        return false
      }

      activeRun.stopTaskFn(taskId)
      return true
    },

    setMode(runId: string, mode: string): boolean {
      const activeRun = activeRuns.get(runId)

      if (!activeRun || activeRun.done) {
        return false
      }

      activeRun.setPermissionModeFn(mode)
      return true
    },

    setModel(runId: string, model: string): boolean {
      const activeRun = activeRuns.get(runId)

      if (!activeRun || activeRun.done) {
        return false
      }

      activeRun.setModelFn(model)
      return true
    },

    respond(runId: string, requestId: string, response: RunResponse): boolean {
      const activeRun = activeRuns.get(runId)

      if (!activeRun || activeRun.done) {
        return false
      }

      activeRun.respondFn(requestId, response)
      return true
    },

    closeAll(): number {
      let count = 0
      for (const activeRun of [...activeRuns.values()]) {
        if (activeRun.done) continue
        cleanup(activeRun)
        activeRun.abortFn()
        count++
      }
      return count
    }
  }
}

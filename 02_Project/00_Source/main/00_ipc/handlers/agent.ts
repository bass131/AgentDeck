import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  AgentRunRequest,
  AgentRunResponse,
  AgentAbortRequest,
  AgentAbortResponse,
  AgentInterruptRequest,
  AgentInterruptResponse,
  TaskStopRequest,
  TaskStopResponse,
  SetModeRequest,
  SetModeResponse,
  SetModelRequest,
  SetModelResponse,
  AgentEventPayload,
  PermissionResponse,
  QuestionResponse,
} from '../../../shared/ipcContract'
import type { RunManager } from '../agentRuns'
import { normalizeSystemPrompt } from '../normalize'
import { getBackend } from '../../01_agents/registry'
import { resolveSetModelRequest } from '../../01_agents/runArgs'

const LIVE_MODE_WHITELIST = ['normal', 'plan', 'acceptEdits', 'auto'] as const

export interface AgentHandlerDeps {
  state: { win: BrowserWindow | null }
  runManager: RunManager
}

export function registerAgentHandlers(deps: AgentHandlerDeps): void {
  const { state, runManager } = deps

  ipcMain.handle(IPC_CHANNELS.AGENT_RUN, async (_e, req: AgentRunRequest): Promise<AgentRunResponse> => {
    if (!Array.isArray(req?.messages)) {
      throw new Error('agent.run: messages must be an array')
    }
    if (req.messages.length === 0) {
      throw new Error('agent.run: messages must not be empty')
    }

    let workspaceRoot = req.workspaceRoot
    if (workspaceRoot) {
      if (!isAbsolute(workspaceRoot)) {
        throw new Error('agent.run: workspaceRoot must be an absolute path')
      }
      workspaceRoot = workspaceRoot.replace(/\\/g, '/')
    }

    const backend = getBackend(req.backendId)

    const model = typeof req.model === 'string' ? req.model : undefined
    const effort = typeof req.effort === 'string' ? req.effort : undefined
    const mode = typeof req.mode === 'string' ? req.mode : undefined

    const systemPrompt = normalizeSystemPrompt(req.systemPrompt)

    const orchestration = req.orchestration === true

    const resumeSessionId = typeof req.resumeSessionId === 'string' && req.resumeSessionId.length > 0
      ? req.resumeSessionId
      : undefined

    const persistent = req.persistent === true
    const sessionKey = typeof req.sessionKey === 'string' && req.sessionKey.length > 0
      ? req.sessionKey
      : undefined

    const runId = await runManager.start(
      backend,
      { messages: req.messages, workspaceRoot, model, effort, mode, systemPrompt, orchestration, resumeSessionId, persistent, sessionKey },
      (event, eventRunId) => {
        const payload: AgentEventPayload = { runId: eventRunId, event }
        if (state.win && !state.win.isDestroyed()) {
          state.win.webContents.send(IPC_CHANNELS.AGENT_EVENT, payload)
        }
      }
    )

    return { runId }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_ABORT, (_e, req: AgentAbortRequest): AgentAbortResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { accepted: false }
    }
    const accepted = runManager.abort(req.runId)
    return { accepted }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_INTERRUPT, (_e, req: AgentInterruptRequest): AgentInterruptResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { accepted: false }
    }
    const accepted = runManager.interrupt(req.runId)
    return { accepted }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_TASK_STOP, (_e, req: TaskStopRequest): TaskStopResponse => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { accepted: false }
    }
    if (!req?.taskId || typeof req.taskId !== 'string' || req.taskId.trim() === '') {
      return { accepted: false }
    }
    const accepted = runManager.taskStop(req.runId, req.taskId)
    return { accepted }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_SET_MODE, (_e, req: SetModeRequest): SetModeResponse => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { accepted: false }
    }
    if (typeof req.mode !== 'string' || !(LIVE_MODE_WHITELIST as readonly string[]).includes(req.mode)) {
      return { accepted: false }
    }
    const accepted = runManager.setMode(req.runId, req.mode)
    return { accepted }
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_SET_MODEL, (_e, req: SetModelRequest): SetModelResponse => {
    const resolved = resolveSetModelRequest(req)
    if (resolved === null) {
      return { accepted: false }
    }
    const accepted = runManager.setModel(resolved.runId, resolved.model)
    return { accepted }
  })

  ipcMain.handle(IPC_CHANNELS.PERMISSION_RESPOND, (_e, req: PermissionResponse): { ok: boolean } => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
      return { ok: false }
    }
    const allowedBehaviors = ['allow', 'allow_always', 'deny'] as const
    if (!allowedBehaviors.includes(req.behavior as (typeof allowedBehaviors)[number])) {
      return { ok: false }
    }

    const ok = runManager.respond(req.runId, req.requestId, {
      kind: 'permission',
      behavior: req.behavior
    })
    return { ok }
  })

  ipcMain.handle(IPC_CHANNELS.QUESTION_RESPOND, (_e, req: QuestionResponse): { ok: boolean } => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
      return { ok: false }
    }

    const answers = req.answers
    if (answers !== null) {
      if (!Array.isArray(answers)) {
        return { ok: false }
      }
      for (const row of answers) {
        if (!Array.isArray(row)) {
          return { ok: false }
        }
        for (const val of row) {
          if (typeof val !== 'string') {
            return { ok: false }
          }
        }
      }
    }

    const ok = runManager.respond(req.runId, req.requestId, {
      kind: 'question',
      answers: answers as string[][] | null
    })
    return { ok }
  })
}

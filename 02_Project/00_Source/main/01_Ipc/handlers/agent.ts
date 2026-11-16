import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS, sendPush } from '@shared/ipcContract'
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
  ModelListResponse,
} from '@shared/ipcContract'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import type { RunManager } from '@main/03_Agent/agentRuns'
import { normalizeSystemPrompt } from '../normalize'
import { handle } from '../handle'
import { getBackend } from '@main/00_App/registry'
import { resolveSetModelRequest } from '@main/04_Claude/runArgs'
import { LIVE_MODE_WHITELIST } from '@main/04_Claude/permissionModes'

export interface AgentHandlerDeps {
  state: { win: BrowserWindow | null }
  runManager: RunManager
  // 모델 목록 공급자 (M06 G4) — 없으면 최소 목록을 builtin으로 준다.
  getModelList?: () => Promise<ModelListResponse>
}

export function registerAgentHandlers(deps: AgentHandlerDeps): void {
  const { state, runManager } = deps

  handle(IPC_CHANNELS.AGENT_LIST_MODELS, async (): Promise<ModelListResponse> => {
    if (deps.getModelList) return deps.getModelList()
    return { models: [...FALLBACK_MODELS], source: 'builtin' }
  })

  handle(IPC_CHANNELS.AGENT_RUN, async (_e, req: AgentRunRequest): Promise<AgentRunResponse> => {
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
          sendPush(state.win.webContents, IPC_CHANNELS.AGENT_EVENT, payload)
        }
      }
    )

    return { runId }
  })

  // M05 G10 ack 통일: 아래 5채널은 옛 { accepted } 대신 { ok }를 돌려준다 (값의 뜻은 같다 — 위임이 받아들였는가)
  handle(IPC_CHANNELS.AGENT_ABORT, (_e, req: AgentAbortRequest): AgentAbortResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { ok: false }
    }
    return { ok: runManager.abort(req.runId) }
  })

  handle(IPC_CHANNELS.AGENT_INTERRUPT, (_e, req: AgentInterruptRequest): AgentInterruptResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { ok: false }
    }
    return { ok: runManager.interrupt(req.runId) }
  })

  handle(IPC_CHANNELS.AGENT_TASK_STOP, (_e, req: TaskStopRequest): TaskStopResponse => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (!req?.taskId || typeof req.taskId !== 'string' || req.taskId.trim() === '') {
      return { ok: false }
    }
    return { ok: runManager.taskStop(req.runId, req.taskId) }
  })

  handle(IPC_CHANNELS.AGENT_SET_MODE, (_e, req: SetModeRequest): SetModeResponse => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (typeof req.mode !== 'string' || !LIVE_MODE_WHITELIST.includes(req.mode)) {
      return { ok: false }
    }
    return { ok: runManager.setMode(req.runId, req.mode) }
  })

  handle(IPC_CHANNELS.AGENT_SET_MODEL, (_e, req: SetModelRequest): SetModelResponse => {
    const resolved = resolveSetModelRequest(req)
    if (resolved === null) {
      return { ok: false }
    }
    return { ok: runManager.setModel(resolved.runId, resolved.model) }
  })

  handle(IPC_CHANNELS.PERMISSION_RESPOND, (_e, req: PermissionResponse): { ok: boolean } => {
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

  handle(IPC_CHANNELS.QUESTION_RESPOND, (_e, req: QuestionResponse): { ok: boolean } => {
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

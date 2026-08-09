import type { AgentEvent, AgentQuestion } from '../../shared/agentEvents'
import type { RunResponse } from './AgentBackend'

const READONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'BashOutput'
])

const MUTATING_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'TaskStop', 'KillShell', 'KillBash'
])

export const ORCHESTRATION_TOOLS = ['Workflow'] as const

export type PermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message: string }

export type CanUseToolFn = (
  toolName: string,
  input: Record<string, unknown>,
  options?: { signal?: AbortSignal; toolUseID?: string }
) => Promise<PermissionResult>

export function parseQuestions(input: Record<string, unknown>): AgentQuestion[] {
  const raw = Array.isArray(input['questions']) ? input['questions'] : []
  const out: AgentQuestion[] = []
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue
    const o = q as Record<string, unknown>
    const options = (Array.isArray(o['options']) ? o['options'] : [])
      .map((opt) => {
        const r = (opt ?? {}) as Record<string, unknown>
        const desc = r['description'] !== undefined ? String(r['description']) : undefined
        return { label: String(r['label'] ?? ''), ...(desc ? { description: desc } : {}) }
      })
      .filter((opt) => opt.label.length > 0)
    if (!options.length) continue
    const header = o['header'] !== undefined ? String(o['header']) : undefined
    out.push({
      question: String(o['question'] ?? ''),
      ...(header !== undefined ? { header } : {}),
      multiSelect: !!o['multiSelect'],
      options
    })
  }
  return out
}

export function formatAnswers(questions: AgentQuestion[], answers: string[][] | null): string {
  if (!answers) {
    return '사용자가 질문에 답하지 않고 건너뛰었습니다. 합리적인 기본값으로 계속 진행하세요.'
  }
  const lines = questions.map((q, i) => {
    const picked = (answers[i] ?? []).filter(Boolean)
    const label = q.header || q.question || `질문 ${i + 1}`
    return `- ${label}: ${picked.length ? picked.join(', ') : '(선택 없음)'}`
  })
  return `사용자가 질문에 다음과 같이 답했습니다:\n${lines.join('\n')}\n\n이 선택을 반영해 계속 진행하세요. (같은 내용을 다시 묻지 마세요.)`
}

function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

export function permissionSummary(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') return `명령 실행: ${oneLine(String(input['command'] ?? ''), 80)}`
  if (toolName === 'Write') return `파일 생성: ${String(input['file_path'] ?? '')}`
  if (toolName === 'Edit' || toolName === 'MultiEdit') return `파일 편집: ${String(input['file_path'] ?? '')}`
  if (toolName === 'ExitPlanMode') return `계획 검토: ${planTitle(input['plan'])}`
  return `${toolName} 실행`
}

function planTitle(plan: unknown): string {
  if (typeof plan !== 'string' || !plan.trim()) return '계획 내용 없음'
  const heading = plan.match(/^#\s+(.+)$/m)
  const raw = heading ? heading[1] : plan.trim().split(/\r?\n/)[0]
  return oneLine(raw, 80)
}

export class PermissionCoordinator {
  private _waiters = new Map<string, (response: RunResponse) => void>()
  private _permCounter = 0

  constructor(private readonly _push: (event: AgentEvent) => void) {}

  respond(requestId: string, response: RunResponse): void {
    const resolve = this._waiters.get(requestId)
    if (!resolve) return
    this._waiters.delete(requestId)
    resolve(response)
  }

  cancelAll(): void {
    for (const [requestId, resolve] of this._waiters) {
      if (requestId.startsWith('ask-')) {
        resolve({ kind: 'question', answers: null })
      } else {
        resolve({ kind: 'permission', behavior: 'deny' })
      }
    }
    this._waiters.clear()
  }

  makeCanUseTool(
    mode: string | undefined | (() => string | undefined),
    getOrchestration: () => boolean
  ): CanUseToolFn {
    const getMode: () => string | undefined = typeof mode === 'function' ? mode : () => mode
    return async (
      toolName: string,
      input: Record<string, unknown>,
      options?: { signal?: AbortSignal; toolUseID?: string }
    ): Promise<PermissionResult> => {
      const currentMode = getMode()
      if (toolName === 'AskUserQuestion') {
        return this._handleAskQuestion(input, options?.signal)
      }

      if ((ORCHESTRATION_TOOLS as readonly string[]).includes(toolName)) {
        if (!getOrchestration()) {
          const id = options?.toolUseID ?? `perm-${++this._permCounter}`
          this._push({ type: 'orchestration_denied', id, reason: 'orchestration-off' })
          return { behavior: 'deny', message: '오케스트레이션 모드가 꺼져 있습니다.' }
        }
        return this._requestPermission(toolName, input, options)
      }

      if (currentMode === 'auto' || currentMode === 'bypass') {
        return { behavior: 'allow', updatedInput: input }
      }

      if (READONLY_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      if (currentMode === 'acceptEdits' && toolName !== 'Bash' && !MUTATING_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      return this._requestPermission(toolName, input, options)
    }
  }

  private async _requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal; toolUseID?: string }
  ): Promise<PermissionResult> {
    const requestId = `perm-${++this._permCounter}`
    const summary = permissionSummary(toolName, input)

    const response = await new Promise<RunResponse>((resolve) => {
      this._waiters.set(requestId, resolve)
      const onAbort = (): void => {
        if (this._waiters.delete(requestId)) {
          resolve({ kind: 'permission', behavior: 'deny' })
        }
      }
      options?.signal?.addEventListener('abort', onAbort, { once: true })
      this._push({
        type: 'permission_request',
        requestId,
        toolName,
        summary,
        ...(toolName === 'ExitPlanMode'
          ? {
              planReview: {
                plan: typeof input['plan'] === 'string' ? input['plan'] : undefined,
                planFilePath:
                  typeof input['planFilePath'] === 'string' ? input['planFilePath'] : undefined
              }
            }
          : {})
      })
    })

    const behavior = response.kind === 'permission' ? response.behavior : 'deny'

    if (behavior === 'deny') {
      return { behavior: 'deny', message: '사용자가 거부했습니다.' }
    }

    const planLanding: unknown[] =
      toolName === 'ExitPlanMode'
        ? [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
        : []

    if (behavior === 'allow_always') {
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [
          { type: 'addRules', rules: [{ toolName }], behavior: 'allow', destination: 'session' },
          ...planLanding
        ]
      }
    }
    if (planLanding.length > 0) {
      return { behavior: 'allow', updatedInput: input, updatedPermissions: planLanding }
    }
    return { behavior: 'allow', updatedInput: input }
  }

  private async _handleAskQuestion(
    input: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<PermissionResult> {
    const questions = parseQuestions(input)
    if (!questions.length) return { behavior: 'allow', updatedInput: input }

    const requestId = `ask-${++this._permCounter}`

    const answers = await new Promise<string[][] | null>((resolve) => {
      this._waiters.set(requestId, (r: RunResponse) => {
        resolve(r.kind === 'question' ? r.answers : null)
      })
      const onAbort = (): void => {
        if (this._waiters.delete(requestId)) resolve(null)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this._push({ type: 'question_request', requestId, questions })
    })

    return { behavior: 'deny', message: formatAnswers(questions, answers) }
  }
}

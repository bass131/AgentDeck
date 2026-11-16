import type { AgentEvent, AgentQuestion } from '@shared/agentEvents'
import type { RunResponse } from '@main/03_Agent/AgentBackend'

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

export interface CanUseToolOptions {
  signal?: AbortSignal
  toolUseID?: string
  decisionReason?: string
  suggestions?: unknown[]
}

export type CanUseToolFn = (
  toolName: string,
  input: Record<string, unknown>,
  options?: CanUseToolOptions
) => Promise<PermissionResult>

// 사람에게 올릴 호출의 판별 (M06 G3). 공개 타입(sdk.d.ts의 CanUseTool)의 options에는 훅 유래를 알리는 필드가 없다.
// 블랙박스 실측(독립 clone, default·acceptEdits·bypassPermissions·실행 중 auto)에서
//   훅 ask는 suggestions가 언제나 없었다. decisionReason은 settings allow 규칙과 겹친 `git push origin HEAD:master`에만 왔고,
//   settings ask 규칙과 겹친 `gh release --help`·`npm publish --help`에는 오지 않았다.
//   일반 질의는 언제나 규칙 제안이 한 개 이상 붙어 왔다. 사유는 없을 수 있었다(default의 Write).
// 그래서 사유가 아니라 규칙 제안으로 가른다. 제안이 비어 있지 않은 배열이 아니면 모드와 관계없이 카드로 보낸다(fail-closed).
// 민감 파일 안전 검사(suggestions: [])와 옵션 없는 호출도 여기에 걸린다 — 모르는 꼴은 허용으로 떨어지지 않는다.
export interface Escalation {
  reason?: string
}

export function escalationOf(options?: CanUseToolOptions): Escalation | undefined {
  const suggestions = options?.suggestions
  if (Array.isArray(suggestions) && suggestions.length > 0) return undefined
  const reason = options?.decisionReason
  return typeof reason === 'string' && reason.trim() !== '' ? { reason } : {}
}

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

// fullCommand: 가드가 물은 Bash 카드는 명령을 자르지도 줄바꿈을 지우지도 않는다 (M06 G3 — 80자 자르기가 push·master를 가렸다).
export function permissionSummary(
  toolName: string,
  input: Record<string, unknown>,
  opts?: { fullCommand?: boolean }
): string {
  if (toolName === 'Bash') {
    const command = String(input['command'] ?? '')
    return `명령 실행: ${opts?.fullCommand ? command.trim() : oneLine(command, 80)}`
  }
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
      options?: CanUseToolOptions
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

      // 규칙 제안 없는 호출은 모드·READONLY 분기보다 먼저 사람에게 올린다 (M06 G3 — auto·bypass 조기 허용이 가드 ask를 삼켰다).
      const escalation = escalationOf(options)
      if (escalation !== undefined) {
        return this._requestPermission(toolName, input, options, escalation)
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
    options?: CanUseToolOptions,
    escalation?: Escalation
  ): Promise<PermissionResult> {
    const requestId = `perm-${++this._permCounter}`
    const escalated = escalation !== undefined
    const askReason = escalation?.reason
    const summary = permissionSummary(toolName, input, { fullCommand: escalated })

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
        ...(escalated ? { escalated: true as const } : {}),
        ...(askReason !== undefined ? { askReason } : {}),
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

    // 사람에게 올린 호출에는 「항상 허용」이 없다 — 카드가 버튼을 숨기고, 여기서도 도구 단위 세션 규칙을 내지 않는다.
    if (behavior === 'allow_always' && !escalated) {
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

/**
 * permissionCoordinator.ts — 권한/질문 결정 코디네이터 (RF1-followup P03: ClaudeCodeBackend에서 분리)
 *
 * 단일책임(SRP): "도구 + 입력 + 모드 → 허용/거부 결정". 양방향 사용자 응답을 waiter 맵으로
 *   조율한다. 이 코디네이터의 외부 의존은 push 콜백 하나뿐 — permission_request/question_request를
 *   events 스트림으로 내보내는 통로. 나머지(_waiters 맵·requestId 카운터·canUseTool 분기)는
 *   전부 이 클래스가 소유한다.
 *
 * 왜 별 모듈인가(모듈 경계 근거):
 *  - _waiters(Map<requestId, resolver>)와 _permCounter는 ClaudeAgentRun 안에서 *오직*
 *    권한/질문 흐름(respond, abort-cancel, canUseTool)만 사용했다 — 다른 책임과 공유 0.
 *  - 호출부와의 결합점은 push(event)와 입력(mode/orchestration)뿐이며, 둘 다 깔끔히 주입 가능
 *    (push=생성자 콜백, mode/orchestration=makeCanUseTool 인자). this 누수 0.
 *  - 따라서 이 권한경계(canUseTool) 결정 로직은 자족적 상태기계로 떼어낼 수 있고, push 클로저와
 *    카운터 의미가 분해 전과 동일하므로 **permission 결정 결과·이벤트 방출이 1:1 동일**하다.
 *
 * 격리 원칙(ADR-003): 엔진 고유 도구명(Workflow/AskUserQuestion 등)·SDK PermissionResult 형상은
 *   이 파일 내부에만. 외부엔 공통 AgentEvent(permission_request/question_request)만 흐른다.
 *
 * (원본 engine.ts makeCanUseTool L761~802 / handleAskQuestion L742~759 / parseQuestions
 *  L880~901 / formatAnswers L905~913 / permissionSummary L915~920 미러)
 */

import type { AgentEvent, AgentQuestion } from '../../shared/agent-events'
import type { RunResponse } from './AgentBackend'

// ── 권한 도구 분류 (원본 engine.ts L108~112 미러) ──────────────────────────────

/**
 * 읽기 전용 도구 — 부수효과 없음 → 항상 자동 허용.
 * Task/Agent/Todo* 계열도 모델의 작업 분해/계획 도구라 안전.
 */
const READONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskStop', 'TaskOutput'
])

/**
 * 부수효과 도구 — 파일/셸 변경. acceptEdits 모드에서도 Bash/Mutating은 발화 대상.
 */
const MUTATING_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'BashOutput', 'KillBash'
])

/**
 * 오케스트레이션 도구군 — disallowedTools(OFF)와 canUseTool 게이트(ON)의 단일 출처.
 *
 * orchestration=false → disallowedTools에 포함(모델이 도구를 볼 수 없음). [sdkOptions.ts가 import]
 * orchestration=true  → canUseTool 게이트에서 항상 사용자 승인 요청(대규모=비용). [이 파일이 게이트]
 *   (오케스트레이션 ON = Workflow + Task 서브에이전트 "둘 다" — Task는 READONLY 자동허용이라
 *    이 배열에 없고, Workflow만 승인 게이트로 통제.)
 *
 * (ADR-003: 어댑터 내부 전용 — 외부 계약/renderer 미노출. sdkOptions.ts에서만 추가 import.)
 */
export const ORCHESTRATION_TOOLS = ['Workflow'] as const

// ── 권한/질문 응답 타입 ───────────────────────────────────────────────────────

/**
 * SDK canUseTool 반환 타입(우리가 사용하는 부분만).
 * raw SDK 타입을 직접 import하지 않고 구조만 맞춘다(누수 방지).
 */
export type PermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message: string }

/**
 * SDK canUseTool 콜백 시그니처(우리가 만들어 주입하는 형태).
 */
export type CanUseToolFn = (
  toolName: string,
  input: Record<string, unknown>,
  options?: { signal?: AbortSignal; toolUseID?: string }
) => Promise<PermissionResult>

// ── parseQuestions / formatAnswers 헬퍼 (원본 engine.ts L880~913 미러) ──────────

/**
 * AskUserQuestion 도구 입력 → AgentQuestion[] 정규화.
 * input.questions 배열을 순회하며 각 항목을 AgentQuestion으로 변환.
 * options가 없거나 빈 항목은 건너뜀(label 없는 옵션 제외).
 * 형식 안 맞으면 빈 배열 반환.
 *
 * (원본 engine.ts parseQuestions L880~901 미러)
 */
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

/**
 * 사용자 답안 배열 → 모델이 읽을 tool-result 메시지 문자열.
 * answers=null이면 건너뜀 안내(기본값으로 진행).
 * answers가 있으면 질문별 선택 항목을 나열.
 *
 * (원본 engine.ts formatAnswers L905~913 미러)
 */
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

// ── permissionSummary 헬퍼 (원본 engine.ts L915~920 미러) ──────────────────────

/**
 * 여러 줄/긴 문자열을 1줄·max자 cap으로 정규화 (claude-stream의 oneLine과 동일 규약).
 */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/**
 * 도구 + 입력 → 사용자에게 보여줄 권한 요약 1줄.
 * raw input을 그대로 노출하지 않고 도구별로 핵심 1줄만 추출(누수 최소화).
 */
export function permissionSummary(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') return `명령 실행: ${oneLine(String(input['command'] ?? ''), 80)}`
  if (toolName === 'Write') return `파일 생성: ${String(input['file_path'] ?? '')}`
  if (toolName === 'Edit' || toolName === 'MultiEdit') return `파일 편집: ${String(input['file_path'] ?? '')}`
  return `${toolName} 실행`
}

// ── PermissionCoordinator ──────────────────────────────────────────────────────

/**
 * 권한/질문 결정 코디네이터 (런당 1개 — ClaudeAgentRun이 소유).
 *
 * 상태:
 *   _waiters: Map<requestId, (RunResponse)=>void> — canUseTool이 await 중인 응답 resolver.
 *     permission(24c)·question(24d) 통합. respond()가 kind 무관하게 requestId로 깨운다.
 *   _permCounter: requestId 발급 카운터(perm-N / ask-N 공유).
 *
 * 외부 의존: push 콜백 1개(permission_request/question_request를 events 큐로 내보냄).
 */
export class PermissionCoordinator {
  /** requestId → respond() resolver. permission/question 통합 관리. */
  private _waiters = new Map<string, (response: RunResponse) => void>()
  /** requestId 발급 카운터 (perm-N / ask-N 공유). */
  private _permCounter = 0

  /** @param _push permission_request/question_request를 events 큐로 내보내는 콜백. */
  constructor(private readonly _push: (event: AgentEvent) => void) {}

  /**
   * 양방향 요청에 대한 사용자 응답을 주입한다.
   * 미존재 requestId(이미 응답/abort/오타) → no-op. 멱등.
   */
  respond(requestId: string, response: RunResponse): void {
    const resolve = this._waiters.get(requestId)
    if (!resolve) return
    this._waiters.delete(requestId)
    // RunResponse를 그대로 전달. canUseTool 측에서 kind로 narrowing.
    resolve(response)
  }

  /**
   * abort() 시 호출: 미해결 waiter를 전부 취소 resolve → canUseTool await가 매달리지 않음.
   * permission → deny, question → answers:null (원본 engine.ts cancel() 미러).
   * 각 waiter의 kind를 별도 저장하지 않으므로 requestId prefix로 구분:
   *   'ask-'이면 question, 그 외(perm-)이면 permission.
   */
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

  // ── canUseTool (권한 게이트) ────────────────────────────────────────────────

  /**
   * SDK canUseTool 콜백 생성. picker mode id + orchestration을 클로저로 캡처.
   *
   * mode는 buildQueryOptions 매핑 *전*의 picker id다(예: 'normal'|'plan'|'acceptEdits'
   * |'auto'|'bypass'). auto/bypass가 SDK permissionMode로 매핑되면 acceptEdits/
   * bypassPermissions와 구분이 사라지므로, 판정은 매핑 전 id로 한다.
   *
   * 판정 순서(원본 engine.ts makeCanUseTool L761~802 미러 + Phase 37 #4a Workflow 게이트):
   *  1. AskUserQuestion → handleAskQuestion (질문카드 흐름, mode 무관).
   *  1a. [Phase 37] Workflow 특별 처리:
   *      orchestration=false → 즉시 deny(permission_request 없음, G4).
   *      orchestration=true → auto/bypass 조기허용 우회하고 항상 _requestPermission(G1/G2).
   *  2. mode auto/bypass → allow(Workflow 제외 — 위에서 처리됨).
   *  3. READONLY_TOOLS → allow.
   *  4. acceptEdits && toolName!=='Bash' && !MUTATING → allow.
   *  5. 그 외(부수효과) → _requestPermission(permission_request push + respond await).
   *  6. options.signal abort → 해당 waiter deny/null resolve(SDK 독립 abort 미러).
   */
  makeCanUseTool(mode: string | undefined, orchestration: boolean): CanUseToolFn {
    return async (
      toolName: string,
      input: Record<string, unknown>,
      options?: { signal?: AbortSignal; toolUseID?: string }
    ): Promise<PermissionResult> => {
      // 1. AskUserQuestion → 질문카드 흐름 (mode 무관 — 원본 engine.ts L768 미러).
      if (toolName === 'AskUserQuestion') {
        return this._handleAskQuestion(input, options?.signal)
      }

      // 1a. [Phase 37 #4a] 오케스트레이션 도구 게이트 (ADR-003: Claude 고유 도구명은 어댑터 내부에만).
      // ORCHESTRATION_TOOLS가 단일 출처 — disallowedTools(OFF)와 이 게이트(ON)가 항상 동기화.
      if ((ORCHESTRATION_TOOLS as readonly string[]).includes(toolName)) {
        if (!orchestration) {
          // orchestration OFF → 즉시 deny(permission_request 발화 없음, G4).
          // disallowedTools에도 'Workflow'가 들어가 있어 실제로는 이 경로에 도달하지 않지만,
          // 방어적으로 canUseTool 직접 호출 시에도 hang 없이 즉시 deny를 반환한다.
          return { behavior: 'deny', message: '오케스트레이션 모드가 꺼져 있습니다.' }
        }
        // orchestration ON → 항상 사용자 승인 게이트(대규모=비용).
        // auto/bypass 조기허용을 우회하여 _requestPermission으로 직행한다(G2).
        return this._requestPermission(toolName, input, options)
      }

      // 2. auto / bypass — 전체 허용 모드(picker id 기준).
      if (mode === 'auto' || mode === 'bypass') {
        return { behavior: 'allow', updatedInput: input }
      }

      // 3. 읽기 전용 도구는 항상 허용.
      if (READONLY_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      // 4. acceptEdits: 파일 편집은 SDK가 이미 자동승인(여기 도달 X). 여기 도달한
      //    non-bash·non-mutating 도구는 허용. Bash/Mutating은 발화(아래).
      if (mode === 'acceptEdits' && toolName !== 'Bash' && !MUTATING_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      // 5. 그 외(부수효과) → 사용자에게 권한 요청.
      return this._requestPermission(toolName, input, options)
    }
  }

  /**
   * 사용자에게 권한 요청(permission_request push + respond await).
   *
   * step5(원본 engine.ts L784~802 미러)를 private 메서드로 추출.
   * makeCanUseTool의 일반 부수효과 분기와 Workflow ON 분기 양쪽에서 호출한다(중복 제거).
   *
   * 흐름:
   *  - requestId 발급 → _waiters.set → onAbort 등록 → permission_request push → respond await.
   *  - RunResponse narrowing: permission만 도달 (question은 _handleAskQuestion).
   *  - deny → {behavior:'deny', message:'사용자가 거부했습니다.'}.
   *  - allow_always → allow + 세션규칙(destination:'session').
   *  - allow → {behavior:'allow', updatedInput}.
   */
  private async _requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal; toolUseID?: string }
  ): Promise<PermissionResult> {
    const requestId = `perm-${++this._permCounter}`
    const summary = permissionSummary(toolName, input)

    const response = await new Promise<RunResponse>((resolve) => {
      this._waiters.set(requestId, resolve)
      // SDK가 독립적으로 이 도구를 abort하면 매달리지 않도록 deny resolve.
      // (원본 engine.ts L784~787 미러)
      const onAbort = (): void => {
        if (this._waiters.delete(requestId)) {
          resolve({ kind: 'permission', behavior: 'deny' })
        }
      }
      options?.signal?.addEventListener('abort', onAbort, { once: true })
      // permission_request를 큐에 push → events로 흘러 UI가 카드를 띄운다.
      this._push({ type: 'permission_request', requestId, toolName, summary })
    })

    // RunResponse narrowing: permission만 여기 도달 (question은 _handleAskQuestion)
    const behavior = response.kind === 'permission' ? response.behavior : 'deny'

    if (behavior === 'deny') {
      return { behavior: 'deny', message: '사용자가 거부했습니다.' }
    }
    if (behavior === 'allow_always') {
      // 세션 범위 allow 규칙 추가 → SDK가 이 세션 동안 같은 도구를 다시 묻지 않음.
      // destination 'session' = 인메모리(설정 파일 미수정).
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [
          { type: 'addRules', rules: [{ toolName }], behavior: 'allow', destination: 'session' }
        ]
      }
    }
    // allow (한 번)
    return { behavior: 'allow', updatedInput: input }
  }

  /**
   * AskUserQuestion 도구 처리 — 질문카드 흐름.
   *
   * questions = parseQuestions(input): 정규화. 빈 배열이면 즉시 allow.
   * question_request를 push → events로 흘러 UI가 QuestionModal을 띄운다.
   * respond(kind:'question', answers)가 올 때까지 await.
   * formatAnswers로 답변을 포매팅해 deny+message로 모델에 전달.
   * (원본 engine.ts handleAskQuestion L742~759 미러)
   *
   * signal abort 시 null answers로 resolve → formatAnswers(null) = 건너뜀 안내.
   */
  private async _handleAskQuestion(
    input: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<PermissionResult> {
    const questions = parseQuestions(input)
    // 빈 questions → 도구 입력이 비정형 → 즉시 allow (원본 L748 미러)
    if (!questions.length) return { behavior: 'allow', updatedInput: input }

    const requestId = `ask-${++this._permCounter}`

    const answers = await new Promise<string[][] | null>((resolve) => {
      this._waiters.set(requestId, (r: RunResponse) => {
        // question 응답: answers 추출. permission 응답이 잘못 오면 null로 취급.
        resolve(r.kind === 'question' ? r.answers : null)
      })
      const onAbort = (): void => {
        if (this._waiters.delete(requestId)) resolve(null)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      // question_request를 큐에 push → UI가 QuestionModal을 띄운다.
      this._push({ type: 'question_request', requestId, questions })
    })

    // canUseTool은 allow/deny만 반환 가능. deny + message로 사용자 답을 모델에 전달.
    return { behavior: 'deny', message: formatAnswers(questions, answers) }
  }
}

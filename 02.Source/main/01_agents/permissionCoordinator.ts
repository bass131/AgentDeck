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
 *    (push=생성자 콜백, mode=makeCanUseTool 인자·orchestration=UC1-P02부터 라이브 게터). this 누수 0.
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
 *
 * (GAP1 P02(b) 보안 부수결함 봉합 — 2건 재분류)
 *  - TaskStop **제거**: SDK 정본(sdk-tools.d.ts:628 TaskStopInput)은 "백그라운드 태스크/셸을
 *    종료"하는 도구다 — 실행 중인 프로세스를 죽이는 부수효과가 있어 READONLY 자동허용은 결함.
 *    아래 MUTATING_TOOLS로 이전(정본).
 *  - BashOutput **추가**: SDK 런타임 alias 테이블(`node_modules/.../sdk.mjs`의 `Mj` 맵 실측 —
 *    `BashOutput`/`AgentOutput`/`BashOutputTool`/`AgentOutputTool` 전부 `TaskOutput`으로 정규화)
 *    이 BashOutput을 TaskOutput(백그라운드 출력 **조회**, 부수효과 없음)의 구 이름으로 취급한다.
 *    즉 SDK 자체가 둘을 동일 도구로 본다 — Read/Grep/Glob과 같은 조회 선례를 따라 READONLY가
 *    정합. (구 MUTATING_TOOLS 배치는 오분류 — 아래에서 이전.)
 */
const READONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'BashOutput'
])

/**
 * 부수효과 도구 — 파일/셸/태스크 변경. acceptEdits 모드에서도 Bash/Mutating은 발화 대상.
 *
 * (GAP1 P02(b)) TaskStop = SDK 정본 태스크 종료 도구(위 READONLY_TOOLS 주석 참조).
 * KillShell/KillBash는 TaskStop의 신·구 alias(SDK 런타임 `Mj` 맵 실측: 둘 다 → 'TaskStop')다.
 * 현재 sdk-tools.d.ts엔 TaskStopInput만 정의돼 있어 런타임 toolName은 보통 'TaskStop'으로
 * 보고되지만, 이름 매핑 드리프트(stale 상수의 보안 함의 — SDK가 옛 이름을 다시 보고하거나
 * 신형 KillShell을 그대로 노출하는 경우)에도 게이트가 뚫리지 않도록 두 alias 모두 방어적으로
 * 유지한다.
 */
const MUTATING_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'TaskStop', 'KillShell', 'KillBash'
])

/**
 * 오케스트레이션 도구군 — canUseTool 게이트(턴별 동적 판정)의 단일 출처.
 *
 * UC1-P02(ADR-032 ④) 전: disallowedTools(OFF 세션 고정)와 이 게이트(ON) 양쪽에서 참조해
 * 서로 동기화했다. UC1-P02부터는 Workflow가 sdkOptions.ts의 disallowedTools 계산 자체가
 * 제거돼 **항상** 모델에 노출된다 — 그래서 이 게이트(makeCanUseTool 1a, getOrchestration()
 * 라이브 조회)가 orchestration OFF 턴의 Workflow 호출을 막는 **유일한 방벽**이다.
 *   (오케스트레이션 ON = Workflow + Task 서브에이전트 "둘 다" — Task는 READONLY 자동허용이라
 *    이 배열에 없고, Workflow만 승인 게이트로 통제.)
 *
 * (ADR-003: 어댑터 내부 전용 — 외부 계약/renderer 미노출.)
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
  if (toolName === 'ExitPlanMode') return `계획 검토: ${planTitle(input['plan'])}`
  return `${toolName} 실행`
}

/**
 * ExitPlanMode 계획 본문(마크다운) → 표면화할 제목 1줄 (P07 (a) 분기).
 * 첫 `# ` 헤딩(마크다운 h1)을 우선 추출 — probe③ fixture 실측: `# Plan: Print Hello`.
 * 헤딩 부재 시 본문 첫 줄로 폴백, plan 자체가 없으면 'ExitPlanMode 실행'과 구별되는
 * 안전 폴백 문자열을 반환한다(테스트가 !== 'ExitPlanMode 실행'로 단정).
 */
function planTitle(plan: unknown): string {
  if (typeof plan !== 'string' || !plan.trim()) return '계획 내용 없음'
  const heading = plan.match(/^#\s+(.+)$/m)
  const raw = heading ? heading[1] : plan.trim().split(/\r?\n/)[0]
  return oneLine(raw, 80)
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
 * 외부 의존: push 콜백 1개(permission_request/question_request/[UC1-P09] orchestration_denied를
 *   events 큐로 내보냄).
 */
export class PermissionCoordinator {
  /** requestId → respond() resolver. permission/question 통합 관리. */
  private _waiters = new Map<string, (response: RunResponse) => void>()
  /** requestId 발급 카운터 (perm-N / ask-N 공유). [UC1-P09] G4 deny의 toolUseID 폴백 id도 이 카운터로 발급. */
  private _permCounter = 0

  /** @param _push permission_request/question_request/orchestration_denied를 events 큐로 내보내는 콜백. */
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
   * SDK canUseTool 콜백 생성. picker mode id는 고정 string **또는 라이브 게터**로 받고,
   * orchestration은 **라이브 게터**(`getOrchestration: () => boolean`)로 받는다
   * (UC1-P02, ADR-032 ④ · GAP1 P13).
   *
   * mode는 buildQueryOptions 매핑 *전*의 picker id다(예: 'normal'|'plan'|'acceptEdits'
   * |'auto'|'bypass'). auto/bypass가 SDK permissionMode로 매핑되면 acceptEdits/
   * bypassPermissions와 구분이 사라지므로, 판정은 매핑 전 id로 한다.
   *
   * GAP1 P13(라이브 모드): mode 인자가 고정 string이면 생성 시점 값으로 얼어붙는다 —
   * held-open 세션에서 진행 중 모드 전환(setPermissionMode)이 판정에 반영되지 않는
   * dogfood 결함 A의 원인. orchestration 게터 선례(UC1-P02)와 동일하게
   * `() => string | undefined` 게터도 수용해, 매 canUseTool 호출 시 "그 순간"의 모드를
   * 다시 읽는다. 하위 호환: 기존 고정 string 호출(테스트·단발 경로)은 내부에서
   * `() => mode` 게터로 정규화돼 바이트 동일하게 동작한다(기존 스위트 무수정 green).
   *
   * 클로저 캡처 vs 라이브 참조: 콜백이 boolean 값을 그대로 캡처하면 생성(세션 시작) 순간에
   * 얼어붙는다 — held-open 세션처럼 콜백 수명이 세션 전체에 걸치는데 그 안의 상태(턴)는 더
   * 짧게 바뀌면, 값을 캡처하는 대신 `() => state.current` 게터를 넘겨 매 호출 시 최신 값을
   * 다시 읽게 한다. 이 게터의 배선(턴마다 갱신되는 상태에 연결)은 호출부
   * (claudeAgentRun.ts의 `_currentOrchestration` 필드 + `setOrchestration()`) 책임 — 이
   * 클래스는 "매 호출 시 게터를 다시 부른다"는 것만 보장한다.
   *
   * 판정 순서(원본 engine.ts makeCanUseTool L761~802 미러 + Phase 37 #4a Workflow 게이트,
   *   **순서 불변** — UC1-P02는 "읽는 값만" 라이브화했을 뿐 판정 로직·순서는 그대로다):
   *  1. AskUserQuestion → handleAskQuestion (질문카드 흐름, mode 무관).
   *  1a. [Phase 37 → UC1-P02] Workflow 특별 처리 — auto/bypass 조기허용(아래 2)보다 반드시
   *      먼저 평가된다(CRITICAL: disallowedTools가 사라진 UC1-P02 이후 이 순서가 유일한
   *      방벽 — 순서가 무너지면 auto/bypass 모드에서 OFF 턴 Workflow가 뚫린다):
   *      getOrchestration()===false → 즉시 deny(permission_request 없음, G4) +
   *      [UC1-P09] orchestration_denied 통지 push(판정 자체는 불변, 통지만 추가).
   *      getOrchestration()===true → auto/bypass 조기허용 우회하고 항상 _requestPermission(G1/G2).
   *  2. mode auto/bypass → allow(Workflow 제외 — 위에서 처리됨).
   *  3. READONLY_TOOLS → allow.
   *  4. acceptEdits && toolName!=='Bash' && !MUTATING → allow.
   *  5. 그 외(부수효과) → _requestPermission(permission_request push + respond await).
   *  6. options.signal abort → 해당 waiter deny/null resolve(SDK 독립 abort 미러).
   */
  makeCanUseTool(
    mode: string | undefined | (() => string | undefined),
    getOrchestration: () => boolean
  ): CanUseToolFn {
    // GAP1 P13: 고정 string(기존 호출) → 게터로 정규화. 이후 판정 본문은 게터만 읽는다 —
    // 호출부(claudeAgentRun)가 라이브 게터를 넘기면 매 호출 시 최신 모드가 반영된다.
    const getMode: () => string | undefined = typeof mode === 'function' ? mode : () => mode
    return async (
      toolName: string,
      input: Record<string, unknown>,
      options?: { signal?: AbortSignal; toolUseID?: string }
    ): Promise<PermissionResult> => {
      // 이 도구 요청 1건의 판정 동안은 스냅샷 1회로 고정(판정 도중 모드가 바뀌어도
      // 한 요청 안에서 분기 2·4가 서로 다른 모드를 보는 일이 없다 — 요청 단위 일관성).
      const currentMode = getMode()
      // 1. AskUserQuestion → 질문카드 흐름 (mode 무관 — 원본 engine.ts L768 미러).
      if (toolName === 'AskUserQuestion') {
        return this._handleAskQuestion(input, options?.signal)
      }

      // 1a. [Phase 37 #4a → UC1-P02] 오케스트레이션 도구 게이트 (ADR-003: Claude 고유
      // 도구명은 어댑터 내부에만). UC1-P02(ADR-032 ④)부터 Workflow는 disallowedTools
      // 계산에서 완전히 빠져 항상 모델에 노출되므로, 이 게이트(getOrchestration()을 호출
      // 시점마다 라이브 조회)가 orchestration OFF 턴의 Workflow 호출을 막는 **유일한 방벽**
      // 이다 — 아래 2번(auto/bypass 조기허용)보다 먼저 평가되는 이 순서가 방벽의 전부다.
      if ((ORCHESTRATION_TOOLS as readonly string[]).includes(toolName)) {
        if (!getOrchestration()) {
          // orchestration OFF(현재 턴) → 즉시 deny(permission_request 발화 없음, G4).
          // [UC1-P09] deny 판정 자체는 불변 — 반환 직전 orchestration_denied 통지만 추가
          // 방출한다(fire-and-forget, 기존 permission_request push와 동일 관례). id는
          // SDK가 넘겨주는 options.toolUseID(실제 도구 호출 id, tool_call/tool_result와
          // 동일 매칭 관례)를 우선 쓰고, 없으면(테스트 등 options 생략 호출) 기존
          // _requestPermission의 requestId 발급 관례(perm-N)를 그대로 재사용해 생성한다.
          const id = options?.toolUseID ?? `perm-${++this._permCounter}`
          this._push({ type: 'orchestration_denied', id, reason: 'orchestration-off' })
          return { behavior: 'deny', message: '오케스트레이션 모드가 꺼져 있습니다.' }
        }
        // orchestration ON(현재 턴) → 항상 사용자 승인 게이트(대규모=비용).
        // auto/bypass 조기허용을 우회하여 _requestPermission으로 직행한다(G2).
        return this._requestPermission(toolName, input, options)
      }

      // 2. auto / bypass — 전체 허용 모드(picker id 기준).
      if (currentMode === 'auto' || currentMode === 'bypass') {
        return { behavior: 'allow', updatedInput: input }
      }

      // 3. 읽기 전용 도구는 항상 허용.
      if (READONLY_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input }
      }

      // 4. acceptEdits: 파일 편집은 SDK가 이미 자동승인(여기 도달 X). 여기 도달한
      //    non-bash·non-mutating 도구는 허용. Bash/Mutating은 발화(아래).
      if (currentMode === 'acceptEdits' && toolName !== 'Bash' && !MUTATING_TOOLS.has(toolName)) {
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
   *  - (GAP1 P13) toolName==='ExitPlanMode'의 allow/allow_always에는 plan 승인 착지
   *    `{type:'setMode', mode:'acceptEdits', destination:'session'}`을 updatedPermissions에
   *    추가 부착한다(착지 모드 결정론화 — 본문 주석 참고).
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
      // planReview(P03 shared 계약)는 ExitPlanMode 전용 additive 부착 — 그 외 도구는 미부여
      // (회귀 0, ADR-003: 엔진 고유 도구명 분기는 이 어댑터 내부에만).
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

    // RunResponse narrowing: permission만 여기 도달 (question은 _handleAskQuestion)
    const behavior = response.kind === 'permission' ? response.behavior : 'deny'

    if (behavior === 'deny') {
      return { behavior: 'deny', message: '사용자가 거부했습니다.' }
    }

    // ── GAP1 P13: plan 승인 착지 결정성 — ExitPlanMode allow에 setMode 착지 명시 부착 ──
    // "SDK가 알아서 default로 돌아가겠지"는 설계가 아니다(암묵 금지 — SDK 버전에 따라
    // 거동이 흔들린다). SDK PermissionUpdate setMode variant(sdk.d.ts:2096 — mode 필수·
    // destination 필수) 형상으로 착지 모드를 결정론화한다. destination은 'session' 고정 —
    // 'userSettings' 등으로 새면 영속 권한 규칙(C-02/M-C) 이연 영역 침범(Phase 📐 감사 🟡5).
    // deny("계속 계획" 경로)·비-ExitPlanMode 도구에는 미부여(회귀 0, qa 대조군 핀).
    // ADR-003: 엔진 고유 도구명(ExitPlanMode) 분기는 이 어댑터 내부에만.
    const planLanding: unknown[] =
      toolName === 'ExitPlanMode'
        ? [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
        : []

    if (behavior === 'allow_always') {
      // 세션 범위 allow 규칙 추가 → SDK가 이 세션 동안 같은 도구를 다시 묻지 않음.
      // destination 'session' = 인메모리(설정 파일 미수정).
      // ExitPlanMode면 plan 착지(setMode)를 addRules와 병기한다(GAP1 P13).
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [
          { type: 'addRules', rules: [{ toolName }], behavior: 'allow', destination: 'session' },
          ...planLanding
        ]
      }
    }
    // allow (한 번) — ExitPlanMode만 setMode 착지 부착, 그 외엔 updatedPermissions 키 자체를
    // 만들지 않는다(기존 계약 보존 — permissionCoordinator.test.ts가 toEqual로 정확 형상 핀).
    if (planLanding.length > 0) {
      return { behavior: 'allow', updatedInput: input, updatedPermissions: planLanding }
    }
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

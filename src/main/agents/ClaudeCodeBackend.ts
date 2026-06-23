/**
 * ClaudeCodeBackend.ts — Claude Agent SDK 어댑터 (Phase 21b ADR-016 · Phase 24c 권한)
 *
 * AgentBackend 구현: @anthropic-ai/claude-agent-sdk query() 사용.
 * SDK가 yield하는 SDKMessage → mapClaudeStreamLine → AgentEvent push-queue.
 *
 * 핵심 책임: 엔진 고유 출력(SDK SDKMessage) → 공통 AgentEvent 정규화.
 * raw SDK 출력을 외부로 누수하지 않는다.
 *
 * 엔진 분기는 registry.ts에서만 수행한다.
 * 이 클래스를 직접 import하는 곳은 registry.ts 하나뿐이어야 한다.
 *
 * API 키: 환경변수(ANTHROPIC_API_KEY)에서 SDK가 자동 처리.
 *          코드·로그에 평문 노출 절대 금지.
 *
 * ── Phase 24c: 양방향 권한 흐름 + push-queue 리팩터 ──────────────────────────────
 *
 * 왜 push-queue로 바꿨나(데드락 회피):
 *   기존 events는 pull 제너레이터였다. 소비처(agent-runs.ts)가 `for await`로 당기고,
 *   내부 `for await (msg of queryIterable)`가 SDK를 당겼다. canUseTool이 사용자 응답을
 *   await하면 SDK query는 그 도구 메시지에서 멈추고 → 내부 `for await`도 suspend →
 *   permission_request를 yield할 길이 막힌다 = 데드락.
 *   해결: 펌프(생산자)와 events(소비자)를 push-queue(채널)로 분리한다. 펌프는 canUseTool
 *   콜백 안에서 직접 큐에 permission_request를 push할 수 있고, 소비처는 그 사이에도
 *   events에서 그 이벤트를 받아 UI에 띄울 수 있다. canUseTool은 respond()가 올 때까지
 *   await하지만, 큐는 막히지 않는다.
 *
 * push-queue 구조:
 *   _queue: AgentEvent[]            — 적재 버퍼
 *   _resolveNext: (()=>void)|null   — events가 빈 큐에서 대기 중일 때의 wake 콜백
 *   _closed: boolean                — 펌프 종료 플래그
 *   _waiters: Map<requestId, (d)=>void> — canUseTool이 await 중인 권한 응답 resolver
 *   _permCounter: number            — requestId 발급 카운터
 *
 * 펌프 시작 시점:
 *   첫 events 접근(_createEventStream의 첫 next) 시 시작한다. "consume 전 abort 시
 *   무이벤트"라는 기존 동작을 보존하기 위해, abort가 events 소비 전에 오면 펌프를
 *   돌리지 않고 곧장 close된 큐를 drain(=무이벤트 종료)한다.
 *
 * abort 보장(G3 좀비 hang 방지):
 *   abort() = abortController.abort() + interrupt() + 미해결 _waiters 전부 deny resolve
 *   후 clear + close(). 권한 카드가 떠 있는 채로 abort해도 canUseTool await가 풀린다.
 *
 * canUseTool 발화 전제(settings 핀):
 *   sdkOptions.settings.permissions.defaultMode + settingSources:['user','project','local']가
 *   있어야 사용자 전역설정이 canUseTool 전에 선승인하지 못한다. (원본 engine.ts L291~313 미러)
 *
 * 설계 (ADR-016, 결정 #1~#9):
 * - CLI spawn/taskkill 제거 → SDK query() 사용.
 * - lazy query injection (결정 #8): 생성자에서 queryFn 주입 가능.
 * - isAvailable: SDK 하드 의존성 → true (결정 #7).
 * - version: SDK 패키지 버전 문자열 (결정 #7).
 *
 * 엔진 출력 → AgentEvent 매핑 표:
 * ┌──────────────────────────────────────┬───────────────────────────────────┐
 * │ SDK SDKMessage / canUseTool           │ AgentEvent                        │
 * ├──────────────────────────────────────┼───────────────────────────────────┤
 * │ type:"assistant" content[text]       │ { type:"text", delta }            │
 * │ type:"assistant" content[tool_use]   │ { type:"tool_call", id,name,input}│
 * │ type:"user" content[tool_result]     │ { type:"tool_result", id,ok,output│
 * │ type:"result" is_error=false         │ { type:"done", usage?, contextWin │
 * │ type:"result" is_error=true          │ { type:"error", message }+{done}  │
 * │ canUseTool(부수효과 도구, 발화)        │ { type:"permission_request",      │
 * │                                      │    requestId,toolName,summary }   │
 * │ type:"system" (init)                 │ [] (무시, session_id 내부 캡처)   │
 * │ type:"stream_event"                  │ [] (무시, includePartialMessages=0│
 * │ 기타 SDKMessage 타입                  │ [] (forward-compatible)           │
 * └──────────────────────────────────────┴───────────────────────────────────┘
 */

import { mapClaudeStreamLine } from './claude-stream'
import { buildQueryOptions } from './run-args'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── SDK 버전 상수 ─────────────────────────────────────────────────────────────

/** SDK 패키지 버전 (package.json에서 확인, 하드코딩). */
const SDK_VERSION = '0.3.186'

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

// ── 권한 응답 타입 ────────────────────────────────────────────────────────────

/**
 * canUseTool waiter가 resolve로 받는 권한 결정.
 * respond()(permission) 또는 abort/signal(deny)에서 전달.
 */
type PermChoice = { behavior: 'allow' | 'allow_always' | 'deny' }

/**
 * SDK canUseTool 반환 타입(우리가 사용하는 부분만).
 * raw SDK 타입을 직접 import하지 않고 구조만 맞춘다(누수 방지).
 */
type PermissionResult =
  | { behavior: 'allow'; updatedInput: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: 'deny'; message: string }

// ── QueryFn 타입 ──────────────────────────────────────────────────────────────

/**
 * query() 함수 시그니처.
 * 실 SDK와 mock 모두 이 타입을 만족한다.
 * options는 unknown으로 열어두어 실 SDK Options 타입과 mock 양쪽 호환.
 */
export type QueryFn = (params: {
  prompt: string
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

// ── 기본 queryFn (lazy dynamic import) ───────────────────────────────────────

/**
 * 기본 queryFn: @anthropic-ai/claude-agent-sdk를 lazy하게 import하여 query를 반환.
 * 모듈 top-level import가 아닌 lazy import → mock 테스트 시 실 SDK를 평가하지 않음.
 * (결정 #8)
 */
async function getDefaultQueryFn(): Promise<QueryFn> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  return sdk.query as QueryFn
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
function permissionSummary(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') return `명령 실행: ${oneLine(String(input['command'] ?? ''), 80)}`
  if (toolName === 'Write') return `파일 생성: ${String(input['file_path'] ?? '')}`
  if (toolName === 'Edit' || toolName === 'MultiEdit') return `파일 편집: ${String(input['file_path'] ?? '')}`
  return `${toolName} 실행`
}

// ── ClaudeAgentRun ─────────────────────────────────────────────────────────────

/**
 * SDK query 실행 핸들 (push-queue 기반).
 * AgentRun 인터페이스 구현.
 *
 * events: 펌프가 push한 AgentEvent를 순서대로 yield하는 async generator.
 * respond(): canUseTool waiter를 깨워 권한 흐름 재개.
 * abort(): abortController.abort() + interrupt() + 미해결 waiter deny + close.
 */
class ClaudeAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  // ── abort/interrupt 상태 ─────────────────────────────────────────────────
  private _aborted = false
  private _abortController = new AbortController()
  private _queryHandle: { interrupt?: () => Promise<void> } | null = null

  // ── push-queue 상태 ──────────────────────────────────────────────────────
  /** 적재 버퍼: 펌프가 push, events가 drain */
  private _queue: AgentEvent[] = []
  /** events가 빈 큐에서 대기 중일 때 깨우는 콜백(없으면 대기 중 아님) */
  private _resolveNext: (() => void) | null = null
  /** 펌프 종료 플래그(close 후 큐 비면 events return) */
  private _closed = false
  /** 펌프 시작 여부(첫 events 접근 시 1회 시작) */
  private _pumpStarted = false

  // ── 권한 waiter 상태 ─────────────────────────────────────────────────────
  /** requestId → canUseTool await resolver */
  private _waiters = new Map<string, (choice: PermChoice) => void>()
  /** requestId 발급 카운터 */
  private _permCounter = 0

  private readonly _req: AgentRunInput
  private readonly _queryFn: QueryFn | null

  constructor(req: AgentRunInput, queryFn: QueryFn | null) {
    this._req = req
    this._queryFn = queryFn
    this.events = this._createEventStream()
  }

  // ── 공개 API ────────────────────────────────────────────────────────────

  abort(): void {
    // 멱등: 이미 abort됐으면 무시
    if (this._aborted) return
    this._aborted = true

    // AbortController 신호 (SDK 스트림/도구 중단)
    this._abortController.abort()

    // SDK query.interrupt() best-effort (결정 #6)
    if (this._queryHandle?.interrupt) {
      try {
        void this._queryHandle.interrupt()
      } catch {
        // best-effort: 실패해도 좀비 없음 (SDK가 AbortController로 정리)
      }
    }

    // G3: 미해결 권한 waiter를 전부 deny resolve → canUseTool await가 매달리지 않음.
    // (원본 engine.ts cancel() L214 미러)
    for (const [, resolve] of this._waiters) {
      resolve({ behavior: 'deny' })
    }
    this._waiters.clear()

    // 큐 close → events가 남은 이벤트 drain 후 종료 (hang 없음)
    this._close()
  }

  respond(requestId: string, response: RunResponse): void {
    // question 응답은 Phase 24d에서 처리. 지금은 permission만.
    if (response.kind !== 'permission') return

    const resolve = this._waiters.get(requestId)
    // 미존재 requestId(이미 응답/abort/오타) → no-op. 멱등.
    if (!resolve) return
    this._waiters.delete(requestId)
    resolve({ behavior: response.behavior })
  }

  // ── push-queue 내부 ───────────────────────────────────────────────────────

  /** 이벤트 적재 + 대기 중인 events를 깨운다. */
  private _push(event: AgentEvent): void {
    this._queue.push(event)
    this._wake()
  }

  /** 펌프 종료 표시 + 대기 중인 events를 깨운다(빈 큐면 return하도록). */
  private _close(): void {
    if (this._closed) return
    this._closed = true
    this._wake()
  }

  /** events가 빈 큐에서 대기 중이면 깨운다. */
  private _wake(): void {
    if (this._resolveNext) {
      const r = this._resolveNext
      this._resolveNext = null
      r()
    }
  }

  /**
   * events 스트림: 큐를 순서대로 yield → close되고 큐 비면 return → 아니면 push까지 await.
   *
   * 소비처(for await)·이벤트 순서·done/error 종료는 기존과 동일하다(외부 계약 불변).
   */
  private async *_createEventStream(): AsyncGenerator<AgentEvent> {
    // "consume 전 abort 시 무이벤트" 보존: 첫 next 시점에 펌프 시작.
    // 이미 abort됐으면 펌프를 돌리지 않고 곧장 종료.
    if (!this._pumpStarted) {
      this._pumpStarted = true
      if (!this._aborted) {
        // 펌프는 백그라운드로 돌린다(await하지 않음). 펌프가 push/close로 큐를 채운다.
        void this._runPump()
      } else {
        this._close()
      }
    }

    for (;;) {
      // 큐에 쌓인 이벤트를 전부 drain
      while (this._queue.length > 0) {
        yield this._queue.shift()!
      }
      // 큐가 비었고 close됐으면 종료
      if (this._closed) return
      // 아니면 다음 push/close까지 대기
      await new Promise<void>((resolve) => {
        this._resolveNext = resolve
      })
    }
  }

  // ── 펌프(생산자) ──────────────────────────────────────────────────────────

  /**
   * SDK query를 돌려 SDKMessage를 AgentEvent로 정규화해 큐에 push한다.
   * canUseTool은 부수효과 도구에 대해 permission_request를 push하고 respond를 await한다.
   *
   * 항상 finally에서 close()하여 events가 종료되게 한다.
   */
  private async _runPump(): Promise<void> {
    try {
      // 마지막 user 메시지를 프롬프트로 사용
      const lastUserMsg = this._req.messages
        .filter(m => m.role === 'user')
        .at(-1)

      if (!lastUserMsg) {
        this._push({ type: 'error', message: 'No user message found in AgentRunInput.messages' })
        this._push({ type: 'done' })
        return
      }

      const prompt = lastUserMsg.content

      if (this._aborted) return

      // queryFn 해석: 주입된 경우 사용, 아니면 lazy import
      let resolvedQueryFn: QueryFn
      try {
        if (this._queryFn !== null) {
          resolvedQueryFn = this._queryFn
        } else {
          resolvedQueryFn = await getDefaultQueryFn()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to load Agent SDK: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      if (this._aborted) return

      // SDK 옵션 빌드 (run-args의 allowlist 검증)
      const optionsPatch = buildQueryOptions({
        model: this._req.model,
        effort: this._req.effort,
        mode: this._req.mode
      })

      // permissionMode 결정: buildQueryOptions 결과 사용, 없으면 'default'.
      // settings 핀(SDK가 보는 모드)에 쓰인다.
      const permissionMode = optionsPatch.permissionMode ?? 'default'

      // canUseTool early-allow 판정은 picker mode id(매핑 전 값)로 한다.
      // auto/bypass가 acceptEdits/bypassPermissions로 매핑되면 구분이 사라지기 때문.
      // (원본 engine.ts는 makeCanUseTool(runId, req.mode, cwd)로 picker id를 직접 넘김)
      const canUseTool = this._makeCanUseTool(this._req.mode)

      // SDK query 옵션
      const sdkOptions: Record<string, unknown> = {
        ...optionsPatch,
        cwd: this._req.workspaceRoot ?? process.cwd(),
        abortController: this._abortController,
        includePartialMessages: false,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        // ── settings 핀 (canUseTool 발화 전제) ──────────────────────────────
        // 사용자 전역 ~/.claude/settings.json의 permissions.defaultMode가 canUseTool
        // 전에 도구를 선승인하지 못하도록, composer가 고른 모드를 inline settings로 핀한다.
        // settingSources를 명시해 user/project/local 설정을 같이 로드하되, inline settings가
        // 우선한다. (원본 engine.ts L291~313 미러)
        settings: { permissions: { defaultMode: permissionMode } },
        settingSources: ['user', 'project', 'local'],
        canUseTool
      }

      // API 키: 환경변수(process.env)에서 SDK가 자동 처리.
      // 코드에 평문 노출 절대 금지.

      // query 호출
      let queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
      try {
        queryIterable = resolvedQueryFn({ prompt, options: sdkOptions })
        this._queryHandle = queryIterable
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to start agent query: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      // SDK SDKMessage 스트림 소비 → AgentEvent 정규화 → push
      try {
        for await (const msg of queryIterable) {
          if (this._aborted || this._abortController.signal.aborted) {
            return
          }
          // 엔진 출력 → AgentEvent (raw 누수 없음, mapClaudeStreamLine 경유만)
          for (const event of mapClaudeStreamLine(msg)) {
            this._push(event)
          }
        }
      } catch (err) {
        // abort로 인한 중단은 정상 종료로 처리
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Agent execution error: ${msg}` })
        this._push({ type: 'done' })
      }
    } finally {
      // 항상 close → events 종료 보장 (정상/에러/abort 무관)
      this._close()
    }
  }

  // ── canUseTool (권한 게이트) ────────────────────────────────────────────────

  /**
   * SDK canUseTool 콜백 생성. picker mode id를 클로저로 캡처.
   *
   * mode는 buildQueryOptions 매핑 *전*의 picker id다(예: 'normal'|'plan'|'acceptEdits'
   * |'auto'|'bypass'). auto/bypass가 SDK permissionMode로 매핑되면 acceptEdits/
   * bypassPermissions와 구분이 사라지므로, 판정은 매핑 전 id로 한다.
   *
   * 판정 순서(원본 engine.ts makeCanUseTool L761~802 미러):
   *  1. AskUserQuestion → 지금은 allow (TODO(24d): 질문카드로 교체).
   *  2. mode auto/bypass → allow.
   *  3. READONLY_TOOLS → allow.
   *  4. acceptEdits && toolName!=='Bash' && !MUTATING → allow.
   *  5. 그 외(부수효과) → permission_request push + respond await.
   *     deny→{behavior:'deny'}, allow_always→allow+세션규칙, allow→allow.
   *  6. options.signal abort → 해당 waiter deny resolve(SDK 독립 abort 미러).
   */
  private _makeCanUseTool(mode: string | undefined) {
    return async (
      toolName: string,
      input: Record<string, unknown>,
      options?: { signal?: AbortSignal; toolUseID?: string }
    ): Promise<PermissionResult> => {
      // 1. AskUserQuestion → TODO(M4-4)/TODO(24d): 질문카드로 교체 예정. 지금은 allow.
      if (toolName === 'AskUserQuestion') {
        return { behavior: 'allow', updatedInput: input }
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
      const requestId = `perm-${++this._permCounter}`
      const summary = permissionSummary(toolName, input)

      const choice = await new Promise<PermChoice>((resolve) => {
        this._waiters.set(requestId, resolve)
        // 6. SDK가 독립적으로 이 도구를 abort하면 매달리지 않도록 deny resolve.
        //    (원본 engine.ts L784~787 미러)
        const onAbort = (): void => {
          if (this._waiters.delete(requestId)) resolve({ behavior: 'deny' })
        }
        options?.signal?.addEventListener('abort', onAbort, { once: true })
        // permission_request를 큐에 push → events로 흘러 UI가 카드를 띄운다.
        this._push({ type: 'permission_request', requestId, toolName, summary })
      })

      if (choice.behavior === 'deny') {
        return { behavior: 'deny', message: '사용자가 거부했습니다.' }
      }
      if (choice.behavior === 'allow_always') {
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
  }
}

// ── ClaudeCodeBackend ─────────────────────────────────────────────────────────

/**
 * Claude Agent SDK 어댑터.
 * AgentBackend 인터페이스 구현.
 *
 * 주입형 queryFn으로 테스트 격리 지원 (결정 #8).
 * 기본값은 lazy dynamic import → mock 테스트가 실 SDK를 평가하지 않음.
 */
export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  private _queryFn: QueryFn | null

  /**
   * @param queryFn 선택적 query 함수 주입 (테스트용).
   *   미전달 시 null → start() 시점에 lazy dynamic import.
   */
  constructor(queryFn?: QueryFn) {
    this._queryFn = queryFn ?? null
  }

  /**
   * SDK 가용성 확인.
   * SDK는 하드 의존성(npm install 필수)이므로 dynamic import가 성공하면 true.
   * (결정 #7)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await getDefaultQueryFn()
      return true
    } catch {
      return false
    }
  }

  /**
   * SDK 패키지 버전 반환.
   * system `claude --version`이 아닌 SDK 패키지 버전.
   * (결정 #7)
   */
  async version(): Promise<string | null> {
    return SDK_VERSION
  }

  /**
   * 에이전트 실행 시작.
   * AgentRun을 즉시 반환 (비동기 스트리밍은 events 소비 시 시작).
   */
  start(req: AgentRunInput): AgentRun {
    return new ClaudeAgentRun(req, this._queryFn)
  }
}

/**
 * claudeAgentRun.ts — SDK query 실행 핸들 (RF1-followup P03: ClaudeCodeBackend에서 분리)
 *
 * AgentRun 구현. 생명주기 오케스트레이터:
 *   SDK 옵션 빌드(sdkOptions) → query 호출(queryFn) → SDKMessage 수신 →
 *   normalizer.process() 위임(eventNormalizer) → push-queue 적재.
 * 권한/질문 결정은 PermissionCoordinator(permissionCoordinator)에 위임한다.
 *
 * 핵심 책임: 펌프(생산자)와 events(소비자)를 push-queue(채널)로 분리해 데드락을 회피한다.
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
 *   _perm: PermissionCoordinator    — canUseTool이 await 중인 권한/질문 waiter 관리
 *
 * 펌프 시작 시점:
 *   첫 events 접근(_createEventStream의 첫 next) 시 시작한다. "consume 전 abort 시
 *   무이벤트"라는 기존 동작을 보존하기 위해, abort가 events 소비 전에 오면 펌프를
 *   돌리지 않고 곧장 close된 큐를 drain(=무이벤트 종료)한다.
 *
 * abort 보장(G3 좀비 hang 방지):
 *   abort() = abortController.abort() + interrupt() + 미해결 waiter 전부 deny resolve
 *   (PermissionCoordinator.cancelAll) 후 close(). 권한 카드가 떠 있는 채로 abort해도
 *   canUseTool await가 풀린다.
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
 * │ canUseTool(부수효과 도구, 발화)        │ { type:"permission_request", … }  │
 * │ canUseTool(AskUserQuestion, 발화)     │ { type:"question_request", … }    │
 * │ type:"system" (init)                 │ [] (무시, session_id 내부 캡처)   │
 * │ type:"stream_event"                  │ content_block_delta text_delta →  │
 * │   content_block_delta text_delta     │   { type:"text", delta }          │
 * │ 기타 SDKMessage 타입                  │ [] (forward-compatible)           │
 * └──────────────────────────────────────┴───────────────────────────────────┘
 */

import { RunEventNormalizer, nextRunTag } from './eventNormalizer'
import { PermissionCoordinator } from './permissionCoordinator'
import { buildClaudeSdkOptions, makeRefusalFallbackHandler } from './sdkOptions'
import { getDefaultQueryFn, captureSupportedCommands } from './queryFn'
import { buildModelContextPrompt } from './buildPrompt'
import type { QueryFn, PersistentQueryFn } from './queryFn'
import type { AgentRun, AgentRunInput, RunResponse } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'
import { MODEL_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW } from '../../shared/ipc-contract'
import type { SlashCommandInfo } from '../../shared/ipc-contract'

/**
 * 컨텍스트 폴백 예산(토큰) 산정 (LR1 Phase 02, ADR-029).
 *
 * resumeSessionId가 없을 때 buildModelContextPrompt가 과거 대화를 얼마나 프롬프트에
 * 채워 넣을지의 상한. 모델 컨텍스트 창(MODEL_CONTEXT_WINDOW — 토큰 게이지 분모와 동일
 * SoT, `shared/ipc/agent.ts`)에서 여유분(시스템 프롬프트·도구 정의·응답 헤드룸)을 뺀
 * 값. 여유분은 튜닝 가능한 보수적 상수 — 모델별 정교한 여유분 산정(예: 도구 개수 반영)은
 * 후속 과제, LR1 Phase 02 범위 밖.
 */
const CONTEXT_FALLBACK_RESERVE_TOKENS = 20_000

function computeContextFallbackBudget(model: string | undefined): number {
  const windowTokens =
    (model !== undefined ? MODEL_CONTEXT_WINDOW[model] : undefined) ?? DEFAULT_CONTEXT_WINDOW
  return Math.max(windowTokens - CONTEXT_FALLBACK_RESERVE_TOKENS, 0)
}

/**
 * SDK query 실행 핸들 (push-queue 기반).
 * AgentRun 인터페이스 구현.
 *
 * events: 펌프가 push한 AgentEvent를 순서대로 yield하는 async generator.
 * respond(): canUseTool waiter를 깨워 권한 흐름 재개(PermissionCoordinator 위임).
 * abort(): abortController.abort() + interrupt() + 미해결 waiter deny + close.
 */
export class ClaudeAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  // ── abort/interrupt 상태 ─────────────────────────────────────────────────
  private _aborted = false
  private _abortController = new AbortController()
  private _queryHandle: { interrupt?: () => Promise<void> } | null = null
  /**
   * interrupt() 신호 — interrupt-result(is_error)를 error로 표면화하지 않기 위한
   * 1회성 플래그. abort(_aborted)와 구별: interrupt=turn만, abort=세션째(BF1-interrupt-loop P03).
   *
   * ⚠️ 안전성 전제(SDK 불변식): interrupt는 반드시 result(is_error)로 귀결한다(실측 — error+done
   * 1쌍을 같은 result msg에 방출). 이 가정이 깨지면(interrupt 후 result 미방출) 플래그가 다음
   * turn까지 살아 그 turn의 실행에러 1건을 마스킹할 수 있다 → SDK 거동 변화 시 회귀 추적점.
   */
  private _interrupted = false

  // ── push-queue 상태 ──────────────────────────────────────────────────────
  /** 적재 버퍼: 펌프가 push, events가 drain */
  private _queue: AgentEvent[] = []
  /** events가 빈 큐에서 대기 중일 때 깨우는 콜백(없으면 대기 중 아님) */
  private _resolveNext: (() => void) | null = null
  /** 펌프 종료 플래그(close 후 큐 비면 events return) */
  private _closed = false
  /** 펌프 시작 여부(첫 events 접근 시 1회 시작) */
  private _pumpStarted = false

  // ── 권한/질문 코디네이터 (Phase 24c/24d → RF1-followup P03 분리) ──────────
  /**
   * 권한/질문 결정 + 양방향 응답 waiter 관리.
   * canUseTool 생성, respond() 위임, abort 시 cancelAll()을 담당.
   * 외부 의존은 push 콜백 하나 — 생성자에서 this._push를 주입한다.
   */
  private readonly _perm: PermissionCoordinator

  // ── 상태 기반 이벤트 정규화기 (Phase 11 책임 분리) ──────────────────────────
  //
  // SDK 옵션 빌드 → query 호출 → SDKMessage 수신 → normalizer.process() 위임 → push-queue 적재.
  // 생성은 constructor에서 nextRunTag()로 launchTag를 발급한 뒤 RunEventNormalizer에 주입.
  private readonly _normalizer: RunEventNormalizer

  // ── 지속세션(REPL, ADR-024) held-open 필드 ───────────────────────────────────

  /**
   * 지속세션 입력 큐 — push()가 적재, _inputGen이 소비.
   * 지속세션 모드(_req.persistent===true)에서만 사용.
   */
  private _inputQueue: string[] = []

  /**
   * _inputGen의 대기 상태를 깨우는 콜백.
   * push()가 _inputQueue에 적재 후 이 콜백을 호출해 _inputGen이 await에서 벗어나게 한다.
   * null이면 _inputGen이 대기 중이 아님(= 처리 중이거나 아직 시작 안 됨).
   */
  private _resolveInput: (() => void) | null = null

  /**
   * LR3 Phase 02: 턴 경계 idle-close 플래그.
   *
   * abort()와 의도적으로 구별한다 — abort는 사용자 취소(AbortController.abort() +
   * PermissionCoordinator.cancelAll() + interrupt() 동반, "세션을 죽인다"), 이 플래그는
   * "살아있을 이유(pending user turn·활성 루프)가 사라져 스스로 접는다"는 자연스러운 강등
   * 신호다. true가 되면 `_inputGen`의 while(true) 루프가 다음 순회에서 정상 return해
   * SDK query가 자연 종료되게 유도한다 — AbortController/권한 waiter는 건드리지 않는다
   * (진행 중이던 도구·권한 흐름이 없는 "턴 경계"에서만 세워지므로 안전).
   */
  private _idleClosing = false

  /**
   * 미소비 user turn 카운터(origin 판정용).
   *
   * origin-probe 실측: SDK는 user/cron origin 신호 미제공 — 턴은 직렬·비인터리브.
   * 판정 원리: 호스트측에서 pendingSends를 관리.
   *   - start() 시 초기 메시지 적재 → pendingSends=1.
   *   - push() 호출 → pendingSends++.
   *   - 턴 경계(done) 도달 → pendingSends>0이면 'user' + pendingSends--, else 'cron'.
   *
   * 단발 경로에서는 사용되지 않는다(undefined 부여 = 기존 동작 회귀 0).
   */
  private _pendingSends = 0

  private readonly _req: AgentRunInput
  private readonly _queryFn: QueryFn | null
  private readonly _skillOverridesProvider: () => Record<string, 'off'> | null
  private readonly _mcpDeniedProvider: () => { serverName: string }[] | null
  /**
   * 캡처된 슬래시 커맨드를 백엔드 캐시에 기록하는 콜백 (ADR-019).
   * ClaudeCodeBackend.start()가 wsKey별로 주입한다.
   * null이면 캡처 비활성(테스트 격리 또는 캐시 미제공 상황).
   */
  private readonly _onCommandsCaptured: ((cmds: SlashCommandInfo[]) => void) | null

  constructor(
    req: AgentRunInput,
    queryFn: QueryFn | null,
    skillOverridesProvider: () => Record<string, 'off'> | null,
    mcpDeniedProvider: () => { serverName: string }[] | null,
    onCommandsCaptured: ((cmds: SlashCommandInfo[]) => void) | null = null
  ) {
    this._req = req
    this._queryFn = queryFn
    this._skillOverridesProvider = skillOverridesProvider
    this._mcpDeniedProvider = mcpDeniedProvider
    this._onCommandsCaptured = onCommandsCaptured
    // 권한 코디네이터: push 콜백 주입(close 가드 포함 _push 경유 → 늦은 이벤트 차단 동일).
    this._perm = new PermissionCoordinator((e) => this._push(e))
    // Phase 11: 런 태그를 발급해 상태 기반 정규화기를 초기화.
    this._normalizer = new RunEventNormalizer(nextRunTag(), req.workspaceRoot ?? undefined)
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

    // G3: 미해결 waiter를 전부 취소 resolve → canUseTool await가 매달리지 않음.
    // permission → deny, question → answers:null (PermissionCoordinator.cancelAll 위임).
    this._perm.cancelAll()

    // Phase 11: normalizer를 통해 상태 정리 + 정리 이벤트 push.
    // 활성 루프가 있으면 빈 loops 이벤트도 반환 → close 전 push-queue에 적재.
    const abortEvents = this._normalizer.abortCleanup()
    for (const e of abortEvents) this._push(e)

    // 지속세션: _inputGen이 _resolveInput await 중이면 깨워 종료시킨다.
    // _aborted=true이면 _inputGen 내부 가드가 종료를 결정한다.
    if (this._resolveInput) {
      const r = this._resolveInput
      this._resolveInput = null
      r()
    }

    // 큐 close → events가 남은 이벤트 drain 후 종료 (hang 없음)
    this._close()
  }

  interrupt(): void {
    // 현재 turn만 best-effort 중단 — 세션·events 스트림은 유지(abort()와 분리, ADR-024 (3)).
    // abort()는 abortController.abort()+waiter 정리+close를 동반하지만, interrupt는 그중
    // SDK turn 중단만. 단발(비-persistent) 경로에선 진행 query를 끊고 펌프가 자연 종료(done).
    // 멱등·안전: abort 후/query 핸들 미캡처/이미 종료 → no-op(예외 없음).
    if (this._aborted) return
    if (this._queryHandle?.interrupt) {
      // queryHandle이 있어 실제 SDK에 신호가 갈 때만 세움 — 곧 올 interrupt-result(error)를
      // 정확히 겨냥(BF1-interrupt-loop P03, ADR-024 세션 유지 불변식).
      this._interrupted = true
      try {
        void this._queryHandle.interrupt()
      } catch {
        // best-effort: 실패해도 좀비 없음(세션 정리는 abort/AbortController 담당)
      }
    }
  }

  respond(requestId: string, response: RunResponse): void {
    // PermissionCoordinator로 위임 — 미존재 requestId no-op, 멱등.
    this._perm.respond(requestId, response)
  }

  /**
   * 지속세션에 후속 user 메시지를 주입한다(ADR-024 Phase 2).
   *
   * 동작:
   *   1. _inputQueue에 content 적재.
   *   2. _pendingSends++ (origin 판정: 다음 done은 'user').
   *   3. _inputGen이 await 중이면 깨운다(_resolveInput 호출).
   *
   * 단발(비-persistent) 경로에서는 호출되지 않아야 하나, 호출돼도 _inputQueue에
   * 적재되기만 하고 부작용은 없다(방어적 no-harm).
   *
   * 멱등·안전: abort 후 호출해도 큐에 적재만 됨(이미 closed이면 _inputGen이 소비 전 종료).
   *
   * 신뢰경계: content는 renderer untrusted 문자열. 길이 제한 없음(SDK에 전달).
   */
  push(content: string): void {
    this._inputQueue.push(content)
    this._pendingSends++
    // _inputGen이 await 중이면 깨운다
    if (this._resolveInput) {
      const r = this._resolveInput
      this._resolveInput = null
      r()
    }
  }

  // ── push-queue 내부 ───────────────────────────────────────────────────────

  /** 이벤트 적재 + 대기 중인 events를 깨운다. */
  private _push(event: AgentEvent): void {
    // 방어심층화(F-B reviewer): close(=정상 종료/abort) 후 push는 무시.
    // close된 뒤 어떤 경로로든 들어온 늦은 이벤트는 큐에 적재되지 않는다.
    if (this._closed) return
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
        // 분기: persistent=true이면 held-open 펌프, 아니면 기존 단발 펌프.
        // 엔진 고유 형상 처리는 각 펌프 내부에만 격리(ADR-003).
        if (this._req.persistent === true) {
          void this._runPersistentPump()
        } else {
          void this._runPump()
        }
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
   * 펌프 공용 준비: queryFn 해석 + abort 가드 + SDK 옵션 빌드 (단발·지속 펌프 DRY).
   *
   * 분해 전 두 펌프가 동일하게 인라인으로 갖던 "queryFn 해석 → abort 확인 → 옵션 빌드"
   * 전처리를 한 곳으로 모은다. abort 가드 위치·순서는 분해 전과 동일하다:
   *  - queryFn 해석 try/catch 후 `if (aborted) return null`(원본의 post-resolve abort 확인).
   *  - pre-resolve abort 확인은 각 펌프 본문에 그대로 남는다(호출 직전).
   *
   * 반환:
   *  - queryFn 로드 실패 → error+done push 후 null(호출자 return).
   *  - abort 감지 → push 없이 null(호출자 return).
   *  - 성공 → { resolvedQueryFn, sdkOptions }.
   */
  private async _prepareQuery(): Promise<{ resolvedQueryFn: QueryFn; sdkOptions: Record<string, unknown> } | null> {
    // queryFn 해석: 주입된 경우 사용, 아니면 lazy import
    let resolvedQueryFn: QueryFn
    try {
      resolvedQueryFn = this._queryFn !== null ? this._queryFn : await getDefaultQueryFn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this._push({ type: 'error', message: `Failed to load Agent SDK: ${msg}` })
      this._push({ type: 'done' })
      return null
    }

    if (this._aborted) return null

    // SDK 옵션 빌드 (sdkOptions.buildClaudeSdkOptions로 위임 — 단발·지속 공용·DRY).
    // canUseTool early-allow 판정은 picker mode id(매핑 전 값)로 한다(orchestration 포함).
    const orchestration = this._req.orchestration === true
    const canUseTool = this._perm.makeCanUseTool(this._req.mode, orchestration)
    const sdkOptions = buildClaudeSdkOptions({
      req: this._req,
      abortController: this._abortController,
      canUseTool,
      skillOverrides: this._skillOverridesProvider(),
      mcpDenied: this._mcpDeniedProvider(),
      onUserDialog: makeRefusalFallbackHandler(this._normalizer, (e) => this._push(e)),
    })
    return { resolvedQueryFn, sdkOptions }
  }

  /**
   * SDK query를 돌려 SDKMessage를 AgentEvent로 정규화해 큐에 push한다.
   * canUseTool은 부수효과 도구에 대해 permission_request를 push하고 respond를 await한다.
   *
   * 항상 finally에서 close()하여 events가 종료되게 한다.
   */
  private async _runPump(): Promise<void> {
    try {
      // 마지막 user 메시지 + (resumeSessionId 없으면) 최근 대화 폴백 프리앰블을
      // 예산 안에서 prompt로 빌드 (LR1 Phase 02, ADR-029). resumeSessionId 있으면
      // buildModelContextPrompt가 기존 거동(마지막 메시지만)을 그대로 보존한다.
      const prompt = buildModelContextPrompt(this._req.messages, {
        resumeSessionId: this._req.resumeSessionId,
        contextBudgetTokens: computeContextFallbackBudget(this._req.model),
      })

      if (!prompt) {
        this._push({ type: 'error', message: 'No user message found in AgentRunInput.messages' })
        this._push({ type: 'done' })
        return
      }

      if (this._aborted) return

      // queryFn 해석 + abort 가드 + SDK 옵션 빌드 (단발·지속 공용 헬퍼).
      const prep = await this._prepareQuery()
      if (!prep) return
      const { resolvedQueryFn, sdkOptions } = prep

      // API 키: 환경변수(process.env)에서 SDK가 자동 처리. 코드에 평문 노출 절대 금지.

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

      // ADR-019: supportedCommands 캡처 (단발·지속 공용 헬퍼) — query 핸들 확보 직후.
      captureSupportedCommands(queryIterable, this._onCommandsCaptured)

      // Phase 11: B2 초기화 → normalizer.resetStreaming() 위임.
      this._normalizer.resetStreaming()

      // SDK SDKMessage 스트림 소비 → AgentEvent 정규화 → push
      try {
        // ── F-B: 중간 done 보류 버퍼 ─────────────────────────────────────────
        // Workflow는 fire-and-watch(프로브 확인): 한 query에 result(턴)가 여러 번 온다
        // (턴1 "launched" result → 턴2 진짜 결과 result). result마다 done이 나오지만,
        // run-manager(agent-runs.ts)는 *첫* done에 run을 닫는다 → 2번째 턴(결과)을 못 받음.
        // 그래서 중간 done은 push하지 않고 보관했다가, iterator가 자연 종료(=진짜 끝)될 때
        // 최종 done만 단 한 번 push한다(맥락 연속).
        let lastDone: AgentEvent | null = null
        for await (const msg of queryIterable) {
          if (this._aborted || this._abortController.signal.aborted) {
            return
          }
          // Phase 11: normalizer.process() 위임.
          // normalizer가 AgentEvent[]와 done(AgentEventDone|null)을 분리 반환.
          const { events: normEvents, done } = this._normalizer.process(msg)
          for (const e of normEvents) this._push(e)
          if (done !== null) {
            lastDone = done  // 단발 경로: 보류(F-B)
          }
        }

        // ── F-B: iterator 자연 종료 → 보류한 최종 done을 단 한 번 push ──────────
        // 위치 load-bearing(plan-auditor): for-await 직후·catch 이전(try 블록 내).
        //  - throw 시: 이 코드는 건너뛰고 catch가 error+done을 냄 → 이중 done 없음.
        //  - abort 시: 가드로 push 금지(abort()가 이미 _close, 늦은 done 누수 차단).
        // 정상 종료: lastDone(마지막 result usage 운반) push, result가 없었으면 bare done.
        if (!this._aborted && !this._abortController.signal.aborted) {
          this._push(lastDone ?? { type: 'done' })
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
      // Phase 11: 상태 클린업 → normalizer.singlePumpCleanup() 위임(silent — 이벤트 없음).
      this._normalizer.singlePumpCleanup()
      // 항상 close → events 종료 보장 (정상/에러/abort 무관)
      this._close()
    }
  }

  // ── 지속세션 입력 제너레이터 (ADR-024) ────────────────────────────────────

  /**
   * held-open 입력 generator.
   *
   * 동작:
   *   - _inputQueue에서 user 메시지를 yield한다. (SDKUserMessage 형상은 여기만 — ADR-003)
   *   - _inputQueue가 비면 _resolveInput await(push()가 깨울 때까지 대기).
   *   - abort()가 _resolveInput을 호출 → 대기에서 깨어나 _aborted 확인 → 종료.
   *   - (LR3 Phase 02) _idleClosing이 세워지면 같은 방식으로 종료 → agent-runs.ts의
   *     기존 스트림 자연종료 정리 경로에 위임(0줄 변경 전략).
   *
   * SDK는 이 generator에서 pull한 user 메시지를 순서대로 처리한다.
   * generator가 return하면(닫히면) SDK 세션도 자연 종료된다.
   *
   * 신뢰경계: content는 renderer untrusted string(_inputQueue에서 옴).
   * ADR-003: SDKUserMessage 형상(role/content/type/parent_tool_use_id)은 이 함수 내부에만.
   */
  private async *_inputGen(): AsyncGenerator<unknown> {
    while (true) {
      // _aborted/_idleClosing이면 input gen 종료 → SDK 세션도 자연 종료
      if (this._aborted || this._abortController.signal.aborted || this._idleClosing) {
        return
      }

      // 큐에 메시지가 있으면 즉시 yield
      if (this._inputQueue.length > 0) {
        const content = this._inputQueue.shift()!
        // SDKUserMessage 형상 — ADR-003: 이 함수 내부에만 격리
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: content }],
          },
          parent_tool_use_id: null,
        }
        continue
      }

      // 큐가 비었으면 push()/abort()가 깨울 때까지 대기
      await new Promise<void>((resolve) => {
        this._resolveInput = resolve
      })
      // 깨어난 뒤 루프 상단의 _aborted 확인으로 올라감
    }
  }

  // ── 지속세션 펌프(ADR-024 Phase 2) ────────────────────────────────────────

  /**
   * held-open query 세션 펌프.
   *
   * 설계(C 설계):
   *   1. 초기 user 메시지를 _inputQueue에 적재 + _pendingSends=1.
   *   2. resolvedQueryFn({ prompt: _inputGen(), options: sdkOptions }) — AsyncIterable prompt.
   *   3. for-await: 각 msg를 normalizer.process로 처리.
   *      done 반환(=turn 경계)하면:
   *        - origin 판정: _pendingSends>0 → 'user' + _pendingSends--.  else → 'cron'.
   *        - _push({ ...done, origin }) 즉시(close 안 함). 루프 계속.
   *   4. input gen이 닫힐 때(abort/세션종료)만 for-await 자연 종료 → finally _close().
   *
   * abort(): _aborted=true + abortController.abort() + _resolveInput 호출(input gen 깨움).
   *   → input gen이 return → queryIterable이 자연 종료 → for-await 끝 → finally _close().
   *
   * 단발 경로(_runPump)와의 차이:
   *   - prompt: AsyncIterable(_inputGen()) vs string.
   *   - done: 즉시 origin 포함 push vs F-B 보류.
   *   - 루프 종료: input gen 닫힐 때 vs queryIterable 자연 종료.
   */
  private async _runPersistentPump(): Promise<void> {
    try {
      // ── 초기 user 메시지(+ 폴백 프리앰블) 적재 (LR1 Phase 02, ADR-029) ────────
      // resumeSessionId 없으면 최근 대화를 예산 안에서 프리앰블로 붙인다(_runPump와
      // 대칭 — held-open 경로도 옛 대화 sessionId 미보유 시 맥락 유실 방지).
      const initialPrompt = buildModelContextPrompt(this._req.messages, {
        resumeSessionId: this._req.resumeSessionId,
        contextBudgetTokens: computeContextFallbackBudget(this._req.model),
      })

      if (!initialPrompt) {
        this._push({ type: 'error', message: 'No user message found in AgentRunInput.messages' })
        this._push({ type: 'done' })
        return
      }

      // 초기 메시지를 큐에 적재 + pendingSends=1(초기 turn은 user origin)
      this._inputQueue.push(initialPrompt)
      this._pendingSends = 1

      if (this._aborted) return

      // ── queryFn 해석 + abort 가드 + SDK 옵션 빌드 (_runPump와 동일 공용 헬퍼) ──
      const prep = await this._prepareQuery()
      if (!prep) return
      const { resolvedQueryFn, sdkOptions } = prep

      // ── query 호출 — AsyncIterable prompt (held-open) ────────────────────
      let queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
      try {
        // ADR-003: 지속세션 AsyncIterable prompt는 어댑터 내부에만.
        // QueryFn(string 선언, 기존 mock 하위호환)을 PersistentQueryFn으로 정밀 캐스트(`any` 아님).
        // 실 SDK query()는 AsyncIterable<SDKUserMessage>도 prompt로 수용한다.
        queryIterable = (resolvedQueryFn as unknown as PersistentQueryFn)({ prompt: this._inputGen(), options: sdkOptions })
        this._queryHandle = queryIterable
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to start agent query: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      // ADR-019: supportedCommands 캡처 (단발·지속 공용 헬퍼) — REPL 기본 모드에서도
      // 슬래시 커맨드(/loop·/schedule·/goal 등)가 팔레트에 뜨도록 지속 펌프도 캡처한다.
      captureSupportedCommands(queryIterable, this._onCommandsCaptured)

      // Phase 11: B2 초기화 → normalizer.resetStreaming() 위임.
      this._normalizer.resetStreaming()

      // ── SDK SDKMessage 스트림 소비 — 지속세션 루프 ───────────────────────
      try {
        for await (const msg of queryIterable) {
          if (this._aborted || this._abortController.signal.aborted) {
            return
          }

          // Phase 11: normalizer.process() 위임.
          const { events: normEvents, done } = this._normalizer.process(msg)
          for (const e of normEvents) {
            // interrupt로 인한 result(is_error)는 turn 중단 신호 — 일반 error로 표면화 금지
            // (BF1-interrupt-loop P03, ADR-024: 세션 유지).
            if (this._interrupted && e.type === 'error') continue
            this._push(e)
          }
          if (done !== null) {
            // ── turn 경계: origin 판정 + 즉시 push ───────────────────────────
            // origin-probe 실측: SDK는 user/cron 신호 미제공. 직렬 턴.
            // 판정: _pendingSends>0이면 user(push()로 주입된 turn), else cron(자율 발동).
            const origin: 'user' | 'cron' = this._pendingSends > 0 ? 'user' : 'cron'
            if (this._pendingSends > 0) {
              this._pendingSends--
            }
            // done 즉시 push (F-B 보류 없음 — 지속세션은 turn마다 즉시 push)
            this._push({ ...done, origin })
            // close 안 함 — input gen이 닫힐 때까지 루프 계속(held-open)
            // turn 경계마다 interrupt 플래그 리셋 — interrupt-result의 error+done은 같은
            // result msg에서 한 쌍으로 오므로, error suppress 후 done에서 리셋해야 다음
            // turn은 정상 error 표면화(BF1-interrupt-loop P03).
            if (this._interrupted) this._interrupted = false

            // ── LR3 Phase 02: 턴 경계 idle-close ──────────────────────────────
            // "살아있을 이유"(미소비 pending user turn 또는 활성 루프[크론·armed
            // wakeup·등록 중 pending])가 없으면 입력 스트림을 스스로 정상 종료한다.
            // 판정은 done push *직후*(정보가 모두 모인 시점 — 강등이 항상 안전) —
            // 트래커의 onTurnEnd()는 normalizer.process() 내부(done 감지 시점)에서 이미
            // 호출됐으므로 hasLoopActivity()는 이 턴의 최신 상태(예: 재예약 없는 wakeup
            // 소멸)를 반영한다. interrupt로 이 turn이 막 끝난 경우도 동일 규칙 —
            // 세션 유지가 원칙이나 활동이 없으면 "다음 경계"인 지금 닫혀도 무방(엣지 계약).
            // 권한/질문 대기(turn 내부)는 done이 없는 시점이라 이 판정의 대상이 아니다
            // (구조적으로 배제 — 이 블록은 done !== null일 때만 도달).
            if (this._pendingSends === 0 && !this._normalizer.hasLoopActivity()) {
              this._idleClosing = true
              // _inputGen이 대기 중(다음 push를 기다리는 상태)이면 깨워 즉시 return시킨다.
              // 대기 중이 아니면(아직 그 지점에 도달 못함) 다음에 resume될 때 루프 상단의
              // _idleClosing 확인에서 스스로 종료한다 — push()와 동일한 wake 관용구.
              if (this._resolveInput) {
                const r = this._resolveInput
                this._resolveInput = null
                r()
              }
            }
          }
        }
        // for-await 자연 종료 = input gen 닫힘(abort/세션종료)
        // abort 시에는 이미 _aborted=true이므로 가드로 처리됨
      } catch (err) {
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }
        const errMsg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Agent execution error: ${errMsg}` })
        this._push({ type: 'done' })
      }
    } finally {
      // Phase 11: 지속세션 종료 시 상태 클린업 → normalizer.persistentPumpCleanup() 위임.
      // 활성 루프가 있었으면 빈 loops push(close 전) → GUI 표시기 제거.
      const loopEvents = this._normalizer.persistentPumpCleanup()
      for (const e of loopEvents) this._push(e)
      // input gen도 확실히 닫힘 보장(_resolveInput 깨우기)
      if (this._resolveInput) {
        const r = this._resolveInput
        this._resolveInput = null
        r()
      }
      // 항상 close → events 종료 보장
      this._close()
    }
  }
}

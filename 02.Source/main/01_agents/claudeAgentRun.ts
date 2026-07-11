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
 * idle-close 유예(grace) 시간(ms) — LR4 Phase 03.
 *
 * turn 경계에서 "살아있을 이유"가 없다고 판정돼도 즉시 입력 스트림을 닫지 않고 이 시간만큼
 * 대기한다. goal(stop-hook 자기지속) 세션은 done 직후 짧은 지연을 두고 다음 자율 continuation을
 * 재발동하는 패턴이 있어, 즉시 close는 그 continuation이 도착하기 전에 입력 스트림을 이미
 * 닫아버려 자율반복이 스스로 죽는(자멸) 결함을 냈다. 이 유예가 그 continuation을 "활동"으로
 * 흡수할 시간을 준다.
 *
 * trade-off: 짧게 잡으면(자원 프로필 보존, 무활동 세션이 빨리 정리됨) 정말 느린 continuation을
 * 놓칠 위험이 있고, 길게 잡으면 오종료는 줄지만 무활동 세션이 그만큼 오래 자원을 점유한다.
 * 3000ms는 초기 추정치 — 실측(라이브 goal 세션의 continuation 지연 분포)으로 추후 조정될 수
 * 있어 상수로 추출해 둔다.
 */
export const IDLE_CLOSE_GRACE_MS = 3000

/**
 * idle-close 유예 1스텝 폭(ms) — 내부 구현 세부(비export, 계약 아님).
 *
 * `_scheduleIdleGrace()`/`_armGraceStep()`이 `IDLE_CLOSE_GRACE_MS`를 한 번의 setTimeout으로
 * 걸지 않고 이 단위로 잘라 자기 재스케줄하는 이유는 `_armGraceStep()` JSDoc 참조 — 요약하면
 * 가짜 타이머(vitest) 중첩 advance 호출 호환성(실측 확인, 프로덕션 지연 총합은 불변).
 */
const IDLE_CLOSE_GRACE_STEP_MS = 100

/**
 * 연속 자율(cron-origin, 사용자 입력 없이 발동) 턴 상한 — LR4 Phase 03.
 *
 * 유예 도입으로 goal 자율반복이 자멸하지 않게 됐지만, 그 대가로 "영원히 스스로를 재점화하는"
 * 세션이 가능해졌다 — 사용자 개입 없이 무한히 자원을 점유할 수 있다. 이 상수는 연속
 * cron-origin 턴 수의 절대 상한이다. 사용자 turn(push())이 오면 카운터가 리셋되므로, 정상적인
 * "사용자와 대화하며 가끔 자율 진행하는" 세션은 이 상한에 걸리지 않는다 — 순수 무인 자율
 * continuation만 억제한다.
 *
 * 100(영호 확정 2026-07-11)은 정상적인 긴 goal 세션을 오종료하지 않을 만큼 넉넉하면서도,
 * 진짜 무한루프(버그·설계 오류로 스스로 계속 재점화)를 유계로 만드는 가드레일.
 */
export const MAX_CONSECUTIVE_AUTONOMOUS_TURNS = 100

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
   * idle-close 유예(grace) 타이머 핸들 (LR4 Phase 03).
   *
   * turn 경계에서 "살아있을 이유 없음" 판정이 나면 즉시 `_idleClosing`을 세우는 대신 이
   * 타이머를 스케줄한다(`_scheduleIdleGrace()`) — 만료 시점에 재확인 후에만 실제로
   * `_idleClosing`을 세운다. 유예 중 새 continuation(자율 or 사용자)이 도착하면 취소된다
   * (`_cancelIdleGrace()`). null이면 유예 대기 중이 아님(멱등 가드).
   *
   * `_idleClosing`/`_aborted`/`AbortController`/`PermissionCoordinator`와는 독립적인
   * 순수 타이머 상태 — abort()·finally에서 반드시 clear해 누수/좀비를 방지한다.
   */
  private _graceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 연속 자율(cron-origin) 턴 카운터 (LR4 Phase 03).
   *
   * turn 경계마다 origin==='cron'이면 증가, origin==='user'(push() 개입)면 0으로 리셋.
   * `MAX_CONSECUTIVE_AUTONOMOUS_TURNS`를 초과하면 강제종료(`autonomy_status`
   * `{status:'ended', reason:'cap-reached'}`) — 무인 무한반복을 유계로 만드는 가드레일.
   */
  private _consecutiveAutonomousTurns = 0

  /**
   * 현재 유예 창에서 `autonomy_status{status:'active'}`를 이미 방출했는지(중복 억제).
   *
   * 유예가 스케줄된 뒤 흡수되는 continuation마다 매번 'active'를 방출하면 잡음이 크다 —
   * 창(schedule~취소 1사이클)당 1회로 dedup한다. 유예가 새로 스케줄될 때(재-idle 판정)
   * false로 리셋된다.
   */
  private _autonomyActiveEmitted = false

  /**
   * idle-close commit 시점(LR4 Phase 02, `onSessionClosing()`으로 등록)에 정확히 1회,
   * 동기 호출되는 콜백. 호출 지점은 `_inputGen()`의 idle-close return 직전(단 한 곳)뿐 —
   * abort() 경로에서는 호출하지 않는다(abort는 자체 정리 경로 보유). 미등록이면 null.
   */
  private _onSessionClosing: (() => void) | null = null

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

  /**
   * 현재(및 이후) turn의 orchestration(UltraCode) 상태 (UC1-P02, ADR-032 ④).
   *
   * 세션 생성 시 req.orchestration으로 초기화되고, setOrchestration()으로 후속 턴마다
   * 갱신될 수 있다. permissionCoordinator.makeCanUseTool에는 이 필드를 직접 캡처하는
   * boolean이 아니라 `() => this._currentOrchestration` 게터로 넘겨, canUseTool이 호출될
   * 때마다 이 필드의 "그 순간" 값을 라이브로 읽게 한다(클로저 캡처 vs 라이브 참조).
   *
   * 배선(누가 setOrchestration()을 호출하는가)은 이 Phase의 범위 밖 — P03(00_ipc/
   * agent-runs.ts)이 같은 sessionKey의 후속 start() 라우팅 시 호출한다. 이 필드/메서드는
   * 그 배선이 꽂힐 지점만 제공한다.
   */
  private _currentOrchestration: boolean

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
    // UC1-P02(ADR-032 ④): 첫 턴(세션 생성) 값으로 초기화 — 이후 setOrchestration()으로 갱신.
    this._currentOrchestration = req.orchestration === true
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

    // LR4 P03: 대기 중인 idle-close 유예 타이머 누수 방지(정리 경로 4지점 중 하나).
    this._cancelIdleGrace()

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
   * 지속세션이 idle-close로 스스로 접히는 commit 시점에 호출될 콜백을 등록한다
   * (LR4 Phase 02, ADR-024 teardown).
   *
   * AgentRun.onSessionClosing 구현 — 등록된 콜백은 `_inputGen()`이 idle 사유로
   * return하기 직전 정확히 1회, 동기 호출된다. abort() 경로에서는 호출되지 않는다
   * (abort는 abortController.abort()+close로 이어지는 자체 정리 경로를 이미 보유).
   * 등록은 1개만 유지(마지막 등록만 유효 — 덮어쓰기).
   *
   * @param cb idle-close commit 시점에 호출될 콜백(인자 없음).
   */
  onSessionClosing(cb: () => void): void {
    this._onSessionClosing = cb
  }

  /**
   * 현재(및 이후) turn의 orchestration(UltraCode) 상태를 갱신한다(UC1-P02, ADR-032 ④).
   *
   * AgentRun.setOrchestration 구현 — `_currentOrchestration` 필드만 갱신한다. 이 필드는
   * permissionCoordinator.makeCanUseTool에 넘긴 게터(`() => this._currentOrchestration`)가
   * 매 canUseTool 호출마다 다시 읽으므로, 세션(query) 재생성 없이도 다음 canUseTool 호출부터
   * 즉시 반영된다.
   *
   * 호출 시점·빈도는 이 클래스의 관심사가 아니다(멱등 — 몇 번을 호출해도 마지막 값만 유효).
   * 배선(누가·언제 호출하는가)은 P03(00_ipc/agent-runs.ts)의 라우팅 로직 몫.
   *
   * @param value 이 시점 이후 턴의 orchestration 상태(true=허용 턴, false=비허용 턴).
   */
  setOrchestration(value: boolean): void {
    this._currentOrchestration = value
  }

  /**
   * 지속세션에 후속 user 메시지를 주입한다(ADR-024 Phase 2).
   *
   * 동작:
   *   1. _inputQueue에 content 적재.
   *   2. _pendingSends++ (origin 판정: 다음 done은 'user').
   *   3. (BF3-P03) _idleClosing이 서 있고 아직 완전히 닫히지 않았다면 강등을 취소.
   *   3b. (LR4 P03) 대기 중인 idle-close 유예 타이머를 취소 + 연속 자율 턴 카운터를
   *       리셋한다 — 사용자 개입은 "자율반복이 아니게 된" 신호이므로 상한 여유를 회복한다.
   *   4. _inputGen이 await 중이면 깨운다(_resolveInput 호출).
   *
   * 단발(비-persistent) 경로에서는 호출되지 않아야 하나, 호출돼도 _inputQueue에
   * 적재되기만 하고 부작용은 없다(방어적 no-harm).
   *
   * 멱등·안전: abort 후 호출해도 큐에 적재만 됨(이미 closed이면 _inputGen이 소비 전 종료).
   *
   * 신뢰경계: content는 renderer untrusted 문자열. 길이 제한 없음(SDK에 전달).
   *
   * ── BF3-P03: push μs창 봉합 ⓐ(01.Phases/BF3-backlog-sweep/03-push-race-window.md) ──
   *
   * 경합 창: 턴 경계 idle-close 판정(`_runPersistentPump`, `_idleClosing = true`)과
   * `_inputGen`이 실제로 그 플래그를 확인해 return하는 시점 사이에 push()가 도착하면,
   * 기존엔 큐에 적재만 되고 `_inputGen`은 플래그만 보고 return해 유실됐다(LR3-P02
   * reviewer 🟡-1). 봉합: push()가 그 순간의 `_idleClosing`을 직접 해제해 "강등 결정을
   * 취소"한다 — `_inputGen`이 아직 안 닫혔다면(`!_closed`) 다음 재확인에서 큐를 정상 소비.
   * `_inputGen` 쪽 재확인(ⓑ, 아래)과 이중 방어 — 어느 한쪽만으로도 닫히지만 함께 두면
   * push()가 언제 도착하든(래이스 유무 무관) 안전하다.
   *
   * 불변조건 보존: `_idleClosing`은 abort와 분리된 순수 강등 경로다(클래스 필드 주석 참고).
   * 이 해제 로직은 `_idleClosing` 필드만 건드리고 `_aborted`/`AbortController`/
   * `PermissionCoordinator`엔 절대 개입하지 않는다 — abort 중(=`_aborted===true`) 세션
   * 부활은 이 경로로 발생할 수 없다(abort는 `_close()`로 이미 `_closed=true`를 만들어
   * `!this._closed` 가드가 막는다 + 애초에 abort는 별도 플래그).
   */
  push(content: string): void {
    this._inputQueue.push(content)
    this._pendingSends++
    // BF3-P03 ⓐ: 아직 완전히 닫히지 않았다면 강등 취소(abort와 무관 — 순수 큐 상태 복구).
    if (this._idleClosing && !this._closed) {
      this._idleClosing = false
    }
    // LR4 P03: 대기 중인 idle-close 유예를 취소(사용자 continuation이 유예를 대체) +
    // 연속 자율 턴 카운터 리셋(사용자 개입 — 자율반복 상한 여유 회복).
    //
    // 취소 직후 곧바로 재스케줄하는 이유(안전성 근거 + 실측 확인): push() 직후에도 유예를
    // "완전히 꺼둔 채" 다음 turn 경계까지 방치하면, 이 사용자 turn이 실제로 처리돼 done이
    // 도달하기 전까지 타이머가 하나도 걸려 있지 않은 구간이 생긴다. 재확인 로직
    // (`_armGraceStep` 마지막 스텝의 `_pendingSends===0` 체크)이 있어 이 재스케줄된 유예가
    // *실제로 만료돼도* 방금 늘어난 `_pendingSends`(아직 처리 전) 때문에 절대 조기 종료로
    // 이어지지 않는다 — 순수하게 "카운트다운을 처음부터 다시" 시작하는 것과 동등하고, 오히려
    // "활동 직후에는 유예를 통째로 리셋한다"는 게 더 보수적인 idle 판정이다(부분 소진된
    // 유예를 그대로 흘려보내는 것보다 안전). qa 골든 테스트(lr4-p03-idle-grace.test.ts
    // 계약3 카운터 리셋 케이스)에서 이 재스케줄이 없으면 push() 이후 그 어떤 타이머도 대기
    // 중이지 않아, 중첩 `vi.advanceTimersByTimeAsync` 호출이 지연 없이 outer 목표(EXPIRE_MS)
    // 로 곧장 건너뛰어버려(`_armGraceStep` JSDoc의 동일 현상) 다음 SDK 메시지가 사실상
    // 도달하지 않는 것처럼 보이는 행 hang이 실측됐다(격리 재현: 경쟁 타이머가 전혀 없을 때
    // outer(10000)+nested(100) 중첩 호출은 nested가 100이 아니라 outer 목표+100에 resolve).
    this._cancelIdleGrace()
    // 이미 완전히 닫힌/중단된 run이면 재스케줄하지 않는다(불필요한 타이머 방지 — 어차피
    // `_armGraceStep` 콜백도 `_aborted`/`_closed`에서 조기 반환하지만, 애초에 걸지 않는
    // 편이 더 깔끔하다). 멱등·안전 성질은 그대로 — 이 가드가 없어도 안전하기만 하다.
    if (!this._closed && !this._aborted) {
      this._scheduleIdleGrace()
    }
    this._consecutiveAutonomousTurns = 0
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

  // ── idle-close 유예(grace) 관리 (LR4 Phase 03) ───────────────────────────────

  /**
   * idle-close 유예를 스케줄한다(이미 대기 중이면 멱등 — 재스케줄 안 함).
   *
   * 내부적으로 `IDLE_CLOSE_GRACE_MS` 전체를 한 번의 setTimeout으로 걸지 않고
   * `_armGraceStep()`으로 잘게 쪼개 자기 재스케줄한다(사유는 그 메서드 JSDoc — 가짜 타이머
   * 테스트 호환성, 실측 확인됨). 프로덕션(실 타이머)에서는 합계 지연이 동일하다
   * (`IDLE_CLOSE_GRACE_MS` 그대로) — 타이머 콜백 횟수만 소폭 늘 뿐.
   *
   * 만료 시점(마지막 스텝)에 재확인(`_pendingSends===0 && _inputQueue.length===0 &&
   * !hasLoopActivity()`)해 그 사이 상태가 바뀌지 않았을 때만 실제로 강등(`_idleClosing=true`
   * + input gen wake)한다 — 유예 동안 push()/continuation이 도착하면 이 타이머 자체가
   * 취소되므로 이 재확인은 방어적 이중 체크(타이머 취소 경합까지 닫는다).
   *
   * `_idleClosing`은 여기서 세우지 않는다(스케줄 시점) — 유예가 실제로 만료됐을 때만.
   * input gen wake도 스케줄 시점엔 하지 않는다(유예 중엔 input gen이 그대로 park해야
   * continuation이 올 여지가 있다 — wake하면 idle-close 재확인 분기를 조기에 태워버린다).
   */
  private _scheduleIdleGrace(): void {
    if (this._graceTimer !== null) return // 이미 대기 중 — 멱등
    // 새 유예 창 시작 — 그 창 안의 continuation 흡수 시 active 1회 방출을 위해 리셋.
    this._autonomyActiveEmitted = false
    this._armGraceStep(IDLE_CLOSE_GRACE_MS)
  }

  /**
   * 유예 잔여 시간(`remainingMs`)을 `IDLE_CLOSE_GRACE_STEP_MS` 단위로 소진한다.
   *
   * 왜 한 번의 큰 setTimeout이 아니라 잘게 쪼개는가(테스트 환경 한정, 실측 확인):
   * qa 골든 테스트(`lr4-p03-idle-grace.test.ts`)는 `vi.useFakeTimers()` +
   * `vi.advanceTimersByTimeAsync`로 유예를 제어하는데, 최상위(outer)에서 큰 델타
   * (`EXPIRE_MS=10000`)를 advance하는 도중, 엔진(mock) 쪽에서 비동기 hop을 거쳐 nested로
   * 짧은 델타(`GRACE_PROBE_MS=100`)를 advance하면, vitest의 가짜 타이머 구현이 이미 등록된
   * 가장 이른 타이머(우리의 유예 전체, 3000ms)를 nested 호출의 등록 여부와 무관하게 먼저
   * 통째로 진행시켜버리는 현상이 격리 재현(`vi.advanceTimersByTimeAsync` outer+inner 중첩
   * probe)으로 확인됐다 — nested가 자기 몫(100ms)을 요청한 시점이 outer의 "다음 타이머로
   * 점프" 판단보다 늦게 관측되면, nested는 100ms가 아니라 (그 타이머가 fire한 시각+100ms)에
   * resolve된다. 유예를 이 상수 단위 스텝으로 쪼개 반복 재스케줄하면 outer가 한 번에
   * 앞서가는 폭이 "다음 스텝"으로 줄어, nested 호출이 훨씬 이른 시점(실측: 총 유예
   * 3000ms 대비 수백 ms 내)에 자기 몫을 받는다 — continuation 흡수 검증이 유예 만료보다
   * 먼저 관측될 여지가 생긴다.
   *
   * 마지막 스텝(remainingMs 소진)에서만 실제 재확인 + 강등을 수행한다 — 중간 스텝은 순수
   * 카운트다운이다(활동 발생 시 취소는 항상 `_cancelIdleGrace()`가 외부[continuation 흡수
   * 체크·push()]에서 수행하므로, 중간 스텝 자체는 재확인이 불필요 — `hasLoopActivity()`는
   * SDK 메시지 처리 결과로만 바뀌고, 메시지 도착은 이미 그 외부 경로에서 취소를 유발한다).
   */
  private _armGraceStep(remainingMs: number): void {
    const step = Math.min(IDLE_CLOSE_GRACE_STEP_MS, remainingMs)
    this._graceTimer = setTimeout(() => {
      this._graceTimer = null
      if (this._aborted || this._closed) return
      const left = remainingMs - step
      if (left > 0) {
        this._armGraceStep(left)
        return
      }
      // 재확인: 유예 동안 push/continuation이 상태를 바꿨으면 close 안 함.
      if (this._pendingSends === 0 && this._inputQueue.length === 0 && !this._normalizer.hasLoopActivity()) {
        this._push({ type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
        this._idleClosing = true
        if (this._resolveInput) {
          const r = this._resolveInput
          this._resolveInput = null
          r()
        }
      }
    }, step)
  }

  /** 대기 중인 idle-close 유예 타이머를 취소한다(없으면 no-op — 멱등). */
  private _cancelIdleGrace(): void {
    if (this._graceTimer !== null) {
      clearTimeout(this._graceTimer)
      this._graceTimer = null
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
    // canUseTool early-allow 판정은 picker mode id(매핑 전 값)로 한다.
    // UC1-P02(ADR-032 ④): orchestration은 세션 생성 시 고정 캡처가 아니라 라이브 게터로
    // 넘긴다 — `_currentOrchestration`은 setOrchestration()으로 턴마다 갱신될 수 있고(배선은
    // P03이 agent-runs.ts에서 담당), 이 게터는 매 canUseTool 호출 시 그 순간의 값을 읽는다.
    const canUseTool = this._perm.makeCanUseTool(this._req.mode, () => this._currentOrchestration)
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
        // BF3-backlog-sweep P02: tool_use 실행 도중 interrupt() → SDK 스트림이 result 대신
        // throw로 귀결하는 잔여 경로. BF1 P03의 "result is_error emit" suppress는 *지속세션*
        // 펌프의 정규 루프에만 있고, 단발 펌프의 정규 루프(normEvents push 지점)에는 없다 —
        // 단발 emit 경로는 선재 미커버 갭(본 Phase는 throw 경로만, reviewer 🟡-1 기록).
        // _interrupted면 이 throw도 사용자 중단이 원인 — 위협적인 일반 에러 문구로
        // 오라벨하지 않고 done만 push(에러 이벤트 억제 — BF1 P03 suppress와 동일 설계,
        // 일반 에러 경로 error+done 쌍은 아래 기존 그대로). 원문은 로그로 보존(과잉억제
        // 시 관찰가능성, reviewer 🟡-2).
        if (this._interrupted) {
          console.warn(
            '[agents] interrupt 중 단발 펌프 throw 억제(문구 순화) — 원문:',
            err instanceof Error ? err.message : String(err)
          )
          this._push({ type: 'done' })
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
   *   - (BF3 Phase 03) _idleClosing이 서 있어도 return 직전 큐를 재확인한다(ⓑ, 아래).
   *
   * SDK는 이 generator에서 pull한 user 메시지를 순서대로 처리한다.
   * generator가 return하면(닫히면) SDK 세션도 자연 종료된다.
   *
   * 신뢰경계: content는 renderer untrusted string(_inputQueue에서 옴).
   * ADR-003: SDKUserMessage 형상(role/content/type/parent_tool_use_id)은 이 함수 내부에만.
   */
  private async *_inputGen(): AsyncGenerator<unknown> {
    while (true) {
      // abort는 idle-close와 분리된 최우선·무조건 종료 경로(LR3-P02 불변조건) — 재확인 없이
      // 즉시 return. push() ⓐ도 _closed 가드로 이 경로엔 개입하지 않는다(state 불변).
      if (this._aborted || this._abortController.signal.aborted) {
        return
      }

      // ── BF3-P03: push μs창 봉합 ⓑ(01.Phases/BF3-backlog-sweep/03-push-race-window.md) ──
      // "판정"(_idleClosing=true, _runPersistentPump 턴 경계)과 "행동"(여기 return) 사이의
      // 경합 창을 닫는 최후 방어선(push() ⓐ가 놓치는 경로가 있어도 여기서 다시 잡힌다).
      // return을 실행하기 직전, 정보가 가장 최신인 시점에 큐/pendingSends를 재확인
      // (double-check) — 재확인과 return 사이엔 다른 JS 코드가 끼어들 수 없으므로(동기
      // 실행, run-to-completion) 이 지점부터는 경합 창이 존재하지 않는다. 잔여가 있으면
      // 강등을 취소(플래그만 해제 — abort/AbortController/PermissionCoordinator 미개입,
      // LR3-P02 불변조건 그대로) 하고 정상 진행, 없으면 원래대로 종료한다.
      if (this._idleClosing) {
        if (this._inputQueue.length > 0 || this._pendingSends > 0) {
          this._idleClosing = false
        } else {
          // LR4 Phase 02: idle-close commit — run-manager에 원자 제거 신호(동기, return 직전).
          //   BF3-P03 이중체크(위 if)가 통과한 뒤이므로 racing push는 이미 강등을 취소했다.
          //   호출과 return 사이에 await/interleave 없음 = 원자적 commit.
          this._onSessionClosing?.()
          this._onSessionClosing = null
          return
        }
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

          // ── LR4 Phase 03: 유예(grace) 중 continuation 흡수 → active 방출 ──────
          // 유예가 대기 중(_graceTimer!==null)인데 새 msg가 도착 = 세션이 여전히 살아있다는
          // 실측 신호. 단, push()가 "취소 후 즉시 재스케줄"하므로(위 push() JSDoc)
          // 사용자 개입 이후에도 _graceTimer는 non-null로 유지된다 — 그 상태에서 SDK가
          // 유예 창 안에 응답하면 이 블록에 진입하지만, 그건 자율 continuation이 아니라
          // "사용자 turn의 응답 도착"이다. active의 계약 의미(agent-events.ts)는 자율
          // (cron-origin) 연속 턴 확인이므로, _pendingSends===0(=대기 중인 user push가
          // 없음, 이 msg가 자율 발동)일 때만 방출한다(reviewer LR4-P03 🟡#1 봉합).
          // 취소(_cancelIdleGrace)와 msg 정상 처리 흐름은 origin 무관하게 그대로 유지.
          if (this._graceTimer !== null) {
            this._cancelIdleGrace()
            if (!this._autonomyActiveEmitted && this._pendingSends === 0) {
              this._autonomyActiveEmitted = true
              this._push({ type: 'autonomy_status', status: 'active' })
            }
          }

          // ── turn 발원(origin) 판정 — process() 호출 *전* 스냅샷 ───────────────
          // origin-probe 실측: SDK는 user/cron 신호 미제공. 직렬 턴.
          // 판정: _pendingSends>0이면 user(push()로 주입된 turn), else cron(자율 발동).
          // BF3 Phase 04: 이 값을 normalizer.process()에도 전달한다 — CronTracker의
          // onTurnEnd() 턴 경계 판정(ScheduleWakeup 체인 종료 여부)이 "이번 턴이 사용자
          // 인터리빙인가"를 알아야 하기 때문(process() 내부에서 done 감지 시 즉시
          // onTurnEnd()를 호출하므로, done push 이후 재계산하면 이미 늦다). push()/_push()가
          // 둘 다 동기 함수라(await 없음) 이 스냅샷과 아래 done push 사이에 다른 push()가
          // 끼어들 수 없다 — 스냅샷 재사용은 안전하며, 재계산 중복(값 drift 위험)도 제거한다.
          const turnOrigin: 'user' | 'cron' = this._pendingSends > 0 ? 'user' : 'cron'

          // Phase 11: normalizer.process() 위임.
          const { events: normEvents, done } = this._normalizer.process(msg, turnOrigin)
          for (const e of normEvents) {
            // interrupt로 인한 result(is_error)는 turn 중단 신호 — 일반 error로 표면화 금지
            // (BF1-interrupt-loop P03, ADR-024: 세션 유지).
            if (this._interrupted && e.type === 'error') continue
            this._push(e)
          }
          if (done !== null) {
            // ── turn 경계: 위에서 스냅샷한 turnOrigin 재사용 + 즉시 push ────────
            if (this._pendingSends > 0) {
              this._pendingSends--
            }
            // done 즉시 push (F-B 보류 없음 — 지속세션은 turn마다 즉시 push)
            this._push({ ...done, origin: turnOrigin })
            // close 안 함 — input gen이 닫힐 때까지 루프 계속(held-open)
            // turn 경계마다 interrupt 플래그 리셋 — interrupt-result의 error+done은 같은
            // result msg에서 한 쌍으로 오므로, error suppress 후 done에서 리셋해야 다음
            // turn은 정상 error 표면화(BF1-interrupt-loop P03).
            if (this._interrupted) this._interrupted = false

            // ── LR4 Phase 03: 연속 자율(cron) 턴 상한(cap) 카운팅 ────────────────
            // 위에서 스냅샷한 turnOrigin 재사용 — 사용자 개입(push())이면 카운터를
            // 리셋하고, 자율 발동(cron)이면 증가시킨다. push() 자체도 즉시 리셋하지만
            // (사용자가 개입한 순간 바로 여유 회복), 여기선 "실제로 처리된 턴"의 origin
            // 기준으로 다시 한번 확정한다(둘 다 있어도 멱등 — 사용자 개입 없이 자율만
            // 이어지면 이 경로만 카운터를 올린다).
            if (turnOrigin === 'user') {
              this._consecutiveAutonomousTurns = 0
            } else {
              this._consecutiveAutonomousTurns++
            }

            if (turnOrigin === 'cron' && this._consecutiveAutonomousTurns >= MAX_CONSECUTIVE_AUTONOMOUS_TURNS) {
              // ── 상한 도달 — 무인 무한반복 방지 강제종료 ──────────────────────
              // 정상적인 사용자-개입 세션은 이 경로에 닿지 않는다(turnOrigin==='user'가
              // 오면 위에서 이미 0으로 리셋됨) — 순수 무인 연속 자율 턴만 억제한다.
              // 유예 판정(아래 else-if)은 건너뛴다 — cap 종료가 idle 종료보다 우선.
              //
              // 경계값(off-by-one, qa 계약3 실측 확정): `>=`(초과가 아니라 도달)로 판정한다
              // — MAX번째 연속 cron 턴이 done push된 *직후* 이 카운팅에서 강제종료가 발동해
              // (MAX+1)번째 턴은 아예 시작되지 않는다. 즉 실제로 완주되는 연속 자율 done은
              // 정확히 MAX개(101번째 시도는 유입 자체가 차단됨) — "MAX개 처리 후 (MAX+1)번째에서
              // 닫는다"(`>`)가 아니라 "MAX번째에서 닫는다"(`>=`)이다.
              this._push({ type: 'autonomy_status', status: 'ended', reason: 'cap-reached' })
              this._cancelIdleGrace()
              this._idleClosing = true
              // _inputGen이 대기 중이면 깨워 즉시 return시킨다(push()/idle-close와 동일
              // wake 관용구) — onSessionClosing→agent-runs 원자제거 경로는 기존 그대로.
              if (this._resolveInput) {
                const r = this._resolveInput
                this._resolveInput = null
                r()
              }
            } else if (this._pendingSends === 0 && !this._normalizer.hasLoopActivity()) {
              // ── LR3 Phase 02 + LR4 Phase 03: 턴 경계 idle 판정(유예 도입) ────────
              // "살아있을 이유"(미소비 pending user turn 또는 활성 루프[크론·armed
              // wakeup·등록 중 pending])가 없어도, 더 이상 즉시 닫지 않는다 — 짧은 유예
              // (IDLE_CLOSE_GRACE_MS)를 스케줄해 goal stop-hook의 다음 자율 continuation을
              // "활동"으로 흡수할 시간을 준다(자멸 방지, LR4 P03). 판정 자체(pendingSends/
              // hasLoopActivity 조건)는 LR3 P02와 동일 — 달라진 건 "즉시 강등" → "유예 후
              // 재확인 강등"뿐이다.
              this._scheduleIdleGrace()
            } else {
              // 활동/pending 있음 — 혹시 대기 중이던 유예가 있으면 취소(정상 held-open 지속).
              this._cancelIdleGrace()
            }
          }
        }
        // for-await 자연 종료 = input gen 닫힘(abort/세션종료)
        // abort 시에는 이미 _aborted=true이므로 가드로 처리됨
      } catch (err) {
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }
        // BF3-backlog-sweep P02: tool_use 실행 도중 interrupt() → SDK 스트림이 result 대신
        // throw로 귀결하는 잔여 경로(_runPump 동일 주석 참고). _interrupted면 위협적인 일반
        // 에러 문구로 오라벨하지 않고 done만 push — 정규 루프의 error suppress(~:628)와
        // 동일 설계다. 이 catch 도달 시 펌프는 finally에서 close되어 세션은 끝나지만(세션
        // 생존은 이 Phase 범위 밖 — BF1 P03이 잡은 "result emit" 경로와 달리 이 throw 경로는
        // 애초에 세션 유지가 불가능하다), 최소한 문구는 순화한다. 리셋은 이 run 인스턴스가
        // 곧 close되므로 실효는 없으나 상태 감사(신규 진입 방지) 목적으로 남긴다.
        if (this._interrupted) {
          console.warn(
            '[agents] interrupt 중 지속세션 펌프 throw 억제(문구 순화) — 원문:',
            err instanceof Error ? err.message : String(err)
          )
          this._interrupted = false
          this._push({ type: 'done' })
          return
        }
        const errMsg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Agent execution error: ${errMsg}` })
        this._push({ type: 'done' })
      }
    } finally {
      // LR4 P03: 유예 대기 중에 펌프 자체가 끝나는 경우(엔진 스트림이 우리 grace 판정보다
      // 먼저 자연 종료 — abort는 아님) — "더 이상 continuation이 오지 않는다"가 이미
      // 확정된 상태이므로 grace-expired와 동일 의미로 간주해 ended를 push한다. 유예 타이머가
      // 진짜로 fire할 때까지 기다리지 않는 이유: 스트림이 이미 끝나 기다릴 대상이 없다
      // (실측: qa 골든 테스트에서 엔진이 입력 스트림 상태와 무관하게 스스로 종료하는 경로가
      // 확인됨 — 프로덕션에서도 엔진 프로세스가 내부 사유로 먼저 끝날 수 있어 동일 로직이
      // 유효하다). abort 경로는 제외(abort()가 이미 자체 정리를 마쳤고 _graceTimer는 그때
      // 이미 clear됨 — 이 시점 재확인이 이중 방출을 만들지 않는다).
      const gracePendingAtExit = this._graceTimer !== null
      // 대기 중인 idle-close 유예 타이머 누수 방지(정상/에러/abort 무관 clear —
      // 정리 경로 4지점 중 하나). 펌프가 어떤 사유로든 끝나면 유예를 더 기다릴 이유가 없다.
      this._cancelIdleGrace()
      if (gracePendingAtExit && !this._aborted) {
        this._push({ type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
      }
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

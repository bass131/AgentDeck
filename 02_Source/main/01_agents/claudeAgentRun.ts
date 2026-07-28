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
 *   기존 events는 pull 제너레이터였다. 소비처(agentRuns.ts)가 `for await`로 당기고,
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
 * │ type:"system" session_state_changed  │ { type:"session_state", state }  │
 * │   (GAP1 P04, env 옵트인 시에만 방출)   │                                   │
 * │ type:"system" api_retry (GAP1 P04)   │ { type:"api_retry", attempt,      │
 * │                                       │   maxRetries, retryDelayMs, error?}│
 * │ type:"system" compact_boundary       │ { type:"compact", kind:"boundary",│
 * │   (GAP1 P04)                          │   trigger, preTokens, postTokens?}│
 * │ type:"system" status (GAP1 P04)      │ { type:"compact", kind:"status",  │
 * │                                       │   status:'compacting'|'requesting'│
 * │                                       │   |null }                         │
 * │ type:"system" status .permissionMode │ { type:"permission_mode",         │
 * │   (GAP1 P13 — compact 방출과 병행.    │   mode:<picker id> } (SDK→picker  │
 * │   'dontAsk'·미지값·필드 부재 = 미방출)│   역매핑은 claude-stream 내부)    │
 * │ type:"user" isReplay:true (GAP1 P04) │ [] (resume replay 중복 재방출 억제)│
 * │ type:"system" task_started/updated/  │ { type:"bg_task", kind:"started"| │
 * │   notification (GAP1 P09 — started/  │   "updated"|"notification", … }   │
 * │   notification은 orchestration_      │  + main 측 output 파일 증분 폴링  │
 * │   progress 기존 방출도 이중 유지)     │   (bgTaskTail.ts)이 kind:"output" │
 * │                                       │   조각을 합성(펌프가 push)        │
 * │ 기타 SDKMessage 타입                  │ [] (forward-compatible)           │
 * └──────────────────────────────────────┴───────────────────────────────────┘
 */

import { RunEventNormalizer, nextRunTag } from './eventNormalizer'
import { PermissionCoordinator } from './permissionCoordinator'
import { buildClaudeSdkOptions, makeRefusalFallbackHandler } from './sdkOptions'
import { getDefaultQueryFn, captureSupportedCommands } from './queryFn'
import { KNOWN_MODELS } from './runArgs'
import type { KnownModel } from './runArgs'
import { buildModelContextPrompt } from './buildPrompt'
import { BgTaskObserver } from './bgTaskObserver'
import { SendTokenLedger } from './sendTokenLedger'
import { IdleCloseGovernor } from './idleCloseGovernor'
import type { QueryFn, PersistentQueryFn } from './queryFn'
import type { AgentRun, AgentRunInput, RunResponse } from './AgentBackend'
import type { AgentEvent } from '../../shared/agentEvents'
import { MODEL_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW } from '../../shared/ipcContract'
import type { SlashCommandInfo } from '../../shared/ipcContract'

/**
 * idle-close 유예(grace) 시간(ms) — LR4 Phase 03.
 *
 * RS1 P06 ③에서 정의가 `idleCloseGovernor.ts`로 이동했다. 이 재수출(re-export)은
 * **공개 진입점 보존** 목적이다 — 기존 골든 테스트 여럿이 이 모듈 경로로 import한다
 * (gap1-p11-autonomous-done-theft.repro · gap1-p11-runmanager-session-routing 등).
 */
export { IDLE_CLOSE_GRACE_MS } from './idleCloseGovernor'

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
  // RS1 P03: 룩업 직전에 KNOWN_MODELS allowlist로 좁힌다.
  // shared의 MODEL_CONTEXT_WINDOW는 `Record<KnownModel, number>`로 조여져 있어
  // (shared/ipc/agent.ts:161) 임의 string 인덱싱이 TS7053 컴파일 에러다 — 이 가드가
  // untrusted 모델 id(string | undefined)를 KnownModel로 좁히는 narrowing을 담당한다.
  // 거동 불변 — 미전달/미등재 모델은 조임 전에도 MODEL_CONTEXT_WINDOW[model]이 undefined라
  // DEFAULT_CONTEXT_WINDOW로 폴백했고, 지금은 그 전에 undefined로 걸러질 뿐이다.
  const knownModel: KnownModel | undefined =
    model !== undefined && (KNOWN_MODELS as readonly string[]).includes(model)
      ? (model as KnownModel)
      : undefined
  const windowTokens =
    (knownModel !== undefined ? MODEL_CONTEXT_WINDOW[knownModel] : undefined) ??
    DEFAULT_CONTEXT_WINDOW
  return Math.max(windowTokens - CONTEXT_FALLBACK_RESERVE_TOKENS, 0)
}

/**
 * 라이브 권한 모드 전환의 picker id → SDK PermissionMode 매핑
 * (GAP1 P13 — 영호 박제 2026-07-14, 어댑터 내부 상수).
 *
 * ⚠ 세션 생성 경로 runArgs.ts의 MODE_TO_PERMISSION(auto→acceptEdits)과 **다르다** —
 * 라이브 전환은 SDK 'auto'(모델 분류기 승인, sdk.d.ts:2039) 모드를 그대로 쓴다.
 * run-args는 불변(세션 생성 경로 — 이 상수와 혼용 금지).
 *
 * 'bypass'(→bypassPermissions)·'dontAsk'는 의도적으로 없다 — 라이브 전환 금지
 * (세션 생성 시에만, 화이트리스트 강제는 main 핸들러 몫[CORE-01] · 어댑터는 매핑 부재로
 * 조용한 no-op 이중 방어). 역매핑(SDK→picker, status.permissionMode 관찰 방출)은
 * claudeStream.ts SDK_MODE_TO_PICKER — 쌍으로 유지한다.
 *
 * ADR-003: SDK 모드 리터럴('default' 등)은 이 상수(어댑터 내부)에만 — AgentBackend
 * 인터페이스는 picker id만 운반한다.
 */
const LIVE_MODE_PICKER_TO_SDK: Record<string, string> = {
  normal: 'default',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'auto',
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
  /**
   * 캡처된 SDK query 핸들. interrupt(턴 중단)·stopTask(백그라운드 태스크 정지, GAP1 P09)
   * 위임 대상. 엔진 고유 핸들 형상은 이 필드에만 격리(ADR-003) — stopTask의 반환은
   * SDK 버전에 따라 Promise일 수 있어 unknown으로 받는다(fire-and-forget).
   */
  private _queryHandle: {
    interrupt?: () => Promise<void>
    stopTask?: (taskId: string) => unknown
    /**
     * 라이브 권한 모드 전환 위임 대상 (GAP1 P13 — sdk.d.ts:2243, streaming input mode 한정).
     * 반환은 SDK 선언상 Promise<void>지만 버전·mock에 따라 다를 수 있어 unknown으로 받는다
     * (fire-and-forget — stopTask 관례 미러).
     */
    setPermissionMode?: (mode: string) => unknown
    /**
     * 라이브 모델 전환 위임 대상 (LM1 P02 — sdk.d.ts:2270, streaming input mode 한정).
     * 반환은 Promise일 수 있어 unknown으로 받는다(fire-and-forget — stopTask/setPermissionMode
     * 관례 미러).
     */
    setModel?: (model: string) => unknown
  } | null = null
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
   * 유휴 종료 거버너 (LR4 P03 · GAP1 P04b → RS1 P06 ③ `idleCloseGovernor.ts`로 분리).
   *
   * 유예(grace) 타이머 핸들·축1(session_state) 관측값·창당 active dedup 플래그는 **그
   * 모듈이 단독 소유**하고, 이 클래스는 인스턴스 하나를 들고 위임한다(상태 복제 금지).
   * 생성자에서 콜백 4개를 주입한다 — 거버너가 형제 모듈(장부·bg 관찰자·정규화기)을
   * 직접 참조하지 않게 하려는 결합 설계(근거는 그 모듈 헤더 JSDoc).
   *
   * 여기 남는 것: `_idleClosing`(강등 확정 플래그)은 입력 제너레이터의 종료 조건이자
   * push() 경합 창(BF3-P03)의 대상이라 **세션 수명 관심사**다 — 거버너는 그것을 직접
   * 만지지 않고 `onGraceCommit` 콜백으로 "접어도 된다"만 알린다.
   *
   * 위임 지점 6종: `scheduleGrace` · `cancelGrace`(정리 4지점 포함) · `isGracePending` ·
   * `absorbActivity`(유예 창 활동 흡수) · `observeSessionState` · `sessionStateGateOpen`.
   */
  private readonly _idleGovernor: IdleCloseGovernor

  /**
   * 연속 자율(cron-origin) 턴 카운터 (LR4 Phase 03).
   *
   * turn 경계마다 origin==='cron'이면 증가, origin==='user'(push() 개입)면 0으로 리셋.
   * `MAX_CONSECUTIVE_AUTONOMOUS_TURNS`를 초과하면 강제종료(`autonomy_status`
   * `{status:'ended', reason:'cap-reached'}`) — 무인 무한반복을 유계로 만드는 가드레일.
   */
  private _consecutiveAutonomousTurns = 0

  /**
   * idle-close commit 시점(LR4 Phase 02, `onSessionClosing()`으로 등록)에 정확히 1회,
   * 동기 호출되는 콜백. 호출 지점은 `_inputGen()`의 idle-close return 직전(단 한 곳)뿐 —
   * abort() 경로에서는 호출하지 않는다(abort는 자체 정리 경로 보유). 미등록이면 null.
   */
  private _onSessionClosing: (() => void) | null = null

  /**
   * send-token 턴 귀속 회계 (GAP1 P11 → RS1 P06 ② `sendTokenLedger.ts`로 분리).
   *
   * 장부 상태(seq 발급기·queued FIFO·delivered·owned·anchored)는 **그 모듈이 단독
   * 소유**하고, 이 클래스는 인스턴스 하나를 들고 위임만 한다(상태 복제 금지).
   * 설계 근거(옛 `_pendingSends` 카운터의 결함과 token 수명 봉합 원리)는 모듈
   * 헤더 JSDoc이 정본 — 여기 중복 기재하지 않는다.
   *
   * 위임 지점 6종: `issue`(push()/초기 적재) · `deliverNext`(_inputGen pull) ·
   * `anchorIfEligible`(펌프 첫 턴귀속 메시지) · `hasOwnedToken`(turnOrigin 판정) ·
   * `completeTurn`(done 경계) · `outstandingCount`(idle-close 게이트 6곳).
   *
   * 단발 경로에서는 사용되지 않는다(장부가 초기값에 머문다 = 기존 동작 회귀 0).
   *
   * ── GAP1 P04: 상태 전이표 — pendingSends 겸직 책임의 5축 분해 ──────────────────
   *
   * pendingSends(+_inputQueue/_idleClosing/_graceTimer/hasLoopActivity 등)는 지금까지
   * 서로 다른 "왜 바뀌는가"를 가진 여러 판정을 한 카운터에 얹어 왔다. GAP1 P04(session_state_
   * changed 정규화)를 계기로 책임을 5축으로 명시 분해한다 — 카운터를 쪼갠 게 아니라
   * *어느 축이 무엇의 권위인지*를 문서로 못박는다(코드 변경 없이 관측 가능한 사실 정리).
   *
   * ┌───┬──────────────────────────┬───────────────────────────────────────────────┐
   * │축 │ 책임                     │ 권위 소스 / 현황                               │
   * ├───┼──────────────────────────┼───────────────────────────────────────────────┤
   * │ 1 │ SDK 실행 상태            │ session_state(idle/running/requires_action) —  │
   * │   │ (idle/running)           │ **수신 시 권위(안전 교집합 결합, GAP1 P04b)**. │
   * │   │                          │ 신호 수신 세션(_sessionStateSeen===true)에서만 │
   * │   │                          │ idle-close 예약/커밋에 참여 — 조건: 최신       │
   * │   │                          │ (latest-wins) _lastSessionState==='idle' ∧    │
   * │   │                          │ 로컬 큐 empty(outstanding send-token 0) ∧      │
   * │   │                          │ !hasLoopActivity(). 미수신 세션(옵트인 미도달· │
   * │   │                          │ 구버전 SDK)은 이 축이 관측 불가 — 아래 2~5축   │
   * │   │                          │ (기존 fallback)이 바이트 동일하게 판정한다.    │
   * │   │                          │ latest-wins는 스트림 도착 순서 기준(idle→running│
   * │   │                          │ 역전만 결정론적 고정) — 완전 역전(새 턴 running │
   * │   │                          │ 관찰 후 이전 턴 늦은 idle 도착)은 turn-id 부재로│
   * │   │                          │ 순수 스트림 순서만으론 구별 불가(스코프 경계,   │
   * │   │                          │ 아래 `_lastSessionState` 필드 JSDoc 참고).      │
   * │   │                          │ **Wave2c 봉합(reviewer 실측 회귀)**: 트리거는   │
   * │   │                          │ 이제 2곳 병존한다 — (a) done 경계 게이트(위    │
   * │   │                          │ 조건, done 발생 그 순간 재확인) + (b) idle 신호│
   * │   │                          │ **관찰 지점 자체**(1차 트리거, 관찰 즉시 재평가│
   * │   │                          │ 후 재스케줄). 근거: 실 SDK 순서(fixture 실측,  │
   * │   │                          │ probe-2b-session-state-env.jsonl)는 running(별 │
   * │   │                          │ 개 system msg)→result(done)→idle(별개 system  │
   * │   │                          │ msg, done *뒤*)라 (a)만으로는 done 시점 이후에 │
   * │   │                          │ 도착하는 이 늦은 idle을 영영 못 잡는다 — (b)가 │
   * │   │                          │ 없으면 무활동 턴이 idle-close 안 되는 회귀(LR4 │
   * │   │                          │ P03 취지 위반). `_scheduleIdleGrace()` 멱등    │
   * │   │                          │ 가드(`_graceTimer!==null`이면 no-op)가 (a)(b)  │
   * │   │                          │ 이중 예약을 막아 같은 grace를 공유한다.        │
   * │ 2 │ 로컬 입력 큐 직렬화      │ _inputQueue·_queuedSendSeqs(push 적재 순서) —  │
   * │   │                          │ GAP1 P11: 카운터→seq FIFO 정밀화(1:1 동기).    │
   * │ 3 │ turn origin(user·cron)   │ send-token owned 여부(GAP1 P11 교체) —         │
   * │   │                          │ hasOwnedToken()이면 user, else cron. done      │
   * │   │                          │ 도착시점 카운터 재계산 폐기 → epoch 시작시점   │
   * │   │                          │ ANCHOR(`anchorIfEligible()`)로 고정.           │
   * │ 4 │ 자율 루프                │ _idleClosing·_graceTimer·MAX_CONSECUTIVE_      │
   * │   │ (idle-close grace·cap)   │ AUTONOMOUS_TURNS·autonomy_status — 기존 존치,  │
   * │   │                          │ 변경 없음. 축1은 grace 예약/재검증에 조건 하나 │
   * │   │                          │ 를 얹을 뿐 — GRACE_MS 타이밍·cap 카운팅은      │
   * │   │                          │ 불변.                                          │
   * │ 5 │ background liveness      │ hasLoopActivity()(CronTracker)·BL1 P03         │
   * │   │                          │ staleWatchdog(renderer) — 기존 존치, 변경 없음.│
   * └───┴──────────────────────────┴───────────────────────────────────────────────┘
   *
   * ⚠️ RS1 P06 이후 표의 필드명 읽는 법(의미 불변, 소유자만 이동): 축1의
   * `_sessionStateSeen`·`_lastSessionState`와 축4의 `_graceTimer`·`_scheduleIdleGrace()`는
   * 이제 `IdleCloseGovernor`(idleCloseGovernor.ts)의 동명 상태·메서드다. 축2의
   * `_queuedSendSeqs`와 축3의 owned/ANCHOR는 `SendTokenLedger`(sendTokenLedger.ts),
   * 축4의 bg-task 게이트는 `BgTaskObserver`(bgTaskObserver.ts)가 소유한다. 축4의
   * `_idleClosing`·`MAX_CONSECUTIVE_AUTONOMOUS_TURNS`만 이 클래스에 남았다.
   *
   * 불변식(회귀 0 조건, GAP1 P04b 완료 기준): session_state가 스트림에 없는 경로(옵트인
   * env 미도달·구버전 SDK)에서 2~5축의 idle-close 거동은 이 Phase 이전과 바이트 동일하다
   * (_sessionStateSeen===false 세션은 fallback 그대로 — 축 1은 아직 "축1은 관측만" 시절의
   * 문구가 아니라 실제로 조건에 참여하지만, 미수신 세션에는 애초에 관여할 신호가 없다).
   * 신호 수신 세션에서만 축 1이 안전 교집합(∧ 결합)으로 idle-close 결정에 참여한다 —
   * 2~5축의 기존 조건을 대체하지 않고 그 위에 조건 하나를 더 얹을 뿐이다(이중 idle 판정
   * 충돌 회피: 큐 empty ∧ !hasLoopActivity() 조건은 여전히 필수 전제, 축1은 추가 게이트).
   */
  private readonly _sendTokens = new SendTokenLedger()

  /**
   * 장부 queued FIFO의 **라이브 뷰**(RS1 P06 ② — 이름·형상 보존 지점).
   *
   * 존재 이유 둘:
   *  1. `_inputQueue`(내용)와 send-token queued FIFO의 인덱스 1:1 동기는 *큐 내용을 아는
   *     이 클래스*만 검사할 수 있는 불변식이다 — `_inputGen`의 dev-assert(GAP1 P12 동봉2)가
   *     pull 직전에 이 길이를 읽는다.
   *  2. gap1-p12 §4 C-2가 "공개 API로 도달 불가한 desync"를 `run._queuedSendSeqs`로 주입한다
   *     (테스트 한정 private 접근 — 그 Phase가 명시 허용). 분리 후에도 그 seam이 같은 이름·
   *     같은 배열 객체를 가리키게 유지해 **기존 테스트 무수정 green**을 보존한다.
   *
   * 복제가 아니라 장부가 소유한 그 배열 자체를 가리킨다(값 복사 금지 — 두 진실 방지).
   */
  private get _queuedSendSeqs(): number[] {
    return this._sendTokens.queuedSeqs
  }

  /**
   * 백그라운드 태스크 관찰자 (GAP1 P09 → RS1 P06 ① `bgTaskObserver.ts`로 분리).
   *
   * 활성 태스크 레지스트리·output 파일 tail 핸들·idle-close 게이트를 **그 모듈이
   * 단독 소유**하고, 이 클래스는 인스턴스 하나를 들고 위임만 한다(상태 복제 금지).
   * 외부 의존은 push 콜백 하나 — 생성자에서 this._push를 주입한다(_perm과 동형).
   *
   * 위임 지점 4종: `maybeStartTail`(원시 tool_result 관측) · `observeEvent`(정규화된
   * bg_task 관측) · `gateOpen`(idle-close 유예 스케줄/커밋의 ∧ 결합 항) ·
   * `stopAll`(abort/펌프 종료 정리 — 타이머 누수 0).
   */
  private readonly _bgTaskObserver: BgTaskObserver

  /**
   * 현재(및 이후) turn의 orchestration(UltraCode) 상태 (UC1-P02, ADR-032 ④).
   *
   * 세션 생성 시 req.orchestration으로 초기화되고, setOrchestration()으로 후속 턴마다
   * 갱신될 수 있다. permissionCoordinator.makeCanUseTool에는 이 필드를 직접 캡처하는
   * boolean이 아니라 `() => this._currentOrchestration` 게터로 넘겨, canUseTool이 호출될
   * 때마다 이 필드의 "그 순간" 값을 라이브로 읽게 한다(클로저 캡처 vs 라이브 참조).
   *
   * 배선(누가 setOrchestration()을 호출하는가)은 이 Phase의 범위 밖 — P03(00_ipc/
   * agentRuns.ts)이 같은 sessionKey의 후속 start() 라우팅 시 호출한다. 이 필드/메서드는
   * 그 배선이 꽂힐 지점만 제공한다.
   */
  private _currentOrchestration: boolean

  /**
   * 현재(및 이후) 도구 요청 판정에 쓰이는 권한 모드 picker id (GAP1 P13 — 라이브 모드).
   *
   * null = 라이브 전환/엔진 통지가 아직 없음 → `_req.mode`(세션 생성 시 모드)로 폴백.
   * canUseTool에는 이 필드를 고정 캡처한 string이 아니라
   * `() => this._currentModeId ?? this._req.mode` 게터로 넘겨, 매 도구 요청마다
   * "그 순간"의 모드를 라이브로 읽게 한다(UC1-P02 `_currentOrchestration` 게터 선례 —
   * 생성 시점 고정 캡처가 dogfood 결함 A의 어댑터측 원인이었다).
   *
   * 갱신 지점 2곳:
   *  1. `setPermissionMode(modeId)` — 사용자 라이브 전환(호출 즉시 적용·이후 도구
   *     요청부터 반영, Phase 스카우트 실측과 동일 의미론).
   *  2. 펌프의 `permission_mode` 이벤트 관찰 — 엔진이 진실(SDK status.permissionMode
   *     통지, plan 승인 착지 acceptEdits가 로컬 판정에 반영되는 경로).
   *
   * 어휘는 항상 picker id('normal'|'plan'|'acceptEdits'|'auto'|'bypass') — SDK 모드
   * 리터럴은 이 필드에 절대 넣지 않는다(canUseTool 판정이 picker id 기준, ADR-003).
   */
  private _currentModeId: string | null = null

  /**
   * 현재(및 이후) turn에 적용 중인 모델 picker id (LM1 P02 — 라이브 모델 전환).
   *
   * 생성 시 `req.model ?? null`로 시드된다 — **항상 사용자 의도값**이다. 갱신 지점은
   * `setModel(modelId)` 딱 하나뿐(모드의 "엔진 통지 관찰" 2번째 갱신 지점이 모델엔 없다 —
   * 모델은 역통지 이벤트가 없다). model-fallback(엔진이 자체 판단으로 모델을 바꾸는 경우,
   * 예: refusal 시 Opus 전환 — agentEvents.ts:535 배너)을 관측했다고 이 필드를 절대
   * 무효화/갱신하지 않는다 — 그러면 P03 재사용 안전망이 다음 턴에 사용자 의도값으로
   * 되돌려 배너("이후 대화도 Opus로")를 배신한다.
   *
   * change-guard(`setModel` 안의 `modelId === this._currentModel`)의 대조 대상이자,
   * reject 롤백(setModel 참고)의 복원 대상.
   */
  private _currentModel: string | null

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
    // LM1-P02: 세션 생성 모델(사용자 의도값)로 시드 — 이후 setModel()로만 갱신.
    this._currentModel = req.model ?? null
    // 권한 코디네이터: push 콜백 주입(close 가드 포함 _push 경유 → 늦은 이벤트 차단 동일).
    this._perm = new PermissionCoordinator((e) => this._push(e))
    // RS1 P06 ①: 백그라운드 태스크 관찰자 — tail 조각도 같은 close 가드(_push)를 탄다.
    this._bgTaskObserver = new BgTaskObserver((e) => this._push(e))
    // RS1 P06 ③: 유휴 종료 거버너 — 거버너 밖 축(장부·입력 큐·루프 활동·bg 태스크)은
    // 여기서 조합해 콜백 하나로 주입한다(거버너는 형제 모듈을 직접 참조하지 않는다).
    this._idleGovernor = new IdleCloseGovernor({
      emit: (e) => this._push(e),
      isRunActive: () => !this._aborted && !this._closed,
      externalGatesOpen: () =>
        this._sendTokens.outstandingCount() === 0 &&
        this._inputQueue.length === 0 &&
        !this._normalizer.hasLoopActivity() &&
        this._bgTaskObserver.gateOpen(),
      onGraceCommit: () => {
        // 강등 확정은 이 클래스의 몫(세션 수명 관심사) — 플래그 + input gen wake.
        this._idleClosing = true
        if (this._resolveInput) {
          const r = this._resolveInput
          this._resolveInput = null
          r()
        }
      },
    })
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
        // 반환 Promise의 reject도 흡수(stopTask 미러) — unhandledRejection 누수 방지(P15 S1).
        void Promise.resolve(this._queryHandle.interrupt()).catch(() => {})
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
    this._idleGovernor.cancelGrace()

    // GAP1 P09: 활성 백그라운드 tail 폴러 전량 정지 + 레지스트리 정리(타이머 누수 0).
    this._bgTaskObserver.stopAll()

    // 큐 close → events가 남은 이벤트 drain 후 종료 (hang 없음)
    this._close()
  }

  /**
   * 백그라운드 태스크 정지 요청 (GAP1 P09) — AgentRun.stopTask 구현.
   *
   * 캡처된 query 핸들의 stopTask(taskId)로 위임한다(엔진 고유 핸들 형상은
   * `_queryHandle` 필드에만 격리, ADR-003). fire-and-forget — 결과를 기다리지 않고,
   * 실제 종료는 SDK가 task_notification(→ bg_task kind:'notification')으로 통지한다.
   *
   * 멱등·안전: 핸들 미캡처(펌프 시작 전)/핸들에 stopTask 없음(구버전 SDK·mock)/
   * 호출 중 예외/reject 전부 조용히 삼킨다(예외 없음 — qa 골든 대조군 핀).
   */
  stopTask(taskId: string): void {
    const handle = this._queryHandle
    if (!handle || typeof handle.stopTask !== 'function') return
    try {
      // 반환이 Promise면 reject도 흡수(fire-and-forget — unhandled rejection 방지).
      void Promise.resolve(handle.stopTask(taskId)).catch(() => {})
    } catch {
      // 동기 throw도 조용히 무시(멱등·no-throw 계약).
    }
  }

  /**
   * 진행 중 세션의 권한 모드 라이브 전환 (GAP1 P13) — AgentRun.setPermissionMode 구현.
   *
   * 두 갈래 동시 수행(둘 다 fire-and-forget):
   *  1. **어댑터 내부 즉시 갱신** — `_currentModeId = modeId`. canUseTool 라이브 게터가
   *     다음 도구 요청부터 이 값을 읽어 로컬 판정(auto 조기허용 등)에 즉시 반영된다.
   *  2. **SDK 위임** — 캡처된 query 핸들의 `setPermissionMode(sdkMode)`(sdk.d.ts:2243,
   *     streaming input mode 한정). picker id → SDK 모드 매핑은 `LIVE_MODE_PICKER_TO_SDK`
   *     (어댑터 내부 상수 — ⚠ run-args의 세션 생성 매핑과 다름, auto→'auto' 그대로).
   *
   * 멱등·안전(stopTask 미러 — qa 대조군 핀):
   *  - 단발(비-persistent) run → **전체 조용한 no-op**(내부 상태도 미갱신) — SDK JSDoc상
   *    streaming input 한정이라 위임 불가이고, 단발 판정 모드는 세션 생성 값이 정본.
   *  - 매핑 불가 modeId('bypass'·'dontAsk'·미지값) → 조용한 no-op(화이트리스트 강제는
   *    main 핸들러[CORE-01], 여기는 이중 방어).
   *  - 핸들 미캡처(펌프 시작 전)/핸들에 setPermissionMode 없음(구버전 SDK·mock) →
   *    내부 갱신만 수행, 위임은 skip(예외 없음). 실제 반영 정본은 어차피 엔진 통지
   *    (`permission_mode` 이벤트)다.
   *  - 핸들 호출 동기 throw/Promise reject → 전부 조용히 삼킨다(no-throw 계약).
   *
   * @param modeId 전환할 권한 모드 picker id ('normal'|'plan'|'acceptEdits'|'auto')
   */
  setPermissionMode(modeId: string): void {
    // SDK setPermissionMode는 streaming input mode(held-open) 한정 — 단발 경로는 위임도
    // 내부 갱신도 하지 않는다(Phase 함정 항목: 잘못 배선하면 미지원 경로).
    if (this._req.persistent !== true) return
    const sdkMode = LIVE_MODE_PICKER_TO_SDK[modeId]
    if (sdkMode === undefined) return // 매핑 불가 picker id — 조용한 no-op(이중 방어)
    // 1. 내부 "현재 모드" 즉시 갱신 — 호출 즉시 적용·이후 도구 요청부터 반영.
    this._currentModeId = modeId
    // 2. SDK 위임 — 핸들 미캡처/미지원이면 skip(내부 갱신은 이미 완료 — 유실 없음).
    const handle = this._queryHandle
    if (!handle || typeof handle.setPermissionMode !== 'function') return
    try {
      // 반환이 Promise면 reject도 흡수(fire-and-forget — unhandled rejection 방지).
      void Promise.resolve(handle.setPermissionMode(sdkMode)).catch(() => {})
    } catch {
      // 동기 throw도 조용히 무시(멱등·no-throw 계약 — stopTask 미러).
    }
  }

  /**
   * 진행 중 세션의 모델 라이브 전환 (LM1 P02) — AgentRun.setModel 구현.
   *
   * setPermissionMode(:692)와 동형 골격이되, 모델 고유 비대칭 1건(reject 롤백)이 있다.
   * 순서(Phase 정본, 임의 변경 금지):
   *  ① 비지속(단발) run → 조용한 no-op.
   *  ② KNOWN_MODELS(runArgs.ts:32) 밖 id → 조용한 no-op(이중 방어 — main 핸들러가 1차).
   *  ③ change-guard — `modelId === this._currentModel`이면 no-op(멱등, P03 재사용
   *     안전망이 매 턴 무조건 호출해도 평상시 비용 0).
   *  ④ **핸들 미캡처/미지원 시엔 `_currentModel`을 갱신하지 않고 반환** — setPermissionMode와의
   *     의도적 차이. 모드는 진실이 엔진 통지(permission_mode 이벤트)라 내부값이 먼저
   *     바뀌어도 무해하지만, 모델은 그런 역통지가 없어 "위임이 실제로 시도됐는지"가 곧
   *     진실이다. 만약 여기서도 먼저 갱신해버리면, 핸들 미캡처 상태에서 들어온 호출이
   *     change-guard를 조용히 "성공"으로 오염시켜, 핸들 확보 후 같은 값 재호출이
   *     no-op 처리되며 실제로는 SDK에 한 번도 전달되지 않는 영구 드리프트가 생긴다.
   *  ⑤ 위임 성공 경로 — `prev`(직전 값) 보관 후 `_currentModel = modelId` 갱신, 이어서
   *     `handle.setModel(modelId)` fire-and-forget(no-throw).
   *  ⑥ **reject 롤백(모드와의 유일한 의도적 비대칭)** — 위임 프로미스가 reject되면
   *     `_currentModel`이 그 사이 다른 성공 전환으로 이미 갱신되지 않았을 때만(현재값이
   *     여전히 이번 modelId일 때만) `prev`로 되돌린다. 모델은 역통지 이벤트가 없어
   *     실패를 스스로 알 방법이 없으므로, 롤백이 다음 턴 P03 재사용 안전망의 재시도를
   *     살리는 유일한 장치다(change-guard가 실패를 성공으로 가리지 않게 함).
   *
   * ⚠ model-fallback(엔진이 자체 판단으로 모델을 바꾸는 경우, 예: refusal 시 Opus 전환)을
   *   관측하는 경로에서는 이 메서드를 호출하지도, `_currentModel`을 건드리지도 않는다 —
   *   `_currentModel`은 항상 *사용자 의도값*(필드 JSDoc 참고).
   *
   * @param modelId 전환할 모델 picker id ('opus'|'sonnet'|'haiku'|'fable')
   */
  setModel(modelId: string): void {
    // ① SDK setModel도 streaming input mode(held-open) 한정 — 단발 경로는 완전 no-op.
    if (this._req.persistent !== true) return
    // ② allowlist 이중 방어 — picker id를 SDK에 원문 전달하되, 미지 id는 걸러낸다.
    //    (매핑 테이블은 만들지 않는다 — runArgs.ts:147-149 선례, 모드와 다르다.)
    if (!(KNOWN_MODELS as readonly string[]).includes(modelId)) return
    // ③ change-guard — 같은 값 재호출은 멱등하게 삼킨다.
    if (modelId === this._currentModel) return
    // ④ 핸들 미캡처/미지원 → _currentModel은 건드리지 않고 반환(위 JSDoc ④ 참고).
    const handle = this._queryHandle
    if (!handle || typeof handle.setModel !== 'function') return
    // ⑤ 갱신 + 위임.
    const prev = this._currentModel
    this._currentModel = modelId
    try {
      // 반환이 Promise면 reject도 흡수하되, 흡수 시 ⑥ 조건부 롤백을 수행.
      void Promise.resolve(handle.setModel(modelId)).catch(() => {
        // 그 사이 다른 성공 전환이 값을 덮어쓰지 않았을 때만 되돌린다.
        if (this._currentModel === modelId) this._currentModel = prev
      })
    } catch {
      // 동기 throw도 no-throw 계약대로 흡수 + 즉시 롤백(위임 자체가 일어나지 않았음).
      if (this._currentModel === modelId) this._currentModel = prev
    }
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
        // 반환 Promise의 reject도 흡수(stopTask 미러) — unhandledRejection 누수 방지(P15 S1).
        void Promise.resolve(this._queryHandle.interrupt()).catch(() => {})
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
   * 배선(누가·언제 호출하는가)은 P03(00_ipc/agentRuns.ts)의 라우팅 로직 몫.
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
   *   2. send-token seq 발급 + queued 상태로 적재(GAP1 P11 — origin 판정은 이 token이
   *      나중에 owned로 승격되는지로 결정, 더 이상 카운터 재계산 아님).
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
   * ── BF3-P03: push μs창 봉합 ⓐ(01_Phases/BF3-backlog-sweep/03-push-race-window.md) ──
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
    // GAP1 P11: send-token queued 상태 발급 — _inputQueue와 인덱스 1:1 동기.
    this._sendTokens.issue()
    // BF3-P03 ⓐ: 아직 완전히 닫히지 않았다면 강등 취소(abort와 무관 — 순수 큐 상태 복구).
    if (this._idleClosing && !this._closed) {
      this._idleClosing = false
    }
    // LR4 P03: 대기 중인 idle-close 유예를 취소(사용자 continuation이 유예를 대체) +
    // 연속 자율 턴 카운터 리셋(사용자 개입 — 자율반복 상한 여유 회복).
    //
    // 취소 직후 곧바로 재스케줄하는 이유(안전성 근거): push() 직후에도 유예를 "완전히 꺼둔
    // 채" 다음 turn 경계까지 방치하면, 이 사용자 turn이 실제로 처리돼 done이 도달하기 전까지
    // 타이머가 하나도 걸려 있지 않은 구간이 생긴다. 만료 콜백의 재확인(`_outstandingSendCount()
    // ===0` 체크, GAP1 P11)이 있어 이 재스케줄된 유예가 *실제로 만료돼도* 방금 발급한 queued
    // token(아직 처리 전) 때문에 절대 조기 종료로 이어지지 않는다 — 순수하게 "카운트다운을 처음부터 다시"
    // 시작하는 것과 동등하고, 오히려 "활동 직후에는 유예를 통째로 리셋한다"는 게 더 보수적인
    // idle 판정이다(부분 소진된 유예를 그대로 흘려보내는 것보다 안전).
    //
    // (BL1-P02 정리) 이 재스케줄 로직 자체는 step-splitting 시절과 동일하게 유지된다 — 바뀐
    // 건 유예를 "단일 setTimeout(IDLE_CLOSE_GRACE_MS)"로 거는 내부 구현뿐(설계 메모:
    // `01_Phases/16_BL1-backlog-closeout/02-grace-timer-cleanup.md` 완료 시 결과 기록).
    // qa 쪽 fake-timer 중첩 advance 아티팩트(옛 `_armGraceStep` JSDoc이 다루던 문제)는 테스트
    // 재구성(비중첩 clock 진행 + barrier 프로토콜) 몫으로 이관 — production 코드는 더 이상
    // 테스트 환경의 타이머 세부를 신경 쓰지 않는다.
    this._idleGovernor.cancelGrace()
    // 이미 완전히 닫힌/중단된 run이면 재스케줄하지 않는다(불필요한 타이머 방지 — 어차피 만료
    // 콜백도 `_aborted`/`_closed`에서 조기 반환하지만, 애초에 걸지 않는 편이 더 깔끔하다).
    // 멱등·안전 성질은 그대로 — 이 가드가 없어도 안전하기만 하다.
    if (!this._closed && !this._aborted) {
      this._idleGovernor.scheduleGrace()
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
  //
  // RS1 P06 ③: 이 관심사의 구현 전체(유예 타이머·축1 게이트 술어·창당 active dedup·
  // GRACE_MS 상수)는 `idleCloseGovernor.ts`로 이관됐다. 이 클래스에는 호출 지점(위임)만
  // 남는다 — `this._idleGovernor.{scheduleGrace|cancelGrace|isGracePending|
  // absorbActivity|observeSessionState|sessionStateGateOpen}`. 만료 재확인에 쓰이는
  // 거버너 밖 축 4종은 생성자에서 `externalGatesOpen` 콜백 하나로 묶어 주입한다.

  // ── 백그라운드 태스크 tail·idle-close 게이트 (GAP1 P09) ─────────────────────────
  //
  // RS1 P06 ①: 이 관심사의 구현 전체(레지스트리·tail 배선·게이트 술어·경로 추출)는
  // `bgTaskObserver.ts`로 이관됐다. 이 클래스에는 호출 지점(위임)만 남는다 —
  // `this._bgTaskObserver.{maybeStartTail|observeEvent|gateOpen|stopAll}`.

  // ── send-token 턴 귀속 회계 (GAP1 P11) ────────────────────────────────────────
  //
  // RS1 P06 ②: 이 관심사의 구현 전체(seq 발급·상태 전이·ANCHOR 자격 판정·미완료
  // 집계)는 `sendTokenLedger.ts`로 이관됐다. 이 클래스에는 호출 지점(위임)만 남는다 —
  // `this._sendTokens.{issue|deliverNext|anchorIfEligible|hasOwnedToken|completeTurn|
  // outstandingCount}`.

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
    // P03이 agentRuns.ts에서 담당), 이 게터는 매 canUseTool 호출 시 그 순간의 값을 읽는다.
    // GAP1 P13: mode도 동일하게 라이브 게터로 — 옛 `this._req.mode` 고정 캡처는 진행 중
    // 세션의 모드 전환(setPermissionMode)·엔진 통지(permission_mode)가 canUseTool 판정에
    // 영영 반영되지 않는 dogfood 결함 A의 어댑터측 원인이었다. `_currentModeId`(라이브
    // 전환/엔진 통지로 갱신)가 있으면 그것을, 없으면 세션 생성 모드로 폴백한다.
    const canUseTool = this._perm.makeCanUseTool(
      () => this._currentModeId ?? this._req.mode,
      () => this._currentOrchestration
    )
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
        // run-manager(agentRuns.ts)는 *첫* done에 run을 닫는다 → 2번째 턴(결과)을 못 받음.
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
          // GAP1 P09: 단발 경로도 tail 배선(레지스트리/폴러) — idle-close 게이트는
          // 지속세션 전용이라 여기선 무관하지만, 스트림이 살아있는 동안(F-B 보류로
          // result 이후 도착하는 task_updated/notification도 이 루프를 계속 돈다)
          // 라이브 조각을 동일하게 방출한다. 정지는 notification 관측 또는 finally.
          this._bgTaskObserver.maybeStartTail(msg)
          for (const e of normEvents) {
            this._bgTaskObserver.observeEvent(e)
            // GAP1 P13: 엔진 측 권한 모드 통지 관찰 → 어댑터 "현재 모드" 동기화(엔진이
            // 진실). 단발 경로도 한 query 안에서 모드가 바뀔 수 있다(예: ExitPlanMode
            // 승인 착지 setMode → SDK가 acceptEdits로 전환 통지) — 이후 도구 요청의
            // canUseTool 라이브 게터가 이 값을 읽는다. 이벤트 자체는 그대로 흘린다(병행).
            if (e.type === 'permission_mode') {
              this._currentModeId = e.mode
            }
            this._push(e)
          }
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
      // GAP1 P09: 활성 백그라운드 tail 전량 정지(타이머 누수 0 — 정상/에러/abort 무관).
      this._bgTaskObserver.stopAll()
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
   *   - (LR3 Phase 02) _idleClosing이 세워지면 같은 방식으로 종료 → agentRuns.ts의
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

      // ── BF3-P03: push μs창 봉합 ⓑ(01_Phases/BF3-backlog-sweep/03-push-race-window.md) ──
      // "판정"(_idleClosing=true, _runPersistentPump 턴 경계)과 "행동"(여기 return) 사이의
      // 경합 창을 닫는 최후 방어선(push() ⓐ가 놓치는 경로가 있어도 여기서 다시 잡힌다).
      // return을 실행하기 직전, 정보가 가장 최신인 시점에 큐/outstanding send-token을 재확인
      // (double-check, GAP1 P11: `_pendingSends` → `_outstandingSendCount()`) — 재확인과
      // return 사이엔 다른 JS 코드가 끼어들 수 없으므로(동기 실행, run-to-completion) 이
      // 지점부터는 경합 창이 존재하지 않는다. 잔여가 있으면 강등을 취소(플래그만 해제 —
      // abort/AbortController/PermissionCoordinator 미개입, LR3-P02 불변조건 그대로) 하고
      // 정상 진행, 없으면 원래대로 종료한다.
      if (this._idleClosing) {
        if (this._inputQueue.length > 0 || this._sendTokens.outstandingCount() > 0) {
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
        // GAP1 P11: queued→delivered 전이 — 이 token은 SDK에 전달됐지만(pull됨) 아직 이
        // token이 속한 turn epoch는 시작 전이다. delivered→owned 전이(ANCHOR)는 그 epoch의
        // 첫 스트림 메시지 도착 시(`SendTokenLedger.anchorIfEligible()`)에만 일어난다 —
        // 여기서 곧바로 owned로 승격하지 않는다(승격 시점을 앞당기면 ①a 앵커 테스트가 잡아낸다).
        // GAP1 P12 동봉2(dev-assert): `_inputQueue`와 `_queuedSendSeqs`는 인덱스 1:1
        // 동기 불변식(P11)이다 — content는 있는데 seq FIFO가 비었다 = desync(위반).
        // 이 불변식은 큐 *내용*을 아는 이 클래스만 검사할 수 있어 장부가 아니라 여기서
        // 판정한다(장부는 상태 전이만 책임진다 — RS1 P06 ② 경계).
        // 조용히 `?? null`만 하면 token-less 전달로 위장돼 user 턴이 cron으로 오분류
        // 된다(무증상 회계 붕괴). warn 1회로 관찰 가능하게 만들되, 폴백 거동은 그대로
        // 유지한다(null token-less 전달 지속, throw 금지 — prod 안전).
        const desync = this._queuedSendSeqs.length === 0
        this._sendTokens.deliverNext()
        if (desync) {
          console.warn(
            '[agents] send-token 회계 desync — _inputQueue에 content가 있는데 _queuedSendSeqs가 비어 있음(1:1 불변식 위반). token-less로 폴백 전달합니다.'
          )
        }
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
   * 설계(C 설계, GAP1 P11: origin 산출을 send-token 회계로 교체):
   *   1. 초기 user 메시지를 _inputQueue에 적재 + queued send-token 1개 발급.
   *   2. resolvedQueryFn({ prompt: _inputGen(), options: sdkOptions }) — AsyncIterable prompt.
   *   3. for-await: 매 msg 진입 시 `_sendTokens.anchorIfEligible(msg)`(delivered→owned
   *      ANCHOR, 이 epoch 최초 1회 · 턴-비귀속 메시지는 자격 없음) → origin =
   *      `_sendTokens.hasOwnedToken()`이면 'user' else 'cron' → normalizer.process.
   *      done 반환(=turn 경계)하면:
   *        - `_sendTokens.completeTurn()` — owned token이 있으면 완료 처리, 무토큰 epoch은
   *          완료할 token이 없어 아무것도 소비하지 않는다(자율 done이 남의 token을 훔칠 수
   *          없음) + ANCHOR 가드 리셋(다음 epoch에서 재수행).
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
    // GAP1 P12 (c): 스트림이 throw로 죽었는가 — finally의 grace-expired 방출 게이트 표식.
    // 계약(agentEvents.ts AutonomyEndedReason)상 grace-expired는 "유예 만료 *자연종료*"
    // 의미이므로, throw 경로(catch가 error/done 방출)에서는 얹지 않는다.
    let streamThrew = false
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

      // 초기 메시지를 큐에 적재 + queued send-token 1개 발급(GAP1 P11 — 초기 turn은
      // 이 token이 owned되어 user origin으로 완료된다).
      this._inputQueue.push(initialPrompt)
      this._sendTokens.issue()

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

          // ── GAP1 P11: ANCHOR delivered→owned — 이 turn epoch의 첫 *턴 귀속* 스트림 메시지 ──
          // 턴 경계(이전 done)를 통과한 뒤 이 epoch에서 정확히 1회만 수행된다(멱등 가드는
          // 장부 내부). 이 호출 이후 이 epoch이 끝날 때까지(다음 done 도착까지) owned는
          // 불변이다 — 아래 grace-active 판정·turnOrigin 산출이 모두 이 승격 결과를
          // 공유한다(도착 시점 재계산 없음).
          // GAP1 dogfood 결함 B 봉합: 턴-비귀속 세션 레벨 메시지(늦은 session_state:idle ·
          // task_* 생명주기)는 anchor 자격이 없다 — done 뒤 턴 사이 창에 도착해 다음 epoch를
          // 무토큰으로 선점(→ 사용자 턴 cron 오분류 + send-token 좌초로 idle-close 영구
          // 봉쇄)하는 것을 막는다. 자격 판정(`isTurnAnchoringMessage()` JSDoc)은 이제
          // 장부의 `anchorIfEligible()` 안에 있다 — 호출측은 매 msg를 그냥 넘기면 된다.
          this._sendTokens.anchorIfEligible(msg)

          // ── turn 발원(origin) 판정 — ANCHOR 결과 재사용(GAP1 P11) ───────────────
          // origin-probe 실측: SDK는 user/cron 신호 미제공. 직렬 턴.
          // 판정: 위 ANCHOR가 이 epoch에 승격한 owned token이 있으면 user, 없으면(무토큰
          // epoch = 자율 발동) cron. 옛 방식(도착 시점 `_pendingSends` 재계산)과 달리 이
          // 값은 epoch 시작 시점에 단 한 번 확정되고, done 도착까지 절대 바뀌지 않는다 —
          // 자율(cron) epoch의 늦은 done이 그 사이 도착한 push()의 token을 훔칠 길이
          // 없다(P11 반증 봉합 핵심).
          // GAP1 P12 동봉1: 이 산출을 ANCHOR 직후(grace 블록 위)로 호이스트 — origin 판정
          // 소스를 이 스냅샷 한 곳으로 단일화한다(아래 grace-active 게이트가 같은 값을
          // 공유). ANCHOR와 이 줄 사이에 장부 owned를 바꾸는 코드가 없으므로 옛 위치
          // (grace 블록 아래)와 거동 동일하다.
          // BF3 Phase 04: 이 값을 normalizer.process()에도 전달한다 — CronTracker의
          // onTurnEnd() 턴 경계 판정(ScheduleWakeup 체인 종료 여부)이 "이번 턴이 사용자
          // 인터리빙인가"를 알아야 하기 때문(process() 내부에서 done 감지 시 즉시
          // onTurnEnd()를 호출하므로, done push 이후 재계산하면 이미 늦다).
          const turnOrigin: 'user' | 'cron' = this._sendTokens.hasOwnedToken() ? 'user' : 'cron'

          // ── LR4 Phase 03: 유예(grace) 중 continuation 흡수 → active 방출 ──────
          // 유예가 대기 중인데 새 msg가 도착 = 세션이 여전히 살아있다는 실측 신호. 단,
          // push()가 "취소 후 즉시 재스케줄"하므로(위 push() JSDoc) 사용자 개입 이후에도
          // 유예는 대기 상태로 유지된다 — 그 상태에서 SDK가 유예 창 안에 응답하면 이
          // 경로에 진입하지만, 그건 자율 continuation이 아니라 "사용자 turn의 응답 도착"
          // 이다. active의 계약 의미(agentEvents.ts)는 자율(cron-origin) 연속 턴 확인이라
          // origin을 넘겨 거버너가 판정한다(reviewer LR4-P03 🟡#1 봉합 — 창당 1회 dedup
          // 포함, §3 핀). 유예 취소와 msg 정상 처리 흐름은 origin 무관하게 그대로 유지.
          this._idleGovernor.absorbActivity(turnOrigin)

          // Phase 11: normalizer.process() 위임.
          const { events: normEvents, done } = this._normalizer.process(msg, turnOrigin)

          // ── GAP1 P09: 백그라운드 Bash tool_result → output 파일 tail 시작 시도 ──────
          // 원시 msg의 구조 payload(tool_use_result.backgroundTaskId)로만 판별 —
          // 이벤트 합성은 없다(어댑터 내부 배선). 추출 실패 시 조용히 skip(degrade).
          this._bgTaskObserver.maybeStartTail(msg)

          for (const e of normEvents) {
            // ── GAP1 P09: bg_task 생명주기 관측 → 레지스트리/tail 갱신 ─────────────
            // 'started' → 레지스트리 추가(idle-close 게이트 닫힘), 'notification' →
            // 제거 + tail 정지. 마지막 활성 태스크가 끝나는 순간은 P04b Wave2c(늦은
            // idle 신호)와 동형의 "막고 있던 조건이 해제된" 재평가 지점이다 — done
            // 경계는 이미 지나갔으므로(백그라운드 태스크는 turn과 독립 수명) 여기서
            // 직접 유예를 재스케줄해야 idle-close가 회복된다(금지의 영구 고착 방지 —
            // 좀비 세션 0, gap1-p09-idle-close-bgtask 계약 2).
            if (e.type === 'bg_task') {
              this._bgTaskObserver.observeEvent(e)
              if (
                e.kind === 'notification' &&
                this._bgTaskObserver.gateOpen() &&
                this._sendTokens.outstandingCount() === 0 &&
                !this._normalizer.hasLoopActivity() &&
                !this._idleClosing &&
                !this._aborted &&
                this._idleGovernor.sessionStateGateOpen()
              ) {
                this._idleGovernor.scheduleGrace()
              }
            }
            // GAP1 P04b: session_state 관찰 지점(단 한 곳) — 신호수신 플래그를 세우고
            // 최신값을 덮어쓴다(latest-wins). 이 세션이 이제부터 축1 게이트(안전 교집합)의
            // 대상이 된다 — 미관측 세션은 이 블록에 진입하지 않아 게이트가 항상 열려 있다.
            if (e.type === 'session_state') {
              this._idleGovernor.observeSessionState(e.state)

              // ── GAP1 P04b Wave2c(reviewer 실측 회귀 봉합): idle 신호 도착 자체가
              // idle-close 1차 트리거 ──────────────────────────────────────────────
              // 실 SDK 방출 순서(fixture 실측: probe-2b-session-state-env.jsonl)는
              // running(별개 system msg) → result(done) → idle(별개 system msg, done
              // *뒤*)다. done 경계 게이트(아래 :~1090)는 done 발생 그 순간의 최신
              // session_state만 재확인하므로, done 시점에 아직 도착 안 한 이 늦은 idle을
              // 절대 못 잡는다 — 방치하면 무활동 턴이 영영 idle-close 안 되는 회귀
              // (LR4 P03 취지 위반)로 이어진다. 그래서 "idle 관찰" 이벤트 자체를 done
              // 경계와 동등한 조건(축2 로컬 큐·축4 grace/idleClosing/abort)으로 재평가해
              // 유예를 (재)스케줄한다 — done 경계 게이트가 이미 커버한 케이스(수신
              // 세션에서 done 시점에 이미 idle)와 병존해도 거버너 `scheduleGrace()`의
              // 멱등 가드(유예가 이미 대기 중이면 no-op)가 이중 예약을 막는다.
              if (e.state === 'idle') {
                // GAP1 P09: bg-task 게이트 ∧ 결합 — 활성 백그라운드 태스크가 있으면
                // 늦은 idle 신호로도 유예를 스케줄하지 않는다(P04b 축1과 동형).
                if (
                  this._sendTokens.outstandingCount() === 0 &&
                  !this._normalizer.hasLoopActivity() &&
                  !this._idleClosing &&
                  !this._aborted &&
                  this._bgTaskObserver.gateOpen()
                ) {
                  this._idleGovernor.scheduleGrace()
                }
              } else {
                // e.state === 'running' | 'requires_action' — SDK가 "아직 실행
                // 중"/"권한 대기 중"이라고 (다시) 말한 것 — 대기 중이던 유예가 있으면
                // 취소한다(닫으면 안 된다는 최신 신호가 도착했으므로, 아래 done 경계
                // 게이트의 else 분기와 동일 의미). 대기 중이 아니면 no-op(멱등).
                this._idleGovernor.cancelGrace()
              }
            }
            // GAP1 P13: 엔진 측 권한 모드 통지(SDK status.permissionMode → permission_mode)
            // 관찰 → 어댑터 "현재 모드" 동기화(엔진이 진실 — plan 승인 착지 acceptEdits가
            // 이후 canUseTool 라이브 판정에 반영되는 경로). 사용자 라이브 전환
            // (setPermissionMode)의 낙관 갱신을 엔진 통지가 최종 확정/정정한다.
            // 이벤트 자체는 그대로 흘린다(renderer 피커/배지 동기화 — 병행, 대체 아님).
            if (e.type === 'permission_mode') {
              this._currentModeId = e.mode
            }
            // interrupt로 인한 result(is_error)는 turn 중단 신호 — 일반 error로 표면화 금지
            // (BF1-interrupt-loop P03, ADR-024: 세션 유지).
            if (this._interrupted && e.type === 'error') continue
            this._push(e)
          }
          if (done !== null) {
            // ── turn 경계: 위에서 스냅샷한 turnOrigin 재사용 + 즉시 push ────────
            // GAP1 P11: owned token 완료 — 무토큰 epoch(자율)은 완료할 token이 없어
            // null→null no-op(아무것도 소비 안 함)이 자동 성립한다. 동시에 ANCHOR 가드를
            // 리셋한다 — 턴 경계를 통과했으므로 다음 epoch 첫 메시지에서 ANCHOR
            // (delivered→owned)를 다시 수행해야 한다. 둘 다 `completeTurn()` 안에 있다.
            this._sendTokens.completeTurn()
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
              this._idleGovernor.cancelGrace()
              this._idleClosing = true
              // _inputGen이 대기 중이면 깨워 즉시 return시킨다(push()/idle-close와 동일
              // wake 관용구) — onSessionClosing→agent-runs 원자제거 경로는 기존 그대로.
              if (this._resolveInput) {
                const r = this._resolveInput
                this._resolveInput = null
                r()
              }
            } else if (
              this._sendTokens.outstandingCount() === 0 &&
              !this._normalizer.hasLoopActivity() &&
              this._idleGovernor.sessionStateGateOpen() &&
              this._bgTaskObserver.gateOpen()
            ) {
              // ── LR3 Phase 02 + LR4 Phase 03: 턴 경계 idle 판정(유예 도입) ────────
              // "살아있을 이유"(미소비 pending user turn 또는 활성 루프[크론·armed
              // wakeup·등록 중 pending])가 없어도, 더 이상 즉시 닫지 않는다 — 짧은 유예
              // (IDLE_CLOSE_GRACE_MS)를 스케줄해 goal stop-hook의 다음 자율 continuation을
              // "활동"으로 흡수할 시간을 준다(자멸 방지, LR4 P03). 판정 자체(GAP1 P11:
              // outstanding send-token 0/hasLoopActivity 조건)는 LR3 P02와 동일 — 달라진
              // 건 "즉시 강등" → "유예 후 재확인 강등"뿐이다. 이 시점 owned는 방금 위에서
              // null이 됐으므로(위 done 블록), 대기 중인 queued/delivered token이 남아
              // 있으면(push가 이미 도착) `_outstandingSendCount()>0`이 되어 유예를 예약하지
              // 않는다 — 세션이 살아남는다(자율 done이 대기 중인 사용자 push를 밀어내는
              // 오탈취 봉합, P11 repro).
              // GAP1 P04b: 축1 안전 교집합 게이트(`_sessionStateGateOpen()`)를 ∧로 결합 —
              // 신호 수신 세션에서 최신 session_state가 'idle'이 아니면(예: running·
              // requires_action) 애초에 유예조차 스케줄하지 않는다(else 분기로 빠져
              // 기존 유예가 있으면 취소). 미수신 세션은 게이트가 항상 true라 기존 그대로.
              // GAP1 P09: bg-task 게이트(`_bgTaskObserver.gateOpen()`)도 ∧ 결합 — 활성 백그라운드
              // 태스크(dev 서버 등)가 있으면 turn 경계가 무활동처럼 보여도 유예를
              // 스케줄하지 않는다. 태스크 종료(notification) 관측 지점이 회복 트리거.
              this._idleGovernor.scheduleGrace()
            } else {
              // 활동/pending 있음 — 혹시 대기 중이던 유예가 있으면 취소(정상 held-open 지속).
              this._idleGovernor.cancelGrace()
            }
          }
        }
        // for-await 자연 종료 = input gen 닫힘(abort/세션종료)
        // abort 시에는 이미 _aborted=true이므로 가드로 처리됨
      } catch (err) {
        // GAP1 P12 (c): 이 catch에 진입한 모든 경로(일반 error·interrupt-throw·abort 경합)는
        // "스트림이 throw로 끝났다"이다 — finally에서 grace-expired를 방출하지 않는다.
        streamThrew = true
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
      // 유효하다). abort 경로는 제외(abort()가 이미 자체 정리를 마쳤고 유예 타이머도 그때
      // 이미 clear됨 — 이 시점 재확인이 이중 방출을 만들지 않는다).
      //
      // GAP1 P12 (c): throw 경로(`streamThrew`)도 제외한다 — 계약상 grace-expired는
      // "무활동 유예 만료 자연종료"인데, 스트림이 throw로 죽은 것은 자연종료가 아니라
      // 에러 사망이다(catch가 이미 error+done을 방출). grace 타이머 잔존은 "예약해 둔
      // 유예가 아직 안 만료됐다"일 뿐 자연종료 확정이 아니므로 방출 근거가 못 된다.
      // interrupt-throw 경로(catch의 _interrupted 분기 — done push 후 return)도 throw의
      // 일종으로 동일하게 제외한다: 그 세션 종결 사유는 "interrupt로 인한 스트림 사망"이지
      // 유예 만료가 아니고, 사용자 개입(interrupt) 직후 "자율반복이 유예 만료로 끝났다"는
      // 신호를 renderer에 보내는 것 자체가 의미 모순이다(자연종료 = for-await 정상 완주만
      // grace-expired 자격을 가진다 — §2 companion 핀이 이 정당 거동을 잠근다).
      const gracePendingAtExit = this._idleGovernor.isGracePending()
      // 대기 중인 idle-close 유예 타이머 누수 방지(정상/에러/abort 무관 clear —
      // 정리 경로 4지점 중 하나). 펌프가 어떤 사유로든 끝나면 유예를 더 기다릴 이유가 없다.
      this._idleGovernor.cancelGrace()
      // GAP1 P09: 세션 종료 시 활성 백그라운드 tail 전량 정지 + 레지스트리 정리
      // (정상/에러/abort 무관 — 타이머 누수 0. 태스크 프로세스 자체의 고아 정리
      // 정책은 백로그 잔류 — 여기서는 우리 쪽 폴러/레지스트리만 정리한다).
      this._bgTaskObserver.stopAll()
      if (gracePendingAtExit && !this._aborted && !streamThrew) {
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

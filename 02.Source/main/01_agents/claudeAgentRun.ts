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
import { buildModelContextPrompt } from './buildPrompt'
import { startBgTaskTail } from './bgTaskTail'
import type { BgTaskTailHandle } from './bgTaskTail'
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
 * 백그라운드 Bash tool_result의 content 문자열에서 output 파일 경로를 best-effort
 * 추출한다 (GAP1 P09 — `_maybeStartBgTail` 전용).
 *
 * ⚠️ fragile: "Output is being written to: <경로>.output" 사람용 안내 문구 포맷
 * (probe④ 실측, SDK 메시지 포맷 의존)에 결합돼 있다 — 포맷 변경 시 null(조용한
 * 실패, tail 없이 생명주기 이벤트만). 호출측은 반드시 구조 payload
 * (`tool_use_result.backgroundTaskId`)로 백그라운드 태스크임을 먼저 확정해야 한다.
 *
 * @param m 원시 user 메시지(type:'user'). content 블록 중 tool_result의 문자열
 *   content(또는 text 파트 배열)를 검사한다.
 * @returns 추출한 경로 또는 null(추출 실패 — graceful degrade).
 */
function extractBgOutputPath(m: Record<string, unknown>): string | null {
  const message = m['message']
  if (message === null || typeof message !== 'object') return null
  const content = (message as Record<string, unknown>)['content']
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b['type'] !== 'tool_result') continue
    const raw = b['content']
    let text = ''
    if (typeof raw === 'string') {
      text = raw
    } else if (Array.isArray(raw)) {
      // content가 파트 배열 형상일 수도 있다({type:'text', text} 파트만 이어붙임).
      text = raw
        .map((part) =>
          part !== null && typeof part === 'object' && typeof (part as Record<string, unknown>)['text'] === 'string'
            ? ((part as Record<string, unknown>)['text'] as string)
            : ''
        )
        .join('')
    }
    if (text.length === 0) continue
    // lazy 캡처가 첫 '.output' 경계에서 멈춘다 — 후행 마침표/문장은 제외된다.
    const match = /Output is being written to:\s*(.+?\.output)/.exec(text)
    if (match) return match[1]
  }
  return null
}

/**
 * 이 원시 SDK 메시지가 turn epoch를 시작(ANCHOR)할 자격이 있는가
 * (GAP1 dogfood 결함 B 봉합 — P11×P04 상호작용).
 *
 * P11 ANCHOR(`_anchorTurnEpochStart`)는 원래 지속 펌프의 **모든** 원시 메시지에서
 * 발화했다. 그런데 실 SDK 방출 순서(fixture 실측: probe-2b-session-state-env.jsonl)는
 * running → result(done) → **idle**(done *뒤* 별개 system msg)이라, 턴 경계를 통과한
 * 직후 도착하는 늦은 idle이 다음 turn epoch를 무토큰으로 선점 앵커했다 — 이후 사용자
 * push 턴의 done이 'cron'으로 오분류(자율 발동 배지 오표시)되고, 그 미완료 send-token이
 * 다음 유령 epoch의 owned로 좌초해 `_outstandingSendCount()`가 1로 영구 잔존 →
 * idle-close 게이트 영구 봉쇄(좀비 세션, P04b 취지 위반). 라이브 dogfood 2세션 재현
 * 2/2 (gap1-dogfood-interturn-anchor.repro).
 *
 * 봉합: **턴에 귀속되지 않는(턴 사이 창에 도착할 수 있는) 세션 레벨 메시지**는 epoch를
 * 시작하지 못하게 한다. 제외 목록:
 *  - `system`/`session_state_changed` state:'idle' — 세션 유휴 신호. 실 SDK 순서상 항상
 *    턴 *종료 후*에 도착한다(턴의 첫 메시지일 수 없음). 반면 'running'·'requires_action'은
 *    턴 활동 신호이므로 앵커 자격 유지 — gap1-p11 ①a 핀(running_A가 자율 A epoch를
 *    B token delivery *前* 무토큰으로 선-앵커해 done_A의 B token 탈취를 봉쇄)이 이
 *    자격에 명시적으로 의존한다.
 *  - `system`/`task_*`(started/progress/updated/notification) — 백그라운드 태스크
 *    생명주기. 태스크는 턴과 독립 수명(P09)이라 턴 사이 창에 도착할 수 있다(늦은 idle과
 *    동일한 선점 문제 — repro 파일 헤더의 파생 케이스).
 *
 * 나머지 모든 메시지(assistant/user/stream_event/result · 기타 system[init·api_retry·
 * compact_boundary 등])는 기존대로 앵커 자격을 유지한다. 안전 근거: 모든 턴은 result로
 * 끝나고 result가 앵커 자격을 가지므로, 진짜 턴이 시작되면 ANCHOR는 늦어도 그 턴의
 * done 산출 전에 반드시 수행된다(origin 판정 소실 없음).
 *
 * ADR-003: 원시 msg 형상('system'·subtype 리터럴) 검사는 어댑터 내부에만 격리.
 */
function isTurnAnchoringMessage(msg: unknown): boolean {
  if (msg === null || typeof msg !== 'object') return true
  const m = msg as Record<string, unknown>
  if (m['type'] !== 'system') return true
  const subtype = m['subtype']
  if (subtype === 'session_state_changed') {
    return m['state'] !== 'idle'
  }
  if (
    subtype === 'task_started' ||
    subtype === 'task_progress' ||
    subtype === 'task_updated' ||
    subtype === 'task_notification'
  ) {
    return false
  }
  return true
}

/**
 * 라이브 권한 모드 전환의 picker id → SDK PermissionMode 매핑
 * (GAP1 P13 — 영호 박제 2026-07-14, 어댑터 내부 상수).
 *
 * ⚠ 세션 생성 경로 run-args.ts의 MODE_TO_PERMISSION(auto→acceptEdits)과 **다르다** —
 * 라이브 전환은 SDK 'auto'(모델 분류기 승인, sdk.d.ts:2039) 모드를 그대로 쓴다.
 * run-args는 불변(세션 생성 경로 — 이 상수와 혼용 금지).
 *
 * 'bypass'(→bypassPermissions)·'dontAsk'는 의도적으로 없다 — 라이브 전환 금지
 * (세션 생성 시에만, 화이트리스트 강제는 main 핸들러 몫[CORE-01] · 어댑터는 매핑 부재로
 * 조용한 no-op 이중 방어). 역매핑(SDK→picker, status.permissionMode 관찰 방출)은
 * claude-stream.ts SDK_MODE_TO_PICKER — 쌍으로 유지한다.
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
   * send-token 턴 귀속 회계 (GAP1 P11 — origin 판정 정본, 옛 `_pendingSends` 카운터 대체).
   *
   * 옛 설계의 결함: `_pendingSends`는 "미소비 user turn 수"를 세고, **done 도착 그 시점의
   * 값**을 보고 turnOrigin을 역산했다 — push↔done의 *도착 순서*에 origin이 의존했다. 자율
   * (cron) 턴 A가 실행 중일 때 사용자 push(B)가 카운터를 0→1로 올리면, A의 늦은 done이
   * "지금 카운터가 >0이니 user"로 오분류해 B의 미소비 token을 탈취(1→0)했다 — origin이
   * "누가 이 done을 유발했는가"가 아니라 "이 순간 카운터가 뭐였는가"를 답했기 때문(P11 반증).
   *
   * 봉합 원리: token에게 수명(lifecycle)을 준다. push()/초기 입력마다 로컬 seq를 발급해
   *   queued(입력 큐 적재) → delivered(`_inputGen`이 pull, SDK에 전달됨) →
   *   owned(그 token이 귀속된 turn epoch가 실제로 시작됨, ANCHOR) →
   *   completed(그 epoch의 done 도착)
   * 로 전이시킨다. done은 **자기 turn epoch에 owned된 token만** 완료할 수 있다 — 무토큰
   * epoch(자율 턴)의 done은 애초에 완료할 token이 없어 남의 것을 훔칠 길이 없다.
   *
   * 필드(아래 `_pendingSends` 대체):
   *   - `_nextSendSeq`: 단조증가 seq 발급기. push()/초기 입력마다 1개 소모.
   *   - `_queuedSendSeqs`: queued 상태 seq FIFO. `_inputQueue`와 인덱스 1:1 동기(같은
   *     push/초기 적재가 두 배열에 함께 쌓이고, `_inputGen`이 pull할 때 함께 shift).
   *   - `_deliveredSendSeq`: delivered 상태(pull됐지만 이 epoch가 아직 시작 전) seq 단
   *     1개(null 가능) — 턴은 직렬·비인터리브라 이 상태는 항상 최대 1개뿐이다.
   *   - `_ownedSendSeq`: 현재 turn epoch가 소유한 seq(null = 무토큰 epoch = 자율 발동).
   *   - `_turnEpochAnchored`: 이 epoch에서 delivered→owned ANCHOR 전이를 이미 수행했는가.
   *     done 도착 시 false로 리셋(턴 경계 통과) — 다음 epoch 첫 메시지에서 재수행.
   *
   * turnOrigin은 더 이상 done 도착 시점의 카운터 재계산이 아니라, 이 epoch가 시작될 때
   * (`_anchorTurnEpochStart()`) 확정된 `_ownedSendSeq`의 유무로만 결정된다 — 같은 epoch의
   * 모든 메시지가 동일한 origin을 본다(epoch 중간에 값이 바뀔 수 없다).
   *
   * idle-close 게이트(6곳)는 `_outstandingSendCount()`(queued+delivered+owned 총합, 완료
   * 안 된 token 전체)를 "살아있을 이유"로 쓴다 — 완료 안 된 token이 하나라도 있으면(어느
   * 상태든) idle-close를 막는다는 옛 `_pendingSends===0` 게이트의 의미를 그대로 보존한다
   * (P04b 9종 시나리오 의미 보존, 상세 = `_outstandingSendCount()` JSDoc).
   *
   * 단발 경로에서는 사용되지 않는다(모든 필드가 초기값에 머문다 = 기존 동작 회귀 0).
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
   * │   │                          │ _ownedSendSeq!==null이면 user, else cron. done │
   * │   │                          │ 도착시점 카운터 재계산 폐기 → epoch 시작시점   │
   * │   │                          │ ANCHOR(`_anchorTurnEpochStart()`)로 고정.      │
   * │ 4 │ 자율 루프                │ _idleClosing·_graceTimer·MAX_CONSECUTIVE_      │
   * │   │ (idle-close grace·cap)   │ AUTONOMOUS_TURNS·autonomy_status — 기존 존치,  │
   * │   │                          │ 변경 없음. 축1은 grace 예약/재검증에 조건 하나 │
   * │   │                          │ 를 얹을 뿐 — GRACE_MS 타이밍·cap 카운팅은      │
   * │   │                          │ 불변.                                          │
   * │ 5 │ background liveness      │ hasLoopActivity()(CronTracker)·BL1 P03         │
   * │   │                          │ staleWatchdog(renderer) — 기존 존치, 변경 없음.│
   * └───┴──────────────────────────┴───────────────────────────────────────────────┘
   *
   * 불변식(회귀 0 조건, GAP1 P04b 완료 기준): session_state가 스트림에 없는 경로(옵트인
   * env 미도달·구버전 SDK)에서 2~5축의 idle-close 거동은 이 Phase 이전과 바이트 동일하다
   * (_sessionStateSeen===false 세션은 fallback 그대로 — 축 1은 아직 "축1은 관측만" 시절의
   * 문구가 아니라 실제로 조건에 참여하지만, 미수신 세션에는 애초에 관여할 신호가 없다).
   * 신호 수신 세션에서만 축 1이 안전 교집합(∧ 결합)으로 idle-close 결정에 참여한다 —
   * 2~5축의 기존 조건을 대체하지 않고 그 위에 조건 하나를 더 얹을 뿐이다(이중 idle 판정
   * 충돌 회피: 큐 empty ∧ !hasLoopActivity() 조건은 여전히 필수 전제, 축1은 추가 게이트).
   */
  private _nextSendSeq = 0
  /** queued 상태 send-token seq FIFO — `_inputQueue`와 인덱스 1:1 동기(GAP1 P11). */
  private _queuedSendSeqs: number[] = []
  /** delivered 상태(pull됐지만 epoch 미시작) send-token seq — 최대 1개, null=없음(GAP1 P11). */
  private _deliveredSendSeq: number | null = null
  /** 현재 turn epoch가 owned한 send-token seq — null=무토큰 epoch(자율, GAP1 P11). */
  private _ownedSendSeq: number | null = null
  /** 이 epoch에서 ANCHOR(delivered→owned) 전이를 이미 수행했는가(GAP1 P11). */
  private _turnEpochAnchored = false

  /**
   * session_state 이벤트를 스트림에서 한 번이라도 관찰했는가 (GAP1 P04b).
   *
   * "신호 수신 세션"의 판별 플래그 — true가 되면 이 세션의 idle-close 판정은 아래
   * `_lastSessionState`와 결합한 안전 교집합(축1)을 반드시 통과해야 하고, false(=한
   * 번도 관찰 못함, 옵트인 env 미도달·구버전 SDK)면 축 2~5(기존 pendingSends 기반
   * 메커니즘)만으로 fallback 판정한다(바이트 동일 보존).
   *
   * 관찰 지점은 `_runPersistentPump`의 for-await 루프 한 곳뿐(normEvents 순회 중
   * `type==='session_state'`). 단발 펌프(`_runPump`)는 지속세션이 아니므로 idle-close
   * 개념 자체가 없어 이 플래그를 갱신하지 않는다(항상 false로 남되 무해 — 단발 경로는
   * 애초에 이 필드를 읽는 게이트를 거치지 않는다).
   */
  private _sessionStateSeen = false

  /**
   * 가장 최근에 관찰된 session_state 값(latest-wins, GAP1 P04b).
   *
   * 관찰될 때마다 무조건 덮어쓴다 — "한 번이라도 idle을 봤으면 close 허용"이 아니라
   * "가장 최근 관찰값이 무엇인가"가 권위(S2 계약: idle→running 순서 관찰 시 running이
   * 앞선 idle을 supersede해 idle-close를 무효화해야 한다).
   *
   * 스코프 경계(turn-id 부재, 이 Phase 범위 밖): `AgentEventSessionState`에 turn 상관자가
   * 없어 "새 turn의 running 관찰 *후* 이전 turn의 늦은 idle 도착" 완전 역전은 순수 스트림
   * 순서만으로 결정론적으로 구별할 수 없다 — 이 필드는 스트림 도착 순서 기준 latest-wins만
   * 구현한다(idle→running 방향만 hard 계약). 역전 케이스가 실제로 문제가 되면 shared
   * `AgentEvent` 계약에 turn-id를 추가하는 논의가 필요 — coordinator escalate 대상.
   */
  private _lastSessionState: 'idle' | 'running' | 'requires_action' | null = null

  /**
   * 활성 백그라운드 태스크 레지스트리 (GAP1 P09).
   *
   * 수명: bg_task 'started' 관측 시 추가 → 'notification' 관측 시 제거(+tail 정지).
   * run abort/펌프 종료 시 전량 정리(`_stopAllBgTails()` — 타이머 누수 0).
   *
   * 두 역할:
   *  1. **idle-close 게이트**(`_bgTaskGateOpen()`) — 활성 태스크가 하나라도 있으면
   *     idle-close 유예 스케줄/커밋 금지(dev 서버를 백그라운드로 돌려두고 지켜보는
   *     세션이 "무활동"으로 오판돼 접히면 안 된다 — P09 완료 조건).
   *  2. **output 파일 tail 핸들 보관** — 백그라운드 Bash tool_result에서 best-effort
   *     추출한 output 경로로 시작한 bgTaskTail 핸들(라이브 증분 로그).
   *
   * outputFile: tool_result content에서 추출한 경로(추출 실패 시 undefined — tail 없이
   * 생명주기 이벤트만, graceful degrade). task_notification의 output_file(구조 필드)이
   * 정본 — 불일치가 관측되면 추출 경로의 잔여 flush를 포기한다(notification 우선).
   */
  private _bgTasks = new Map<string, { outputFile?: string; tail: BgTaskTailHandle | null }>()

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
    this._cancelIdleGrace()

    // GAP1 P09: 활성 백그라운드 tail 폴러 전량 정지 + 레지스트리 정리(타이머 누수 0).
    this._stopAllBgTails()

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
    // GAP1 P11: send-token queued 상태 발급 — _inputQueue와 인덱스 1:1 동기.
    this._queuedSendSeqs.push(this._nextSendSeq++)
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
    // `01.Phases/16_BL1-backlog-closeout/02-grace-timer-cleanup.md` 완료 시 결과 기록).
    // qa 쪽 fake-timer 중첩 advance 아티팩트(옛 `_armGraceStep` JSDoc이 다루던 문제)는 테스트
    // 재구성(비중첩 clock 진행 + barrier 프로토콜) 몫으로 이관 — production 코드는 더 이상
    // 테스트 환경의 타이머 세부를 신경 쓰지 않는다.
    this._cancelIdleGrace()
    // 이미 완전히 닫힌/중단된 run이면 재스케줄하지 않는다(불필요한 타이머 방지 — 어차피 만료
    // 콜백도 `_aborted`/`_closed`에서 조기 반환하지만, 애초에 걸지 않는 편이 더 깔끔하다).
    // 멱등·안전 성질은 그대로 — 이 가드가 없어도 안전하기만 하다.
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
   * 축1(SDK 실행 상태) 안전 교집합 게이트 (GAP1 P04b).
   *
   * 신호 수신 세션(`_sessionStateSeen===true`)이면 최신(latest-wins) session_state가
   * 'idle'일 때만 true — 'running'·'requires_action'이면 false(idle-close 금지).
   * 신호 미수신 세션(`_sessionStateSeen===false`)은 이 축 자체가 관측 불가하므로 항상
   * true를 반환해 게이트를 사실상 무력화한다(= fallback, 2~5축에 판단을 전적으로 위임 —
   * 이 게이트가 미수신 세션의 기존 거동을 단 1비트도 바꾸지 않는다).
   *
   * 호출 지점 2곳(둘 다 "∧ 결합" — 이 게이트 하나만으로 idle-close를 결정하지 않고,
   * 기존 pendingSends/큐/hasLoopActivity 조건에 조건 하나를 얹을 뿐이다):
   *  - `_runPersistentPump` 턴 경계의 유예 스케줄 분기(`_scheduleIdleGrace()` 호출 여부).
   *  - `_scheduleIdleGrace()`의 유예 만료 재확인(커밋 직전 최종 게이트).
   */
  private _sessionStateGateOpen(): boolean {
    return !this._sessionStateSeen || this._lastSessionState === 'idle'
  }

  /**
   * idle-close 유예를 스케줄한다(이미 대기 중이면 멱등 — 재스케줄 안 함).
   *
   * (BL1-P02 정리) `IDLE_CLOSE_GRACE_MS` 전체를 단일 `setTimeout`으로 건다 — 예전
   * step-splitting(`_armGraceStep` 100ms 재스케줄) 구조는 fake-timer 테스트의 중첩
   * `advanceTimersByTimeAsync` 호출을 우회하기 위한 것이었으나, 실제 문제의 근원은
   * production 타이머가 아니라 *테스트 쪽의 중첩 clock 진행*이었다(설계 메모:
   * `01.Phases/16_BL1-backlog-closeout/02-grace-timer-cleanup.md`). 테스트가 비중첩
   * barrier 프로토콜로 재구성되면 production은 이 단일 타이머로 안전하다 — 합계 지연은
   * 변함없이 `IDLE_CLOSE_GRACE_MS`(3000ms) 그대로다.
   *
   * 만료 시점에 재확인(`_outstandingSendCount()===0 && _inputQueue.length===0 &&
   * !hasLoopActivity()`, GAP1 P11)해 그 사이 상태가 바뀌지 않았을 때만 실제로 강등(`_idleClosing=true`
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
    this._graceTimer = setTimeout(() => {
      this._graceTimer = null
      if (this._aborted || this._closed) return
      // 재확인: 유예 동안 push/continuation이 상태를 바꿨으면 close 안 함.
      // GAP1 P04b: 축1 안전 교집합 게이트(`_sessionStateGateOpen()`)를 ∧로 결합 —
      // 신호 수신 세션에서 최신 session_state가 'idle'이 아니면(latest-wins) 커밋 안 함.
      // GAP1 P11: `_pendingSends===0` → `_outstandingSendCount()===0`(queued+delivered+
      // owned 전체 미완료 token 0) — "살아있을 이유 없음" 판정에 owned(진행 중인 자기 turn)
      // 뿐 아니라 delivered(pull됐지만 아직 epoch 미시작)·queued(아직 안 당겨진) token까지
      // 전부 포함해야 조기 close를 막는다(단일 카운터 시절의 겸직 의미 보존).
      // GAP1 P09: bg-task 게이트(`_bgTaskGateOpen()`)를 ∧로 결합 — 유예 대기 중에
      // 새 백그라운드 태스크가 시작됐으면(started 관측) 커밋하지 않는다(P04b 동형).
      if (
        this._outstandingSendCount() === 0 &&
        this._inputQueue.length === 0 &&
        !this._normalizer.hasLoopActivity() &&
        this._sessionStateGateOpen() &&
        this._bgTaskGateOpen()
      ) {
        this._push({ type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
        this._idleClosing = true
        if (this._resolveInput) {
          const r = this._resolveInput
          this._resolveInput = null
          r()
        }
      }
    }, IDLE_CLOSE_GRACE_MS)
  }

  /** 대기 중인 idle-close 유예 타이머를 취소한다(없으면 no-op — 멱등). */
  private _cancelIdleGrace(): void {
    if (this._graceTimer !== null) {
      clearTimeout(this._graceTimer)
      this._graceTimer = null
    }
  }

  // ── 백그라운드 태스크 tail·idle-close 게이트 (GAP1 P09) ─────────────────────────

  /**
   * bg-task 게이트: 활성 백그라운드 태스크(bg_task 'started' 관측 ~ 'notification'
   * 관측 사이)가 하나라도 있으면 false — idle-close 유예 스케줄/커밋 금지.
   *
   * P04b 축1(`_sessionStateGateOpen()`)과 동형의 ∧ 결합 — 기존 5축 결정 표의 어떤
   * 축도 대체하지 않고 조건 하나를 위에 더 얹는다(활성 태스크가 없으면 이 게이트는
   * 항상 열려 있어 기존 거동을 단 1비트도 바꾸지 않는다).
   */
  private _bgTaskGateOpen(): boolean {
    return this._bgTasks.size === 0
  }

  /**
   * 정규화된 bg_task 이벤트 관측 → 레지스트리 갱신 + tail 정지 (GAP1 P09).
   *
   *  - kind:'started' → 레지스트리 추가(tail은 아직 없음 — output 경로는 이후
   *    백그라운드 Bash tool_result에서 획득, `_maybeStartBgTail`).
   *  - kind:'notification' → 레지스트리 제거 + tail 정지. 추출 경로와 notification의
   *    output_file(정본)이 불일치하면 잘못된 파일의 잔여 flush를 포기(finalFlush=false),
   *    일치/미상이면 잔여분 최종 flush(finalFlush=true).
   *  - kind:'updated'/'output' → 레지스트리 무관(상태 패치/조각 — 수명 경계 아님).
   *
   * 단발·지속 펌프 공용. idle-close 회복 트리거는 지속 펌프에만 있다(호출측 분기).
   */
  private _observeBgTaskEvent(e: AgentEvent): void {
    if (e.type !== 'bg_task') return
    if (e.kind === 'started') {
      if (!this._bgTasks.has(e.taskId)) {
        this._bgTasks.set(e.taskId, { tail: null })
      }
      return
    }
    if (e.kind === 'notification') {
      const entry = this._bgTasks.get(e.taskId)
      if (!entry) return
      this._bgTasks.delete(e.taskId)
      if (entry.tail) {
        const pathAgrees =
          entry.outputFile === undefined ||
          e.outputFile === undefined ||
          entry.outputFile === e.outputFile
        entry.tail.stop(pathAgrees).catch(() => {})
      }
    }
  }

  /**
   * 원시 user tool_result 메시지에서 백그라운드 태스크 output 경로를 획득해 tail을
   * 시작한다 (GAP1 P09 — 어댑터 내부 전용, 이벤트 합성 없음).
   *
   * 경로 획득 원천(probe④ 실측): task_started에는 output 경로가 없다. 유일한 조기
   * 원천 = 백그라운드 Bash tool_result의 content 문자열("Output is being written
   * to: <경로>.output"). 판별은 **구조 payload가 정본** — 원시 메시지 top-level
   * `tool_use_result.backgroundTaskId`(sdk.d.ts:4297)로 백그라운드 태스크임을 확정한
   * 뒤에만, 같은 메시지 content에서 경로를 best-effort 정규식 추출한다.
   *
   * ⚠️ fragile(주석 명시 의무): 경로 추출은 SDK의 사람용 안내 문구 포맷에 의존한다 —
   * SDK가 문구를 바꾸면 조용히 실패한다. 실패 시 tail 없이 생명주기 이벤트만 흐른다
   * (graceful degrade). task_notification의 output_file(구조 필드)이 항상 정본.
   *
   * qa 골든 핀: content 문자열에서 **taskId를 추출하지 않는다**(decoy 대조군) — 상관
   * 키는 구조 payload의 backgroundTaskId뿐이고, bg_task 이벤트도 합성하지 않는다.
   */
  private _maybeStartBgTail(msg: unknown): void {
    if (msg === null || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>
    if (m['type'] !== 'user') return
    const tur = m['tool_use_result']
    if (tur === null || typeof tur !== 'object' || Array.isArray(tur)) return
    const taskId = (tur as Record<string, unknown>)['backgroundTaskId']
    if (typeof taskId !== 'string' || taskId.length === 0) return

    // task_started('started' 관측)가 선행돼야 활성 태스크 — 미등록이면 스킵(graceful).
    const entry = this._bgTasks.get(taskId)
    if (!entry || entry.tail !== null) return

    const outputFile = extractBgOutputPath(m)
    if (outputFile === null) return // 추출 실패 → tail 없이 생명주기만(degrade)

    entry.outputFile = outputFile
    entry.tail = startBgTaskTail({
      taskId,
      outputFile,
      emit: (ev) => this._push(ev), // close 후 늦은 조각은 _push 가드가 차단
    })
  }

  /**
   * 모든 활성 tail 정지 + 레지스트리 정리 (GAP1 P09 — abort/펌프 종료 공용).
   * finalFlush 없이 즉시 정지(run이 끝나는 마당에 잔여 조각을 밀어넣지 않는다 —
   * 어차피 close 후 _push는 무시된다). 타이머 누수 0 보장 지점.
   */
  private _stopAllBgTails(): void {
    for (const entry of this._bgTasks.values()) {
      if (entry.tail) entry.tail.stop(false).catch(() => {})
    }
    this._bgTasks.clear()
  }

  // ── send-token 턴 귀속 회계 (GAP1 P11) ────────────────────────────────────────

  /**
   * outstanding(=아직 completed 안 된) send-token 총수 — queued+delivered+owned 합.
   *
   * idle-close "살아있을 이유" 판정의 정본 — 옛 `_pendingSends===0` 게이트를 대체한다.
   * 완료(done)되지 않은 token이 하나라도 있으면(대기 큐에 있든, pull됐지만 epoch 미시작
   * 이든, 현재 epoch가 owned해 처리 중이든) idle-close를 막아야 한다는 의미는 그대로다 —
   * 옛 단일 카운터가 겸직하던 "살아있을 이유"를 세 상태 총합으로 정밀화했을 뿐이다.
   */
  private _outstandingSendCount(): number {
    return (
      this._queuedSendSeqs.length +
      (this._deliveredSendSeq !== null ? 1 : 0) +
      (this._ownedSendSeq !== null ? 1 : 0)
    )
  }

  /**
   * ANCHOR delivered→owned: turn epoch 시작 (GAP1 P11).
   *
   * 이 turn epoch의 첫 *턴 귀속* 스트림 메시지 도착 시 정확히 1회 호출된다
   * (`_runPersistentPump`의 for-await 루프 최상단, msg 처리 진입점 — 단 턴-비귀속
   * 세션 레벨 메시지[늦은 session_state:idle·task_*]는 `isTurnAnchoringMessage()`가
   * 걸러 이 호출에 도달하지 않는다, GAP1 dogfood 결함 B). delivered 상태 token(있다면 단 1개 — 턴은
   * 직렬·비인터리브라 이 상태는 항상 최대 1개뿐)을 이 epoch의 owned token으로 승격한다.
   * delivered token이 없으면(자율 발동) owned도 null로 유지 — 이 epoch은 무토큰(cron)
   * epoch이 된다. `_turnEpochAnchored` 가드로 같은 epoch 안에서는 재호출돼도 no-op(멱등)
   * — done 도착 시 그 가드를 false로 리셋해 다음 epoch에서 다시 수행되게 한다.
   *
   * 🟡#1(plan-auditor): 이 전이가 token 귀속의 유일한 정본 지점이다. delivered token을
   * 즉시 owned로 승격하거나(전이 앵커 스킵) done이 delivered token까지 완료하게 무력화하면
   * gap1-p11-send-token-accounting의 ①a[delivered→owned 앵커]가 RED로 뒤집혀야 한다.
   */
  private _anchorTurnEpochStart(): void {
    if (this._turnEpochAnchored) return
    this._turnEpochAnchored = true
    this._ownedSendSeq = this._deliveredSendSeq
    this._deliveredSendSeq = null
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
          // GAP1 P09: 단발 경로도 tail 배선(레지스트리/폴러) — idle-close 게이트는
          // 지속세션 전용이라 여기선 무관하지만, 스트림이 살아있는 동안(F-B 보류로
          // result 이후 도착하는 task_updated/notification도 이 루프를 계속 돈다)
          // 라이브 조각을 동일하게 방출한다. 정지는 notification 관측 또는 finally.
          this._maybeStartBgTail(msg)
          for (const e of normEvents) {
            this._observeBgTaskEvent(e)
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
      this._stopAllBgTails()
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
      // return을 실행하기 직전, 정보가 가장 최신인 시점에 큐/outstanding send-token을 재확인
      // (double-check, GAP1 P11: `_pendingSends` → `_outstandingSendCount()`) — 재확인과
      // return 사이엔 다른 JS 코드가 끼어들 수 없으므로(동기 실행, run-to-completion) 이
      // 지점부터는 경합 창이 존재하지 않는다. 잔여가 있으면 강등을 취소(플래그만 해제 —
      // abort/AbortController/PermissionCoordinator 미개입, LR3-P02 불변조건 그대로) 하고
      // 정상 진행, 없으면 원래대로 종료한다.
      if (this._idleClosing) {
        if (this._inputQueue.length > 0 || this._outstandingSendCount() > 0) {
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
        // 첫 스트림 메시지 도착 시(`_anchorTurnEpochStart()`)에만 일어난다 — 여기서 곧바로
        // owned로 승격하지 않는다(승격 시점을 앞당기면 ①a 앵커 테스트가 잡아낸다).
        const deliveredSeq = this._queuedSendSeqs.shift()
        if (deliveredSeq === undefined) {
          // GAP1 P12 동봉2(dev-assert): `_inputQueue`와 `_queuedSendSeqs`는 인덱스 1:1
          // 동기 불변식(P11)이다 — content는 있는데 seq FIFO가 비었다 = desync(위반).
          // 조용히 `?? null`만 하면 token-less 전달로 위장돼 user 턴이 cron으로 오분류
          // 된다(무증상 회계 붕괴). warn 1회로 관찰 가능하게 만들되, 폴백 거동은 그대로
          // 유지한다(null token-less 전달 지속, throw 금지 — prod 안전).
          console.warn(
            '[agents] send-token 회계 desync — _inputQueue에 content가 있는데 _queuedSendSeqs가 비어 있음(1:1 불변식 위반). token-less로 폴백 전달합니다.'
          )
        }
        this._deliveredSendSeq = deliveredSeq ?? null
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
   *   3. for-await: 매 msg 진입 시 `_anchorTurnEpochStart()`(delivered→owned ANCHOR, 이 epoch
   *      최초 1회) → origin = `_ownedSendSeq!==null`이면 'user' else 'cron' → normalizer.process.
   *      done 반환(=turn 경계)하면:
   *        - owned token이 있으면 완료 처리(`_ownedSendSeq=null`) — 무토큰 epoch은 완료할
   *          token이 없어 아무것도 소비하지 않는다(자율 done이 남의 token을 훔칠 수 없음).
   *        - `_turnEpochAnchored=false`(턴 경계 통과 — 다음 epoch에서 ANCHOR 재수행).
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
    // 계약(agent-events.ts AutonomyEndedReason)상 grace-expired는 "유예 만료 *자연종료*"
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
      this._queuedSendSeqs.push(this._nextSendSeq++)

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
          // `_anchorTurnEpochStart()` 내부, `_turnEpochAnchored`). 이 호출 이후 이 epoch이
          // 끝날 때까지(다음 done 도착까지) `_ownedSendSeq`는 불변이다 — 아래 grace-active
          // 판정·turnOrigin 산출이 모두 이 승격 결과를 공유한다(도착 시점 재계산 없음).
          // GAP1 dogfood 결함 B 봉합: 턴-비귀속 세션 레벨 메시지(늦은 session_state:idle ·
          // task_* 생명주기)는 anchor 자격이 없다 — done 뒤 턴 사이 창에 도착해 다음 epoch를
          // 무토큰으로 선점(→ 사용자 턴 cron 오분류 + send-token 좌초로 idle-close 영구
          // 봉쇄)하는 것을 막는다. 판정 근거 = `isTurnAnchoringMessage()` JSDoc.
          if (isTurnAnchoringMessage(msg)) {
            this._anchorTurnEpochStart()
          }

          // ── turn 발원(origin) 판정 — ANCHOR 결과 재사용(GAP1 P11) ───────────────
          // origin-probe 실측: SDK는 user/cron 신호 미제공. 직렬 턴.
          // 판정: 위 ANCHOR가 이 epoch에 승격한 owned token이 있으면 user, 없으면(무토큰
          // epoch = 자율 발동) cron. 옛 방식(도착 시점 `_pendingSends` 재계산)과 달리 이
          // 값은 epoch 시작 시점에 단 한 번 확정되고, done 도착까지 절대 바뀌지 않는다 —
          // 자율(cron) epoch의 늦은 done이 그 사이 도착한 push()의 token을 훔칠 길이
          // 없다(P11 반증 봉합 핵심).
          // GAP1 P12 동봉1: 이 산출을 ANCHOR 직후(grace 블록 위)로 호이스트 — origin 판정
          // 소스를 이 스냅샷 한 곳으로 단일화한다(아래 grace-active 게이트가 같은 값을
          // 공유). ANCHOR와 이 줄 사이에 `_ownedSendSeq`를 바꾸는 코드가 없으므로 옛 위치
          // (grace 블록 아래)와 거동 동일하다.
          // BF3 Phase 04: 이 값을 normalizer.process()에도 전달한다 — CronTracker의
          // onTurnEnd() 턴 경계 판정(ScheduleWakeup 체인 종료 여부)이 "이번 턴이 사용자
          // 인터리빙인가"를 알아야 하기 때문(process() 내부에서 done 감지 시 즉시
          // onTurnEnd()를 호출하므로, done push 이후 재계산하면 이미 늦다).
          const turnOrigin: 'user' | 'cron' = this._ownedSendSeq !== null ? 'user' : 'cron'

          // ── LR4 Phase 03: 유예(grace) 중 continuation 흡수 → active 방출 ──────
          // 유예가 대기 중(_graceTimer!==null)인데 새 msg가 도착 = 세션이 여전히 살아있다는
          // 실측 신호. 단, push()가 "취소 후 즉시 재스케줄"하므로(위 push() JSDoc)
          // 사용자 개입 이후에도 _graceTimer는 non-null로 유지된다 — 그 상태에서 SDK가
          // 유예 창 안에 응답하면 이 블록에 진입하지만, 그건 자율 continuation이 아니라
          // "사용자 turn의 응답 도착"이다. active의 계약 의미(agent-events.ts)는 자율
          // (cron-origin) 연속 턴 확인이므로, 이 epoch이 자율 발동(`turnOrigin==='cron'`,
          // GAP1 P12 동봉1 — 옛 `_ownedSendSeq===null` 직접 참조를 위 스냅샷으로 단일화,
          // 의미 동일)일 때만 방출한다(reviewer LR4-P03 🟡#1 봉합). 창당 1회 dedup은
          // `_autonomyActiveEmitted`(§3 핀 — 같은 흡수 사이클에서 정확히 1회).
          // 취소(_cancelIdleGrace)와 msg 정상 처리 흐름은 origin 무관하게 그대로 유지.
          if (this._graceTimer !== null) {
            this._cancelIdleGrace()
            if (!this._autonomyActiveEmitted && turnOrigin === 'cron') {
              this._autonomyActiveEmitted = true
              this._push({ type: 'autonomy_status', status: 'active' })
            }
          }

          // Phase 11: normalizer.process() 위임.
          const { events: normEvents, done } = this._normalizer.process(msg, turnOrigin)

          // ── GAP1 P09: 백그라운드 Bash tool_result → output 파일 tail 시작 시도 ──────
          // 원시 msg의 구조 payload(tool_use_result.backgroundTaskId)로만 판별 —
          // 이벤트 합성은 없다(어댑터 내부 배선). 추출 실패 시 조용히 skip(degrade).
          this._maybeStartBgTail(msg)

          for (const e of normEvents) {
            // ── GAP1 P09: bg_task 생명주기 관측 → 레지스트리/tail 갱신 ─────────────
            // 'started' → 레지스트리 추가(idle-close 게이트 닫힘), 'notification' →
            // 제거 + tail 정지. 마지막 활성 태스크가 끝나는 순간은 P04b Wave2c(늦은
            // idle 신호)와 동형의 "막고 있던 조건이 해제된" 재평가 지점이다 — done
            // 경계는 이미 지나갔으므로(백그라운드 태스크는 turn과 독립 수명) 여기서
            // 직접 유예를 재스케줄해야 idle-close가 회복된다(금지의 영구 고착 방지 —
            // 좀비 세션 0, gap1-p09-idle-close-bgtask 계약 2).
            if (e.type === 'bg_task') {
              this._observeBgTaskEvent(e)
              if (
                e.kind === 'notification' &&
                this._bgTaskGateOpen() &&
                this._outstandingSendCount() === 0 &&
                !this._normalizer.hasLoopActivity() &&
                !this._idleClosing &&
                !this._aborted &&
                this._sessionStateGateOpen()
              ) {
                this._scheduleIdleGrace()
              }
            }
            // GAP1 P04b: session_state 관찰 지점(단 한 곳) — 신호수신 플래그를 세우고
            // 최신값을 덮어쓴다(latest-wins). 이 세션이 이제부터 축1 게이트(안전 교집합)의
            // 대상이 된다 — 미관측 세션은 이 블록에 진입하지 않아 게이트가 항상 열려 있다.
            if (e.type === 'session_state') {
              this._sessionStateSeen = true
              this._lastSessionState = e.state

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
              // 세션에서 done 시점에 이미 idle)와 병존해도 `_scheduleIdleGrace()`의
              // 멱등 가드(`_graceTimer!==null`이면 no-op, 위 ~613)가 이중 예약을 막는다.
              if (e.state === 'idle') {
                // GAP1 P09: bg-task 게이트 ∧ 결합 — 활성 백그라운드 태스크가 있으면
                // 늦은 idle 신호로도 유예를 스케줄하지 않는다(P04b 축1과 동형).
                if (
                  this._outstandingSendCount() === 0 &&
                  !this._normalizer.hasLoopActivity() &&
                  !this._idleClosing &&
                  !this._aborted &&
                  this._bgTaskGateOpen()
                ) {
                  this._scheduleIdleGrace()
                }
              } else {
                // e.state === 'running' | 'requires_action' — SDK가 "아직 실행
                // 중"/"권한 대기 중"이라고 (다시) 말한 것 — 대기 중이던 유예가 있으면
                // 취소한다(닫으면 안 된다는 최신 신호가 도착했으므로, 아래 done 경계
                // 게이트의 else 분기와 동일 의미). 대기 중이 아니면 no-op(멱등).
                this._cancelIdleGrace()
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
            // GAP1 P11: owned token 완료(_ownedSendSeq=null) — 무토큰 epoch(자율)은
            // 완료할 token이 없어 null→null no-op(아무것도 소비 안 함)이 자동 성립한다.
            // _turnEpochAnchored=false로 리셋 — 턴 경계를 통과했으므로 다음 epoch 첫
            // 메시지에서 ANCHOR(delivered→owned)를 다시 수행해야 한다.
            this._ownedSendSeq = null
            this._turnEpochAnchored = false
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
            } else if (
              this._outstandingSendCount() === 0 &&
              !this._normalizer.hasLoopActivity() &&
              this._sessionStateGateOpen() &&
              this._bgTaskGateOpen()
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
              // GAP1 P09: bg-task 게이트(`_bgTaskGateOpen()`)도 ∧ 결합 — 활성 백그라운드
              // 태스크(dev 서버 등)가 있으면 turn 경계가 무활동처럼 보여도 유예를
              // 스케줄하지 않는다. 태스크 종료(notification) 관측 지점이 회복 트리거.
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
      // 유효하다). abort 경로는 제외(abort()가 이미 자체 정리를 마쳤고 _graceTimer는 그때
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
      const gracePendingAtExit = this._graceTimer !== null
      // 대기 중인 idle-close 유예 타이머 누수 방지(정상/에러/abort 무관 clear —
      // 정리 경로 4지점 중 하나). 펌프가 어떤 사유로든 끝나면 유예를 더 기다릴 이유가 없다.
      this._cancelIdleGrace()
      // GAP1 P09: 세션 종료 시 활성 백그라운드 tail 전량 정지 + 레지스트리 정리
      // (정상/에러/abort 무관 — 타이머 누수 0. 태스크 프로세스 자체의 고아 정리
      // 정책은 백로그 잔류 — 여기서는 우리 쪽 폴러/레지스트리만 정리한다).
      this._stopAllBgTails()
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

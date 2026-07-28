/**
 * idleCloseGovernor.ts — 유휴 종료(idle-close) 거버너 관심사 (LR4 P03 · GAP1 P04b →
 * RS1 P06 ③ 분리)
 *
 * claudeAgentRun(어댑터 본체)이 들고 있던 "유예(grace) 타이머 + 축1(SDK 실행 상태)
 * 게이트 + 유예 창당 autonomy_status dedup"을 한 모듈로 모은 것이다. 거동은 분리
 * 이전과 1비트도 다르지 않다 — 계약 핀은 기존 골든(`lr4-p03-idle-grace` ·
 * `gap1-p04b-session-state-idle-authority` · `gap1-p10-dispatch-grace-cancel-lock` ·
 * `gap1-p12-grace-expired-misemission` · `gap1-p09-idle-close-bgtask` ·
 * `bf3-p03-push-race-window`) **무수정 green**이고, 단위 표면은
 * `idleCloseGovernor.test.ts`가 잠근다.
 *
 * ── 결합 설계(RS1 P06 ③ 확정, trade-off 기록) ────────────────────────────────────
 *
 * idle-close 판정은 5축의 ∧ 결합인데, 그중 이 모듈이 소유하는 축은 **축1(session_state)
 * 하나뿐**이다. 나머지(미완료 send-token 수·로컬 입력 큐·루프 활동·활성 bg 태스크)는
 * 각각 sendTokenLedger·claudeAgentRun·normalizer·bgTaskObserver의 것이다.
 *
 * 선택지 A(거버너가 그 모듈들을 직접 참조) vs B(판정에 필요한 값을 콜백으로 주입).
 * **B를 택했다** — 이유:
 *  - A는 형제 모듈 3개로 향하는 의존 간선을 만들어, 관심사 분리로 얻으려던 "독립적으로
 *    읽히고 테스트되는 모듈"을 도로 무너뜨린다(거버너 단위 테스트가 장부·관찰자·
 *    정규화기를 전부 준비해야 한다).
 *  - B는 거버너를 순수한 타이머·게이트 기계로 남긴다 — 밖의 조건은 `externalGatesOpen()`
 *    불리언 하나로 압축되고, 그 조건들을 *어떻게 조합하는가*는 원래 그 조합을 알고 있던
 *    claudeAgentRun에 남는다(조합 지식의 이동 = 거동 변경 위험).
 *  - 대가(trade-off): 콜백이 4개라 생성 시점 배선이 조금 장황하고, "어떤 축이 닫혀서
 *    커밋이 안 됐는가"를 거버너 혼자서는 말할 수 없다(진단 로그를 넣으려면 호출측 협조
 *    필요). 지금은 그 진단 요구가 없어 결합을 낮추는 쪽이 이득이라 판단했다.
 *
 * 소유권 규칙: 타이머 핸들·session_state 관측값·창당 dedup 플래그는 **이 모듈 단독
 * 소유**다. 반면 `_idleClosing`(강등 확정 플래그)은 claudeAgentRun에 남는다 — 그것은
 * 입력 제너레이터의 종료 조건이자 push() 경합 창(BF3-P03)의 대상이라 유예 관심사가
 * 아니라 **세션 수명 관심사**이기 때문이다. 거버너는 그 플래그를 직접 만지지 않고
 * `onGraceCommit()` 콜백으로 "이제 접어도 된다"만 알린다.
 */

import type { AgentEvent } from '../../shared/agentEvents'

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
 *
 * ⚠️ 공개 경로 보존: 이 상수는 `claudeAgentRun.ts`에서도 재수출(re-export)된다 — 기존
 * 골든 테스트들이 그 경로로 import하고 있어 옮기면서도 진입점을 유지했다.
 */
export const IDLE_CLOSE_GRACE_MS = 3000

/** 거버너가 자기 밖 세계와 이야기하는 유일한 통로(결합 설계 B — 모듈 헤더 참고). */
export interface IdleCloseGovernorDeps {
  /** 이벤트 방출 — claudeAgentRun의 push-queue 적재(`_push`, close 가드 포함). */
  emit: (ev: AgentEvent) => void
  /**
   * 유예 만료 시점의 생존 확인. abort/close된 run에서는 커밋도 방출도 하지 않는다
   * (옛 `if (this._aborted || this._closed) return` 가드와 동일 의미).
   */
  isRunActive: () => boolean
  /**
   * 거버너 **밖** 축들의 ∧ 총합 — 미완료 send-token 0 ∧ 로컬 입력 큐 empty ∧
   * 루프 무활동 ∧ bg-task 게이트 열림. 조합 지식은 원래 그것을 알고 있던
   * claudeAgentRun에 남긴다(모듈 헤더의 결합 설계 참고).
   */
  externalGatesOpen: () => boolean
  /**
   * 유예가 만료되고 모든 게이트가 열려 있을 때 정확히 1회 호출 — "강등해도 좋다".
   * 실제 강등(`_idleClosing=true` + input gen wake)은 호출측 책임이다.
   */
  onGraceCommit: () => void
}

/**
 * 유휴 종료 거버너 — 유예 타이머와 축1 게이트의 단독 소유자.
 *
 * 상태:
 *  - `_graceTimer`: 유예 타이머 핸들. null = 대기 중 아님(멱등 가드 겸용).
 *    abort·펌프 종료 시 호출측이 `cancelGrace()`로 반드시 정리한다(누수/좀비 방지).
 *  - `_sessionStateSeen` / `_lastSessionState`: 축1(SDK 실행 상태) 관측 — "신호 수신
 *    세션인가"와 그 최신값(latest-wins).
 *  - `_autonomyActiveEmitted`: 현재 유예 창에서 `autonomy_status{active}`를 이미
 *    방출했는가(창당 1회 dedup — 창이 새로 열릴 때 리셋).
 */
export class IdleCloseGovernor {
  private readonly _deps: IdleCloseGovernorDeps

  private _graceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * session_state 이벤트를 스트림에서 한 번이라도 관찰했는가 (GAP1 P04b).
   *
   * "신호 수신 세션"의 판별 플래그 — true가 되면 이 세션의 idle-close 판정은
   * `_lastSessionState`와 결합한 안전 교집합(축1)을 반드시 통과해야 하고, false(=한
   * 번도 관찰 못함, 옵트인 env 미도달·구버전 SDK)면 축 2~5(기존 pendingSends 기반
   * 메커니즘)만으로 fallback 판정한다(바이트 동일 보존).
   *
   * 관찰 지점은 지속 펌프의 for-await 루프 한 곳뿐(normEvents 순회 중
   * `type==='session_state'` → `observeSessionState()`). 단발 펌프는 지속세션이
   * 아니므로 idle-close 개념 자체가 없어 이 플래그를 갱신하지 않는다(항상 false로
   * 남되 무해 — 단발 경로는 애초에 이 게이트를 거치지 않는다).
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
   * 현재 유예 창에서 `autonomy_status{status:'active'}`를 이미 방출했는지(중복 억제).
   *
   * 유예가 스케줄된 뒤 흡수되는 continuation마다 매번 'active'를 방출하면 잡음이 크다 —
   * 창(schedule~취소 1사이클)당 1회로 dedup한다. 유예가 새로 스케줄될 때(재-idle 판정)
   * false로 리셋된다.
   */
  private _autonomyActiveEmitted = false

  constructor(deps: IdleCloseGovernorDeps) {
    this._deps = deps
  }

  /** 축1 관측 — 신호 수신 플래그를 세우고 최신값을 덮어쓴다(latest-wins). */
  observeSessionState(state: 'idle' | 'running' | 'requires_action'): void {
    this._sessionStateSeen = true
    this._lastSessionState = state
  }

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
   * 기존 큐/hasLoopActivity 조건에 조건 하나를 얹을 뿐이다):
   *  - 지속 펌프 턴 경계의 유예 스케줄 분기(`scheduleGrace()` 호출 여부 — 호출측).
   *  - `scheduleGrace()`의 유예 만료 재확인(커밋 직전 최종 게이트 — 이 모듈 내부).
   */
  sessionStateGateOpen(): boolean {
    return !this._sessionStateSeen || this._lastSessionState === 'idle'
  }

  /** 유예가 대기 중인가(펌프 종료 시 grace-expired 방출 자격 판정 등에 쓰인다). */
  isGracePending(): boolean {
    return this._graceTimer !== null
  }

  /**
   * idle-close 유예를 스케줄한다(이미 대기 중이면 멱등 — 재스케줄 안 함).
   *
   * (BL1-P02 정리) `IDLE_CLOSE_GRACE_MS` 전체를 단일 `setTimeout`으로 건다 — 예전
   * step-splitting(`_armGraceStep` 100ms 재스케줄) 구조는 fake-timer 테스트의 중첩
   * `advanceTimersByTimeAsync` 호출을 우회하기 위한 것이었으나, 실제 문제의 근원은
   * production 타이머가 아니라 *테스트 쪽의 중첩 clock 진행*이었다(설계 메모:
   * `01_Phases/16_BL1-backlog-closeout/02-grace-timer-cleanup.md`). 테스트가 비중첩
   * barrier 프로토콜로 재구성되면 production은 이 단일 타이머로 안전하다 — 합계 지연은
   * 변함없이 `IDLE_CLOSE_GRACE_MS`(3000ms) 그대로다.
   *
   * 만료 시점에 재확인(거버너 밖 축 = `externalGatesOpen()`, 축1 = 자기 게이트)해 그 사이
   * 상태가 바뀌지 않았을 때만 실제로 커밋(`onGraceCommit()`)한다 — 유예 동안 push()/
   * continuation이 도착하면 이 타이머 자체가 취소되므로 이 재확인은 방어적 이중 체크
   * (타이머 취소 경합까지 닫는다).
   *
   * 강등 플래그는 여기서 세우지 않는다(스케줄 시점) — 유예가 실제로 만료됐을 때만.
   * input gen wake도 스케줄 시점엔 하지 않는다(유예 중엔 input gen이 그대로 park해야
   * continuation이 올 여지가 있다 — wake하면 idle-close 재확인 분기를 조기에 태워버린다).
   */
  scheduleGrace(): void {
    if (this._graceTimer !== null) return // 이미 대기 중 — 멱등
    // 새 유예 창 시작 — 그 창 안의 continuation 흡수 시 active 1회 방출을 위해 리셋.
    this._autonomyActiveEmitted = false
    this._graceTimer = setTimeout(() => {
      this._graceTimer = null
      if (!this._deps.isRunActive()) return
      // 재확인: 유예 동안 push/continuation이 상태를 바꿨으면 close 안 함.
      // GAP1 P04b: 축1 안전 교집합 게이트(`sessionStateGateOpen()`)를 ∧로 결합 —
      // 신호 수신 세션에서 최신 session_state가 'idle'이 아니면(latest-wins) 커밋 안 함.
      // GAP1 P11/P09: 미완료 send-token 0 · 입력 큐 empty · 루프 무활동 · bg-task 게이트는
      // `externalGatesOpen()` 안에 묶여 주입된다(호출측이 조합 — 모듈 헤더 결합 설계).
      if (this._deps.externalGatesOpen() && this.sessionStateGateOpen()) {
        this._deps.emit({ type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
        this._deps.onGraceCommit()
      }
    }, IDLE_CLOSE_GRACE_MS)
  }

  /** 대기 중인 idle-close 유예 타이머를 취소한다(없으면 no-op — 멱등). */
  cancelGrace(): void {
    if (this._graceTimer !== null) {
      clearTimeout(this._graceTimer)
      this._graceTimer = null
    }
  }

  /**
   * 유예 창 안에서 활동(새 스트림 메시지)이 관측됐을 때의 흡수 처리 (LR4 P03).
   *
   * 유예가 대기 중일 때만 의미가 있다 — 대기 중이 아니면 완전한 no-op이다. 대기 중이면
   * 유예를 취소하고("세션이 여전히 살아있다"는 실측 신호), 그 활동이 **자율 발동**
   * (`turnOrigin==='cron'`)일 때만 `autonomy_status{active}`를 창당 1회 방출한다.
   *
   * user origin에서 방출하지 않는 이유: push()가 "취소 후 즉시 재스케줄"하므로 사용자
   * 개입 이후에도 유예는 대기 상태로 유지된다 — 그 상태에서 SDK가 유예 창 안에 응답하면
   * 이 경로에 진입하지만, 그건 자율 continuation이 아니라 "사용자 turn의 응답 도착"이다.
   * active의 계약 의미(agentEvents.ts)는 자율 연속 턴 확인이다(reviewer LR4-P03 🟡#1 봉합).
   */
  absorbActivity(turnOrigin: 'user' | 'cron'): void {
    if (this._graceTimer === null) return
    this.cancelGrace()
    if (!this._autonomyActiveEmitted && turnOrigin === 'cron') {
      this._autonomyActiveEmitted = true
      this._deps.emit({ type: 'autonomy_status', status: 'active' })
    }
  }
}

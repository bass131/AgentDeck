/**
 * staleWatchdog.ts — goal 배너 stale-watchdog 핵심 로직 (BL1 P03, LR4-P05 잔여 #4).
 *
 * 배경(01.Phases/16_BL1-backlog-closeout/03-goal-banner-stale-watchdog.md): `autonomy_status`
 * ended 신호가 유실되고 error/abort도 오지 않는 경계에서 goal 배너가 영원히 "진행 중"으로
 * 고착된다(LR4-DONE:76 잔여 4번, 🟡). 설계 고정 — main heartbeat 신설이 아니라 renderer
 * 수신측 stale-watchdog(계약 불변·가역적, REPL 4b auto-revive 재도입 때 heartbeat와 별도 협의).
 *
 * ── 활동 신호 정의(핵심 결정) ────────────────────────────────────────────────────────
 * `autonomy_status`의 status:'active'만 기준 삼으면(claudeAgentRun.ts:918 — 유예 중
 * continuation 흡수 시에만 방출) 턴 진행 중 계속 오는 text/tool_call/thinking 등 대다수
 * 신호를 놓쳐 정상 장기 턴을 stale로 오판한다. 대신 renderer의 store/reducer.ts
 * applyAgentEvent 스위치(L150-190)가 실제로 처리하는 AgentEvent 전체 타입을 "활동"으로
 * 집계한다 — SDK가 살아있는 한 흘러드는 실 스트림/턴 이벤트이기 때문이다(shared/
 * agent-events.ts 전체 union과 1:1 대응 — 실측 확인, 19종).
 *
 * ── 타이머 정책 ──────────────────────────────────────────────────────────────────────
 * setInterval 상시 tick 금지(P04 복원 페이지 갱신 루프 데드락과 같은 문제 재발 방지) —
 * "신호 수신 시점 기준 setTimeout 재설정" 방식만 사용한다. createStaleTimer가 그 최소
 * 단위(arm/dispose)를 제공하고, 실제 스코프별 배선(단일챗 foreground 1개 / 패널 키별)은
 * slices/runtime.ts·store/panelSession.ts가 각자 소유한다(전역 타이머 1개로 만들면 패널간
 * 오염 — 함정 항목).
 *
 * CRITICAL: 이 파일은 순수 로직 + 최소 타이머 래퍼만 — window.api/fs/네트워크 직접 호출 0.
 */
import type { AgentEvent } from '../../../shared/agent-events'

/**
 * GOAL_BANNER_STALE_THRESHOLD_MS — 마지막 활동 신호 후 이 시간(ms)이 지나면 stale 판정.
 * 기본 5분 — 영호 육안 트랙(ui-visual)에서 조정 가능하도록 상수화(문서 §함정 요구).
 * 오탐(false positive, 긴 자율 턴을 죽은 것으로 오판)-미탐(고착을 늦게 발견) trade-off:
 * 너무 짧으면 정상 SDK "사고 중" 공백(턴 경계 사이)도 stale로 오판하고, 너무 길면 고착
 * 발견이 늦어진다. 자동 강제 해제 대신 "표시 전환 + 수동 해제"를 택한 것도 같은 축의
 * 보수적 선택(오탐 시에도 배너 자체가 사라지지는 않음).
 */
export const GOAL_BANNER_STALE_THRESHOLD_MS = 5 * 60 * 1000

/**
 * ACTIVITY_EVENT_TYPES — "활동" 신호로 집계되는 AgentEvent.type 전체 목록.
 * reducer.ts applyAgentEvent 스위치가 처리하는 모든 케이스와 1:1(exhaustive) —
 * shared/agent-events.ts의 AgentEvent 전체 union과 정확히 대응한다(실측: 19종).
 * done/error도 포함: done은 지속세션 턴 경계마다 오되 autonomyActive를 끄지 않으므로
 * (reducer/lifecycle.ts handleDone) 유효한 생존신호이고, error는 즉시 autonomyActive를
 * false로 떨어뜨려 게이트 자체가 닫히므로 포함해도 무해하다(활동 스탬프가 남아도
 * autonomyActive=false면 goal 배너 자체가 안 뜬다 — lib/loopStatus.ts resolveLoopStatus).
 */
export const ACTIVITY_EVENT_TYPES: ReadonlySet<AgentEvent['type']> = new Set<AgentEvent['type']>([
  'text',
  'tool_call',
  'tool_result',
  'file_changed',
  'thinking',
  'thinking_clear',
  'orchestration',
  'orchestration_progress',
  'orchestration_denied',
  'subagent',
  'todos',
  'permission_request',
  'question_request',
  'model-fallback',
  'done',
  'error',
  'session',
  'loops',
  'autonomy_status',
])

/** isActivityEvent — type이 활동 신호 목록에 속하는지 판정(순수 함수). */
export function isActivityEvent(type: AgentEvent['type']): boolean {
  return ACTIVITY_EVENT_TYPES.has(type)
}

/**
 * isStaleNow — nowMs 시점에 lastActivityAt 기준으로 stale 여부 판정(순수 함수).
 * lastActivityAt===null(활동 신호 아직 없음)이면 false(판정 불가 — 애초에 goal 시작 전).
 */
export function isStaleNow(
  lastActivityAt: number | null,
  nowMs: number,
  thresholdMs: number = GOAL_BANNER_STALE_THRESHOLD_MS,
): boolean {
  if (lastActivityAt === null) return false
  return nowMs - lastActivityAt >= thresholdMs
}

/**
 * remainingStaleMs — 임계까지 남은 시간(ms). 음수/0이면 이미 초과(즉시 stale).
 * 전환·축출 복원 시 "남은 시간만큼 재무장"에 사용(경과 시간을 무시하고 리셋하지 않는다 —
 * 대화 전환·패널 캐시 축출 후 stale 판정 연속성 요구).
 */
export function remainingStaleMs(
  lastActivityAt: number,
  nowMs: number,
  thresholdMs: number = GOAL_BANNER_STALE_THRESHOLD_MS,
): number {
  return thresholdMs - (nowMs - lastActivityAt)
}

/** StaleTimerHandle — setTimeout 재설정 방식 타이머 핸들(setInterval 금지 트랩 준수). */
export interface StaleTimerHandle {
  /**
   * ms만큼(남은 시간) 재무장 — 기존 타이머는 취소 후 재설정(신호 수신 시점 기준).
   * ms<=0이면 이미 임계를 넘었다는 뜻 — 타이머를 걸지 않고 즉시 onStale을 동기 호출한다.
   */
  arm: (ms: number) => void
  /** 타이머 취소(스코프 종료 — abort/dead-run/패널 폐기/캐시 축출 등). */
  dispose: () => void
}

/**
 * createStaleTimer — onStale 콜백을 감싸는 타이머 핸들 생성.
 * 호출자(slices/runtime.ts 단일챗 foreground 1개 / panelSession.ts 패널 키별)가 스코프별로
 * 인스턴스를 소유·정리한다 — 이 함수 자체는 스코프를 모른다(재사용 가능한 최소 단위).
 */
export function createStaleTimer(onStale: () => void): StaleTimerHandle {
  let handle: ReturnType<typeof setTimeout> | null = null
  return {
    arm(ms: number) {
      if (handle !== null) {
        clearTimeout(handle)
        handle = null
      }
      if (ms <= 0) {
        onStale()
        return
      }
      handle = setTimeout(() => {
        handle = null
        onStale()
      }, ms)
    },
    dispose() {
      if (handle !== null) {
        clearTimeout(handle)
        handle = null
      }
    },
  }
}

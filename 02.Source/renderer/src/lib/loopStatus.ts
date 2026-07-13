/**
 * loopStatus.ts — 통합 루프 인디케이터의 표시 결정 순수 로직 (LR2-03, LR3-03, LR3-06,
 * BL1 후속: goal 표시 수명 일원화).
 *
 * 배경: LR2-03까지는 표시가 두 소스로 갈렸다 — 앱 타이머 루프(loopCommand.ts 인터셉트가
 * 굴리는 renderer 타이머) / SDK 크론 루프(LoopInfo[], main CronTracker가 loops 이벤트로
 * 정규화). LR3-03(앱 타이머 /loop 폐기 — 영호 확정 "토큰 맥싱")에서 앱 타이머 소스 자체가
 * 사라져 이 함수는 SDK 크론 하나만 판정했다.
 *
 * LR3-06: 세 번째 소스 goal(=`/goal` — SDK stop-hook 자기지속, 크론 아님) 편입.
 * goal은 크론과 메커니즘이 달라(loops 이벤트 0, 자체 진행 컨텍스트로만 관측) 별도
 * 인자로 받는다. **단일 표시 불변식**: 이 함수 한 곳에서만 우선순위를 결정 —
 * sdk(크론) > goal(자기지속) > stopped > none. 근거: 크론은 턴 경계 밖에서도 예약이
 * 살아있는 더 "메타"한 신호라 항상 우선 노출하고, goal은 현재 실행 안에서만 의미가
 * 있어 크론이 있으면 뒤로 물러나도 정보 손실이 적다.
 *
 * LR4 P05(폐기 — 아래 "BL1 후속" 참조): goal 가시성 게이트를 pendingCommand(낙관
 * 플래그)에서 autonomy_status 기반 autonomyActive(백엔드 실상태)로 교체했었다. 그러나
 * `autonomy_status active`는 claudeAgentRun.ts `_runPersistentPump`의 유예-흡수 경로
 * (idle-close grace 중 continuation 도착)에서만 방출되고, 단발(비-REPL) 세션의
 * `_runPump`에는 그 방출 지점 자체가 없다(F-B 중간 done 보류가 여러 turn을 하나로
 * 뭉갠다) — `/goal`이 실제로 진행 중인데도 이 신호가 한 번도 오지 않는 경로가
 * 실측됐다(2026-07-13 10:18 goal, 카드 턴수는 5턴까지 증가했지만 배너/gloss 미표시).
 *
 * BL1 후속(goal 표시 수명 일원화, 영호 확정 2026-07-13): 가시성·내용 게이트를
 * autonomyActive에서 store의 지속 goal 컨텍스트(AppState.goalRun)로 교체한다.
 *   - 점등 = 커맨드 입력 시점(낙관적, begin-command가 goalRun을 즉시 생성).
 *   - 소등 = 백엔드 종료 신호(autonomy_status ended / error / abort)에서만(goalRun이
 *     그 시점에만 소멸).
 *   - 턴 경계(handleDone)에는 goalRun이 절대 소멸·리셋되지 않는다 — 자율 연속 턴
 *     사이에도 배너 내용(turns/detail)이 유지된다(구 pendingCommand-enrichment 방식의
 *     "턴 경계마다 0/null로 퇴화" 결함도 함께 봉합).
 * autonomyActive 필드 자체(이벤트 처리·터미널 리셋)는 폐기하지 않는다 — 이 함수의
 * 가시성 판정에서만 빠진다(다른 소비처: lib/stopAction.ts는 pendingCommand를 직접
 * 참조하므로 이 변경과 무관 — grep 확인 완료).
 *
 * BL1 P03(stale-watchdog, LR4-DONE:76 잔여 4번): ended 신호가 유실되면 goalRun이
 * 영원히 살아있어 goal 배너가 고착될 수 있다 — 4·5번째 인자(bannerStale/staleDismissed,
 * store가 store/staleWatchdog.ts 판정을 반영)로 goal 변형을 goal-stale로 전환하거나
 * (staleDismissed) 완전히 숨긴다. goalRun 자체는 이 함수가 되돌리지 않는다(표시-only
 * 원칙, ADR-024와 동일 정신).
 *
 * LoopStatusBanner 하나만 렌더(컴포저 위) — 표시 위치·문법은 그대로 유지.
 *
 * CRITICAL(신뢰경계): 순수 함수 — window.api/fs/타이머 0. 컴포넌트가 이 판정을 렌더만.
 */
import type { LoopInfo } from '../../../shared/agent-events'

/**
 * resolveLoopStatus 두 번째 인자로 받는 pendingCommand의 최소 구조.
 * reducer/types.ts AppState['pendingCommand']의 구조적 부분집합(name·turns만 사용) —
 * 순수 lib가 reducer 타입에 직접 결합하지 않도록 여기서 로컬 정의.
 *
 * BL1 후속: resolveLoopStatus 자체는 더 이상 이 타입을 소비하지 않는다(goalRun으로
 * 대체) — lib/stopAction.ts(정지 버튼 판정, "goal/loop 활성이면 abort")가 여전히
 * pendingCommand.name==='goal' 판정에 이 타입을 쓰므로 export는 유지한다(다른 관심사 —
 * 표시 로직과 정지 로직을 의도적으로 분리, stopAction.ts JSDoc 참조).
 */
export interface GoalPendingLike {
  name: string
  /** 새 assistant msg(턴 경계)마다 +1 — reducer text.ts가 갱신. 없으면 0으로 취급. */
  turns?: number
  /**
   * FB2 P08: begin 시점의 커맨드 인자(goal 목표 텍스트) — 카드 3단 정보위계의
   * "작업 주제"(2번째 층위) 소스. 없으면(구 호출부·타 커맨드) null로 취급.
   */
  detail?: string | null
}

/**
 * resolveLoopStatus 두 번째 인자 — AppState.goalRun의 구조적 부분집합(turns·detail만
 * 사용). BL1 후속: 이 값이 non-null이면 그 자체가 가시성 신호다(구 pendingCommand의
 * name 필터링·autonomyActive 게이트 모두 불필요 — goalRun은 애초에 '/goal'에만,
 * 종료 신호가 올 때까지만 존재하도록 store가 보장한다).
 */
export interface GoalRunLike {
  turns: number
  detail: string | null
}

/** 통합 인디케이터가 표시할 단일 상태 — 배너는 이 union만 소비한다. */
export type LoopStatus =
  | { kind: 'none' }
  /** SDK 크론 루프 활성. */
  | { kind: 'sdk'; loops: LoopInfo[] }
  /**
   * `/goal` 자율 반복 진행 중(LR3-06). detail(FB2 P08): 3단 정보위계의 "작업 주제"
   * (사용자가 지정한 목표 텍스트) — 없으면 null(맨몸 /goal).
   */
  | { kind: 'goal'; turns: number; detail: string | null }
  /**
   * BL1 P03: goal 자율 반복 중 마지막 활동 신호로부터 임계 시간이 지나 "신호 없음"으로
   * 전환된 상태(stale-watchdog). ended 신호 유실 폴백 — goalRun은 여전히 살아있지만
   * (엔진이 실제로 끝났는지 이 시점엔 알 수 없음) 표시만 경고로 바뀐다. turns/detail은
   * goal과 동일 소스(stale 전환 직전까지의 진행 맥락 유지).
   */
  | { kind: 'goal-stale'; turns: number; detail: string | null }
  /**
   * 정지 확인(LR3-06 정지 신뢰 피드백 — 영호 육안 피드백 2026-07-03).
   * abort로 루프를 끊은 직후 — "예약된 반복이 세션과 함께 정리됨"을 사용자에게 확인.
   * 배경: 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 정지 후 80s간 옛 runId
   * 이벤트 증가 0)이나, 배너가 즉시 사라지기만 해 정리 여부를 신뢰할 수 없었다.
   */
  | { kind: 'stopped' }

/**
 * SDK 크론(activeLoops) + goal(goalRun 단일 소스, BL1 후속) + 정지확인(stoppedNotice)
 * → 단일 표시 상태.
 * 우선순위: sdk > goal(-stale) > stopped > none(불변식 — 이 함수 한 곳에서만 결정).
 * stopped가 최하위인 이유: 살아있는 루프 신호(sdk/goal)가 있으면 "정지됨" 확인은
 * 이미 낡은 정보라 뒤로 물러난다(새 루프 시작 시 reducer가 notice 자체도 해제).
 *
 * BL1 후속: goal 변형은 goalRun!==null일 때만 노출된다(store가 begin-command 시점에
 * 낙관적으로 생성, 종료 신호에서만 소멸 — 자세한 수명 규칙은 reducer/types.ts
 * AppState.goalRun JSDoc 참조). turns/detail은 goalRun에서 그대로 읽는다(구
 * pendingCommand-enrichment 2단계 방식 폐기 — goalRun 자체가 이미 정확한 값을 보장).
 */
export function resolveLoopStatus(
  activeLoops: LoopInfo[],
  goalRun?: GoalRunLike | null,
  stoppedNotice?: boolean,
  bannerStale?: boolean,
  staleDismissed?: boolean,
): LoopStatus {
  if (activeLoops.length > 0) {
    return { kind: 'sdk', loops: activeLoops }
  }
  if (goalRun) {
    // BL1 P03: 수동 해제(staleDismissed) — 표시만 숨긴다(goalRun은 불변, 자동
    // 강제 해제 금지). 아래 stoppedNotice/none 우선순위로 자연스럽게 떨어진다.
    if (!staleDismissed) {
      if (bannerStale) {
        return { kind: 'goal-stale', turns: goalRun.turns, detail: goalRun.detail }
      }
      return { kind: 'goal', turns: goalRun.turns, detail: goalRun.detail }
    }
  }
  if (stoppedNotice) {
    return { kind: 'stopped' }
  }
  return { kind: 'none' }
}

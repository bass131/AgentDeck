/**
 * loopStatus.ts — 통합 루프 인디케이터의 표시 결정 순수 로직 (LR2-03, LR3-03, LR3-06).
 *
 * 배경: LR2-03까지는 표시가 두 소스로 갈렸다 — 앱 타이머 루프(loopCommand.ts 인터셉트가
 * 굴리는 renderer 타이머) / SDK 크론 루프(LoopInfo[], main CronTracker가 loops 이벤트로
 * 정규화). LR3-03(앱 타이머 /loop 폐기 — 영호 확정 "토큰 맥싱")에서 앱 타이머 소스 자체가
 * 사라져 이 함수는 SDK 크론 하나만 판정했다.
 *
 * LR3-06: 세 번째 소스 goal(=`/goal` — SDK stop-hook 자기지속, 크론 아님) 편입.
 * goal은 크론과 메커니즘이 달라(loops 이벤트 0, `pendingCommand` 턴 카운트로만 관측)
 * 별도 인자로 받는다. **단일 표시 불변식**: 이 함수 한 곳에서만 우선순위를 결정 —
 * sdk(크론) > goal(자기지속) > none. 근거: 크론은 턴 경계 밖에서도 예약이 살아있는
 * 더 "메타"한 신호라 항상 우선 노출하고, goal은 현재 턴 안에서만 의미가 있어 크론이
 * 있으면 뒤로 물러나도 정보 손실이 적다(둘이 동시에 잡히는 경우는 실무상 희귀 — 크론
 * 틱이 /goal을 트리거하는 조합 정도).
 *
 * LR4 P05: goal 가시성 게이트를 pendingCommand(낙관 플래그)에서 autonomyActive(백엔드
 * 실상태, 4번째 인자)로 교체 — 조기발동(요청 즉시 켜짐)·미해제(조용한 사멸 후 안 꺼짐)
 * 두 결함 봉합. 각 autonomous 턴의 done이 handleDone에서 pendingCommand를 null로 지우므로
 * (턴 경계마다 반복) 가시성을 pendingCommand에 걸면 배너가 자율 턴 사이마다 깜빡인다 —
 * autonomyActive는 ended 신호 전까지 살아있는 강건한 게이트다. pendingCommand는 이제
 * turns/detail "enrichment"(3단 위계 2·3번째 층위) 소스로만 남는다.
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
   * 정지 확인(LR3-06 정지 신뢰 피드백 — 영호 육안 피드백 2026-07-03).
   * abort로 루프를 끊은 직후 — "예약된 반복이 세션과 함께 정리됨"을 사용자에게 확인.
   * 배경: 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 정지 후 80s간 옛 runId
   * 이벤트 증가 0)이나, 배너가 즉시 사라지기만 해 정리 여부를 신뢰할 수 없었다.
   */
  | { kind: 'stopped' }

/**
 * SDK 크론(activeLoops) + goal(autonomyActive 게이트, pendingCommand는 enrichment) +
 * 정지확인(stoppedNotice) → 단일 표시 상태.
 * 우선순위: sdk > (autonomyActive)goal > stopped > none(불변식 — 이 함수 한 곳에서만 결정).
 * stopped가 최하위인 이유: 살아있는 루프 신호(sdk/goal)가 있으면 "정지됨" 확인은
 * 이미 낡은 정보라 뒤로 물러난다(새 루프 시작 시 reducer가 notice 자체도 해제).
 *
 * LR4 P05: goal 변형은 autonomyActive===true일 때만 노출된다(백엔드 실상태 게이트).
 * pendingCommand는 turns/detail을 채우는 enrichment 소스일 뿐 가시성을 결정하지 않는다 —
 * autonomyActive=true인데 pendingCommand가 null(자율 턴 사이 handleDone이 지운 순간)이어도
 * goal은 유지되고 turns=0/detail=null로 표시된다(강건성 — 배너 깜빡임 방지).
 */
export function resolveLoopStatus(
  activeLoops: LoopInfo[],
  pendingCommand?: GoalPendingLike | null,
  stoppedNotice?: boolean,
  autonomyActive?: boolean,
): LoopStatus {
  if (activeLoops.length > 0) {
    return { kind: 'sdk', loops: activeLoops }
  }
  if (autonomyActive) {
    return {
      kind: 'goal',
      turns: pendingCommand?.name === 'goal' ? (pendingCommand.turns ?? 0) : 0,
      detail: pendingCommand?.name === 'goal' ? (pendingCommand.detail ?? null) : null,
    }
  }
  if (stoppedNotice) {
    return { kind: 'stopped' }
  }
  return { kind: 'none' }
}

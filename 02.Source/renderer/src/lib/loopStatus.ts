/**
 * loopStatus.ts — 통합 루프 인디케이터의 표시 결정 순수 로직 (LR2-03, LR3-03 단순화).
 *
 * 배경: LR2-03까지는 표시가 두 소스로 갈렸다 — 앱 타이머 루프(loopCommand.ts 인터셉트가
 * 굴리는 renderer 타이머) / SDK 크론 루프(LoopInfo[], main CronTracker가 loops 이벤트로
 * 정규화). LR3-03(앱 타이머 /loop 폐기 — 영호 확정 "토큰 맥싱")에서 앱 타이머 소스 자체가
 * 사라져 이 함수는 SDK 크론 하나만 판정한다.
 *
 * LoopStatusBanner 하나만 렌더(컴포저 위) — 표시 위치·문법은 그대로 유지.
 *
 * CRITICAL(신뢰경계): 순수 함수 — window.api/fs/타이머 0. 컴포넌트가 이 판정을 렌더만.
 */
import type { LoopInfo } from '../../../shared/agent-events'

/** 통합 인디케이터가 표시할 단일 상태 — 배너는 이 union만 소비한다. */
export type LoopStatus =
  | { kind: 'none' }
  /** SDK 크론 루프만 활성. */
  | { kind: 'sdk'; loops: LoopInfo[] }

/** SDK 크론 루프 소스 → 단일 표시 상태. */
export function resolveLoopStatus(activeLoops: LoopInfo[]): LoopStatus {
  if (activeLoops.length > 0) {
    return { kind: 'sdk', loops: activeLoops }
  }
  return { kind: 'none' }
}

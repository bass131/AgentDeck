/**
 * loopStatus.ts — 통합 루프 인디케이터의 표시 결정 순수 로직 (LR2-03).
 *
 * 배경: 루프 표시가 두 소스로 갈린다 —
 *   - 앱 타이머 루프(ActiveLoop): 단발 모드 `/loop` 인터셉트(loopCommand.ts)가 굴리는
 *     renderer 타이머. 사용자가 직접 발화·정지/닫기 UX 보유.
 *   - SDK 크론 루프(LoopInfo[]): REPL 지속세션에서 엔진이 크론으로 자기제어하는 루프
 *     (main CronTracker가 loops 이벤트로 정규화 — 실측: /goal은 stop-hook 자기지속이라
 *     여기 안 잡히고, `/loop`·`/schedule` 크론만 잡힌다).
 *
 * 종전에는 두 컴포넌트가 서로 다른 위치(우상단 pill / 컴포저 배너)에 렌더돼 동시 표시
 * 회피가 replMode 분기에 *우연히* 의존했다. 이 함수가 "무엇을 표시할지"를 단일
 * discriminated union으로 결정하고 LoopStatusBanner 하나만 렌더 → 동시 표시 없음을
 * 구조적으로 보장한다(03-loop-gui.md 완료조건).
 *
 * 우선순위: app > sdk > none.
 *   - app 우선 근거: 사용자 발화 루프라 정지/상한알림 UX가 붙어 있고, stopped 상한
 *     알림이 크론 표시에 가려지면 안 된다. 크론 정보는 extraSdkLoops로 배너에 병기
 *     (정보 은닉 없이 단일 표면). 트레이드오프: 크론 개별 summary는 앱 루프 종료 후 노출.
 *
 * CRITICAL(신뢰경계): 순수 함수 — window.api/fs/타이머 0. 컴포넌트가 이 판정을 렌더만.
 */
import type { ActiveLoop } from './loopCommand'
import type { LoopInfo } from '../../../shared/agent-events'

/** 통합 인디케이터가 표시할 단일 상태 — 배너는 이 union만 소비한다. */
export type LoopStatus =
  | { kind: 'none' }
  /** 앱 타이머 루프(running/stopped 공통). extraSdkLoops: 동시 활성 SDK 크론 수(힌트 병기). */
  | { kind: 'app'; loop: ActiveLoop; extraSdkLoops: number }
  /** SDK 크론 루프만 활성. */
  | { kind: 'sdk'; loops: LoopInfo[] }

/** 두 루프 소스 → 단일 표시 상태. 우선순위 app > sdk > none. */
export function resolveLoopStatus(
  activeLoop: ActiveLoop | null,
  activeLoops: LoopInfo[]
): LoopStatus {
  if (activeLoop) {
    return { kind: 'app', loop: activeLoop, extraSdkLoops: activeLoops.length }
  }
  if (activeLoops.length > 0) {
    return { kind: 'sdk', loops: activeLoops }
  }
  return { kind: 'none' }
}

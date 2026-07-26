/**
 * replIndicator.ts — REPL 상태 표시등 점등 판정 (LR3-06, 영호 조정 2026-07-03).
 *
 * 배경(P06 육안 게이트 피드백): 애초 P06 초안은 "지금 실제로 세션이 살아있는지"(isRunning
 * || hasActiveLoop)를 대리(proxy)해 활동 중에만 점등했다. 하지만 영호 육안 검토에서 의미를
 * 조정 — REPL 버튼은 "세션 활동 표시등"이 아니라 **"기능이 켜져 있다"는 상시 표시등**이어야
 * 한다는 지시("ON을 통해 기능이 활성화 되어 있으면 계속 점등"). 즉 판정은 이제 토글
 * 상태(replMode) 그 자체와 동일 — activity(isRunning/hasActiveLoop) 신호는 더 이상 관여하지
 * 않는다(호출부도 해당 인자를 넘길 필요가 없어져 정리됨).
 *
 * CRITICAL: 순수 함수 — window.api/fs/타이머 0.
 */

/**
 * REPL 상태 표시등 점등 여부.
 *
 * ON(토글 활성)이면 세션 활동 여부와 무관하게 상시 점등, OFF면 상시 소등 — "기능이 켜져
 * 있음"을 보여주는 단순 표시등(P03 계약: OFF=강제 단발과 별개, 표시는 토글 자체만 반영).
 *
 * @param replMode REPL 지속세션 토글 상태 (P03 기본 true).
 */
export function resolveReplLit(replMode: boolean): boolean {
  return replMode
}

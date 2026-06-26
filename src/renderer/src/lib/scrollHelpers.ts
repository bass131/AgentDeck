/**
 * scrollHelpers.ts — 스크롤 상태 판단 순수 함수.
 * renderer untrusted — 부수효과 0, 순수 계산만.
 */

export interface ScrollMeasure {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

/**
 * 사용자가 바닥에서 일정 거리(THRESHOLD) 이상 위로 스크롤했는지 판단.
 * threshold 기본값 40px — Conversation.handleScroll과 동일.
 * @returns true = 위로 스크롤 중(바닥 아님), false = 바닥 근처
 */
export function isScrolledUp(
  { scrollHeight, scrollTop, clientHeight }: ScrollMeasure,
  threshold = 40
): boolean {
  return scrollHeight - scrollTop - clientHeight > threshold
}

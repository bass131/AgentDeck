export interface ScrollMeasure {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export function isScrolledUp(
  { scrollHeight, scrollTop, clientHeight }: ScrollMeasure,
  threshold = 40
): boolean {
  return scrollHeight - scrollTop - clientHeight > threshold
}

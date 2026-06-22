/**
 * geometry.ts — 수동 drag/resize 좌표 수학 (순수, electron 무의존).
 *
 * 투명 frameless 창은 OS 네이티브 드래그/리사이즈가 없다(Phase 02). main이
 * 커서를 추종하며 setBounds 할 때 쓸 bounds를 여기서 계산한다. 순수 함수라
 * node 환경에서 단위 검증 가능 — 추종 로직의 안전망.
 */

import type { ResizeEdge } from '../../shared/ipc-contract'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * 드래그: grab 시점 대비 커서 이동량만큼 창을 평행이동(크기 불변).
 * setPosition이 아니라 setBounds로 적용(투명창 DPI 안전 — Phase 02).
 */
export function computeDragBounds(start: Bounds, startCursor: Point, cur: Point): Bounds {
  const dx = cur.x - startCursor.x
  const dy = cur.y - startCursor.y
  return { x: start.x + dx, y: start.y + dy, width: start.width, height: start.height }
}

/**
 * 리사이즈: 지정 엣지를 커서 이동량만큼 늘린다. 반대편 엣지는 고정.
 * 최소 크기(minW/minH) 미만이면 클램프하고, w/n 엣지는 고정 엣지를 유지하도록
 * x/y를 보정한다. 결과는 정수로 반올림(서브픽셀 흔들림 방지).
 */
export function computeResizeBounds(
  start: Bounds,
  edge: ResizeEdge,
  startCursor: Point,
  cur: Point,
  minW: number,
  minH: number
): Bounds {
  const dx = cur.x - startCursor.x
  const dy = cur.y - startCursor.y

  let { x, y, width, height } = start

  if (edge.includes('e')) width = start.width + dx
  if (edge.includes('s')) height = start.height + dy
  if (edge.includes('w')) {
    width = start.width - dx
    x = start.x + dx
  }
  if (edge.includes('n')) {
    height = start.height - dy
    y = start.y + dy
  }

  // 최소 너비 클램프 — w 엣지는 동쪽 엣지 고정 유지(x 되돌림).
  if (width < minW) {
    if (edge.includes('w')) x -= minW - width
    width = minW
  }
  // 최소 높이 클램프 — n 엣지는 하단 엣지 고정 유지(y 되돌림).
  if (height < minH) {
    if (edge.includes('n')) y -= minH - height
    height = minH
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

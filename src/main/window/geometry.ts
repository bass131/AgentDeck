/**
 * geometry.ts — 수동 drag/resize 좌표 수학 (순수, electron 무의존).
 *
 * 투명 frameless 창은 OS 네이티브 드래그/리사이즈가 없다(Phase 02). main이
 * 커서를 추종하며 setBounds 할 때 쓸 bounds를 여기서 계산한다. 순수 함수라
 * node 환경에서 단위 검증 가능 — 추종 로직의 안전망.
 *
 * F14-03: 창 스냅 존 판별(computeSnapZone) + 스냅 bounds 계산(snapBounds) 추가.
 * 두 함수 모두 electron 무의존 순수 함수 — 동일하게 단위 검증 가능.
 */

import type { ResizeEdge, WindowBounds } from '../../shared/ipc-contract'

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

// ─────────────────────────────────────────────────────────────────────────────
// F14-03: 창 스냅 존 (순수 함수, electron 무의존)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 스냅 존 식별자 유니온.
 *
 * - 'left' / 'right'  : 좌·우 절반
 * - 'maximize'        : 상단 엣지 → 전체 workArea
 * - 'tl' / 'tr' / 'bl' / 'br' : 4 모서리 → 사분면
 */
export type SnapZone = 'left' | 'right' | 'maximize' | 'tl' | 'tr' | 'bl' | 'br'

/**
 * 커서 위치가 workArea 엣지/모서리 근처인지 판별해 스냅 존을 반환한다.
 * 어느 존에도 해당하지 않으면 null.
 *
 * 우선순위: 모서리(tl/tr/bl/br) > 상단(maximize) > 좌(left) > 우(right).
 * 하단 엣지 단독은 스냅 없음(null).
 *
 * 판별 기준:
 *   lef  = cursor.x <= workArea.x + threshold
 *   rig  = cursor.x >= workArea.x + workArea.width - 1 - threshold
 *   top  = cursor.y <= workArea.y + threshold
 *   bot  = cursor.y >= workArea.y + workArea.height - 1 - threshold
 *
 *   모서리: (lef AND top) → tl, (rig AND top) → tr, (lef AND bot) → bl, (rig AND bot) → br
 *   직선 : top → maximize, lef → left, rig → right
 *
 * @param cursor    스크린 좌표 커서 위치 (screen.getCursorScreenPoint() 결과)
 * @param workArea  디스플레이 workArea bounds
 * @param threshold 엣지 인식 두께(px, default 8). 경계 값 포함(≤/≥).
 */
export function computeSnapZone(
  cursor: Point,
  workArea: WindowBounds,
  threshold: number = 8
): SnapZone | null {
  const { x: wx, y: wy, width: ww, height: wh } = workArea

  const lef = cursor.x <= wx + threshold
  const rig = cursor.x >= wx + ww - 1 - threshold
  const top = cursor.y <= wy + threshold
  const bot = cursor.y >= wy + wh - 1 - threshold

  // 모서리 우선 (두 엣지 동시 충족)
  if (lef && top) return 'tl'
  if (rig && top) return 'tr'
  if (lef && bot) return 'bl'
  if (rig && bot) return 'br'

  // 직선 엣지 (단독)
  if (top) return 'maximize'
  if (lef) return 'left'
  if (rig) return 'right'

  return null
}

/**
 * 스냅 존에 해당하는 창 bounds를 계산한다.
 *
 * - left/right  : workArea 너비 절반씩 (홀수 width는 right가 잔차 1px 흡수)
 * - maximize    : workArea 전체
 * - tl/tr/bl/br : 사분면 (홀수 width/height 잔차 우측·하단 흡수)
 *
 * 결과는 정수(Math.round 적용) — 서브픽셀 흔들림 방지.
 *
 * @param zone     computeSnapZone 이 반환한 스냅 존
 * @param workArea 디스플레이 workArea bounds
 */
export function snapBounds(zone: SnapZone, workArea: WindowBounds): WindowBounds {
  const { x: wx, y: wy, width: ww, height: wh } = workArea
  const hw = Math.round(ww / 2) // 좌측/상단 절반
  const hh = Math.round(wh / 2)
  const rw = ww - hw // 우측/하단 잔차 흡수 → 두 쪽 합 = workArea 전체
  const bh = wh - hh

  switch (zone) {
    case 'left':
      return { x: wx, y: wy, width: hw, height: wh }
    case 'right':
      return { x: wx + hw, y: wy, width: rw, height: wh }
    case 'maximize':
      return { x: wx, y: wy, width: ww, height: wh }
    case 'tl':
      return { x: wx, y: wy, width: hw, height: hh }
    case 'tr':
      return { x: wx + hw, y: wy, width: rw, height: hh }
    case 'bl':
      return { x: wx, y: wy + hh, width: hw, height: bh }
    case 'br':
      return { x: wx + hw, y: wy + hh, width: rw, height: bh }
  }
}

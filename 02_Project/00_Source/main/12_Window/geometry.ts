import type { ResizeEdge, WindowBounds } from '../../shared/ipcContract'

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

export function computeDragBounds(start: Bounds, startCursor: Point, cur: Point): Bounds {
  const dx = cur.x - startCursor.x
  const dy = cur.y - startCursor.y
  return { x: start.x + dx, y: start.y + dy, width: start.width, height: start.height }
}

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

  if (width < minW) {
    if (edge.includes('w')) x -= minW - width
    width = minW
  }
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

export type SnapZone = 'left' | 'right' | 'maximize' | 'tl' | 'tr' | 'bl' | 'br'

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

  if (lef && top) return 'tl'
  if (rig && top) return 'tr'
  if (lef && bot) return 'bl'
  if (rig && bot) return 'br'

  if (top) return 'maximize'
  if (lef) return 'left'
  if (rig) return 'right'

  return null
}

export function snapBounds(zone: SnapZone, workArea: WindowBounds): WindowBounds {
  const { x: wx, y: wy, width: ww, height: wh } = workArea
  const hw = Math.round(ww / 2)
  const hh = Math.round(wh / 2)
  const rw = ww - hw
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

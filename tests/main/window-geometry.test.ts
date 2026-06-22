/**
 * window-geometry.test.ts — 수동 drag/resize 좌표 수학 (TDD RED 먼저).
 *
 * 투명 frameless 창은 OS 네이티브 드래그/리사이즈가 없어 main이 커서를 추종해
 * setBounds 한다(Phase 02). 그 좌표 계산을 순수 함수로 분리 — electron 무의존,
 * node 환경에서 단위 검증. 안전망(plan-auditor 권고): 추종 setBounds가 올바른
 * bounds를 내는지 여기서 닫는다.
 */
import { describe, it, expect } from 'vitest'
import { computeDragBounds, computeResizeBounds } from '../../src/main/window/geometry'

// 시작 창은 최소 크기(1024x680)보다 크게 — 리사이즈 클램프와 무관한 케이스 확인용.
const start = { x: 100, y: 100, width: 1200, height: 800 }
const minW = 1024
const minH = 680

describe('computeDragBounds — 평행이동(크기 불변)', () => {
  it('커서 이동량만큼 창을 옮기고 크기는 유지한다', () => {
    const b = computeDragBounds(start, { x: 500, y: 300 }, { x: 540, y: 330 })
    expect(b).toEqual({ x: 140, y: 130, width: 1200, height: 800 })
  })

  it('커서가 안 움직이면 bounds 불변', () => {
    const b = computeDragBounds(start, { x: 500, y: 300 }, { x: 500, y: 300 })
    expect(b).toEqual(start)
  })

  it('음의 델타(좌상단 이동)도 처리한다', () => {
    const b = computeDragBounds(start, { x: 500, y: 300 }, { x: 460, y: 270 })
    expect(b).toEqual({ x: 60, y: 70, width: 1200, height: 800 })
  })
})

describe('computeResizeBounds — 엣지별 (min 1024x680)', () => {
  it('e(동): 너비만 증가, x/y/height 불변', () => {
    const b = computeResizeBounds(start, 'e', { x: 1300, y: 400 }, { x: 1400, y: 400 }, minW, minH)
    expect(b).toEqual({ x: 100, y: 100, width: 1300, height: 800 })
  })

  it('s(남): 높이만 증가', () => {
    const b = computeResizeBounds(start, 's', { x: 400, y: 900 }, { x: 400, y: 1000 }, minW, minH)
    expect(b).toEqual({ x: 100, y: 100, width: 1200, height: 900 })
  })

  it('w(서): 너비 증가 + x 좌측 이동(동쪽 엣지 고정)', () => {
    // 커서 좌로 50 → x -50, width +50. 동쪽 엣지(x+width=1300) 유지.
    const b = computeResizeBounds(start, 'w', { x: 100, y: 400 }, { x: 50, y: 400 }, minW, minH)
    expect(b).toEqual({ x: 50, y: 100, width: 1250, height: 800 })
    expect(b.x + b.width).toBe(start.x + start.width)
  })

  it('n(북): 높이 증가 + y 상단 이동(하단 엣지 고정)', () => {
    const b = computeResizeBounds(start, 'n', { x: 400, y: 100 }, { x: 400, y: 60 }, minW, minH)
    expect(b).toEqual({ x: 100, y: 60, width: 1200, height: 840 })
    expect(b.y + b.height).toBe(start.y + start.height)
  })

  it('se(남동 모서리): 너비+높이 동시 증가', () => {
    const b = computeResizeBounds(start, 'se', { x: 1300, y: 900 }, { x: 1400, y: 1000 }, minW, minH)
    expect(b).toEqual({ x: 100, y: 100, width: 1300, height: 900 })
  })

  it('e 최소너비 클램프: minW 미만으로 줄지 않는다', () => {
    const b = computeResizeBounds(start, 'e', { x: 1300, y: 400 }, { x: 100, y: 400 }, minW, minH)
    expect(b.width).toBe(minW)
  })

  it('w 최소너비 클램프: 동쪽 엣지 고정 유지하며 minW', () => {
    // 커서 우로 크게 → width 줄다 minW 클램프. 동쪽 엣지 고정.
    const b = computeResizeBounds(start, 'w', { x: 100, y: 400 }, { x: 400, y: 400 }, minW, minH)
    expect(b.width).toBe(minW)
    expect(b.x + b.width).toBe(start.x + start.width)
  })

  it('n 최소높이 클램프: 하단 엣지 고정 유지하며 minH', () => {
    const b = computeResizeBounds(start, 'n', { x: 400, y: 100 }, { x: 400, y: 400 }, minW, minH)
    expect(b.height).toBe(minH)
    expect(b.y + b.height).toBe(start.y + start.height)
  })
})

/**
 * window-geometry.test.ts — 수동 drag/resize 좌표 수학 (TDD RED 먼저).
 *
 * 투명 frameless 창은 OS 네이티브 드래그/리사이즈가 없어 main이 커서를 추종해
 * setBounds 한다(Phase 02). 그 좌표 계산을 순수 함수로 분리 — electron 무의존,
 * node 환경에서 단위 검증. 안전망(plan-auditor 권고): 추종 setBounds가 올바른
 * bounds를 내는지 여기서 닫는다.
 *
 * F14-03: computeSnapZone / snapBounds golden 케이스 추가.
 */
import { describe, it, expect } from 'vitest'
import { computeDragBounds, computeResizeBounds, computeSnapZone, snapBounds } from '../../../02.Source/main/06_window/geometry'

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

// ═══════════════════════════════════════════════════════════════════════════════
// F14-03: computeSnapZone / snapBounds golden 케이스
// workArea = { x:0, y:0, width:1920, height:1080 }, threshold=8
// ═══════════════════════════════════════════════════════════════════════════════

const workArea = { x: 0, y: 0, width: 1920, height: 1080 }
const T = 8 // threshold

describe('computeSnapZone — 존 판별 (golden)', () => {
  // ── 모서리(corners) — 직선 엣지보다 우선 ──────────────────────────────────
  it('tl: 커서가 좌측 엣지 + 상단 근접이면 tl', () => {
    expect(computeSnapZone({ x: 0, y: 4 }, workArea, T)).toBe('tl')
  })

  it('tl: 커서가 상단 엣지 + 좌측 근접이면 tl', () => {
    expect(computeSnapZone({ x: 4, y: 0 }, workArea, T)).toBe('tl')
  })

  it('tr: 커서가 우측 엣지 + 상단 근접이면 tr', () => {
    expect(computeSnapZone({ x: 1919, y: 4 }, workArea, T)).toBe('tr')
  })

  it('tr: 커서가 상단 엣지 + 우측 근접이면 tr', () => {
    expect(computeSnapZone({ x: 1916, y: 0 }, workArea, T)).toBe('tr')
  })

  it('bl: 커서가 좌측 엣지 + 하단 근접이면 bl', () => {
    expect(computeSnapZone({ x: 0, y: 1076 }, workArea, T)).toBe('bl')
  })

  it('bl: 커서가 하단 엣지 + 좌측 근접이면 bl', () => {
    expect(computeSnapZone({ x: 4, y: 1079 }, workArea, T)).toBe('bl')
  })

  it('br: 커서가 우측 엣지 + 하단 근접이면 br', () => {
    expect(computeSnapZone({ x: 1919, y: 1076 }, workArea, T)).toBe('br')
  })

  it('br: 커서가 하단 엣지 + 우측 근접이면 br', () => {
    expect(computeSnapZone({ x: 1916, y: 1079 }, workArea, T)).toBe('br')
  })

  // ── 직선 엣지 ────────────────────────────────────────────────────────────
  it('maximize: 커서가 상단 엣지(중앙부)에 있으면 maximize', () => {
    // x=960(중앙)은 좌우 corner 기준 8px 밖 → 직선 top
    expect(computeSnapZone({ x: 960, y: 0 }, workArea, T)).toBe('maximize')
  })

  it('left: 커서가 좌측 엣지(중앙부)에 있으면 left', () => {
    expect(computeSnapZone({ x: 0, y: 540 }, workArea, T)).toBe('left')
  })

  it('right: 커서가 우측 엣지(중앙부)에 있으면 right', () => {
    expect(computeSnapZone({ x: 1919, y: 540 }, workArea, T)).toBe('right')
  })

  // ── 내부(null) ────────────────────────────────────────────────────────────
  it('null: 커서가 workArea 중앙이면 null', () => {
    expect(computeSnapZone({ x: 960, y: 540 }, workArea, T)).toBeNull()
  })

  it('null: 엣지에서 threshold+1 안쪽이면 null', () => {
    // 좌측 엣지에서 9px 안쪽(x=9), y는 모서리도 아님(중앙)
    expect(computeSnapZone({ x: 9, y: 540 }, workArea, T)).toBeNull()
  })

  it('null: 하단 엣지에서 threshold+1 안쪽이면 null', () => {
    expect(computeSnapZone({ x: 960, y: 1071 }, workArea, T)).toBeNull()
  })

  // ── threshold 경계(on-the-edge) ───────────────────────────────────────────
  it('left: x=threshold(8)이면 left(경계 포함)', () => {
    expect(computeSnapZone({ x: 8, y: 540 }, workArea, T)).toBe('left')
  })

  it('null: x=threshold+1(9)이면 null', () => {
    expect(computeSnapZone({ x: 9, y: 540 }, workArea, T)).toBeNull()
  })
})

describe('snapBounds — workArea 1920×1080 기준', () => {
  // ── 반(half) ─────────────────────────────────────────────────────────────
  it('left: 좌측 절반 (x=0, y=0, w=960, h=1080)', () => {
    expect(snapBounds('left', workArea)).toEqual({ x: 0, y: 0, width: 960, height: 1080 })
  })

  it('right: 우측 절반 (x=960, y=0, w=960, h=1080)', () => {
    // rw = 1920 - round(1920/2) = 1920 - 960 = 960
    expect(snapBounds('right', workArea)).toEqual({ x: 960, y: 0, width: 960, height: 1080 })
  })

  it('maximize: 전체 workArea', () => {
    expect(snapBounds('maximize', workArea)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  // ── 사분면(quadrant) ─────────────────────────────────────────────────────
  it('tl: 좌상 사분면 (x=0, y=0, w=960, h=540)', () => {
    expect(snapBounds('tl', workArea)).toEqual({ x: 0, y: 0, width: 960, height: 540 })
  })

  it('tr: 우상 사분면 (x=960, y=0, w=960, h=540)', () => {
    expect(snapBounds('tr', workArea)).toEqual({ x: 960, y: 0, width: 960, height: 540 })
  })

  it('bl: 좌하 사분면 (x=0, y=540, w=960, h=540)', () => {
    expect(snapBounds('bl', workArea)).toEqual({ x: 0, y: 540, width: 960, height: 540 })
  })

  it('br: 우하 사분면 (x=960, y=540, w=960, h=540)', () => {
    expect(snapBounds('br', workArea)).toEqual({ x: 960, y: 540, width: 960, height: 540 })
  })

  // ── 홀수 workArea — 잔차(나머지) 흡수 검증 ──────────────────────────────
  it('left+right 너비 합이 workArea.width와 일치(홀수 1921)', () => {
    const wa = { x: 0, y: 0, width: 1921, height: 1080 }
    const l = snapBounds('left', wa)
    const r = snapBounds('right', wa)
    expect(l.width + r.width).toBe(wa.width)
  })

  it('tl+bl 높이 합이 workArea.height와 일치(홀수 1081)', () => {
    const wa = { x: 0, y: 0, width: 1920, height: 1081 }
    const tl = snapBounds('tl', wa)
    const bl = snapBounds('bl', wa)
    expect(tl.height + bl.height).toBe(wa.height)
  })

  // ── workArea offset(x/y ≠ 0) 검증 ────────────────────────────────────────
  it('offset workArea: left 위치가 workArea.x/y에서 시작', () => {
    const wa = { x: 100, y: 50, width: 1820, height: 980 }
    const b = snapBounds('left', wa)
    expect(b.x).toBe(100)
    expect(b.y).toBe(50)
  })

  it('offset workArea: right 위치가 올바름', () => {
    const wa = { x: 100, y: 50, width: 1820, height: 980 }
    const hw = Math.round(1820 / 2)
    const b = snapBounds('right', wa)
    expect(b.x).toBe(100 + hw)
    expect(b.y).toBe(50)
  })
})

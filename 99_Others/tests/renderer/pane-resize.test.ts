import { describe, it, expect } from 'vitest'
import { clampPaneWidth, calcAgentWidth } from '../../../02_Source/renderer/src/lib/paneResize'

describe('clampPaneWidth — 범위 클램프', () => {
  it('정상 범위 값은 그대로 반환한다', () => {
    expect(clampPaneWidth(400, 280, 640)).toBe(400)
  })

  it('min보다 작으면 min을 반환한다', () => {
    expect(clampPaneWidth(100, 280, 640)).toBe(280)
  })

  it('max보다 크면 max를 반환한다', () => {
    expect(clampPaneWidth(800, 280, 640)).toBe(640)
  })

  it('min == max이면 그 값을 반환한다', () => {
    expect(clampPaneWidth(999, 400, 400)).toBe(400)
  })

  it('정확히 min 경계는 min을 반환한다', () => {
    expect(clampPaneWidth(280, 280, 640)).toBe(280)
  })

  it('정확히 max 경계는 max를 반환한다', () => {
    expect(clampPaneWidth(640, 280, 640)).toBe(640)
  })

  it('소수점이 있으면 정수로 반올림한다', () => {
    expect(clampPaneWidth(400.7, 280, 640)).toBe(401)
    expect(clampPaneWidth(400.3, 280, 640)).toBe(400)
  })
})

describe('calcAgentWidth — 드래그 델타 → 우측 패널 너비', () => {
  it('deltaX 양수(오른쪽 드래그) → 너비 감소', () => {
    expect(calcAgentWidth(392, 50, 280, 640)).toBe(342)
  })

  it('deltaX 음수(왼쪽 드래그) → 너비 증가', () => {
    expect(calcAgentWidth(392, -100, 280, 640)).toBe(492)
  })

  it('clamp min 적용 — 너무 작아지면 min 반환', () => {
    expect(calcAgentWidth(300, 200, 280, 640)).toBe(280)
  })

  it('clamp max 적용 — 너무 커지면 max 반환', () => {
    expect(calcAgentWidth(400, -400, 280, 640)).toBe(640)
  })

  it('deltaX=0이면 startW 그대로(범위 안일 때)', () => {
    expect(calcAgentWidth(392, 0, 280, 640)).toBe(392)
  })
})

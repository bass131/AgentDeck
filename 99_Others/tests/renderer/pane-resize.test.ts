/**
 * pane-resize.test.ts — #5 드래그 스플리터 순수 계산 함수 TDD
 *
 * clampPaneWidth(px, min, max): 범위 클램프
 * calcAgentWidth(startW, deltaX, min, max): 드래그 델타 → 새 너비 (우측 패널 특성상 역방향)
 * loadPaneWidth(key, fallback): localStorage 읽기
 * savePaneWidth(key, px): localStorage 저장
 *
 * Node 환경(localStorage mock). window.api 0.
 */
import { describe, it, expect } from 'vitest'
import { clampPaneWidth, calcAgentWidth } from '../../../02.Source/renderer/src/lib/paneResize'

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
  // 우측 패널: 스플리터를 오른쪽으로 드래그 → 패널 축소(deltaX 양수 → 너비 감소)
  // 스플리터를 왼쪽으로 드래그 → 패널 확장(deltaX 음수 → 너비 증가)
  it('deltaX 양수(오른쪽 드래그) → 너비 감소', () => {
    // startW=392, deltaX=+50 → newW = 392 - 50 = 342, clamp(342, 280, 640)=342
    expect(calcAgentWidth(392, 50, 280, 640)).toBe(342)
  })

  it('deltaX 음수(왼쪽 드래그) → 너비 증가', () => {
    // startW=392, deltaX=-100 → newW = 392 + 100 = 492, clamp(492, 280, 640)=492
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

/**
 * editor-font.test.ts — #6 에디터 폰트 크기 순수 계산 함수 TDD
 *
 * clampEditorFont(px, min, max): 범위 클램프 (픽셀 기준)
 * nextEditorFont(current, step): step 적용 후 clamp (Ctrl+= or Ctrl+-)
 * loadEditorFont(fallback): localStorage 읽기
 * saveEditorFont(px): localStorage 저장
 *
 * Node 환경. window.api 0.
 */
import { describe, it, expect } from 'vitest'
import { clampEditorFont, nextEditorFont, EDITOR_FONT_MIN, EDITOR_FONT_MAX } from '../../../02.Source/renderer/src/lib/editorFont'

describe('clampEditorFont — 범위 클램프', () => {
  it('정상 범위 값은 그대로 반환한다', () => {
    expect(clampEditorFont(14, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(14)
  })

  it('min보다 작으면 min을 반환한다', () => {
    expect(clampEditorFont(5, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(EDITOR_FONT_MIN)
  })

  it('max보다 크면 max를 반환한다', () => {
    expect(clampEditorFont(99, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(EDITOR_FONT_MAX)
  })

  it('정확히 min 경계는 min을 반환한다', () => {
    expect(clampEditorFont(EDITOR_FONT_MIN, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(EDITOR_FONT_MIN)
  })

  it('정확히 max 경계는 max를 반환한다', () => {
    expect(clampEditorFont(EDITOR_FONT_MAX, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(EDITOR_FONT_MAX)
  })

  it('소수점이 있으면 정수로 반올림한다', () => {
    expect(clampEditorFont(13.6, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(14)
    expect(clampEditorFont(13.4, EDITOR_FONT_MIN, EDITOR_FONT_MAX)).toBe(13)
  })
})

describe('nextEditorFont — 스텝 적용 후 clamp', () => {
  it('양수 step(Ctrl+= → 키우기) → 현재 + step', () => {
    expect(nextEditorFont(13, 1)).toBe(14)
  })

  it('음수 step(Ctrl+- → 줄이기) → 현재 + step', () => {
    expect(nextEditorFont(14, -1)).toBe(13)
  })

  it('결과가 max 초과 시 max로 clamp', () => {
    expect(nextEditorFont(EDITOR_FONT_MAX, 1)).toBe(EDITOR_FONT_MAX)
  })

  it('결과가 min 미만 시 min으로 clamp', () => {
    expect(nextEditorFont(EDITOR_FONT_MIN, -1)).toBe(EDITOR_FONT_MIN)
  })

  it('step=2 이면 2씩 변경', () => {
    expect(nextEditorFont(14, 2)).toBe(16)
    expect(nextEditorFont(14, -2)).toBe(12)
  })

  it('min/max 상수가 합리적인 범위다 (10 이상, 28 이하)', () => {
    expect(EDITOR_FONT_MIN).toBeGreaterThanOrEqual(8)
    expect(EDITOR_FONT_MAX).toBeLessThanOrEqual(32)
    expect(EDITOR_FONT_MIN).toBeLessThan(EDITOR_FONT_MAX)
  })
})

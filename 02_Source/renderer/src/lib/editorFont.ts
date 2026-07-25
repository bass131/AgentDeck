/**
 * editorFont.ts — 에디터 폰트 크기 조절 순수 유틸 (#6).
 *
 * - EDITOR_FONT_MIN / EDITOR_FONT_MAX: 허용 범위 상수.
 * - EDITOR_FONT_DEFAULT: 기본 폰트 크기.
 * - clampEditorFont: 픽셀 범위 클램프 (정수 반올림).
 * - nextEditorFont: step 적용 후 clamp (Ctrl+= → +1, Ctrl+- → -1).
 * - loadEditorFont / saveEditorFont: localStorage 영속 유틸.
 *
 * CRITICAL: renderer-safe — window.api 0. fs/Node 0.
 * 인라인 색상 0.
 */

/** localStorage 키 */
const EDITOR_FONT_KEY = 'agentdeck.editorFont'

/** 최소 폰트 크기(px) */
export const EDITOR_FONT_MIN = 10

/** 최대 폰트 크기(px) */
export const EDITOR_FONT_MAX = 28

/** 기본 폰트 크기(px) */
export const EDITOR_FONT_DEFAULT = 13

/**
 * 폰트 크기(px)를 [min, max] 범위로 클램프하고 정수로 반올림.
 */
export function clampEditorFont(px: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, px)))
}

/**
 * 현재 폰트 크기에 step을 더하고 [EDITOR_FONT_MIN, EDITOR_FONT_MAX]로 clamp.
 *
 * @param current - 현재 폰트 크기(px)
 * @param step - 변화량(px). 양수=키우기, 음수=줄이기.
 * @returns 새 폰트 크기(px)
 */
export function nextEditorFont(current: number, step: number): number {
  return clampEditorFont(current + step, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
}

/**
 * localStorage에서 에디터 폰트 크기 로드.
 * 파싱 실패 / 접근 불가 시 EDITOR_FONT_DEFAULT 반환.
 */
export function loadEditorFont(): number {
  try {
    const raw = localStorage.getItem(EDITOR_FONT_KEY)
    if (raw !== null) {
      const v = parseInt(raw, 10)
      if (Number.isFinite(v) && v > 0) {
        return clampEditorFont(v, EDITOR_FONT_MIN, EDITOR_FONT_MAX)
      }
    }
  } catch {
    /* localStorage 접근 불가 → 기본값 */
  }
  return EDITOR_FONT_DEFAULT
}

/**
 * localStorage에 에디터 폰트 크기 저장.
 * 저장 실패는 무시.
 */
export function saveEditorFont(px: number): void {
  try {
    localStorage.setItem(EDITOR_FONT_KEY, String(px))
  } catch {
    /* 영속 실패 무시 */
  }
}

/**
 * paneResize.ts — 패널 드래그 리사이즈 순수 유틸 (#5).
 *
 * - clampPaneWidth: 픽셀 범위 클램프 (정수 반올림).
 * - calcAgentWidth: 우측 에이전트 패널 너비 계산 (스플리터 드래그 델타).
 *   우측 패널 특성: 스플리터가 패널의 왼쪽 경계에 있으므로,
 *   스플리터를 오른쪽(deltaX 양수)으로 밀면 패널이 좁아지고
 *   왼쪽(deltaX 음수)으로 밀면 패널이 넓어진다.
 * - loadPaneWidth / savePaneWidth: localStorage 영속 유틸.
 *
 * CRITICAL: renderer-safe — window.api 0. fs/Node 0. localStorage만 사용.
 * 인라인 색상 0.
 */

/** localStorage 키 접두사 */
const PANE_KEY_PREFIX = 'agentdeck.pane.'

/**
 * 픽셀 값을 [min, max] 범위로 클램프하고 정수로 반올림.
 */
export function clampPaneWidth(px: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, px)))
}

/**
 * 우측 에이전트 패널 너비 계산.
 *
 * @param startW - 드래그 시작 시점의 패널 너비(px)
 * @param deltaX - 마우스 이동량(px). 양수=오른쪽, 음수=왼쪽.
 * @param min - 최소 너비(px)
 * @param max - 최대 너비(px)
 * @returns 새 패널 너비(px, clamp 적용)
 */
export function calcAgentWidth(startW: number, deltaX: number, min: number, max: number): number {
  // 우측 패널: 왼쪽 경계의 스플리터가 오른쪽으로 이동하면 패널 축소
  return clampPaneWidth(startW - deltaX, min, max)
}

/**
 * localStorage에서 패널 너비 로드.
 * 파싱 실패 / 접근 불가 시 fallback 반환.
 */
export function loadPaneWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(PANE_KEY_PREFIX + key)
    if (raw !== null) {
      const v = parseInt(raw, 10)
      if (Number.isFinite(v) && v > 0) return v
    }
  } catch {
    /* localStorage 접근 불가(테스트/샌드박스) → fallback */
  }
  return fallback
}

/**
 * localStorage에 패널 너비 저장.
 * 저장 실패는 무시(세션 내 상태는 이미 useState로 유지됨).
 */
export function savePaneWidth(key: string, px: number): void {
  try {
    localStorage.setItem(PANE_KEY_PREFIX + key, String(px))
  } catch {
    /* 영속 실패 무시 */
  }
}

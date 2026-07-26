/**
 * ipc/window.ts — 윈도우 제어 도메인 채널·타입 계약 (F1-b — 투명 frameless 셸)
 *
 * 채널: WINDOW_MINIMIZE · WINDOW_MAXIMIZE_TOGGLE · WINDOW_CLOSE · WINDOW_IS_MAXIMIZED
 *       WINDOW_GET_BOUNDS · WINDOW_SET_BOUNDS · WINDOW_DRAG_START · WINDOW_DRAG_END
 *       WINDOW_RESIZE_START · WINDOW_RESIZE_END · WINDOW_STATE
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const WINDOW_CHANNELS = {
  // CRITICAL(신뢰경계): 아래 채널은 **창 식별자 인자를 받지 않는다**. main이
  // BrowserWindow.fromWebContents(event.sender)로 *요청을 보낸 창*만 조작한다
  // (renderer가 임의 창 ID/핸들을 주입할 수 없음). drag/resize는 start/end
  // 브래킷만 renderer가 트리거하고, 커서 추종 setBounds는 main이 수행한다.
  /** 현재 창 최소화 (invoke) */
  WINDOW_MINIMIZE: 'window.minimize',
  /** 최대화 토글 — 투명창은 OS 네이티브 maximize 부재 → main custom maximize (invoke, {maximized} 반환) */
  WINDOW_MAXIMIZE_TOGGLE: 'window.maximizeToggle',
  /** 현재 창 닫기 (invoke) */
  WINDOW_CLOSE: 'window.close',
  /** 현재 창의 최대화 상태 조회 (invoke, {maximized} 반환) */
  WINDOW_IS_MAXIMIZED: 'window.isMaximized',
  /** 현재 창 bounds 조회 (invoke, WindowBounds 반환) */
  WINDOW_GET_BOUNDS: 'window.getBounds',
  /** 현재 창 bounds 설정 (invoke) */
  WINDOW_SET_BOUNDS: 'window.setBounds',
  /** 수동 드래그 시작 — main이 grab점 잠금 후 커서 추종 setBounds 개시 (invoke) */
  WINDOW_DRAG_START: 'window.dragStart',
  /** 수동 드래그 종료 — 커서 추종 정지 (invoke) */
  WINDOW_DRAG_END: 'window.dragEnd',
  /** 수동 리사이즈 시작 — 엣지 지정, main이 커서 추종 setBounds 개시 (invoke) */
  WINDOW_RESIZE_START: 'window.resizeStart',
  /** 수동 리사이즈 종료 (invoke) */
  WINDOW_RESIZE_END: 'window.resizeEnd',
  /** main → renderer 최대화 상태 변경 push (event형 — .win.max 토글용) */
  WINDOW_STATE: 'window.state',
} as const

// ── 윈도우 타입 ───────────────────────────────────────────────────────────────

/**
 * 창 bounds (스크린 좌표 px).
 * getBounds 응답 / setBounds 요청 공용.
 */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 리사이즈 핸들 방향 (8 엣지/모서리).
 * resizeStart 요청에 포함 — main이 해당 엣지를 커서 추종으로 늘린다.
 */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** `window.maximizeToggle` / `window.isMaximized` 응답 */
export interface WindowMaximizedResponse {
  /** 토글/조회 후 최대화 상태 */
  maximized: boolean
}

/** `window.resizeStart` 요청 */
export interface WindowResizeStartRequest {
  /** 늘릴 엣지/모서리 */
  edge: ResizeEdge
}

/**
 * `window.state` IPC 이벤트 페이로드 (main → renderer push).
 * 최대화/복원 시 main이 push → renderer가 `.win.max` 토글.
 */
export interface WindowStatePayload {
  /** 현재 최대화 여부 */
  maximized: boolean
}

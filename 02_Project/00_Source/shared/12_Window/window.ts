export const WINDOW_CHANNELS = {
  WINDOW_MINIMIZE: 'window.minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'window.maximizeToggle',
  WINDOW_CLOSE: 'window.close',
  WINDOW_IS_MAXIMIZED: 'window.isMaximized',
  WINDOW_GET_BOUNDS: 'window.getBounds',
  WINDOW_SET_BOUNDS: 'window.setBounds',
  WINDOW_DRAG_START: 'window.dragStart',
  WINDOW_DRAG_END: 'window.dragEnd',
  WINDOW_RESIZE_START: 'window.resizeStart',
  WINDOW_RESIZE_END: 'window.resizeEnd',
  WINDOW_STATE: 'window.state',
} as const

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface WindowMaximizedResponse {
  maximized: boolean
}

export interface WindowResizeStartRequest {
  edge: ResizeEdge
}

export interface WindowStatePayload {
  maximized: boolean
}

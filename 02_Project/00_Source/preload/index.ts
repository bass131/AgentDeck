import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import { ZOOM_FACTOR_RANGE } from '../shared/ipcContract'
import { API_ROUTES } from '../shared/01_Ipc/apiRoutes'
import type { ApiRoute, IpcApi, RoutedApi } from '../shared/01_Ipc/apiRoutes'

// preload 노출은 라우트 표(API_ROUTES)를 순회해 만든다 (M05 G10) — api.<묶음>.<동작>.
// 노출 타입(IpcApi)도 같은 표와 채널 맵에서 유도하므로, 표와 맵이 어긋나면 typecheck가 실패한다.

function routeFn(route: ApiRoute): unknown {
  switch (route.kind) {
    // 요청 하나를 그대로 넘긴다 — 생략 가능한 요청도 invoke(ch, undefined)로 넘어간다.
    case 'call':
      return (req?: unknown) => ipcRenderer.invoke(route.channel, req)
    // 인자 없는 채널 — invoke(ch).
    case 'call0':
      return () => ipcRenderer.invoke(route.channel)
    case 'push':
      return (cb: (payload: unknown) => void): (() => void) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
          cb(payload)
        }
        ipcRenderer.on(route.channel, handler)
        return () => {
          ipcRenderer.removeListener(route.channel, handler)
        }
      }
  }
}

function buildRouted(): RoutedApi {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [group, actions] of Object.entries(API_ROUTES)) {
    const fns: Record<string, unknown> = {}
    for (const [action, route] of Object.entries(actions)) fns[action] = routeFn(route as ApiRoute)
    out[group] = fns
  }
  return out as RoutedApi
}

const routed = buildRouted()

const api: IpcApi = {
  ...routed,

  workspace: {
    ...routed.workspace,
    // IPC가 아닌 노출 — 드롭한 File의 실제 경로.
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
  },

  window: {
    ...routed.window,
    // IPC가 아닌 노출 — 화면 배율 읽기와 클램프된 적용.
    getZoomFactor: (): number => webFrame.getZoomFactor(),
    setZoomFactor: (factor: number): void => {
      if (typeof factor !== 'number' || !Number.isFinite(factor)) return
      const clamped = Math.min(ZOOM_FACTOR_RANGE.MAX, Math.max(ZOOM_FACTOR_RANGE.MIN, factor))
      webFrame.setZoomFactor(clamped)
    },
  },
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('[preload] exposeInMainWorld 실패:', error)
}

export type Api = typeof api

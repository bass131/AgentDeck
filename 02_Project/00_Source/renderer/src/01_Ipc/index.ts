// renderer IPC 클라이언트 (M05 G10) — 컴포넌트·store·hook은 window.api를 직접 부르지 않고 이 `ipc`를 거친다.
// getter 위임이다: import 시점에는 window.api를 읽지 않고(bl1-p03 하네스처럼 브리지가 없는 환경),
// 부를 때마다 지금의 window.api 묶음을 돌려준다(테스트 mock 교체). 함수는 감싸지 않아
// `ipc.agent.onEvent === window.api.agent.onEvent`가 성립한다(세션 레지스트리가 함수 동일성으로 교체를 감지).
import type { IpcApi } from '@shared/01_Ipc/apiRoutes'

// preload 브리지가 있는지 — 기능 감지는 이것과 함께 `typeof ipc.<묶음>.<동작> === 'function'`으로 한다.
export function hasBridge(): boolean {
  return typeof window !== 'undefined' && window.api != null
}

export const ipc: IpcApi = {
  get agent(): IpcApi['agent'] {
    return window.api.agent
  },
  get sessions(): IpcApi['sessions'] {
    return window.api.sessions
  },
  get workspace(): IpcApi['workspace'] {
    return window.api.workspace
  },
  get git(): IpcApi['git'] {
    return window.api.git
  },
  get lsp(): IpcApi['lsp'] {
    return window.api.lsp
  },
  get engine(): IpcApi['engine'] {
    return window.api.engine
  },
  get settings(): IpcApi['settings'] {
    return window.api.settings
  },
  get window(): IpcApi['window'] {
    return window.api.window
  },
}

import { contextBridge } from 'electron'

// 신뢰 경계: renderer에는 *화이트리스트된* API만 노출(헌법 CRITICAL).
// Phase 02(ipc-contract)에서 src/shared 계약 기반으로 채널을 여기 노출한다.
// 현재(Phase 01)는 골격만 — ipcRenderer 통째 노출 금지.
const api = {
  /** 앱 버전 등 메타. Phase 02에서 IPC 채널 추가. */
  ping: (): 'pong' => 'pong'
}

export type Api = typeof api

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  // contextIsolation 비활성 등 예외 상황 로깅(정상 경로에선 발생 X)
  console.error('[preload] exposeInMainWorld 실패:', error)
}

import { app } from 'electron'

// 캐시하지 않는다 — 해석 시점과 실패 처리는 부르는 자리가 정한다
export function getUserDataDir(): string {
  return app.getPath('userData')
}

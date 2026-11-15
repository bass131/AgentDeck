import { app } from 'electron'

// electron userData 경로 해석의 한 곳 (M05 G11) — main의 여덟 자리가 이 함수를 부른다.
// 해석 시점(스토어 생성 때 한 번인지, 호출마다인지)과 실패 처리(try·안내 문구)는 부르는 자리가 정한다.
// 이 함수는 결과를 캐시하지 않는다 — 부를 때마다 app.getPath를 그대로 부른다.
export function getUserDataDir(): string {
  return app.getPath('userData')
}

// 「처음 설정함」 표시의 거처 — 앱 데이터 폴더의 이웃 폴더 `<폴더>-guard` (M07 G7 사용자 결정).
// 표시를 쓰는 쪽(controlsStore.ts)과 지키는 쪽(enginePathLock.ts)이 같은 이름을 쓰도록 한 곳에 둔다(G7 검수 사소 8).
export const GUARD_SUFFIX = '-guard'

export function markerDir(userData: string): string {
  return `${userData.replace(/[\\/]+$/, '')}${GUARD_SUFFIX}`
}

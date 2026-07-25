/**
 * whatsNewTrigger.ts — 부트 시 자동 표시 모달 결정 순수 함수 (P4).
 *
 * 원본 AgentCodeGUI WhatsNew.tsx의 SEEN_KEY·seriesOf·자동 트리거 결정 로직을
 * 테스트 용이 + 단일 정의를 위해 별도 lib로 추출.
 *
 * 이 파일은 순수 함수만 export — side effect / IPC / window.api 호출 0.
 * Shell.tsx가 부트 useEffect에서 이 함수를 호출하고 IPC/prefs를 제어한다.
 *
 * seen-key 의미:
 *   - '' (빈 문자열, 기본값) → 첫 실행 → WhatsNew 표시
 *   - 버전 문자열 존재 + 마이너 시리즈 다름 → UpdateNotes 표시
 *   - 같은 마이너 시리즈 재실행 → 표시 없음
 *
 * 원본 AgentCodeGUI 동작 1:1 미러 (prefs seen-key + 앱 버전 비교).
 */

/** prefs 저장 키 — WhatsNew·UpdateNotes 공유 seen-key. */
export const SEEN_KEY = 'whatsnew.seenVersion'

/**
 * 버전 문자열에서 마이너 시리즈를 추출한다 (앞 2 세그먼트).
 *
 * 예: '1.5.3' → '1.5', '2.0.0' → '2.0', '1' → '1'
 * 패치노트는 마이너 단위로 한 번만 표시하므로 앞 2개만 비교한다.
 */
export function seriesOf(v: string): string {
  return v.split('.').slice(0, 2).join('.')
}

/**
 * 부트 시 어떤 시작 모달을 자동 표시할지 결정한다 (순수).
 *
 * - version이 없음(빈/falsy) → null (graceful: IPC 실패 등)
 * - seen === '' (첫 실행, 기본값) → 'whatsnew'
 * - seriesOf(seen) !== seriesOf(version) (마이너 업데이트) → 'updatenotes'
 * - 그 외 (같은 마이너 재실행) → null
 *
 * WhatsNew와 UpdateNotes는 같은 seen-key를 공유하므로 동시에 뜨지 않는다.
 *
 * @param version - 현재 앱 버전 (window.api.getAppVersion IPC 결과). null/undefined/'' → null.
 * @param seen - prefs에서 읽은 seen-version (getPref(SEEN_KEY, '')). 첫 실행이면 ''.
 * @returns 표시할 모달 식별자 또는 null (표시 없음)
 */
export function decideStartupModal(
  version: string | null | undefined,
  seen: string
): 'whatsnew' | 'updatenotes' | null {
  if (!version) return null
  if (seen === '') return 'whatsnew'
  if (seriesOf(seen) !== seriesOf(version)) return 'updatenotes'
  return null
}

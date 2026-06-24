/**
 * engineUpdateTrigger.ts — 부트 시 엔진 업데이트 알림 표시 결정 순수 함수.
 *
 * 원본 AgentCodeGUI EngineGate.tsx `kind==='update'` 트리거 로직을
 * 테스트 용이 + 단일 정의를 위해 별도 lib로 추출.
 *
 * 이 파일은 순수 함수만 export — side effect / IPC / window.api 호출 0.
 * Shell.tsx가 부트 useEffect에서 이 함수를 호출하고 IPC/prefs를 제어한다.
 *
 * seen-key 의미:
 *   - '' (빈 문자열, 기본값) → 처음 봄 → 알림 표시 (updateAvailable 이면)
 *   - latest 버전 문자열 저장됨 + latest === seen → 이미 본 버전 → 표시 안 함
 *   - latest !== seen → 새 버전 → 표시
 *
 * whatsNewTrigger.ts 패턴 미러 (seen-key 순수함수 추출).
 */

import type { EngineUpdateInfo } from '../../../shared/ipc-contract'

/** prefs 저장 키 — 엔진 업데이트 알림 seen-key. */
export const ENGINE_SEEN_KEY = 'engine.seenLatest'

/**
 * 부트 시 엔진 업데이트 알림 표시 여부를 결정한다 (순수).
 *
 * 조건: updateAvailable=true + latest 존재 + latest !== seen → true (표시)
 * 그 외 모두 → false (표시 안 함)
 *
 * @param info - window.api.checkEngineUpdate() IPC 결과. null/undefined → false (graceful).
 * @param seen - prefs에서 읽은 seen-latest (getPref(ENGINE_SEEN_KEY, '')). 처음이면 ''.
 * @returns 알림 표시 여부
 */
export function decideEngineNotice(
  info: EngineUpdateInfo | null | undefined,
  seen: string
): boolean {
  if (!info) return false
  if (!info.updateAvailable) return false
  if (!info.latest) return false
  return info.latest !== seen
}

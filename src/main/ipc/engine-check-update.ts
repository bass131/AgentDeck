/**
 * engine-check-update.ts — ENGINE_CHECK_UPDATE 핸들러 로직 (순수 모듈)
 *
 * 이 파일은 electron import 0 — 순수 Node.js 로직만. Vitest에서 직접 테스트 가능.
 *
 * 책임:
 *   - cmpVer: numeric semver-ish 비교 헬퍼 (원본 EngineGate.tsx cmpVer 미러).
 *   - checkEngineUpdate: backend.version() + backend.latestVersion()을 호출해
 *     EngineUpdateInfo를 합성. graceful(throw → null, updateAvailable=false).
 *
 * ADR-003: 핸들러는 구체 엔진 미인지 — AgentBackend 인터페이스만 사용.
 * ADR-008: 반환 EngineUpdateInfo에 버전 문자열·boolean 3개 필드만 — 시크릿 0.
 *
 * IPC 등록: src/main/ipc/index.ts 에서 ENGINE_CHECK_UPDATE 채널에 등록.
 * 소비: renderer EngineUpdateNotice 팝업 (부트 시 invoke).
 */

import type { EngineUpdateInfo } from '../../shared/ipc-contract'

// ── cmpVer: numeric semver-ish 비교 ─────────────────────────────────────────

/**
 * 두 버전 문자열을 numeric semver-ish로 비교한다.
 * 원본 AgentCodeGUI EngineGate.tsx `cmpVer` 미러.
 *
 * 알고리즘:
 *   - `.`으로 split → 각 파트를 Number로 변환 → 앞에서부터 순서대로 비교.
 *   - a < b → 음수, a > b → 양수, a === b → 0.
 *
 * 예:
 *   cmpVer('0.3.186', '0.3.187') → -1 (current가 오래된 버전)
 *   cmpVer('0.4.0', '0.3.999')  → 양수 (current가 최신)
 *   cmpVer('1.2.3', '1.2.3')    → 0   (동일)
 *
 * 테스트 가능하도록 export. 이 파일을 import하는 핸들러 등록 레이어에서는
 * 이 함수를 직접 사용하지 말고 checkEngineUpdate를 경유한다.
 */
export function cmpVer(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  const len = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA !== numB) {
      return numA - numB
    }
  }
  return 0
}

// ── checkEngineUpdate: EngineUpdateInfo 합성 ─────────────────────────────────

/**
 * backend.version()(현재) + backend.latestVersion()(최신)을 병렬 호출해
 * EngineUpdateInfo를 합성한다.
 *
 * CRITICAL(ADR-003): backend는 AgentBackend 인터페이스만 — 구체 엔진 미인지.
 * CRITICAL(ADR-008): 반환 EngineUpdateInfo에 버전 문자열·boolean 3개 필드만.
 *
 * updateAvailable 합성 규칙:
 *   - current와 latest 둘 다 비어있지 않은 문자열일 때만 cmpVer 비교.
 *   - cmpVer(current, latest) < 0 → true (current가 latest보다 오래됨).
 *   - 한쪽이라도 null 또는 빈 문자열 → updateAvailable=false (graceful).
 *
 * graceful 보장:
 *   - version() throw → current=null (앱 부트를 막지 않는다).
 *   - latestVersion() throw → latest=null (오프라인 환경 대응).
 *   - Promise.all이 아닌 개별 try/catch로 부분 실패를 허용한다.
 *
 * @param backend AgentBackend 인스턴스 (registry 경유로 주입)
 * @returns EngineUpdateInfo { current, latest, updateAvailable }
 */
export async function checkEngineUpdate(
  backend: { version(): Promise<string | null>; latestVersion(): Promise<string | null> }
): Promise<EngineUpdateInfo> {
  // 병렬 호출 — 각각 독립적으로 graceful 처리
  const [current, latest] = await Promise.all([
    (async (): Promise<string | null> => {
      try {
        const v = await backend.version()
        // 빈 문자열도 null로 정규화 (updateAvailable 합성에서 null로 취급)
        if (typeof v === 'string' && v.length > 0) return v
        return null
      } catch {
        return null
      }
    })(),
    (async (): Promise<string | null> => {
      try {
        const v = await backend.latestVersion()
        if (typeof v === 'string' && v.length > 0) return v
        return null
      } catch {
        return null
      }
    })()
  ])

  // updateAvailable 합성:
  // current와 latest 둘 다 비어있지 않은 문자열일 때만 비교.
  // 한쪽이라도 null → updateAvailable=false (graceful).
  const updateAvailable =
    current !== null && latest !== null
      ? cmpVer(current, latest) < 0
      : false

  return { current, latest, updateAvailable }
}

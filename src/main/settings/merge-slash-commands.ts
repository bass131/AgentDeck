/**
 * merge-slash-commands.ts — mergeSlashCommands() pure 헬퍼 (ADR-019)
 *
 * COMMAND_LIST IPC 핸들러가 큐레이션 빌트인(commandsStore) + 캡처 빌트인(backend)
 * + .claude/commands 스캔을 머지할 때 사용하는 순수 함수.
 *
 * Pure 함수 — IO 없음, electron 0, side-effect 0.
 * 테스트가 이 함수를 직접 import하여 검증한다.
 *
 * 머지 규칙:
 *   - name 키 dedup, store 우선: store에 있는 name은 store 항목을 그대로 유지.
 *     (scope/description/argHint 모두 store 값 보존 — captured의 동명 항목 무시)
 *   - captured에만 있는 name은 scope='builtin'(captured 값 그대로)으로 추가.
 *   - 결과 = store ∪ (captured 중 store에 없는 name).
 *   - 정렬: builtin → project → user 순, 각 그룹 내 name 알파벳순.
 *
 * CRITICAL(신뢰경계):
 *   - 반환값 SlashCommandInfo[] 는 name/description/argHint/scope 4필드만.
 *   - 시크릿·경로·API 키 0. 캡처 sanitize는 backend(ClaudeCodeBackend)가 수행 완료.
 *   - 이 함수는 그 결과를 받아 머지만 수행한다.
 *
 * (ADR-019 — COMMAND_LIST 핸들러 확장)
 */

import type { SlashCommandInfo } from '../../shared/ipc-contract'

// ── 정렬 기준 ─────────────────────────────────────────────────────────────────

/** scope 정렬 우선순위 — builtin=0, project=1, user=2 */
const SCOPE_ORDER: Record<SlashCommandInfo['scope'], number> = {
  builtin: 0,
  project: 1,
  user: 2,
}

/**
 * SlashCommandInfo 비교 함수 (정렬용).
 *
 * 우선순위: scope 순서(builtin < project < user) → 동일 scope 내에서 name 알파벳순.
 */
function compareCommands(a: SlashCommandInfo, b: SlashCommandInfo): number {
  const scopeDiff = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]
  if (scopeDiff !== 0) return scopeDiff
  return a.name.localeCompare(b.name)
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * 큐레이션 빌트인(store)과 캡처 빌트인(backend)을 머지한다.
 *
 * @param store    commandsStore.listSlashCommands() 반환값
 *                 (큐레이션 빌트인 + .claude/commands project + user 스캔 결과)
 * @param captured backend.listSupportedCommands() 반환값
 *                 (엔진 run 중 캡처된 SDK 지원 커맨드 캐시)
 * @returns        머지 + 정렬된 SlashCommandInfo[]
 *
 * CRITICAL(신뢰경계): 반환값은 SlashCommandInfo 4필드만 — 이 함수 내에서
 *   추가 필드 생성 금지(타입이 보장하나, 구현에서도 spread/pick 명시).
 */
export function mergeSlashCommands(
  store: SlashCommandInfo[],
  captured: SlashCommandInfo[]
): SlashCommandInfo[] {
  // store 항목의 name 집합 — O(1) 조회를 위해 Set 사용
  const storeNames = new Set(store.map(c => c.name))

  // captured 중 store에 없는 name만 추가 (store 우선 dedup)
  const additions: SlashCommandInfo[] = captured
    .filter(c => !storeNames.has(c.name))
    .map(c => {
      // 신뢰경계: 4필드만 명시적으로 pick — 추가 필드 누출 방지
      const safe: SlashCommandInfo = {
        name: c.name,
        description: c.description,
        scope: c.scope,
      }
      if (c.argHint !== undefined) safe.argHint = c.argHint
      return safe
    })

  // 머지: store 항목(원형 유지) + 추가 항목 → 정렬
  const merged = [...store, ...additions]
  merged.sort(compareCommands)
  return merged
}

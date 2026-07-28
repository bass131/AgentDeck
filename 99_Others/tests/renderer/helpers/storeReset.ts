/**
 * storeReset.ts — renderer 유닛테스트 공용 store 리셋 (RS1 P02)
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────────────────────────
 *   renderer store 테스트 10여 개 파일이 각자 `resetStore()` 를 들고 있다. 몸통은 전부
 *
 *       useAppStore.setState({ ...makeInitialState(), <이 파일이 신경 쓰는 필드들> })
 *
 *   인데, 뒤쪽 "신경 쓰는 필드" 목록이 파일마다 다르다. 그 차이는 **의도**인 경우가 많다
 *   (예: `lr2-01-replmode-default` 는 store 기본값 자체를 검증하려고 `replMode` 를 일부러
 *   건드리지 않는다). 그래서 이 헬퍼는 공통분모(`makeInitialState()` 전개)만 소유하고,
 *   파일별 차이는 `patch` 인자로 남긴다 — 통일하지 않는다.
 *
 * ── `makeInitialState()` 만으로 충분하지 않은 이유 ─────────────────────────────
 *   `makeInitialState()` 는 **AppState(reducer 코어)** 만 돌려준다. Zustand store 는 거기에
 *   8개 도메인 슬라이스(workspace·composer·sessions…)를 spread 합성한 것이라,
 *   `queue`·`attachedImages`·`replMode`·`selectedModel` 같은 슬라이스 소유 필드는 여기 없다.
 *   그 필드들을 초기화하고 싶으면 patch 로 명시해야 한다 — 기존 복제본들이 그 필드를
 *   일일이 나열하고 있던 이유가 그것이다.
 *
 * ── store 인스턴스를 인자로 받을 수 있는 이유 ──────────────────────────────────
 *   일부 테스트는 `vi.resetModules()` 후 `await import(appStore)` 로 **모듈을 새로 평가**한다
 *   (모듈 최상단 부수효과나 기본값을 신선하게 보려고). 그 경우 이 헬퍼가 정적으로 import 한
 *   store 와 테스트가 쥔 store 는 **서로 다른 인스턴스**다. 그래서 첫 인자로 store 를 넘기는
 *   오버로드를 둔다 — 안 넘기면 정적 import 한 기본 store 를 쓴다.
 */

import { useAppStore as defaultStore } from '../../../../02_Source/renderer/src/store/appStore'
import { makeInitialState } from '../../../../02_Source/renderer/src/store/reducer'

/** setState 만 요구하는 최소 형상 — 동적 import 한 store 도 그대로 받는다. */
export interface ResettableStore {
  setState: (partial: never) => void
}

export type StorePatch = Record<string, unknown>

function isStore(value: unknown): value is ResettableStore {
  return typeof (value as { setState?: unknown } | undefined)?.setState === 'function'
}

/**
 * store 를 `makeInitialState()` 기준으로 되돌리고 patch 를 얹는다.
 *
 * @example  resetAppStore({ conversationId: null, isRunning: false })
 * @example  resetAppStore(dynamicallyImportedStore, { currentRunId: 'run-1' })
 */
export function resetAppStore(patch?: StorePatch): void
export function resetAppStore(store: ResettableStore, patch?: StorePatch): void
export function resetAppStore(
  storeOrPatch?: ResettableStore | StorePatch,
  maybePatch?: StorePatch
): void {
  const store: ResettableStore = isStore(storeOrPatch)
    ? storeOrPatch
    : (defaultStore as unknown as ResettableStore)
  const patch = isStore(storeOrPatch) ? (maybePatch ?? {}) : ((storeOrPatch as StorePatch) ?? {})

  store.setState({ ...makeInitialState(), ...patch } as never)
}

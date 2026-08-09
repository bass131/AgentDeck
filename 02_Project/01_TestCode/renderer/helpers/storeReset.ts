import { useAppStore as defaultStore } from '../../../../02_Project/00_Source/renderer/src/store/appStore'
import { makeInitialState } from '../../../../02_Project/00_Source/renderer/src/store/reducer'

export interface ResettableStore {
  setState: (partial: never) => void
}

export type StorePatch = Record<string, unknown>

function isStore(value: unknown): value is ResettableStore {
  return typeof (value as { setState?: unknown } | undefined)?.setState === 'function'
}

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

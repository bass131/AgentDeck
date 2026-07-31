import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { create } from 'zustand'

export const SINGLE_CHAT_DEFAULT_SCOPE = 'single:default'

interface UltracodeToggleState {
  offKeys: Set<string>
}

const useUltracodeToggleStore = create<UltracodeToggleState>(() => ({
  offKeys: new Set(),
}))

export function useUltracodeToggle(key: string): [boolean, Dispatch<SetStateAction<boolean>>] {
  const on = useUltracodeToggleStore((s) => !s.offKeys.has(key))

  const setOn = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      useUltracodeToggleStore.setState((s) => {
        const prevOn = !s.offKeys.has(key)
        const resolved = typeof next === 'function' ? (next as (prev: boolean) => boolean)(prevOn) : next
        if (resolved === prevOn) return s
        const nextOffKeys = new Set(s.offKeys)
        if (resolved) nextOffKeys.delete(key)
        else nextOffKeys.add(key)
        return { offKeys: nextOffKeys }
      })
    },
    [key]
  )

  return [on, setOn]
}

export function __resetUltracodeToggleForTests(): void {
  useUltracodeToggleStore.setState({ offKeys: new Set() })
}

export function migrateSingleChatDefaultScope(newKey: string): void {
  if (newKey === SINGLE_CHAT_DEFAULT_SCOPE) return
  useUltracodeToggleStore.setState((s) => {
    if (!s.offKeys.has(SINGLE_CHAT_DEFAULT_SCOPE)) return s
    const next = new Set(s.offKeys)
    next.delete(SINGLE_CHAT_DEFAULT_SCOPE)
    next.add(newKey)
    return { offKeys: next }
  })
}

export function pruneConversationScope(id: string): void {
  useUltracodeToggleStore.setState((s) => {
    if (!s.offKeys.has(id)) return s
    const next = new Set(s.offKeys)
    next.delete(id)
    return { offKeys: next }
  })
}

export function pruneMultiSessionScope(sessionId: string): void {
  const prefix = `multi:${sessionId}:`
  useUltracodeToggleStore.setState((s) => {
    let changed = false
    const next = new Set(s.offKeys)
    for (const k of s.offKeys) {
      if (k.startsWith(prefix)) {
        next.delete(k)
        changed = true
      }
    }
    return changed ? { offKeys: next } : s
  })
}

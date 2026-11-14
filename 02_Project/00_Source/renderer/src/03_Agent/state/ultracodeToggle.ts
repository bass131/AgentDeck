import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { create } from 'zustand'
import { convKey, multiPrefix } from './sessionKeys'

// UltraCode 토글의 범위 키는 세션 레지스트리 키다(G9c) — 대화는 convKey(id), id가 없는 새 대화는
// convKey(null), 멀티 패널은 패널 키. 꺼 둔 키만 기억하고(기본 ON) 영속하지 않는다.

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

// 범위 키 옮기기 — 새 대화가 id를 받으면 초안 키(convKey(null))의 OFF를 그 대화 키로 옮긴다.
export function rekeyUltracodeScope(fromKey: string, toKey: string): void {
  if (toKey === fromKey) return
  useUltracodeToggleStore.setState((s) => {
    if (!s.offKeys.has(fromKey)) return s
    const next = new Set(s.offKeys)
    next.delete(fromKey)
    next.add(toKey)
    return { offKeys: next }
  })
}

export function pruneConversationScope(id: string): void {
  const key = convKey(id)
  useUltracodeToggleStore.setState((s) => {
    if (!s.offKeys.has(key)) return s
    const next = new Set(s.offKeys)
    next.delete(key)
    return { offKeys: next }
  })
}

export function pruneMultiSessionScope(sessionId: string): void {
  const prefix = multiPrefix(sessionId)
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

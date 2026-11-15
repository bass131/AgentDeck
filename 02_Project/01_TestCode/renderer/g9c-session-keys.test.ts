// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  convKey,
  conversationIdOfKey,
  keyKind,
  multiPrefix,
  multiSessionIdOfKey,
  panelKey,
  panelPrefix,
} from '@renderer/03_Agent/state/sessionKeys'
import { makePanelSlotKey, panelSlotKeyPrefix } from '@renderer/03_Agent/state/panelSession'

// G9c — 세션 레지스트리 키 하나. 대화는 conv:<id|draft>, 패널은 multi:<id>:slot:<n>.

describe('G9c sessionKeys — 키 형식', () => {
  it('대화 키는 conv:<id>이고 id가 없는 새 대화는 conv:draft 하나다', () => {
    expect(convKey('abc')).toBe('conv:abc')
    expect(convKey(null)).toBe('conv:draft')
    expect(conversationIdOfKey('conv:abc')).toBe('abc')
    expect(conversationIdOfKey('conv:draft')).toBeNull()
    expect(conversationIdOfKey('multi:s:slot:0')).toBeUndefined()
  })

  it('패널 키는 기존 형식 multi:<id>:slot:<n> 그대로다(REPL 세션키 값 불변)', () => {
    expect(panelKey('s1', 3)).toBe('multi:s1:slot:3')
    expect(panelPrefix('s1')).toBe('multi:s1:slot:')
    expect(multiPrefix('s1')).toBe('multi:s1:')
    expect(makePanelSlotKey('s1', 3)).toBe(panelKey('s1', 3))
    expect(panelSlotKeyPrefix('s1')).toBe(panelPrefix('s1'))
  })

  it('멀티 세션 삭제의 UltraCode 범위 정리는 multiPrefix로 그 세션 키만 지운다', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useUltracodeToggle, pruneMultiSessionScope, __resetUltracodeToggleForTests } = await import('@renderer/03_Agent/state/ultracodeToggle')
    __resetUltracodeToggleForTests()
    const a = renderHook(() => useUltracodeToggle(panelKey('s1', 0)))
    const b = renderHook(() => useUltracodeToggle(panelKey('s10', 0)))
    act(() => { a.result.current[1](false); b.result.current[1](false) })
    act(() => { pruneMultiSessionScope('s1') })
    expect(a.result.current[0]).toBe(true)
    expect(b.result.current[0]).toBe(false)
  })

  it('키 종류와 패널 키의 멀티 세션 id를 가른다', () => {
    expect(keyKind(convKey('a'))).toBe('conv')
    expect(keyKind(panelKey('s', 0))).toBe('panel')
    expect(keyKind('foreground')).toBeNull()
    expect(multiSessionIdOfKey(panelKey('s:x', 2))).toBe('s:x')
    expect(multiSessionIdOfKey(convKey('a'))).toBeNull()
  })
})

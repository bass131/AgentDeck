// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  convKey,
  conversationIdOfKey,
  keyKind,
  multiPrefix,
  panelKey,
  panelPrefix,
} from '@renderer/03_Agent/state/sessionKeys'

// 패널 키 형식은 REPL 세션키 값을 바꾸지 않으려고 그대로 둔다.

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
  })

  it('키 종류를 가른다', () => {
    expect(keyKind(convKey('a'))).toBe('conv')
    expect(keyKind(panelKey('s', 0))).toBe('panel')
    expect(keyKind('foreground')).toBeNull()
  })
})

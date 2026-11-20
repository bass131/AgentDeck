// 작업 ID: g9c · 옛 이름 g9c-session-keys.test.ts
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
import { makePanelSlotKey, panelSlotKeyPrefix } from '@renderer/03_Agent/state/panelSession'

// G9c — 세션 레지스트리 키 하나. 대화는 conv:<id|draft>, 패널은 multi:<id>:slot:<n>.
// M10 G1 — 멀티 에이전트 모드를 지웠지만 패널 키 형식(REPL 세션키 값)은 G3 세션 탭을 위해 그대로 둔다.
// 멀티 세션 삭제의 범위 정리와 키에서 멀티 세션 id를 꺼내는 함수는 쓰는 곳이 없어져 뺐다.

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

  it('키 종류를 가른다', () => {
    expect(keyKind(convKey('a'))).toBe('conv')
    expect(keyKind(panelKey('s', 0))).toBe('panel')
    expect(keyKind('foreground')).toBeNull()
  })
})

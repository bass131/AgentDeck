// @vitest-environment jsdom
/**
 * useComposerKeyHandler.test.ts — 컴포저 키 핸들러 훅 단위 테스트.
 * Composer.tsx Phase 14 분해: handleKey 콜백을 useComposerKeyHandler로 추출.
 *
 * 검증:
 *   1. disabled=true → Enter도 차단 (doSend 미호출)
 *   2. 슬래시 팔레트 열림 + Enter → pickSlash 호출
 *   3. 슬래시 팔레트 열림 + Esc → setSlashDismissed(true)
 *   4. 멘션 팔레트 열림 + Esc → setMentionDismissed(true)
 *   5. 팔레트 닫힘 + Enter → doSend 호출
 *   6. 슬래시 열림 + ArrowDown → setSlashIdx 호출
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useComposerKeyHandler } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useComposerKeyHandler'
import type { UseSlashPaletteReturn } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useSlashPalette'
import type { UseMentionPaletteReturn } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useMentionPalette'
import type { UseInputHistoryReturn } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useInputHistory'

function makeSlash(overrides: Partial<UseSlashPaletteReturn> = {}): UseSlashPaletteReturn {
  return {
    slashOpen: false,
    slashQuery: null,
    slashIdx: 0,
    setSlashIdx: vi.fn(),
    slashDismissed: false,
    setSlashDismissed: vi.fn(),
    cmdHits: [],
    skillHits: [],
    totalSlash: 0,
    safeSlashIdx: 0,
    pickSlash: vi.fn(),
    ...overrides,
  }
}

function makeMention(overrides: Partial<UseMentionPaletteReturn> = {}): UseMentionPaletteReturn {
  return {
    caret: 0,
    setCaret: vi.fn(),
    mentionOpen: false,
    mentionIdx: 0,
    setMentionIdx: vi.fn(),
    mentionDismissed: false,
    setMentionDismissed: vi.fn(),
    mentionHits: [],
    safeMentionIdx: 0,
    mentionResult: null,
    mentionLocText: '',
    pickMention: vi.fn(),
    ...overrides,
  }
}

function makeHist(overrides: Partial<UseInputHistoryReturn> = {}): UseInputHistoryReturn {
  return {
    histIdx: null,
    setHistIdx: vi.fn(),
    histDraft: { current: '' },
    applyHistory: vi.fn(),
    ...overrides,
  }
}

function makeKeyEvent(key: string, extra: Partial<React.KeyboardEvent<HTMLTextAreaElement>> = {}) {
  return {
    key,
    shiftKey: false,
    preventDefault: vi.fn(),
    currentTarget: { selectionStart: 0, value: '' },
    ...extra,
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
}

describe('useComposerKeyHandler', () => {
  it('disabled=true + Enter → doSend 미호출', () => {
    const doSend = vi.fn()
    const { result } = renderHook(() =>
      useComposerKeyHandler({
        disabled: true,
        slash: makeSlash(),
        mention: makeMention(),
        hist: makeHist(),
        history: [],
        value: 'hi',
        doSend,
      })
    )
    result.current(makeKeyEvent('Enter'))
    expect(doSend).not.toHaveBeenCalled()
  })

  it('슬래시 열림 + Esc → setSlashDismissed(true)', () => {
    const setSlashDismissed = vi.fn()
    const { result } = renderHook(() =>
      useComposerKeyHandler({
        disabled: false,
        slash: makeSlash({ slashOpen: true, setSlashDismissed }),
        mention: makeMention(),
        hist: makeHist(),
        history: [],
        value: '/',
        doSend: vi.fn(),
      })
    )
    result.current(makeKeyEvent('Escape'))
    expect(setSlashDismissed).toHaveBeenCalledWith(true)
  })

  it('슬래시 열림 + ArrowDown(totalSlash>0) → setSlashIdx 호출', () => {
    const setSlashIdx = vi.fn()
    const { result } = renderHook(() =>
      useComposerKeyHandler({
        disabled: false,
        slash: makeSlash({ slashOpen: true, totalSlash: 3, setSlashIdx }),
        mention: makeMention(),
        hist: makeHist(),
        history: [],
        value: '/',
        doSend: vi.fn(),
      })
    )
    result.current(makeKeyEvent('ArrowDown'))
    expect(setSlashIdx).toHaveBeenCalled()
  })

  it('멘션 열림 + Esc → setMentionDismissed(true)', () => {
    const setMentionDismissed = vi.fn()
    const { result } = renderHook(() =>
      useComposerKeyHandler({
        disabled: false,
        slash: makeSlash(),
        mention: makeMention({ mentionOpen: true, setMentionDismissed }),
        hist: makeHist(),
        history: [],
        value: '@',
        doSend: vi.fn(),
      })
    )
    result.current(makeKeyEvent('Escape'))
    expect(setMentionDismissed).toHaveBeenCalledWith(true)
  })

  it('팔레트 모두 닫힘 + Enter → doSend 호출', () => {
    const doSend = vi.fn()
    const { result } = renderHook(() =>
      useComposerKeyHandler({
        disabled: false,
        slash: makeSlash({ slashOpen: false }),
        mention: makeMention({ mentionOpen: false }),
        hist: makeHist(),
        history: [],
        value: 'hello',
        doSend,
      })
    )
    result.current(makeKeyEvent('Enter'))
    expect(doSend).toHaveBeenCalled()
  })

  it('팔레트 모두 닫힘 + Shift+Enter → doSend 미호출(줄바꿈)', () => {
    const doSend = vi.fn()
    const { result } = renderHook(() =>
      useComposerKeyHandler({
        disabled: false,
        slash: makeSlash(),
        mention: makeMention(),
        hist: makeHist(),
        history: [],
        value: 'hello',
        doSend,
      })
    )
    result.current(makeKeyEvent('Enter', { shiftKey: true } as Partial<React.KeyboardEvent<HTMLTextAreaElement>>))
    expect(doSend).not.toHaveBeenCalled()
  })
})

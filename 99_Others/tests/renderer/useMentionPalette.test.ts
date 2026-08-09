// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMentionPalette } from '../../../02_Source/renderer/src/features/conversation/hooks/useMentionPalette'

const SAMPLE_FILES = ['src/index.ts', 'src/utils.ts', 'src/components/App.tsx']

describe('useMentionPalette', () => {
  const makeRef = () => ({ current: null }) as React.RefObject<HTMLTextAreaElement | null>

  it('"@" value → caret=1로 초기화 → mentionOpen=true', () => {
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '@',
        mentionFiles: SAMPLE_FILES,
        onChange: vi.fn(),
        inputRef: makeRef(),
      })
    )
    expect(result.current.mentionOpen).toBe(true)
  })

  it('값 없음("") → mentionOpen=false', () => {
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '',
        mentionFiles: SAMPLE_FILES,
        onChange: vi.fn(),
        inputRef: makeRef(),
      })
    )
    expect(result.current.mentionOpen).toBe(false)
  })

  it('setMentionDismissed(true) → mentionOpen=false', () => {
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '@',
        mentionFiles: SAMPLE_FILES,
        onChange: vi.fn(),
        inputRef: makeRef(),
      })
    )
    act(() => {
      result.current.setMentionDismissed(true)
    })
    expect(result.current.mentionOpen).toBe(false)
  })

  it('mentionFiles 주입 시 mentionHits.length > 0', () => {
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '@',
        mentionFiles: SAMPLE_FILES,
        onChange: vi.fn(),
        inputRef: makeRef(),
      })
    )
    expect(result.current.mentionHits.length).toBeGreaterThan(0)
  })

  it('mentionFiles 비어있으면 mentionHits=[]', () => {
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '@',
        mentionFiles: [],
        onChange: vi.fn(),
        inputRef: makeRef(),
      })
    )
    expect(result.current.mentionHits.length).toBe(0)
  })

  it('pickMention(file entry) → onChange 호출', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '@',
        mentionFiles: SAMPLE_FILES,
        onChange,
        inputRef: makeRef(),
      })
    )
    const fileEntry = result.current.mentionHits.find((e) => e.kind === 'file')
    if (fileEntry) {
      act(() => {
        result.current.pickMention(fileEntry)
      })
      expect(onChange).toHaveBeenCalled()
      const newVal = onChange.mock.calls[0][0] as string
      expect(newVal).toMatch(/@\S+/)
    }
  })

  it('pickMention(dir entry) → onChange(@dir/ 형태) 호출', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '@',
        mentionFiles: SAMPLE_FILES,
        onChange,
        inputRef: makeRef(),
      })
    )
    const dirEntry = result.current.mentionHits.find((e) => e.kind === 'dir')
    if (dirEntry) {
      act(() => {
        result.current.pickMention(dirEntry)
      })
      expect(onChange).toHaveBeenCalled()
      const newVal = onChange.mock.calls[0][0] as string
      expect(newVal).toMatch(/@.*\/$/)
    }
  })

  it('setCaret(5) → caret=5 갱신', () => {
    const { result } = renderHook(() =>
      useMentionPalette({
        value: '',
        mentionFiles: [],
        onChange: vi.fn(),
        inputRef: makeRef(),
      })
    )
    act(() => {
      result.current.setCaret(5)
    })
    expect(result.current.caret).toBe(5)
  })
})

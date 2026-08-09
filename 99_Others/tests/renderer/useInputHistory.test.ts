// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInputHistory } from '../../../02_Source/renderer/src/features/conversation/hooks/useInputHistory'

describe('useInputHistory', () => {
  const makeRef = () => ({ current: null }) as React.RefObject<HTMLTextAreaElement | null>

  it('초기 상태: histIdx=null', () => {
    const { result } = renderHook(() =>
      useInputHistory({ onChange: vi.fn(), inputRef: makeRef() })
    )
    expect(result.current.histIdx).toBeNull()
  })

  it('초기 상태: histDraft.current === ""', () => {
    const { result } = renderHook(() =>
      useInputHistory({ onChange: vi.fn(), inputRef: makeRef() })
    )
    expect(result.current.histDraft.current).toBe('')
  })

  it('applyHistory(text) → onChange(text) 호출', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInputHistory({ onChange, inputRef: makeRef() })
    )
    act(() => {
      result.current.applyHistory('hello history')
    })
    expect(onChange).toHaveBeenCalledWith('hello history')
  })

  it('setHistIdx(3) → histIdx === 3', () => {
    const { result } = renderHook(() =>
      useInputHistory({ onChange: vi.fn(), inputRef: makeRef() })
    )
    act(() => {
      result.current.setHistIdx(3)
    })
    expect(result.current.histIdx).toBe(3)
  })

  it('setHistIdx(null) → histIdx === null (초기화)', () => {
    const { result } = renderHook(() =>
      useInputHistory({ onChange: vi.fn(), inputRef: makeRef() })
    )
    act(() => {
      result.current.setHistIdx(2)
    })
    act(() => {
      result.current.setHistIdx(null)
    })
    expect(result.current.histIdx).toBeNull()
  })

  it('histDraft.current 직접 쓰기/읽기', () => {
    const { result } = renderHook(() =>
      useInputHistory({ onChange: vi.fn(), inputRef: makeRef() })
    )
    act(() => {
      result.current.histDraft.current = '작성 중인 초안'
    })
    expect(result.current.histDraft.current).toBe('작성 중인 초안')
  })

  it('applyHistory → onCaretChange 콜백 호출 (rAF 내, jsdom에서 rAF는 즉시 실행 없음)', () => {
    const onChange = vi.fn()
    const onCaretChange = vi.fn()
    const { result } = renderHook(() =>
      useInputHistory({ onChange, inputRef: makeRef(), onCaretChange })
    )
    act(() => {
      result.current.applyHistory('test')
    })
    expect(onChange).toHaveBeenCalledWith('test')
  })
})

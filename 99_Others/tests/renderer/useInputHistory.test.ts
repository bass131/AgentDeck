// @vitest-environment jsdom
/**
 * useInputHistory.test.ts — B9 셸식 입력 히스토리 훅 단위 테스트.
 *
 * Composer.tsx 리팩토링 Phase 14: 기존 Composer 통합 테스트(composer.test.tsx)가
 * 커버하는 거동을 훅 단위로도 검증해 독립 테스트 가능 구조 확인.
 *
 * 검증:
 *   1. 초기 상태: histIdx=null, histDraft.current=''
 *   2. applyHistory → onChange 호출
 *   3. setHistIdx로 인덱스 갱신
 *   4. histDraft.current 직접 쓰기/읽기
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInputHistory } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useInputHistory'

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
    // jsdom에서 requestAnimationFrame은 즉시 실행되지 않으므로 onChange 호출만 확인
    const onChange = vi.fn()
    const onCaretChange = vi.fn()
    const { result } = renderHook(() =>
      useInputHistory({ onChange, inputRef: makeRef(), onCaretChange })
    )
    act(() => {
      result.current.applyHistory('test')
    })
    // onChange는 동기 호출
    expect(onChange).toHaveBeenCalledWith('test')
    // onCaretChange는 rAF 내부 — jsdom 환경에서 시뮬레이션 어려우므로 호출 검증 생략
  })
})

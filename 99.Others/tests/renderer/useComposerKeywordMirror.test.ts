// @vitest-environment jsdom
/**
 * useComposerKeywordMirror.test.ts — UC1 Phase 05: 컴포저 키워드 하이라이트 미러
 * 오버레이 상태 훅 단위 테스트.
 *
 * 검증:
 *   1. 키워드 없음 → segments=[일반 세그먼트 1개], ghostActive=false
 *   2. 키워드 있음("ultracode") → segments에 highlight:true 세그먼트 존재, ghostActive=true
 *   3. compositionstart 중에는 키워드가 있어도 ghostActive=false(조합 중 어긋남 방지)
 *   4. compositionend 후 ghostActive 재판정(키워드 있으면 다시 true)
 *   5. handleScroll → mirrorRef.current.scrollTop/Left이 이벤트의 값으로 동기화
 *   6. value 변경 시 안전망 useEffect가 mirrorRef를 inputRef의 scrollTop/Left에 재동기화
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useComposerKeywordMirror } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useComposerKeywordMirror'

type FakeScrollable = { scrollTop: number; scrollLeft: number }

function makeInputRef(init: FakeScrollable = { scrollTop: 0, scrollLeft: 0 }) {
  return { current: init as unknown as HTMLTextAreaElement } as React.RefObject<HTMLTextAreaElement | null>
}

describe('useComposerKeywordMirror — 세그먼트/ghost 판정', () => {
  it('키워드 없는 텍스트 → 세그먼트 1개(non-highlight), ghostActive=false', () => {
    const { result } = renderHook(() => useComposerKeywordMirror('hello world', makeInputRef()))
    expect(result.current.segments).toEqual([{ text: 'hello world', highlight: false }])
    expect(result.current.ghostActive).toBe(false)
  })

  it('"ultracode" 포함 텍스트 → 하이라이트 세그먼트 존재, ghostActive=true', () => {
    const { result } = renderHook(() => useComposerKeywordMirror('ultracode 실행', makeInputRef()))
    expect(result.current.segments.some((s) => s.highlight)).toBe(true)
    expect(result.current.ghostActive).toBe(true)
  })

  it('빈 문자열 → 세그먼트 빈 배열, ghostActive=false', () => {
    const { result } = renderHook(() => useComposerKeywordMirror('', makeInputRef()))
    expect(result.current.segments).toEqual([])
    expect(result.current.ghostActive).toBe(false)
  })
})

describe('useComposerKeywordMirror — IME 조합 중 ghost 비활성', () => {
  it('compositionstart 후 → 키워드가 있어도 ghostActive=false', () => {
    const { result } = renderHook(() => useComposerKeywordMirror('ultracode 실행', makeInputRef()))
    expect(result.current.ghostActive).toBe(true)
    act(() => {
      result.current.handleCompositionStart()
    })
    expect(result.current.ghostActive).toBe(false)
  })

  it('compositionend 후 → ghostActive 재판정(키워드 있으면 true로 복귀)', () => {
    const { result } = renderHook(() => useComposerKeywordMirror('ultracode 실행', makeInputRef()))
    act(() => {
      result.current.handleCompositionStart()
    })
    expect(result.current.ghostActive).toBe(false)
    act(() => {
      result.current.handleCompositionEnd()
    })
    expect(result.current.ghostActive).toBe(true)
  })
})

describe('useComposerKeywordMirror — 스크롤 동기화', () => {
  it('handleScroll(e) → mirrorRef.current.scrollTop/Left이 이벤트 값으로 동기화', () => {
    const { result } = renderHook(() => useComposerKeywordMirror('ultracode', makeInputRef()))
    const fakeMirror: FakeScrollable = { scrollTop: 0, scrollLeft: 0 }
    // 내부 mirrorRef는 훅이 소유 — 테스트에서 직접 대입해 동기화 로직만 검증.
    result.current.mirrorRef.current = fakeMirror as unknown as HTMLDivElement
    act(() => {
      result.current.handleScroll({
        currentTarget: { scrollTop: 42, scrollLeft: 7 },
      } as unknown as React.UIEvent<HTMLTextAreaElement>)
    })
    expect(fakeMirror.scrollTop).toBe(42)
    expect(fakeMirror.scrollLeft).toBe(7)
  })

  it('value 변경 시 안전망 effect가 mirrorRef를 inputRef의 scrollTop/Left에 재동기화', () => {
    const inputFake: FakeScrollable = { scrollTop: 15, scrollLeft: 3 }
    const inputRef = makeInputRef(inputFake)
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useComposerKeywordMirror(value, inputRef),
      { initialProps: { value: 'ultracode' } }
    )
    const fakeMirror: FakeScrollable = { scrollTop: 0, scrollLeft: 0 }
    result.current.mirrorRef.current = fakeMirror as unknown as HTMLDivElement

    // inputRef 쪽 스크롤이 먼저 바뀌고(브라우저의 캐럿 추종 auto-scroll을 흉내), value 변경으로
    // 안전망 effect가 재실행되어 mirror가 따라온다.
    inputFake.scrollTop = 88
    inputFake.scrollLeft = 11
    act(() => {
      rerender({ value: 'ultracode!' })
    })
    expect(fakeMirror.scrollTop).toBe(88)
    expect(fakeMirror.scrollLeft).toBe(11)
  })
})

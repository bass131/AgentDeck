// @vitest-environment jsdom
/**
 * tg1-p04-status-line.test.tsx — StatusLine.tsx (한 줄 상태 라인) 컴포넌트 TDD (RED 선행).
 *
 * 검증 대상(01.Phases/18_TG1-thinking-gui/04-status-line.md 4요소):
 *   1. .thinking 호환 클래스 렌더(census §2.2③ ~10파일 의존 — 상태 라인이 대체해도 유지).
 *   2. ✻ 심볼 렌더.
 *   3. text(thinkingText override) 우선 표시 / null이면 WORKING_PHRASES 순환(WorkingIndicator
 *      동일 관례 재사용).
 *   4. thinkingStartedAt + estimatedTokens → 메타 세그먼트("(Ns · ↑ X tokens)")가 1초 인터벌로
 *      갱신됨(로컬 state 격리 — P02 computeThinkingElapsedSeconds 순수 함수 소비).
 *   5. thinkingStartedAt=null + estimatedTokens=undefined → 메타 세그먼트 자체 미표시.
 *   6. 언마운트 시 인터벌+phrase 타이머 정리(누수 0).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { StatusLine } from '../../../02.Source/renderer/src/components/01_conversation/StatusLine'
import { WORKING_PHRASES } from '../../../02.Source/renderer/src/lib/workingPhrases'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('TG1 P04 — StatusLine: 호환 셀렉터 + 심볼', () => {
  it('.thinking 클래스 렌더(census 호환) + ✻ 심볼 텍스트 포함', () => {
    const { container } = render(
      <StatusLine text="분석 중" thinkingStartedAt={null} estimatedTokens={undefined} />,
    )
    expect(container.querySelector('.thinking')).toBeTruthy()
    expect(container.textContent).toContain('✻')
  })
})

describe('TG1 P04 — StatusLine: 동사 순환(WORKING_PHRASES 재사용)', () => {
  it('text 있으면 그 텍스트 우선 표시(phrase 대신)', () => {
    const { container } = render(
      <StatusLine text="코드 분석 중…" thinkingStartedAt={null} estimatedTokens={undefined} />,
    )
    expect(container.textContent).toContain('코드 분석 중…')
  })

  it('text=null이면 WORKING_PHRASES 중 하나 표시', () => {
    const { container } = render(
      <StatusLine text={null} thinkingStartedAt={null} estimatedTokens={undefined} />,
    )
    const found = WORKING_PHRASES.some((p) => (container.textContent ?? '').includes(p))
    expect(found).toBe(true)
  })
})

describe('TG1 P04 — StatusLine: 경과 초 + 토큰 메타 세그먼트', () => {
  it('thinkingStartedAt + estimatedTokens → "(Ns · ↑ X tokens)" 형태 메타 표시', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)

    const { container } = render(
      <StatusLine text="사고 중" thinkingStartedAt={5_000} estimatedTokens={3400} />,
    )

    // mount 시점 nowMs=10000, thinkingStartedAt=5000 → 경과 5초
    expect(container.textContent).toContain('5s')
    expect(container.textContent).toContain('3.4k')
    expect(container.textContent).toContain('tokens')
  })

  it('1초 인터벌 경과 후 경과 초가 갱신된다(로컬 상태 격리)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)

    const { container } = render(
      <StatusLine text="사고 중" thinkingStartedAt={5_000} estimatedTokens={undefined} />,
    )
    expect(container.textContent).toContain('5s')

    // advanceTimersByTime 자체가 가짜 시계를 함께 전진시킨다(setSystemTime과 중복 호출 시
    // 이중 전진 — advanceTimersByTime 단독으로 3초 경과를 시뮬레이션한다).
    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    expect(container.textContent).toContain('8s')
  })

  it('thinkingStartedAt=null + estimatedTokens=undefined → 메타 세그먼트 자체 미표시(괄호 없음)', () => {
    const { container } = render(
      <StatusLine text="사고 중" thinkingStartedAt={null} estimatedTokens={undefined} />,
    )
    expect(container.textContent).not.toContain('(')
  })
})

describe('TG1 P04 — StatusLine: 언마운트 정리(누수 0)', () => {
  it('언마운트 시 clearInterval + clearTimeout 모두 호출된다', () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    const { unmount } = render(
      <StatusLine text={null} thinkingStartedAt={1_000} estimatedTokens={340} />,
    )

    clearIntervalSpy.mockClear()
    clearTimeoutSpy.mockClear()
    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearIntervalSpy.mockRestore()
    clearTimeoutSpy.mockRestore()
  })
})

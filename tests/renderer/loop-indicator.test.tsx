// @vitest-environment jsdom
/**
 * loop-indicator.test.tsx — LoopIndicator 컴포넌트 단위 (4단계).
 *
 * 활성 루프 인디케이터: 프롬프트·간격·틱 카운트·정지 버튼(running) / 상한 알림·닫기(stopped).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LoopIndicator } from '../../src/renderer/src/components/07_notice/LoopIndicator'
import type { ActiveLoop } from '../../src/renderer/src/lib/loopCommand'

afterEach(() => cleanup())

function loop(p: Partial<ActiveLoop> = {}): ActiveLoop {
  return { prompt: '테스트 실행', intervalMs: 300_000, tickCount: 3, status: 'running', startedAt: 1, ...p }
}

describe('LoopIndicator — running', () => {
  it('루프 바 렌더 + 프롬프트 표시', () => {
    const { container } = render(<LoopIndicator loop={loop()} onStop={vi.fn()} onDismiss={vi.fn()} />)
    expect(container.querySelector('.loop-indicator')).toBeTruthy()
    expect(screen.getByText(/테스트 실행/)).toBeTruthy()
  })

  it('틱 카운트 + 간격 표시 (3틱 · 5분)', () => {
    const { container } = render(<LoopIndicator loop={loop({ tickCount: 3, intervalMs: 300_000 })} onStop={vi.fn()} onDismiss={vi.fn()} />)
    const txt = container.textContent ?? ''
    expect(txt).toContain('3')
    expect(txt).toContain('5분')
  })

  it('정지 버튼 클릭 → onStop', () => {
    const onStop = vi.fn()
    render(<LoopIndicator loop={loop()} onStop={onStop} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /정지/ }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})

describe('LoopIndicator — stopped (상한 도달)', () => {
  it('max-ticks → 상한 알림 + 닫기 버튼', () => {
    const { container } = render(
      <LoopIndicator loop={loop({ status: 'stopped', stopReason: 'max-ticks' })} onStop={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator.stopped')).toBeTruthy()
    // 틱 상한 안내 문구
    expect(container.textContent ?? '').toMatch(/상한|정지|도달/)
  })

  it('max-duration → 시간 상한 안내', () => {
    const { container } = render(
      <LoopIndicator loop={loop({ status: 'stopped', stopReason: 'max-duration' })} onStop={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container.textContent ?? '').toMatch(/시간|상한|정지/)
  })

  it('닫기 버튼 클릭 → onDismiss', () => {
    const onDismiss = vi.fn()
    render(<LoopIndicator loop={loop({ status: 'stopped', stopReason: 'max-ticks' })} onStop={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

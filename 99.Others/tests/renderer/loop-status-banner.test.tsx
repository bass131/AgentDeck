// @vitest-environment jsdom
/**
 * loop-status-banner.test.tsx — LR2-03 통합 루프 인디케이터 (LR3-03 단순화).
 *
 * 배경(03-loop-gui.md): 두 인디케이터(LoopRunningIndicator←SDK 크론 activeLoops /
 * LoopIndicator←앱 타이머 activeLoop)가 별도 컴포넌트·별도 위치(우상단 pill vs 컴포저 위
 * 배너)로 갈려 있던 것을 LR2-03이 LoopStatusBanner 하나로 통합했다. LR3-03(앱 타이머
 * /loop 폐기 — 영호 확정 "토큰 맥싱")에서 app 변형 소스(activeLoop)가 통째로 사라져
 * resolveLoopStatus/LoopStatusBanner 모두 sdk 변형만 남는다.
 *
 * 셀렉터 계약(회귀 방지): 루트 `.loop-indicator` · sdk 변형 `.loop-sdk` ·
 * sdk 정지 `.loop-sdk-stop`은 e2e가 의존 — 유지.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import {
  resolveLoopStatus,
} from '../../../02.Source/renderer/src/lib/loopStatus'
import { LoopStatusBanner } from '../../../02.Source/renderer/src/components/07_notice/LoopStatusBanner'
import type { LoopInfo } from '../../../02.Source/shared/agent-events'

afterEach(() => cleanup())

function sdkLoop(p: Partial<LoopInfo> = {}): LoopInfo {
  return { id: 'cc247', summary: '매분 상태 점검', interval: 'Every minute', ...p }
}

// ══════════════════════════════════════════════════════════════════════════════
// resolveLoopStatus — 상태 결정 순수 로직
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveLoopStatus — 단일 표시 결정 (LR3-03: SDK 크론 단일 소스)', () => {
  it('없음 → none', () => {
    expect(resolveLoopStatus([]).kind).toBe('none')
  })

  it('SDK 크론만 → sdk + loops 전달', () => {
    const st = resolveLoopStatus([sdkLoop(), sdkLoop({ id: 'dd1', summary: '두번째' })])
    expect(st.kind).toBe('sdk')
    expect(st.kind === 'sdk' && st.loops.length).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// LoopStatusBanner — sdk 변형 (기존 LoopRunningIndicator 의도 이관)
// ══════════════════════════════════════════════════════════════════════════════

describe('LoopStatusBanner — sdk 크론', () => {
  it('summary 1개 → "loop 진행중" 라벨 + summary + 접근성 라벨 (.loop-indicator 셀렉터 계약 유지)', () => {
    const status = resolveLoopStatus([sdkLoop()])
    const { container } = render(
      <LoopStatusBanner status={status} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator')).toBeTruthy()
    expect(container.textContent ?? '').toContain('loop 진행중')
    expect(container.textContent ?? '').toContain('매분 상태 점검')
    expect(screen.getByRole('status', { name: /루프 1개 진행중/ })).toBeTruthy()
  })

  it('여러 루프 → 첫 summary + "외 N"', () => {
    const status = resolveLoopStatus([sdkLoop(), sdkLoop({ id: 'dd1', summary: '둘' }), sdkLoop({ id: 'ee2', summary: '셋' })])
    const { container } = render(
      <LoopStatusBanner status={status} onStopSdk={vi.fn()} />,
    )
    expect(container.textContent ?? '').toContain('매분 상태 점검 외 2')
  })

  it('정지 버튼("루프 정지", .loop-sdk-stop 셀렉터 계약) → onStopSdk (세션 abort 배선용)', () => {
    const onStopSdk = vi.fn()
    const status = resolveLoopStatus([sdkLoop()])
    const { container } = render(
      <LoopStatusBanner status={status} onStopSdk={onStopSdk} />,
    )
    const stopBtn = container.querySelector('.loop-sdk-stop')
    expect(stopBtn).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /루프 정지/ }))
    expect(onStopSdk).toHaveBeenCalledTimes(1)
  })

  it('onStopSdk 미전달 → 정지 버튼 미표시 (기존 옵셔널 계약 유지)', () => {
    const status = resolveLoopStatus([sdkLoop()])
    render(<LoopStatusBanner status={status} />)
    expect(screen.queryByRole('button', { name: /루프 정지/ })).toBeNull()
  })
})

describe('LoopStatusBanner — none', () => {
  it('none → null 렌더 (표시 제거)', () => {
    const { container } = render(
      <LoopStatusBanner status={{ kind: 'none' }} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator')).toBeNull()
  })
})

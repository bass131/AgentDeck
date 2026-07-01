// @vitest-environment jsdom
/**
 * loop-status-banner.test.tsx — LR2-03 통합 루프 인디케이터 (TDD RED→GREEN).
 *
 * 배경(03-loop-gui.md): 두 인디케이터(LoopRunningIndicator←SDK 크론 activeLoops /
 * LoopIndicator←앱 타이머 activeLoop)가 별도 컴포넌트·별도 위치(우상단 pill vs 컴포저 위
 * 배너)로 갈려 있고, 동시 표시 회피가 replMode 분기에 *우연히* 의존한다.
 *
 * 통합: 순수 함수 resolveLoopStatus(activeLoop, activeLoops)가 "무엇을 표시할지"를
 * 단일 결정(discriminated union) → LoopStatusBanner 하나가 컴포저 위 한 자리에 렌더.
 * 동시 표시 없음이 *구조적으로* 보장된다(컴포넌트가 하나뿐).
 *
 * 우선순위: 앱 타이머 루프(사용자 발화·정지/닫기 UX 보유) > SDK 크론 > none.
 * 둘 다 활성이면 앱 배너 + "크론 N" 힌트(정보 은닉 없이 단일 표면).
 *
 * 셀렉터 계약(회귀 방지): 루트 `.loop-indicator` · 정지 버튼 `.loop-stop`은
 * loop-live.e2e.ts가 의존 — 통합 후에도 유지.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import {
  resolveLoopStatus,
  type LoopStatus,
} from '../../../02.Source/renderer/src/lib/loopStatus'
import { LoopStatusBanner } from '../../../02.Source/renderer/src/components/07_notice/LoopStatusBanner'
import type { ActiveLoop } from '../../../02.Source/renderer/src/lib/loopCommand'
import type { LoopInfo } from '../../../02.Source/shared/agent-events'

afterEach(() => cleanup())

function appLoop(p: Partial<ActiveLoop> = {}): ActiveLoop {
  return { prompt: '테스트 실행', intervalMs: 300_000, tickCount: 3, status: 'running', startedAt: 1, ...p }
}

function sdkLoop(p: Partial<LoopInfo> = {}): LoopInfo {
  return { id: 'cc247', summary: '매분 상태 점검', interval: 'Every minute', ...p }
}

// ══════════════════════════════════════════════════════════════════════════════
// resolveLoopStatus — 상태 결정 순수 로직 (완료조건: "단위 테스트로 상태 로직 검증")
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveLoopStatus — 단일 표시 결정', () => {
  it('둘 다 없음 → none', () => {
    expect(resolveLoopStatus(null, []).kind).toBe('none')
  })

  it('앱 루프만 → app + extraSdkLoops 0', () => {
    const st = resolveLoopStatus(appLoop(), [])
    expect(st.kind).toBe('app')
    expect((st as Extract<LoopStatus, { kind: 'app' }>).extraSdkLoops).toBe(0)
  })

  it('SDK 크론만 → sdk + loops 전달', () => {
    const st = resolveLoopStatus(null, [sdkLoop(), sdkLoop({ id: 'dd1', summary: '두번째' })])
    expect(st.kind).toBe('sdk')
    expect((st as Extract<LoopStatus, { kind: 'sdk' }>).loops.length).toBe(2)
  })

  it('둘 다 활성 → app 우선 + extraSdkLoops에 크론 수 (동시 표시 원천 차단)', () => {
    const st = resolveLoopStatus(appLoop(), [sdkLoop()])
    expect(st.kind).toBe('app')
    expect((st as Extract<LoopStatus, { kind: 'app' }>).extraSdkLoops).toBe(1)
  })

  it('앱 루프 stopped(상한 알림)도 app 우선 유지 — 알림이 크론에 가려지지 않음', () => {
    const st = resolveLoopStatus(appLoop({ status: 'stopped', stopReason: 'max-ticks' }), [sdkLoop()])
    expect(st.kind).toBe('app')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// LoopStatusBanner — app 변형 (기존 LoopIndicator 의도 이관)
// ══════════════════════════════════════════════════════════════════════════════

describe('LoopStatusBanner — app running', () => {
  const status = resolveLoopStatus(appLoop(), [])

  it('.loop-indicator 루트 + 프롬프트 표시 (loop-live.e2e 셀렉터 계약 유지)', () => {
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator')).toBeTruthy()
    expect(screen.getByText(/테스트 실행/)).toBeTruthy()
  })

  it('틱 카운트 + 간격 표시 (3틱 · 5분)', () => {
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    const txt = container.textContent ?? ''
    expect(txt).toContain('3')
    expect(txt).toContain('5분')
  })

  it('.loop-stop 정지 버튼 클릭 → onStopApp (셀렉터 계약 유지)', () => {
    const onStopApp = vi.fn()
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={onStopApp} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    const stopBtn = container.querySelector('.loop-stop')
    expect(stopBtn).toBeTruthy()
    fireEvent.click(stopBtn as HTMLElement)
    expect(onStopApp).toHaveBeenCalledTimes(1)
  })

  it('둘 다 활성 → 배너 1개만 렌더(.loop-indicator 1개) + 크론 힌트', () => {
    const both = resolveLoopStatus(appLoop(), [sdkLoop(), sdkLoop({ id: 'dd1' })])
    const { container } = render(
      <LoopStatusBanner status={both} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelectorAll('.loop-indicator').length).toBe(1)
    expect(container.textContent ?? '').toContain('크론 2')
  })
})

describe('LoopStatusBanner — app stopped (상한 도달)', () => {
  it('max-ticks → .stopped 변형 + 상한 안내 + 닫기 → onDismissApp', () => {
    const onDismissApp = vi.fn()
    const status = resolveLoopStatus(appLoop({ status: 'stopped', stopReason: 'max-ticks' }), [])
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={onDismissApp} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator.stopped')).toBeTruthy()
    expect(container.textContent ?? '').toMatch(/상한|정지|도달/)
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }))
    expect(onDismissApp).toHaveBeenCalledTimes(1)
  })

  it('max-duration → 시간 상한 안내', () => {
    const status = resolveLoopStatus(appLoop({ status: 'stopped', stopReason: 'max-duration' }), [])
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    expect(container.textContent ?? '').toMatch(/시간|상한|정지/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// LoopStatusBanner — sdk 변형 (기존 LoopRunningIndicator 의도 이관)
// ══════════════════════════════════════════════════════════════════════════════

describe('LoopStatusBanner — sdk 크론', () => {
  it('summary 1개 → "loop 진행중" 라벨 + summary + 접근성 라벨', () => {
    const status = resolveLoopStatus(null, [sdkLoop()])
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    expect(container.textContent ?? '').toContain('loop 진행중')
    expect(container.textContent ?? '').toContain('매분 상태 점검')
    expect(screen.getByRole('status', { name: /루프 1개 진행중/ })).toBeTruthy()
  })

  it('여러 루프 → 첫 summary + "외 N"', () => {
    const status = resolveLoopStatus(null, [sdkLoop(), sdkLoop({ id: 'dd1', summary: '둘' }), sdkLoop({ id: 'ee2', summary: '셋' })])
    const { container } = render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    expect(container.textContent ?? '').toContain('매분 상태 점검 외 2')
  })

  it('정지 버튼("루프 정지") → onStopSdk (세션 abort 배선용)', () => {
    const onStopSdk = vi.fn()
    const status = resolveLoopStatus(null, [sdkLoop()])
    render(
      <LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={onStopSdk} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /루프 정지/ }))
    expect(onStopSdk).toHaveBeenCalledTimes(1)
  })

  it('onStopSdk 미전달 → 정지 버튼 미표시 (기존 옵셔널 계약 유지)', () => {
    const status = resolveLoopStatus(null, [sdkLoop()])
    render(<LoopStatusBanner status={status} onStopApp={vi.fn()} onDismissApp={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /루프 정지/ })).toBeNull()
  })
})

describe('LoopStatusBanner — none', () => {
  it('none → null 렌더 (표시 제거)', () => {
    const { container } = render(
      <LoopStatusBanner status={{ kind: 'none' }} onStopApp={vi.fn()} onDismissApp={vi.fn()} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator')).toBeNull()
  })
})

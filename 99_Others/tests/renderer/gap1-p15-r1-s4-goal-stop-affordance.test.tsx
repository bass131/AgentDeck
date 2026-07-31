// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { LoopStatusBanner } from '../../../02_Source/renderer/src/components/07_notice/LoopStatusBanner'

afterEach(() => cleanup())

const GOAL_STATUS = { kind: 'goal', turns: 3, detail: '테스트 커버리지 80% 달성' } as const

describe('GAP1 P15-R1 S4 — goal 배너 정지 어포던스 (RED)', () => {
  it('goal 변형 + onStopSdk 제공 → .loop-goal-stop 정지 버튼 렌더', () => {
    const { container } = render(
      <LoopStatusBanner status={GOAL_STATUS} onStopSdk={vi.fn()} />
    )
    expect(container.querySelector('.loop-indicator.loop-goal')).toBeTruthy()
    const stopBtn = container.querySelector('.loop-goal .loop-head .loop-goal-stop')
    expect(stopBtn).toBeTruthy()
  })

  it('정지 버튼 클릭 → onStopSdk 호출(부모의 abortRun 배선 = goal 해제 경로)', () => {
    const onStopSdk = vi.fn()
    const { container } = render(
      <LoopStatusBanner status={GOAL_STATUS} onStopSdk={onStopSdk} />
    )
    const stopBtn = container.querySelector('.loop-goal-stop') as HTMLElement | null
    expect(stopBtn).toBeTruthy()
    if (stopBtn) fireEvent.click(stopBtn)
    expect(onStopSdk).toHaveBeenCalledTimes(1)
  })

  it('대조군(GREEN 유지): onStopSdk 미전달 → 정지 버튼 미표시(옵셔널 계약 미러)', () => {
    const { container } = render(<LoopStatusBanner status={GOAL_STATUS} />)
    expect(container.querySelector('.loop-goal-stop')).toBeNull()
    expect(container.querySelector('.loop-sdk-stop')).toBeNull()
  })
})

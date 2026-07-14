// @vitest-environment jsdom
/**
 * gap1-p15-r1-s4-goal-stop-affordance.test.tsx — GAP1 P15 라운드1 시드 S4 RED.
 *
 * 결함(라운드 0 시드): goal 활성 배너(LoopStatusBanner goal 변형)에 정지 어포던스가
 * 없다 — sdk(크론) 변형은 `.loop-sdk-stop` 정지 버튼이 있지만 goal 변형은 "컴포저 자체
 * 중단 버튼이 대신"이라는 전제로 버튼을 뺐다(LoopStatusBanner.tsx:33-35 주석). 그러나
 * dogfood 실사용에서 goal 진행 중 배너만 보이는 상황(스크롤/포커스가 컴포저에서 먼
 * 상태)에서 "여기서 바로 멈출 수단"이 없어 정지 경로 발견이 어려웠다.
 *
 * 기대 스펙(interface-of-record — 봉합은 renderer Worker):
 *   - status.kind==='goal' && onStopSdk 제공 → `.loop-head` 안에 정지 버튼
 *     `.loop-goal-stop` 렌더(기존 `.loop-btn` 문법 미러).
 *   - 클릭 → onStopSdk 호출. 호출부(Conversation.tsx:1031 / PanelView.tsx:632)는 이미
 *     onStopSdk를 무조건 abortRun/session.abort로 배선한다 — abort가 goalRun·
 *     pendingCommand를 소멸시키는 "goal 해제 경로"다(decideStopAction도 goal 활성이면
 *     항상 'abort' 판정, lib/stopAction.ts:43-45). **props 계약 변경 0** — 기존
 *     onStopSdk 재사용(부모 배선 수정 불필요).
 *   - onStopSdk 미전달 → 버튼 미표시(sdk 변형의 옵셔널 계약 미러).
 *   - 셀렉터는 `.loop-goal-stop`(신규) — 기존 핀 "goal 변형에 `.loop-sdk-stop` 없음"
 *     (loop-status-banner.test.tsx:237)과 충돌하지 않는다(그 핀은 계속 GREEN).
 *
 * TDD 상태: RED 2건(버튼 존재·클릭 배선) + 대조군 GREEN 1건(onStopSdk 미전달 시 미표시).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { LoopStatusBanner } from '../../../02.Source/renderer/src/components/07_notice/LoopStatusBanner'

afterEach(() => cleanup())

const GOAL_STATUS = { kind: 'goal', turns: 3, detail: '테스트 커버리지 80% 달성' } as const

describe('GAP1 P15-R1 S4 — goal 배너 정지 어포던스 (RED)', () => {
  it('goal 변형 + onStopSdk 제공 → .loop-goal-stop 정지 버튼 렌더', () => {
    const { container } = render(
      <LoopStatusBanner status={GOAL_STATUS} onStopSdk={vi.fn()} />
    )
    // goal 변형 자체는 기존 계약대로 렌더된다(전제 확인).
    expect(container.querySelector('.loop-indicator.loop-goal')).toBeTruthy()
    // 현행: goal 변형엔 정지 버튼이 전혀 없음 → RED.
    const stopBtn = container.querySelector('.loop-goal .loop-head .loop-goal-stop')
    expect(stopBtn).toBeTruthy()
  })

  it('정지 버튼 클릭 → onStopSdk 호출(부모의 abortRun 배선 = goal 해제 경로)', () => {
    const onStopSdk = vi.fn()
    const { container } = render(
      <LoopStatusBanner status={GOAL_STATUS} onStopSdk={onStopSdk} />
    )
    const stopBtn = container.querySelector('.loop-goal-stop') as HTMLElement | null
    expect(stopBtn).toBeTruthy() // 현행 null → RED
    if (stopBtn) fireEvent.click(stopBtn)
    expect(onStopSdk).toHaveBeenCalledTimes(1)
  })

  it('대조군(GREEN 유지): onStopSdk 미전달 → 정지 버튼 미표시(옵셔널 계약 미러)', () => {
    const { container } = render(<LoopStatusBanner status={GOAL_STATUS} />)
    expect(container.querySelector('.loop-goal-stop')).toBeNull()
    // 기존 핀과의 정합: goal 변형에 sdk 셀렉터(.loop-sdk-stop)는 어떤 경우에도 없음.
    expect(container.querySelector('.loop-sdk-stop')).toBeNull()
  })
})

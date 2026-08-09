// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import {
  resolveLoopStatus,
} from '../../../02_Source/renderer/src/lib/loopStatus'
import { LoopStatusBanner } from '../../../02_Source/renderer/src/features/notice'
import { CMD_CARDS } from '../../../02_Source/renderer/src/lib/cmdCards'
import type { LoopInfo } from '../../../02_Source/shared/agentEvents'

afterEach(() => cleanup())

function sdkLoop(p: Partial<LoopInfo> = {}): LoopInfo {
  return { id: 'cc247', summary: '매분 상태 점검', interval: 'Every minute', ...p }
}

function goalRun(turns: number, detail: string | null = null) {
  return { turns, detail }
}

describe('resolveLoopStatus — 단일 표시 결정 (BL1 후속: sdk > goal(goalRun) > stopped > none)', () => {
  it('없음 → none', () => {
    expect(resolveLoopStatus([]).kind).toBe('none')
  })

  it('SDK 크론만 → sdk + loops 전달', () => {
    const st = resolveLoopStatus([sdkLoop(), sdkLoop({ id: 'dd1', summary: '두번째' })])
    expect(st.kind).toBe('sdk')
    expect(st.kind === 'sdk' && st.loops.length).toBe(2)
  })

  it('goalRun 없음(undefined) → 회귀: 기존 2-인자 호출부와 동일하게 none', () => {
    expect(resolveLoopStatus([]).kind).toBe('none')
  })

  it('goalRun 존재 → goal + turns/detail 그대로 전달', () => {
    const st = resolveLoopStatus([], goalRun(3))
    expect(st.kind).toBe('goal')
    expect(st.kind === 'goal' && st.turns).toBe(3)
  })

  it('점등은 낙관적 — begin-command로 goalRun이 생기는 즉시(백엔드 확인 신호 없이도) goal', () => {
    const st = resolveLoopStatus([], goalRun(0))
    expect(st.kind).toBe('goal')
    expect(st.kind === 'goal' && st.turns).toBe(0)
    expect(st.kind === 'goal' && st.detail).toBeNull()
  })

  it('단일 표시 불변식: sdk + goal 동시 존재 → sdk 우선(goal은 뒤로)', () => {
    const st = resolveLoopStatus([sdkLoop()], goalRun(5))
    expect(st.kind).toBe('sdk')
  })

  it('goalRun=null → none(옵셔널 계약)', () => {
    expect(resolveLoopStatus([], null).kind).toBe('none')
  })
})

describe('resolveLoopStatus — stopped 변형 (정지 신뢰 피드백)', () => {
  it('stoppedNotice=true(활성 루프 없음) → stopped', () => {
    expect(resolveLoopStatus([], null, true).kind).toBe('stopped')
  })

  it('stoppedNotice 미전달 → 기존 3-변형 거동 그대로(none)', () => {
    expect(resolveLoopStatus([], null).kind).toBe('none')
  })

  it('단일 표시 불변식: sdk가 stopped보다 우선(새 루프가 이미 돌면 확인 배너는 뒤로)', () => {
    expect(resolveLoopStatus([sdkLoop()], null, true).kind).toBe('sdk')
  })

  it('단일 표시 불변식: goal(goalRun 존재)이 stopped보다 우선', () => {
    expect(resolveLoopStatus([], goalRun(2), true).kind).toBe('goal')
  })
})

describe('LoopStatusBanner — stopped 변형 (정지 확인)', () => {
  it('stopped → .loop-stopped 렌더 + "루프 정지됨" 라벨 + 정리 확인 문구, 회전 아이콘 없음', () => {
    render(<LoopStatusBanner status={{ kind: 'stopped' }} />)
    const root = document.querySelector('.loop-indicator.loop-stopped')
    expect(root).not.toBeNull()
    expect(screen.getByText('루프 정지됨')).toBeTruthy()
    expect(screen.getByText(/반복 실행이 멈췄어요/)).toBeTruthy()
    expect(document.querySelector('.loop-stopped .spin')).toBeNull()
    expect(document.querySelector('.loop-stopped .loop-spinner')).toBeNull()
  })

  it('sdk/goal 진행 변형 → 표준 border 스피너(.loop-spinner) 렌더(SVG 회전 아님)', () => {
    render(<LoopStatusBanner status={resolveLoopStatus([sdkLoop()])} />)
    expect(document.querySelector('.loop-sdk .loop-spinner')).not.toBeNull()
    cleanup()
    render(<LoopStatusBanner status={resolveLoopStatus([], goalRun(1))} />)
    expect(document.querySelector('.loop-goal .loop-spinner')).not.toBeNull()
  })

  it('onDismissStopped 전달 → .loop-dismiss 버튼 렌더 + 클릭 시 호출', () => {
    const onDismiss = vi.fn()
    render(<LoopStatusBanner status={{ kind: 'stopped' }} onDismissStopped={onDismiss} />)
    const btn = document.querySelector('.loop-dismiss') as HTMLButtonElement
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('onDismissStopped 미전달 → 닫기 버튼 미표시(기존 onStopSdk 옵셔널 계약과 동형)', () => {
    render(<LoopStatusBanner status={{ kind: 'stopped' }} />)
    expect(document.querySelector('.loop-dismiss')).toBeNull()
  })
})

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

describe('LoopStatusBanner — goal (`/goal` 자기지속)', () => {
  it('상태 라벨(CMD_CARDS.goal.running과 동일 문자열 — 단일 진실원) + "N턴" 뱃지 + 접근성 라벨 (.loop-indicator.loop-goal 셀렉터)', () => {
    const status = resolveLoopStatus([], goalRun(2))
    const { container } = render(<LoopStatusBanner status={status} />)
    const root = container.querySelector('.loop-indicator.loop-goal')
    expect(root).toBeTruthy()
    expect(container.textContent ?? '').toContain(CMD_CARDS.goal.running)
    expect(container.textContent ?? '').toContain('2턴')
    expect(screen.getByRole('status', { name: /목표 진행중 · 2턴/ })).toBeTruthy()
  })

  it('turns=0(맨몸 /goal 직후) → "0턴" 뱃지', () => {
    const status = resolveLoopStatus([], goalRun(0))
    const { container } = render(<LoopStatusBanner status={status} />)
    expect(container.textContent ?? '').toContain('0턴')
  })

  it('sdk 정지 버튼(.loop-sdk-stop)이 렌더되지 않음 — goal 변형은 정지 버튼 없음(컴포저 자체 중단 버튼이 대신)', () => {
    const status = resolveLoopStatus([], goalRun(1))
    const { container } = render(<LoopStatusBanner status={status} onStopSdk={vi.fn()} />)
    expect(container.querySelector('.loop-sdk-stop')).toBeNull()
    expect(container.querySelector('.loop-btn')).toBeNull()
  })

  it('회귀: goal 변형이어도 루트 .loop-indicator 셀렉터 계약은 그대로 유지', () => {
    const status = resolveLoopStatus([], goalRun(1))
    const { container } = render(<LoopStatusBanner status={status} />)
    expect(container.querySelector('.loop-indicator')).toBeTruthy()
  })
})

describe('resolveLoopStatus — goal detail(작업 주제) 전달', () => {
  it('goalRun.detail 있음 → LoopStatus.detail로 그대로 전달', () => {
    const st = resolveLoopStatus([], goalRun(1, '간단한 goal을 일단 내가 멈추라고 하기 전까지 진행해줘'))
    expect(st.kind).toBe('goal')
    expect(st.kind === 'goal' && st.detail).toBe('간단한 goal을 일단 내가 멈추라고 하기 전까지 진행해줘')
  })

  it('goalRun.detail 미전달(맨몸 /goal) → null', () => {
    const st = resolveLoopStatus([], goalRun(1))
    expect(st.kind === 'goal' && st.detail).toBeNull()
  })
})

describe('LoopStatusBanner — 2행 작업 주제(.loop-topic)', () => {
  it('goal: detail 있으면 2행에 목표 텍스트 렌더', () => {
    const status = resolveLoopStatus([], goalRun(1, '리팩토링 마무리하기'))
    const { container } = render(<LoopStatusBanner status={status} />)
    const topic = container.querySelector('.loop-topic')
    expect(topic).not.toBeNull()
    expect(topic?.textContent).toBe('리팩토링 마무리하기')
  })

  it('goal: detail 없으면 2행(.loop-topic) 자체를 렌더하지 않음(정보 없는데 지어내지 않음)', () => {
    const status = resolveLoopStatus([], goalRun(1))
    const { container } = render(<LoopStatusBanner status={status} />)
    expect(container.querySelector('.loop-topic')).toBeNull()
  })

  it('sdk: summary가 2행(.loop-topic)에 렌더(기존 표시 재배치 — 정보 손실 없음)', () => {
    const status = resolveLoopStatus([sdkLoop()])
    const { container } = render(<LoopStatusBanner status={status} onStopSdk={vi.fn()} />)
    const topic = container.querySelector('.loop-topic')
    expect(topic).not.toBeNull()
    expect(topic?.textContent).toBe('매분 상태 점검')
  })
})

describe('LoopStatusBanner — 3행 현재 작업내용(.loop-current, currentActivity prop)', () => {
  it('sdk + currentActivity 있음 → 3행 렌더', () => {
    const status = resolveLoopStatus([sdkLoop()])
    const { container } = render(
      <LoopStatusBanner status={status} onStopSdk={vi.fn()} currentActivity="다음 실행 결과를 정리하는 중" />,
    )
    expect(container.querySelector('.loop-current')?.textContent).toBe('다음 실행 결과를 정리하는 중')
  })

  it('goal + currentActivity 있음 → 3행 렌더', () => {
    const status = resolveLoopStatus([], goalRun(1, '리팩토링'))
    const { container } = render(<LoopStatusBanner status={status} currentActivity="파일을 검토하는 중" />)
    expect(container.querySelector('.loop-current')?.textContent).toBe('파일을 검토하는 중')
  })

  it('currentActivity 미전달/null → 3행 미렌더(값 없는 정보를 지어내지 않음)', () => {
    const status = resolveLoopStatus([sdkLoop()])
    const { container } = render(<LoopStatusBanner status={status} onStopSdk={vi.fn()} />)
    expect(container.querySelector('.loop-current')).toBeNull()
  })

  it('stopped 변형은 currentActivity를 전달해도 무시(과거 통지엔 "지금 하는 일" 개념이 없음)', () => {
    const { container } = render(
      <LoopStatusBanner status={{ kind: 'stopped' }} currentActivity="이 텍스트는 안 보여야 함" />,
    )
    expect(container.querySelector('.loop-current')).toBeNull()
    expect(container.textContent ?? '').not.toContain('이 텍스트는 안 보여야 함')
  })
})

describe('LoopStatusBanner — 상태 전환 표시(진행 → 정지)', () => {
  it('goal(진행) → stopped로 rerender 시 헤드/스피너/토픽이 정지 확인 표시로 완전히 교체된다', () => {
    const running = resolveLoopStatus([], goalRun(3, '문서 정리'))
    const { container, rerender } = render(
      <LoopStatusBanner status={running} currentActivity="개요를 작성하는 중" />,
    )
    expect(container.querySelector('.loop-goal')).not.toBeNull()
    expect(container.querySelector('.loop-spinner')).not.toBeNull()
    expect(container.querySelector('.loop-topic')?.textContent).toBe('문서 정리')
    expect(container.querySelector('.loop-current')?.textContent).toBe('개요를 작성하는 중')

    rerender(<LoopStatusBanner status={{ kind: 'stopped' }} />)
    expect(container.querySelector('.loop-goal')).toBeNull()
    expect(container.querySelector('.loop-spinner')).toBeNull()
    expect(container.querySelector('.loop-stopped')).not.toBeNull()
    expect(screen.getByText('루프 정지됨')).toBeTruthy()
  })

  it('sdk(진행) → none으로 rerender 시 배너가 완전히 사라진다(대기 상태 전이)', () => {
    const running = resolveLoopStatus([sdkLoop()])
    const { container, rerender } = render(
      <LoopStatusBanner status={running} onStopSdk={vi.fn()} />,
    )
    expect(container.querySelector('.loop-indicator')).not.toBeNull()
    rerender(<LoopStatusBanner status={{ kind: 'none' }} />)
    expect(container.querySelector('.loop-indicator')).toBeNull()
  })
})

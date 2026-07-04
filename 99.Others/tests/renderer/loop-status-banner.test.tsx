// @vitest-environment jsdom
/**
 * loop-status-banner.test.tsx — LR2-03 통합 루프 인디케이터
 * (LR3-03 단순화, LR3-06 goal 편입, FB2 P08 카드형 3단 위계).
 *
 * 배경(03-loop-gui.md): 두 인디케이터(LoopRunningIndicator←SDK 크론 activeLoops /
 * LoopIndicator←앱 타이머 activeLoop)가 별도 컴포넌트·별도 위치(우상단 pill vs 컴포저 위
 * 배너)로 갈려 있던 것을 LR2-03이 LoopStatusBanner 하나로 통합했다. LR3-03(앱 타이머
 * /loop 폐기 — 영호 확정 "토큰 맥싱")에서 app 변형 소스(activeLoop)가 통째로 사라져
 * resolveLoopStatus/LoopStatusBanner 모두 sdk 변형만 남았다. LR3-06은 세 번째 소스
 * goal(`/goal` 자기지속)을 편입 — 단일 표시 불변식(sdk > goal > none)을
 * resolveLoopStatus 한 곳에서 계약으로 고정한다(06-loop-gui-polish.md).
 *
 * FB2 P08(영호 피드백): "상태 → 작업 주제 → 현재 작업내용" 3단 위계 카드로 재구성.
 * goal의 주제는 pendingCommand.detail(목표 텍스트)로, 현재 작업내용은 currentActivity
 * prop(부모의 thinkingText)으로 각각 흘러든다 — 아래 테스트가 이 두 소스 매핑을 고정한다.
 *
 * 셀렉터 계약(회귀 방지): 루트 `.loop-indicator` · sdk 변형 `.loop-sdk` ·
 * sdk 정지 `.loop-sdk-stop`은 e2e가 의존 — 유지. goal 변형은 `.loop-goal` 신규(LR3-06).
 * FB2 P08 신규: 1행 `.loop-head` · 2행 `.loop-topic`(작업 주제) · 3행 `.loop-current`
 * (현재 작업내용, 있을 때만 렌더).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import {
  resolveLoopStatus,
} from '../../../02.Source/renderer/src/lib/loopStatus'
import { LoopStatusBanner } from '../../../02.Source/renderer/src/components/07_notice/LoopStatusBanner'
import { CMD_CARDS } from '../../../02.Source/renderer/src/lib/cmdCards'
import type { LoopInfo } from '../../../02.Source/shared/agent-events'

afterEach(() => cleanup())

function sdkLoop(p: Partial<LoopInfo> = {}): LoopInfo {
  return { id: 'cc247', summary: '매분 상태 점검', interval: 'Every minute', ...p }
}

// ══════════════════════════════════════════════════════════════════════════════
// resolveLoopStatus — 상태 결정 순수 로직
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveLoopStatus — 단일 표시 결정 (LR3-06: sdk > goal > none)', () => {
  it('없음 → none', () => {
    expect(resolveLoopStatus([]).kind).toBe('none')
  })

  it('SDK 크론만 → sdk + loops 전달', () => {
    const st = resolveLoopStatus([sdkLoop(), sdkLoop({ id: 'dd1', summary: '두번째' })])
    expect(st.kind).toBe('sdk')
    expect(st.kind === 'sdk' && st.loops.length).toBe(2)
  })

  it('pendingCommand 없음(undefined) → 회귀: 기존 2-인자 호출부와 동일하게 none', () => {
    expect(resolveLoopStatus([]).kind).toBe('none')
  })

  it('goal pendingCommand만(activeLoops 빈 배열) → goal + turns 전달', () => {
    const st = resolveLoopStatus([], { name: 'goal', turns: 3 })
    expect(st.kind).toBe('goal')
    expect(st.kind === 'goal' && st.turns).toBe(3)
  })

  it('goal turns 미전달 → 0으로 취급', () => {
    const st = resolveLoopStatus([], { name: 'goal' })
    expect(st.kind === 'goal' && st.turns).toBe(0)
  })

  it('goal 외 커맨드(pendingCommand.name !== "goal") → none(compact 등은 배너 미표시)', () => {
    expect(resolveLoopStatus([], { name: 'compact', turns: 1 }).kind).toBe('none')
  })

  it('단일 표시 불변식: sdk + goal 동시 존재 → sdk 우선(goal은 뒤로)', () => {
    const st = resolveLoopStatus([sdkLoop()], { name: 'goal', turns: 5 })
    expect(st.kind).toBe('sdk')
  })

  it('pendingCommand=null → none(옵셔널 계약)', () => {
    expect(resolveLoopStatus([], null).kind).toBe('none')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// stopped 변형 — 정지 신뢰 피드백 (LR3-06 영호 육안 피드백 2026-07-03)
//
// 배경: 배너 정지 → abort의 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 정지 후
// 80s간 옛 runId 이벤트 증가 0)이나, 배너가 즉시 사라지기만 해 "내부 크론도 정리됐는지"
// 사용자가 신뢰할 수 없었다. 정지 직후 확인 배너(stopped)를 잠깐 노출해 피드백한다.
// ══════════════════════════════════════════════════════════════════════════════

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

  it('단일 표시 불변식: goal이 stopped보다 우선', () => {
    expect(resolveLoopStatus([], { name: 'goal', turns: 2 }, true).kind).toBe('goal')
  })
})

describe('LoopStatusBanner — stopped 변형 (정지 확인)', () => {
  it('stopped → .loop-stopped 렌더 + "루프 정지됨" 라벨 + 정리 확인 문구, 회전 아이콘 없음', () => {
    render(<LoopStatusBanner status={{ kind: 'stopped' }} />)
    const root = document.querySelector('.loop-indicator.loop-stopped')
    expect(root).not.toBeNull()
    expect(screen.getByText('루프 정지됨')).toBeTruthy()
    // 문구 계약: "정리" 금지(크론 기록은 트랜스크립트에 잔존 — resume 후 CronList가 보고,
    // 실행만 중지가 사실. lr3-p06-stop-cleanup resume probe 실측) — "실행이 멈췄"으로 고정.
    expect(screen.getByText(/반복 실행이 멈췄어요/)).toBeTruthy()
    expect(document.querySelector('.loop-stopped .spin')).toBeNull()
    expect(document.querySelector('.loop-stopped .loop-spinner')).toBeNull()
  })

  // 영호 육안 피드백(2026-07-03, 마크업 샷): IconRefresh(거의 완전한 원형)를 통째로
  // 회전시키니 형태 변화가 인지되지 않아 얼룩처럼 보임 → 앱 표준 border-arc 스피너
  // (.t-spin 관례: ToolCallCard·GitModal·AgentPanel 공통)로 정렬.
  it('sdk/goal 진행 변형 → 표준 border 스피너(.loop-spinner) 렌더(SVG 회전 아님)', () => {
    render(<LoopStatusBanner status={resolveLoopStatus([sdkLoop()])} />)
    expect(document.querySelector('.loop-sdk .loop-spinner')).not.toBeNull()
    cleanup()
    render(<LoopStatusBanner status={resolveLoopStatus([], { name: 'goal', turns: 1 })} />)
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

// ══════════════════════════════════════════════════════════════════════════════
// LoopStatusBanner — goal 변형 (LR3-06)
// ══════════════════════════════════════════════════════════════════════════════

describe('LoopStatusBanner — goal (`/goal` 자기지속)', () => {
  it('상태 라벨(CMD_CARDS.goal.running과 동일 문자열 — 단일 진실원) + "N턴" 뱃지 + 접근성 라벨 (.loop-indicator.loop-goal 셀렉터)', () => {
    const status = resolveLoopStatus([], { name: 'goal', turns: 2 })
    const { container } = render(<LoopStatusBanner status={status} />)
    const root = container.querySelector('.loop-indicator.loop-goal')
    expect(root).toBeTruthy()
    // FB2 P08: cmdresult 카드(CmdResultCard)와 동일 문구 소스 — 두 표시가 어긋나지 않는다.
    expect(container.textContent ?? '').toContain(CMD_CARDS.goal.running)
    expect(container.textContent ?? '').toContain('2턴')
    expect(screen.getByRole('status', { name: /목표 진행중 · 2턴/ })).toBeTruthy()
  })

  it('turns=0(맨몸 /goal 직후) → "0턴" 뱃지', () => {
    const status = resolveLoopStatus([], { name: 'goal', turns: 0 })
    const { container } = render(<LoopStatusBanner status={status} />)
    expect(container.textContent ?? '').toContain('0턴')
  })

  it('sdk 정지 버튼(.loop-sdk-stop)이 렌더되지 않음 — goal 변형은 정지 버튼 없음(컴포저 자체 중단 버튼이 대신)', () => {
    const status = resolveLoopStatus([], { name: 'goal', turns: 1 })
    const { container } = render(<LoopStatusBanner status={status} onStopSdk={vi.fn()} />)
    expect(container.querySelector('.loop-sdk-stop')).toBeNull()
    expect(container.querySelector('.loop-btn')).toBeNull()
  })

  it('회귀: goal 변형이어도 루트 .loop-indicator 셀렉터 계약은 그대로 유지', () => {
    const status = resolveLoopStatus([], { name: 'goal', turns: 1 })
    const { container } = render(<LoopStatusBanner status={status} />)
    expect(container.querySelector('.loop-indicator')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// FB2 P08 — 3단 정보위계(상태 → 작업 주제 → 현재 작업내용) 매핑
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveLoopStatus — goal detail(작업 주제) 전달', () => {
  it('pendingCommand.detail 있음 → LoopStatus.detail로 그대로 전달', () => {
    const st = resolveLoopStatus([], { name: 'goal', turns: 1, detail: '간단한 goal을 일단 내가 멈추라고 하기 전까지 진행해줘' })
    expect(st.kind).toBe('goal')
    expect(st.kind === 'goal' && st.detail).toBe('간단한 goal을 일단 내가 멈추라고 하기 전까지 진행해줘')
  })

  it('pendingCommand.detail 미전달(맨몸 /goal) → null', () => {
    const st = resolveLoopStatus([], { name: 'goal', turns: 1 })
    expect(st.kind === 'goal' && st.detail).toBeNull()
  })
})

describe('LoopStatusBanner — 2행 작업 주제(.loop-topic)', () => {
  it('goal: detail 있으면 2행에 목표 텍스트 렌더', () => {
    const status = resolveLoopStatus([], { name: 'goal', turns: 1, detail: '리팩토링 마무리하기' })
    const { container } = render(<LoopStatusBanner status={status} />)
    const topic = container.querySelector('.loop-topic')
    expect(topic).not.toBeNull()
    expect(topic?.textContent).toBe('리팩토링 마무리하기')
  })

  it('goal: detail 없으면 2행(.loop-topic) 자체를 렌더하지 않음(정보 없는데 지어내지 않음)', () => {
    const status = resolveLoopStatus([], { name: 'goal', turns: 1 })
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
    const status = resolveLoopStatus([], { name: 'goal', turns: 1, detail: '리팩토링' })
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
    const running = resolveLoopStatus([], { name: 'goal', turns: 3, detail: '문서 정리' })
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

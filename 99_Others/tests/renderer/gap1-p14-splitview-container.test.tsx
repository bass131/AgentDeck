// @vitest-environment jsdom
/**
 * gap1-p14-splitview-container.test.tsx — GAP1 P14 sub-C: Shell 우측 레이아웃 분기 컨테이너.
 *
 * 대상: SubAgentSplitView(신규) — 단일채팅모드 우측 도크. state.subagents(store 구독)를
 * splitView.ts 순수 정책(수정 금지 — 계약 정본 gap1-p14-splitview-policy.test.ts 40 PASS)에
 * 병합해 "AgentPanel ↔ 스플릿 그리드"를 분기하고, 완성된 SubAgentCell을 배선한다.
 * Date.now/setTimeout 등 비순수 계층은 이 컨테이너만 소유한다(정책 순수성 보존).
 *
 * CT1: 분기 무회귀 — subagents 표시분 0 → 기존 DOM 그대로(PaneSplitter + .pane.agent >
 *      .agent-panel), 그리드 없음 (components.test.tsx:312·e2e shell.e2e.ts 소비 계약 보존)
 * CT2: 전환 — running 1개 → .sag-grid + SubAgentCell(data-subagent-id), AgentPanel 미렌더
 * CT3: 배치 — computeColumns 출력 그대로(지그재그: 짝수 index=좌, 홀수 index=우, TG1 P08)
 * CT4: 대기열 — 7개 → 셀 6 + 초과 1개는 탭 스트립(표시 전용 — 클릭 승격 발명 금지, 버튼 0)
 * CT5: 토글 배선 — 셀 '창 비활성화' 클릭 → toggleCell → .sac-off / 재클릭 → 해제
 * CT6: 자동닫기 — done 전이 후 린저 유지 → CLOSE_LINGER_MS 경과 setTimeout 재평가 →
 *      셀 제거 + queue 선두 승격 (가짜 타이머 결정론)
 * CT7: 정적 하이라이트(TG1 P08) — 참조 갱신(스트림 활동) 감지 → noteActivity → 해당 셀
 *      래퍼에 `.sag-cell--active` 클래스 부여(크기 인라인 0 — flexGrow 계약 폐기)
 * CT8: AgentPanel 접근 수단 — 셀 존재 중 헤더 토글로 상태 패널 ↔ 분할 그리드 전환
 * TF1~3: tail-follow — SubAgentChatStream 새 조각 도착 시 하단 추종, 위로 스크롤 시 해제,
 *      바닥 복귀 시 재개(BackgroundTaskView·Conversation isScrolledUp 관례 — P14 항목 7 예외 허용 수정)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'
import { CLOSE_LINGER_MS } from '../../../02.Source/renderer/src/lib/splitView'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** 테스트용 SubAgentInfo 최소 생성자 — name은 '이름-{id}' (대기열 탭 라벨 단언용). */
function sub(
  id: string,
  status: SubAgentInfo['status'] = 'running',
  extra?: Partial<SubAgentInfo>
): SubAgentInfo {
  return { id, name: `이름-${id}`, role: 'r', status, tools: [], transcript: [], ...extra }
}

type StoreModule = typeof import('../../../02.Source/renderer/src/store/appStore')

async function setup(subagents: SubAgentInfo[]): Promise<{
  useAppStore: StoreModule['useAppStore']
  container: HTMLElement
  setSubagents: (next: SubAgentInfo[]) => void
}> {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    isRunning: false,
    errorMessage: undefined,
    thread: [],
    changedFiles: new Set<string>(),
    toolCards: [],
    subagents,
  } as Parameters<typeof useAppStore.setState>[0])
  const { SubAgentSplitView } = await import(
    '../../../02.Source/renderer/src/components/05_agent/SubAgentSplitView'
  )
  const { container } = await act(async () => render(<SubAgentSplitView />))
  const setSubagents = (next: SubAgentInfo[]): void => {
    act(() => {
      useAppStore.setState({ subagents: next } as Parameters<typeof useAppStore.setState>[0])
    })
  }
  return { useAppStore, container, setSubagents }
}

const cellSel = (id: string): string => `[data-subagent-id="${id}"]`

describe('CT1 — 분기 무회귀: 표시할 셀 0 → 기존 AgentPanel 그대로', () => {
  it('subagents=[] → PaneSplitter + .pane.agent > .agent-panel, 그리드 없음', async () => {
    const { container } = await setup([])
    expect(screen.getByRole('separator')).toBeTruthy()
    expect(container.querySelector('.pane.agent .agent-panel')).toBeTruthy()
    expect(container.querySelector('.sag-grid')).toBeNull()
    expect(container.querySelector('.sag-head')).toBeNull()
  })

  it('done만 있는 스냅샷(대화 로드 복원) → 셀 배정 없음 — AgentPanel 유지', async () => {
    const { container } = await setup([sub('a', 'done'), sub('b', 'done')])
    expect(container.querySelector('.agent-panel')).toBeTruthy()
    expect(container.querySelector('.sag-grid')).toBeNull()
  })
})

describe('CT2 — 전환: SubAgent 발생 → 우측이 스플릿 그리드로', () => {
  it('running 1개 → .sag-grid + SubAgentCell, AgentPanel 미렌더', async () => {
    const { container } = await setup([sub('a')])
    expect(container.querySelector('.sag-grid')).toBeTruthy()
    expect(container.querySelector(cellSel('a'))).toBeTruthy()
    expect(container.querySelector('.agent-panel')).toBeNull()
  })

  it('라이브 도착(빈 상태 → running 추가)에도 그리드로 전환된다', async () => {
    const { container, setSubagents } = await setup([])
    expect(container.querySelector('.sag-grid')).toBeNull()
    setSubagents([sub('a')])
    expect(container.querySelector('.sag-grid')).toBeTruthy()
    expect(container.querySelector(cellSel('a'))).toBeTruthy()
  })
})

describe('CT3 — 배치: computeColumns 출력 그대로 렌더(지그재그 — TG1 P08)', () => {
  it('4개 → 컬럼 2개, 각 2셀 — 좌[a,c]·우[b,d]', async () => {
    const { container } = await setup([sub('a'), sub('b'), sub('c'), sub('d')])
    const cols = container.querySelectorAll('.sag-col')
    expect(cols.length).toBe(2)
    const idsOf = (col: Element): (string | null)[] =>
      Array.from(col.querySelectorAll('[data-subagent-id]')).map((el) =>
        el.getAttribute('data-subagent-id')
      )
    expect(idsOf(cols[0])).toEqual(['a', 'c'])
    expect(idsOf(cols[1])).toEqual(['b', 'd'])
  })

  it('2개 → 컬럼 2개, 좌1·우1', async () => {
    const { container } = await setup([sub('a'), sub('b')])
    const cols = container.querySelectorAll('.sag-col')
    expect(cols.length).toBe(2)
    expect(cols[0].querySelector(cellSel('a'))).toBeTruthy()
    expect(cols[1].querySelector(cellSel('b'))).toBeTruthy()
  })

  it('1개 → 컬럼 1개(전폭 — 지그재그 미진입)', async () => {
    const { container } = await setup([sub('a')])
    expect(container.querySelectorAll('.sag-col').length).toBe(1)
  })
})

describe('CT4 — 대기열: 상한 6 초과분은 탭 스트립(표시 전용)', () => {
  it('7개 → 셀 6 + 대기열 탭에 displayName ?? name 표시, 클릭 승격 없음(버튼 0)', async () => {
    const { container } = await setup([
      sub('a'), sub('b'), sub('c'), sub('d'), sub('e'), sub('f'),
      sub('g', 'running', { displayName: '일곱째' }),
    ])
    expect(container.querySelectorAll('.sag-grid [data-subagent-id]').length).toBe(6)
    expect(container.querySelector(cellSel('g'))).toBeNull()
    const queue = container.querySelector('.sag-queue')
    expect(queue).toBeTruthy()
    expect(queue?.textContent).toContain('일곱째')
    // 수동 승격은 스펙 미정의 — 발명 금지(표시 전용, 상호작용 요소 없음).
    expect(queue?.querySelector('button')).toBeNull()
  })

  it('6개 이하 → 대기열 스트립 미렌더', async () => {
    const { container } = await setup([sub('a'), sub('b')])
    expect(container.querySelector('.sag-queue')).toBeNull()
  })
})

describe('CT5 — 창별 활성/비활성 토글 배선(toggleCell)', () => {
  it('셀 토글 클릭 → .sac-off 진입, 재클릭 → 해제', async () => {
    const { container } = await setup([sub('a')])
    expect(container.querySelector('.sac-off')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '창 비활성화' }))
    expect(container.querySelector(`${cellSel('a')}.sac-off`)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '창 활성화' }))
    expect(container.querySelector('.sac-off')).toBeNull()
  })
})

describe('CT6 — 완료 창 자동 닫기 → 재배치(가짜 타이머 결정론)', () => {
  it('done 전이 → 린저 동안 유지 → CLOSE_LINGER_MS 경과 재평가로 제거 + queue 승격', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const seven = [sub('a'), sub('b'), sub('c'), sub('d'), sub('e'), sub('f'), sub('g')]
    const { container, setSubagents } = await setup(seven)
    expect(container.querySelector(cellSel('a'))).toBeTruthy()
    expect(container.querySelector('.sag-queue')?.textContent).toContain('이름-g')

    // a가 done으로 전이 — 즉시 제거가 아니라 잠시(린저) 표시 유지.
    setSubagents([sub('a', 'done'), ...seven.slice(1)])
    expect(container.querySelector(cellSel('a'))).toBeTruthy()

    // 린저 경과 → 컨테이너 setTimeout이 applySubagents 재평가 → a 제거 + g 승격.
    await act(async () => {
      vi.advanceTimersByTime(CLOSE_LINGER_MS + 100)
    })
    expect(container.querySelector(cellSel('a'))).toBeNull()
    expect(container.querySelector(`.sag-grid ${cellSel('g')}`)).toBeTruthy()
    expect(container.querySelector('.sag-queue')).toBeNull()
  })

  it('마지막 셀이 린저 만료로 사라지면 AgentPanel로 복귀(분기 원복)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { container, setSubagents } = await setup([sub('a')])
    expect(container.querySelector('.sag-grid')).toBeTruthy()

    setSubagents([sub('a', 'done')])
    await act(async () => {
      vi.advanceTimersByTime(CLOSE_LINGER_MS + 100)
    })
    expect(container.querySelector('.sag-grid')).toBeNull()
    expect(container.querySelector('.agent-panel')).toBeTruthy()
  })
})

describe('CT7 — 정적 하이라이트: 스트림 활동 감지 → noteActivity → active 클래스(크기 불변, TG1 P08)', () => {
  it('참조 갱신된 running 셀 래퍼에 .sag-cell--active, 다른 셀엔 없음(flexGrow 인라인 0)', async () => {
    // reducer 규율 재현: 갱신된 항목만 새 객체(map) — b는 참조 보존이 실동작.
    const b = sub('b')
    const { container, setSubagents } = await setup([sub('a'), b])

    // a의 transcript 갱신(참조 변경 = 활동 신호), b는 참조 불변(활동 없음).
    setSubagents([
      sub('a', 'running', { transcript: [{ kind: 'text', text: '진행' }] }),
      b,
    ])

    const wrapA = container.querySelector(cellSel('a'))?.closest('.sag-cell') as HTMLElement
    const wrapB = container.querySelector(cellSel('b'))?.closest('.sag-cell') as HTMLElement
    expect(wrapA.classList.contains('sag-cell--active')).toBe(true)
    expect(wrapB.classList.contains('sag-cell--active')).toBe(false)
    // 크기 인라인 0 — 균등은 CSS가 담당, JS는 클래스만 부여(옛 flexGrow 계약 폐기).
    expect(wrapA.style.flexGrow).toBe('')
    expect(wrapB.style.flexGrow).toBe('')
  })

  it('disabled 셀은 활동이 갱신돼도 active 클래스 없음(표시 정지 강조는 거짓 신호)', async () => {
    const { container, setSubagents } = await setup([sub('a')])
    fireEvent.click(screen.getByRole('button', { name: '창 비활성화' }))
    setSubagents([sub('a', 'running', { transcript: [{ kind: 'text', text: '진행' }] })])
    const wrapA = container.querySelector(cellSel('a'))?.closest('.sag-cell') as HTMLElement
    expect(wrapA.classList.contains('sag-cell--active')).toBe(false)
  })
})

describe('CT8 — AgentPanel 접근 수단: 헤더 보기 전환 토글', () => {
  it('셀 존재 중 "상태 패널 보기" → AgentPanel, "분할 그리드 보기" → 그리드 복귀', async () => {
    const { container } = await setup([sub('a')])
    expect(container.querySelector('.sag-grid')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '상태 패널 보기' }))
    expect(container.querySelector('.agent-panel')).toBeTruthy()
    expect(container.querySelector('.sag-grid')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '분할 그리드 보기' }))
    expect(container.querySelector('.sag-grid')).toBeTruthy()
    expect(container.querySelector('.agent-panel')).toBeNull()
  })
})

// ── tail-follow (P14 항목 7 — SubAgentChatStream 최소 수정 예외 허용분) ─────────

describe('TF — 셀 스트림 tail-follow 자동 스크롤', () => {
  const v = (texts: string[], status: SubAgentInfo['status'] = 'running'): SubAgentInfo =>
    sub('tf', status, { transcript: texts.map((t, i) => ({ kind: 'text', text: t, id: `t${i}` })) })

  /** jsdom은 레이아웃이 없어 scrollHeight=0 — 스크롤 기하를 주입해 계약만 검증. */
  function primeScrollGeometry(el: HTMLElement): void {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 })
  }

  it('TF1: 새 조각 도착 → 스크롤 컨테이너가 하단 추종(scrollTop=scrollHeight)', async () => {
    const { SubAgentChatStream } = await import(
      '../../../02.Source/renderer/src/components/05_agent/SubAgentChatStream'
    )
    const { container, rerender } = render(<SubAgentChatStream agent={v(['하나'])} />)
    const thread = container.querySelector('.ma-p-thread') as HTMLElement
    primeScrollGeometry(thread)

    rerender(<SubAgentChatStream agent={v(['하나', '둘'])} />)
    expect(thread.scrollTop).toBe(1000)
  })

  it('TF2: 사용자가 위로 스크롤 → 추종 해제(새 조각에도 위치 유지)', async () => {
    const { SubAgentChatStream } = await import(
      '../../../02.Source/renderer/src/components/05_agent/SubAgentChatStream'
    )
    const { container, rerender } = render(<SubAgentChatStream agent={v(['하나'])} />)
    const thread = container.querySelector('.ma-p-thread') as HTMLElement
    primeScrollGeometry(thread)

    // 바닥에서 40px 이상 위(threshold 관례 — isScrolledUp)로 스크롤.
    thread.scrollTop = 0
    fireEvent.scroll(thread)

    rerender(<SubAgentChatStream agent={v(['하나', '둘'])} />)
    expect(thread.scrollTop).toBe(0)
  })

  it('TF3: 바닥 근처로 복귀 → 추종 재개', async () => {
    const { SubAgentChatStream } = await import(
      '../../../02.Source/renderer/src/components/05_agent/SubAgentChatStream'
    )
    const { container, rerender } = render(<SubAgentChatStream agent={v(['하나'])} />)
    const thread = container.querySelector('.ma-p-thread') as HTMLElement
    primeScrollGeometry(thread)

    thread.scrollTop = 0
    fireEvent.scroll(thread) // 해제
    thread.scrollTop = 980 // 1000-980-100 = -80 < 40 → 바닥 근처
    fireEvent.scroll(thread) // 재개

    rerender(<SubAgentChatStream agent={v(['하나', '둘'])} />)
    expect(thread.scrollTop).toBe(1000)
  })
})

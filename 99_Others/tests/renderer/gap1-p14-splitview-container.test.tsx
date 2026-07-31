// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02_Source/renderer/src/lib/agentSampleData'
import { CLOSE_LINGER_MS } from '../../../02_Source/renderer/src/lib/splitView'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function sub(
  id: string,
  status: SubAgentInfo['status'] = 'running',
  extra?: Partial<SubAgentInfo>
): SubAgentInfo {
  return { id, name: `이름-${id}`, role: 'r', status, tools: [], transcript: [], ...extra }
}

type StoreModule = typeof import('../../../02_Source/renderer/src/store/appStore')

async function setup(subagents: SubAgentInfo[]): Promise<{
  useAppStore: StoreModule['useAppStore']
  container: HTMLElement
  setSubagents: (next: SubAgentInfo[]) => void
}> {
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  useAppStore.setState({
    isRunning: false,
    errorMessage: undefined,
    thread: [],
    changedFiles: new Set<string>(),
    toolCards: [],
    subagents,
  } as Parameters<typeof useAppStore.setState>[0])
  const { SubAgentSplitView } = await import(
    '../../../02_Source/renderer/src/components/05_agent/SubAgentSplitView'
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

    setSubagents([sub('a', 'done'), ...seven.slice(1)])
    expect(container.querySelector(cellSel('a'))).toBeTruthy()

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
    const b = sub('b')
    const { container, setSubagents } = await setup([sub('a'), b])

    setSubagents([
      sub('a', 'running', { transcript: [{ kind: 'text', text: '진행' }] }),
      b,
    ])

    const wrapA = container.querySelector(cellSel('a'))?.closest('.sag-cell') as HTMLElement
    const wrapB = container.querySelector(cellSel('b'))?.closest('.sag-cell') as HTMLElement
    expect(wrapA.classList.contains('sag-cell--active')).toBe(true)
    expect(wrapB.classList.contains('sag-cell--active')).toBe(false)
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

describe('TF — 셀 스트림 tail-follow 자동 스크롤', () => {
  const v = (texts: string[], status: SubAgentInfo['status'] = 'running'): SubAgentInfo =>
    sub('tf', status, { transcript: texts.map((t, i) => ({ kind: 'text', text: t, id: `t${i}` })) })

  function primeScrollGeometry(el: HTMLElement): void {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 })
  }

  it('TF1: 새 조각 도착 → 스크롤 컨테이너가 하단 추종(scrollTop=scrollHeight)', async () => {
    const { SubAgentChatStream } = await import(
      '../../../02_Source/renderer/src/components/05_agent/SubAgentChatStream'
    )
    const { container, rerender } = render(<SubAgentChatStream agent={v(['하나'])} />)
    const thread = container.querySelector('.ma-p-thread') as HTMLElement
    primeScrollGeometry(thread)

    rerender(<SubAgentChatStream agent={v(['하나', '둘'])} />)
    expect(thread.scrollTop).toBe(1000)
  })

  it('TF2: 사용자가 위로 스크롤 → 추종 해제(새 조각에도 위치 유지)', async () => {
    const { SubAgentChatStream } = await import(
      '../../../02_Source/renderer/src/components/05_agent/SubAgentChatStream'
    )
    const { container, rerender } = render(<SubAgentChatStream agent={v(['하나'])} />)
    const thread = container.querySelector('.ma-p-thread') as HTMLElement
    primeScrollGeometry(thread)

    thread.scrollTop = 0
    fireEvent.scroll(thread)

    rerender(<SubAgentChatStream agent={v(['하나', '둘'])} />)
    expect(thread.scrollTop).toBe(0)
  })

  it('TF3: 바닥 근처로 복귀 → 추종 재개', async () => {
    const { SubAgentChatStream } = await import(
      '../../../02_Source/renderer/src/components/05_agent/SubAgentChatStream'
    )
    const { container, rerender } = render(<SubAgentChatStream agent={v(['하나'])} />)
    const thread = container.querySelector('.ma-p-thread') as HTMLElement
    primeScrollGeometry(thread)

    thread.scrollTop = 0
    fireEvent.scroll(thread)
    thread.scrollTop = 980
    fireEvent.scroll(thread)

    rerender(<SubAgentChatStream agent={v(['하나', '둘'])} />)
    expect(thread.scrollTop).toBe(1000)
  })
})

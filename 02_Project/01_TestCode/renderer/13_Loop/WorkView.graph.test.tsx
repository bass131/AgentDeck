// @vitest-environment jsdom
// M10 G5 — 그래프 탭 캔버스와 「노드 설정」 탭. 노드마다 카드 하나, 다음 선과 점선, 지금 노드 강조와 끝난 노드 흐림,
// 같은 상태면 같은 표시. 노드를 고르면 「노드 설정」이 입력칸 없이 그 노드의 설정을 보이고, 세션이 있으면 세션 탭을 연다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { LoopGraph, LoopGraphNode, LoopStatus, MainChatView } from '../../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi, type InstalledWindowApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const node = (id: string, title: string, scope: LoopGraphNode['scope'], x: number, y: number, over: Partial<LoopGraphNode> = {}): LoopGraphNode => ({
  id, title, kind: 'work', scope, role: 'worker', rule: null, commands: [], next: null, onFail: null, when: null, position: { x, y }, ...over,
})
const GRAPH: LoopGraph = {
  templateId: 'program-dev', title: '프로그램 개발', failLimit: 3,
  nodes: [
    node('brainstorm', '브레인스토밍', 'milestone', 40, 40, { role: 'main', next: 'goal-branch' }),
    node('goal-branch', 'goal 브랜치 가르기', 'goal', 40, 202, { kind: 'action', role: null, next: 'implement' }),
    node('implement', '구현', 'goal', 200, 202, { next: 'checks' }),
    node('checks', '검사', 'goal', 360, 202, {
      kind: 'rule', role: null, rule: 'commands', commands: ['npm run build', 'npm test'], next: 'regression', onFail: { goto: 'implement', limit: 3 },
    }),
    node('regression', '마일스톤 회귀', 'milestone', 40, 364, { kind: 'rule', role: null, rule: 'commands', commands: ['npm test'] }),
  ],
  edges: [
    { from: 'brainstorm', to: 'goal-branch', kind: 'next' }, { from: 'goal-branch', to: 'implement', kind: 'next' },
    { from: 'implement', to: 'checks', kind: 'next' }, { from: 'checks', to: 'regression', kind: 'next' },
    { from: 'checks', to: 'implement', kind: 'fail' }, { from: 'checks', to: 'goal-branch', kind: 'repeat' },
  ],
  goalLoop: { id: 'goals', title: 'goal마다', nodes: ['goal-branch', 'implement', 'checks'] },
}
const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'running', milestoneId: 'M02', node: 'G2/checks', nodeTitle: '검사', reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 1, approval: null, milestonePr: null, cards: [],
  goals: [{ id: 'G1', title: 'a', status: 'done', grade: 'weak', pr: 3 }, { id: 'G2', title: 'b', status: 'active', grade: null, pr: null }],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false, mainNode: false,
  recentLines: [
    { marker: 'PASS', at: '2026-11-20T05:12:00.000Z', node: 'checks', goal: 'G1', sentence: '검사 통과' },
    { marker: 'FAIL', at: '2026-11-20T05:40:00.000Z', node: 'checks', goal: 'G2', sentence: 'npm test 실패' },
  ],
  sessions: [{ key: 'w.1', kind: 'work', node: 'implement', goal: 'G2', live: false }],
  ...over,
})
const mv: MainChatView = { cwd: CWD, root: CWD, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0 }

let installed: InstalledWindowApi<Record<string, unknown>>
let stateHandlers: Set<(s: LoopStatus) => void>
let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  stateHandlers = new Set()
  api = {
    loopStatus: vi.fn().mockResolvedValue(st()),
    onLoopState: vi.fn((cb: (s: LoopStatus) => void) => { stateHandlers.add(cb); return () => stateHandlers.delete(cb) }),
    loopGraph: vi.fn().mockResolvedValue({ ok: true, graph: GRAPH }),
    loopMainRead: vi.fn().mockResolvedValue(mv),
    onLoopMainState: vi.fn(() => () => {}),
    loopSessionLog: vi.fn().mockResolvedValue({ cwd: CWD, sessions: [] }),
    loopMainArchives: vi.fn().mockResolvedValue({ cwd: CWD, archives: [] }),
    onLoopSessionEvent: vi.fn(() => () => {}),
  }
  installed = installWindowApi(api)
  const git = installed.api.git as unknown as Record<string, ReturnType<typeof vi.fn>>
  git.status.mockResolvedValue({ root: CWD, branch: 'goal/M02-G2', ahead: 0, behind: 0, changes: [], branches: [], remotes: [], tags: [] })
  git.prRead.mockResolvedValue({ ok: false, error: 'x' })
})
afterEach(() => { cleanup(); installed.uninstall() })

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const click = async (el: Element): Promise<void> => { await act(async () => { fireEvent.click(el) }); await flush() }
const tabs = (label: string): HTMLElement => screen.getByRole('tablist', { name: label })
const tabNames = (label: string): string[] => within(tabs(label)).getAllByRole('tab').map((t) => t.getAttribute('aria-label') ?? '')
const push = async (s: LoopStatus): Promise<void> => { await act(async () => { for (const h of [...stateHandlers]) h(s) }); await flush() }

async function renderGraph() {
  const { WorkView, useWorkStore } = await import('@renderer/13_Loop')
  useWorkStore.setState({ hydrated: true, cwd: CWD, projects: [CWD], center: 'graph', extraTabs: [], right: 'board', archives: [], selectedNode: null })
  const r = render(<WorkView />)
  await flush()
  const canvas = r.container.querySelector('.graph-canvas') as HTMLElement
  return { r, canvas, useWorkStore }
}
const card = (canvas: HTMLElement, id: string): HTMLElement => canvas.querySelector(`[data-node="${id}"]`) as HTMLElement

describe('그래프 탭 캔버스 (M10 G5)', () => {
  it('그 작업 폴더의 그래프를 읽어 노드마다 카드 하나, 다음 선, 되돌아가는 점선, 목표 반복 묶음을 그린다', async () => {
    const { canvas } = await renderGraph()
    expect(api.loopGraph).toHaveBeenCalledWith({ cwd: CWD })
    expect([...canvas.querySelectorAll('[data-node]')].map((e) => e.getAttribute('data-node'))).toEqual(GRAPH.nodes.map((n) => n.id))
    expect(canvas.querySelectorAll('path[data-edge="next"]')).toHaveLength(4)
    expect(canvas.querySelectorAll('path[data-edge="fail"]')).toHaveLength(1)
    expect(canvas.querySelectorAll('path[data-edge="repeat"]')).toHaveLength(1)
    expect(within(canvas).getByText('목표 반복 — G1 ✓ · 지금 G2')).toBeTruthy()
    expect(within(canvas).getByText('실패 → 다시 (최대 3)')).toBeTruthy()
    expect(within(canvas).getByText(/보기 전용/)).toBeTruthy()
    // 범례는 노드 종류 다섯 가지를 카드와 같은 색 표식으로 보인다
    const key = within(canvas).getByLabelText('범례')
    expect([...key.querySelectorAll('i[data-kind]')].map((i) => i.getAttribute('data-kind'))).toEqual(['work', 'action', 'rule', 'model', 'human'])
  })

  it('지금 노드는 강조, 앞 노드는 흐리게, 지금 노드 카드에 실패 수가 있다 — 같은 상태를 다시 넣으면 같은 표시다', async () => {
    const { canvas } = await renderGraph()
    expect(card(canvas, 'checks').getAttribute('data-now')).toBe('true')
    expect(['brainstorm', 'goal-branch', 'implement'].map((id) => card(canvas, id).getAttribute('data-done'))).toEqual(['true', 'true', 'true'])
    expect(card(canvas, 'regression').getAttribute('data-done')).toBe('false')
    expect(within(card(canvas, 'checks')).getByText(/실패 1/)).toBeTruthy()
    const before = canvas.innerHTML
    await push(st())
    expect(canvas.innerHTML).toBe(before)
    await push(st({ node: 'regression', nodeTitle: '마일스톤 회귀', failCount: 0, goals: st().goals.map((g) => ({ ...g, status: 'done' as const })) }))
    expect(card(canvas, 'regression').getAttribute('data-now')).toBe('true')
    expect(card(canvas, 'checks').getAttribute('data-done')).toBe('true')
  })

  it('확대·축소·맞춤 단추가 배율을 바꾼다', async () => {
    const { canvas } = await renderGraph()
    const zoom = within(canvas).getByRole('status', { name: '배율' })
    expect(zoom.textContent).toBe('100%')
    await click(within(canvas).getByRole('button', { name: '확대' }))
    expect(zoom.textContent).toBe('110%')
    await click(within(canvas).getByRole('button', { name: '축소' }))
    await click(within(canvas).getByRole('button', { name: '축소' }))
    expect(zoom.textContent).toBe('90%')
    await click(within(canvas).getByRole('button', { name: '맞춤' }))
    expect(zoom.textContent).toBe('100%')
  })

  it('그래프를 읽지 못하면 사유를 보인다', async () => {
    api.loopGraph.mockResolvedValue({ ok: false, reason: '번들 템플릿이 스키마에 맞지 않는다' })
    const { r } = await renderGraph()
    expect(within(r.container.querySelector('[data-tab-panel="graph"]') as HTMLElement).getByText(/번들 템플릿이 스키마에 맞지 않는다/)).toBeTruthy()
  })
})

describe('「노드 설정」 탭 (M10 G5)', () => {
  it('그래프 탭이 열려 있을 때만 오른쪽 첫 탭이다. 가운데를 바꾸면 사라지고 현황판으로 돌아간다', async () => {
    const { canvas, useWorkStore } = await renderGraph()
    expect(tabNames('오른쪽 탭')).toEqual(['노드 설정', '현황판', '파일·변경'])
    await click(card(canvas, 'checks'))
    expect(useWorkStore.getState().right).toBe('node')
    await click(within(tabs('가운데 탭')).getByRole('tab', { name: '메인 대화' }))
    expect(tabNames('오른쪽 탭')).toEqual(['현황판', '파일·변경'])
    expect(within(tabs('오른쪽 탭')).getByRole('tab', { name: '현황판' }).getAttribute('aria-selected')).toBe('true')
  })

  it('노드를 누르면 세션 탭이 아니라 「노드 설정」이 열리고, 그 노드의 설정과 최근 검증 기록이 입력칸 없이 보인다', async () => {
    const { canvas } = await renderGraph()
    await click(card(canvas, 'checks'))
    expect(card(canvas, 'checks').getAttribute('data-selected')).toBe('true')
    expect(tabNames('가운데 탭')).toEqual(['그래프', '메인 대화'])
    expect(within(tabs('오른쪽 탭')).getByRole('tab', { name: '노드 설정' }).getAttribute('aria-selected')).toBe('true')
    const panel = screen.getByRole('region', { name: '노드 설정' })
    expect(within(panel).getByText('규칙 게이트')).toBeTruthy()
    expect(within(panel).getByText('npm run build')).toBeTruthy()
    expect(within(panel).getByText('npm test')).toBeTruthy()
    expect(within(panel).getByText('마일스톤 회귀')).toBeTruthy()
    expect(within(panel).getByText(/구현.*되돌림.*최대 3번/)).toBeTruthy()
    expect(within(panel).getByText(/보기 전용 — 편집은 그래프 편집\(뒤 마일스톤\)/)).toBeTruthy()
    const lines = within(panel).getByRole('list', { name: '이 노드의 최근 검증 기록' })
    expect(within(lines).getAllByRole('listitem').map((li) => li.getAttribute('data-marker'))).toEqual(['PASS', 'FAIL'])
    expect(within(lines).getByText('실패')).toBeTruthy()
    expect(within(lines).getByText('통과')).toBeTruthy()
    expect(panel.querySelectorAll('input, textarea, select, [contenteditable="true"]')).toHaveLength(0)
    expect(within(panel).queryByRole('button', { name: '세션 열기' })).toBeNull()
  })

  it('그 노드의 세션이 있으면 「세션 열기」로 가운데에 세션 탭을 연다', async () => {
    const { canvas } = await renderGraph()
    await click(card(canvas, 'implement'))
    const panel = screen.getByRole('region', { name: '노드 설정' })
    await click(within(panel).getByRole('button', { name: '세션 열기' }))
    expect(tabNames('가운데 탭')).toEqual(['그래프', '메인 대화', 'G2 implement · 작업'])
    expect(within(tabs('가운데 탭')).getByRole('tab', { name: 'G2 implement · 작업' }).getAttribute('aria-selected')).toBe('true')
  })

  it('메인 노드(브레인스토밍)는 「메인 대화 열기」로 메인 대화 탭을 연다', async () => {
    const { canvas } = await renderGraph()
    await click(card(canvas, 'brainstorm'))
    await click(within(screen.getByRole('region', { name: '노드 설정' })).getByRole('button', { name: '메인 대화 열기' }))
    expect(within(tabs('가운데 탭')).getByRole('tab', { name: '메인 대화' }).getAttribute('aria-selected')).toBe('true')
  })

  it('아직 노드를 고르지 않았으면 고르는 법을 알린다', async () => {
    const { useWorkStore } = await renderGraph()
    await act(async () => { useWorkStore.getState().setRight('node') })
    expect(within(screen.getByRole('region', { name: '노드 설정' })).getByText(/노드를 누르면/)).toBeTruthy()
  })
})

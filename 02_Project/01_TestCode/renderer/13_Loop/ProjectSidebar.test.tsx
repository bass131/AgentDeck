// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { LoopStatus, MainChatView } from '@shared/ipcContract'
import { installWindowApi, type InstalledWindowApi } from '../00_Helpers/windowApiMock'

const A = 'C:\\work\\practice'
const B = 'C:\\Dev\\AgentDeck'
const C = 'C:\\work\\third'
const st = (cwd: string, over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd, root: cwd, phase: 'running', milestoneId: 'M02', node: 'G2/implement', nodeTitle: '구현', reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], ...over,
})
const STATUS: Record<string, LoopStatus> = {
  [A]: st(A),
  [B]: st(B, { milestoneId: 'M10', node: 'brainstorm', mainNode: true }),
  [C]: st(C, { phase: 'closed', root: null, milestoneId: null, node: null }),
}

let installed: InstalledWindowApi<Record<string, unknown>>
let stateHandlers: Set<(s: LoopStatus) => void>
let mainHandlers: Set<(v: MainChatView) => void>
let api: Record<string, ReturnType<typeof vi.fn>>
let git: Record<string, ReturnType<typeof vi.fn>>
const view = (over: Partial<MainChatView> = {}): MainChatView => ({
  cwd: A, root: A, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0, ...over,
})

beforeEach(async () => {
  stateHandlers = new Set()
  mainHandlers = new Set()
  api = {
    loopStatus: vi.fn(async ({ cwd }: { cwd: string }) => STATUS[cwd]),
    onLoopState: vi.fn((cb: (s: LoopStatus) => void) => { stateHandlers.add(cb); return () => stateHandlers.delete(cb) }),
    onLoopMainState: vi.fn((cb: (v: MainChatView) => void) => { mainHandlers.add(cb); return () => mainHandlers.delete(cb) }),
    loopMainArchives: vi.fn().mockResolvedValue({
      cwd: A, archives: [{ id: 'k-2026-11-18T05-00-00-000Z', at: '2026-11-18T05:00:00.000Z', items: [{ id: 'i1', at: '2026-11-18T05:00:00.000Z', kind: 'assistant', text: 'M01 방향을 정하자', turn: 'start' }] }],
    }),
    pickFolder: vi.fn().mockResolvedValue({ path: C }),
    setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  }
  installed = installWindowApi(api)
  git = installed.api.git as unknown as Record<string, ReturnType<typeof vi.fn>>
  git.status.mockResolvedValue({ root: A, branch: 'goal/M02-G2', ahead: 0, behind: 0, changes: [], branches: [], remotes: [], tags: [] })
  const { useWorkStore } = await import('@renderer/13_Loop')
  useWorkStore.setState({ hydrated: true, cwd: A, projects: [A, B], center: 'main', extraTabs: [], right: 'board', archives: [] })
})
afterEach(async () => {
  cleanup()
  installed.uninstall()
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.setState({ workspaceMode: 'single', pendingQuestion: null, pendingPermission: null } as never)
})

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const click = async (el: HTMLElement): Promise<void> => { await act(async () => { fireEvent.click(el) }); await flush() }
const list = (): HTMLElement => screen.getByRole('list', { name: '프로젝트' })
const rows = (): HTMLElement[] => within(list()).getAllByRole('listitem').filter((li) => li.classList.contains('sb-proj'))

async function renderSide() {
  const { ProjectSidebar } = await import('@renderer/13_Loop')
  const r = render(<ProjectSidebar />)
  await flush()
  return r
}

describe('프로젝트 목록과 진행 꼬리표 (M10 G4)', () => {
  it('저장된 작업 폴더를 폴더 이름으로 보이고, 꼬리표는 그 저장소의 상태와 같다 — push가 오면 바뀐다', async () => {
    await renderSide()
    expect(rows().map((r) => r.querySelector('.sb-proj-name')?.textContent)).toEqual(['practice', 'AgentDeck'])
    expect(rows().map((r) => r.querySelector('.sb-proj-tag')?.textContent)).toEqual(['M02 · 진행 중', 'M10 · 브레인스토밍'])
    expect(api.loopStatus).toHaveBeenCalledWith({ cwd: A })
    expect(api.loopStatus).toHaveBeenCalledWith({ cwd: B })
    await act(async () => { for (const h of [...stateHandlers]) h(st('c:/work/practice/', { phase: 'halted' })) })
    expect(rows()[0].querySelector('.sb-proj-tag')?.textContent).toBe('M02 · 멈춤')
    expect(rows()[0].querySelector('.sb-proj-tag')?.getAttribute('data-tone')).toBe('stop')
    // 꼬리표 옆 점은 main이 정한 알림 목록에서만 온다(상태의 멈춤만으로는 붙지 않는다 — alerts.test)
    expect(rows().map((r) => r.querySelector('.sb-proj-alert'))).toEqual([null, null])
  })

  it('「프로젝트 열기」는 폴더 고르기로 더하고 목록과 고른 폴더를 설정에 남긴다', async () => {
    await renderSide()
    await click(screen.getByRole('button', { name: '프로젝트 열기' }))
    expect(api.pickFolder).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(3)
    expect(api.setUiPref).toHaveBeenCalledWith({ key: 'work.projects', value: [A, B, C] })
    expect(api.setUiPref).toHaveBeenCalledWith({ key: 'work.cwd', value: C })
    const { useWorkStore } = await import('@renderer/13_Loop')
    expect(useWorkStore.getState().cwd).toBe(C)
    // 닫힌 저장소는 꼬리표가 없다
    expect(rows()[2].querySelector('.sb-proj-tag')).toBeNull()
  })

  it('다른 프로젝트를 누르면 그 폴더가 작업 폴더가 되고 설정에 남는다', async () => {
    await renderSide()
    await click(within(rows()[1]).getByRole('button', { name: /AgentDeck/ }))
    const { useWorkStore } = await import('@renderer/13_Loop')
    expect(useWorkStore.getState().cwd).toBe(B)
    expect(api.setUiPref).toHaveBeenCalledWith({ key: 'work.cwd', value: B })
    expect(rows()[1].getAttribute('data-active')).toBe('true')
  })

  it('고른 프로젝트 아래에 작업 폴더(브랜치), 메인 대화, 지난 메인 대화가 있고, 지난 대화는 가운데 탭으로 연다', async () => {
    await renderSide()
    const active = rows()[0]
    expect(git.status).toHaveBeenCalledWith({ root: A })
    expect(within(active).getByText('기본 폴더 · goal/M02-G2')).toBeTruthy()
    expect(api.loopMainArchives).toHaveBeenCalledWith({ cwd: A })
    const { useWorkStore } = await import('@renderer/13_Loop')
    useWorkStore.setState({ center: 'graph' })
    await click(within(active).getByRole('button', { name: '메인 대화' }))
    expect(useWorkStore.getState().center).toBe('main')
    await click(within(active).getByRole('button', { name: /지난 메인 대화/ }))
    expect(useWorkStore.getState().center).toBe('archive:k-2026-11-18T05-00-00-000Z')
    expect(useWorkStore.getState().extraTabs).toEqual(['archive:k-2026-11-18T05-00-00-000Z'])
    expect(within(rows()[1]).queryByRole('button', { name: '메인 대화' })).toBeNull()
  })

  // 세션 id로는 새 장을 알 수 없다(새 장은 null로 시작하고, 마운트 뒤 첫 push는 비교할 앞 값이 없다)
  it('메인 대화의 장 표지가 바뀌면 지난 메인 대화 목록을 다시 읽는다 — 마운트 뒤 첫 push도, 세션 id가 null에서 null이어도', async () => {
    await renderSide()
    expect(api.loopMainArchives).toHaveBeenCalledTimes(1)
    const archive = (id: string, at: string) => ({ id, at, items: [] })
    api.loopMainArchives.mockResolvedValue({ cwd: A, archives: [archive('k2', '2026-11-19T05:00:00.000Z'), archive('k1', '2026-11-18T05:00:00.000Z')] })
    const pushView = async (v: MainChatView): Promise<void> => { await act(async () => { for (const h of [...mainHandlers]) h(v) }); await flush() }
    await pushView(view({ chapter: 'c2', sessionId: null }))
    expect(api.loopMainArchives).toHaveBeenCalledTimes(2)
    expect(within(rows()[0]).getAllByRole('button', { name: /지난 메인 대화/ })).toHaveLength(2)
    await pushView(view({ chapter: 'c2', sessionId: 'S2' }))
    await pushView(view({ chapter: 'c9', cwd: B }))
    expect(api.loopMainArchives).toHaveBeenCalledTimes(2)
    await pushView(view({ chapter: 'c3', sessionId: null }))
    expect(api.loopMainArchives).toHaveBeenCalledTimes(3)
  })

  // 브랜치는 goal이 바뀌면 바뀐다. 폴더를 고를 때 한 번만 읽지 않는다
  it('고른 프로젝트의 노드·단계가 바뀌면 브랜치를 다시 읽는다', async () => {
    await renderSide()
    const reads = git.status.mock.calls.length
    git.status.mockResolvedValue({ root: A, branch: 'goal/M02-G3', ahead: 0, behind: 0, changes: [], branches: [], remotes: [], tags: [] })
    await act(async () => { for (const h of [...stateHandlers]) h(st(A, { node: 'G3/implement' })) })
    await flush()
    expect(git.status).toHaveBeenCalledTimes(reads + 1)
    expect(within(rows()[0]).getByText('기본 폴더 · goal/M02-G3')).toBeTruthy()
    await act(async () => { for (const h of [...stateHandlers]) h(st(A, { node: 'G3/implement', failCount: 1 })) })
    await flush()
    expect(git.status).toHaveBeenCalledTimes(reads + 1)
    expect(api.loopMainArchives).toHaveBeenCalledTimes(1)
  })
})

describe('사이드바 껍데기 — 작업 모드와 채팅 대기 표시 (M10 G4)', () => {
  async function renderSidebar() {
    const { Sidebar } = await import('@renderer/12_Window/Sidebar')
    const r = render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
    await flush()
    return r
  }

  it('작업 모드에서는 새 대화·대화 검색·최근 채팅 대신 프로젝트 목록이고, 채팅 모드로 돌아가면 그대로다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceMode: 'work' })
    const r = await renderSidebar()
    expect(screen.getByRole('list', { name: '프로젝트' })).toBeTruthy()
    expect(screen.queryByLabelText('새 대화')).toBeNull()
    expect(screen.queryByLabelText('대화 검색')).toBeNull()
    expect(r.container.querySelector('.sb-list')).toBeNull()
    await click(screen.getByRole('tab', { name: '채팅' }))
    expect(screen.queryByRole('list', { name: '프로젝트' })).toBeNull()
    expect(screen.getByLabelText('새 대화')).toBeTruthy()
    expect(screen.getByLabelText('대화 검색')).toBeTruthy()
  })

  it('채팅이 사람의 답(질문·권한)을 기다리면 「채팅」 칸에 표시가 붙고, 칸 이름은 그대로다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceMode: 'work', pendingQuestion: null, pendingPermission: null } as never)
    await renderSidebar()
    const tab = (): HTMLElement => screen.getByRole('tab', { name: '채팅' })
    expect(tab().getAttribute('data-waiting')).toBeNull()
    await act(async () => { useAppStore.setState({ pendingQuestion: { requestId: 'q1', runId: 'r1', questions: [] } } as never) })
    expect(tab().getAttribute('data-waiting')).toBe('true')
    expect(tab().querySelector('.sb-mode-wait')).not.toBeNull()
    await act(async () => { useAppStore.setState({ pendingQuestion: null, pendingPermission: { requestId: 'p1', runId: 'r1', toolName: 'Bash', summary: 'ls' } } as never) })
    expect(tab().getAttribute('data-waiting')).toBe('true')
    await act(async () => { useAppStore.setState({ pendingPermission: null } as never) })
    expect(tab().getAttribute('data-waiting')).toBeNull()
  })
})

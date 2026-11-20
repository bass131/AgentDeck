// @vitest-environment jsdom
// M10 G5 — 앱 안 알림 표시. main이 정한 알림 목록(loop.alerts 읽기 + loop.alertsState push)을 받아
// 현황판 「기다리는 결정」 칸 위 알림 띠, 사이드바 프로젝트 꼬리표 옆 점, 채팅 모드의 「작업」 모드 버튼 옆 점으로 보인다.
// 풀리면(빈 목록 push) 표시가 사라진다. Windows 알림을 누르면(loop.alertOpen push) 그 작업 폴더의 작업 모드를 연다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import type { LoopAlert, LoopAlertList, LoopAlertOpen, LoopStatus } from '../../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi, type InstalledWindowApi } from '../00_Helpers/windowApiMock'

const A = 'C:\\work\\practice'
const B = 'C:\\work\\other'
const st = (cwd: string, over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd, root: cwd, phase: 'halted', milestoneId: 'M02', node: 'G2/checks', nodeTitle: '검사', reason: '같은 곳 FAIL 세 번',
  base: 'main', ghRepo: null, failCount: 3, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], ...over,
})
const NOW: LoopAlert = { key: 'a:halted:G2/checks', cwd: 'c:/work/practice', phase: 'halted', node: 'G2/checks', level: 'now', text: '멈춤 · G2/checks — 같은 곳 FAIL 세 번' }
const LATER: LoopAlert = { key: 'b:waiting-human:milestone-merge', cwd: B, phase: 'waiting-human', node: 'milestone-merge', level: 'later', text: '마일스톤 PR #12 병합을 기다려요' }

let installed: InstalledWindowApi<Record<string, unknown>>
let alertHandlers: Set<(l: LoopAlertList) => void>
let openHandlers: Set<(o: LoopAlertOpen) => void>
let stop: (() => void) | null = null

beforeEach(async () => {
  alertHandlers = new Set()
  openHandlers = new Set()
  installed = installWindowApi({
    loopStatus: vi.fn(async ({ cwd }: { cwd: string }) => st(cwd)),
    onLoopState: vi.fn(() => () => {}),
    loopAlerts: vi.fn().mockResolvedValue({ alerts: [NOW] }),
    onLoopAlerts: vi.fn((cb: (l: LoopAlertList) => void) => { alertHandlers.add(cb); return () => alertHandlers.delete(cb) }),
    onLoopAlertOpen: vi.fn((cb: (o: LoopAlertOpen) => void) => { openHandlers.add(cb); return () => openHandlers.delete(cb) }),
    loopMainArchives: vi.fn().mockResolvedValue({ cwd: A, archives: [] }),
    setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  })
  const git = installed.api.git as unknown as Record<string, ReturnType<typeof vi.fn>>
  git.status.mockResolvedValue({ root: A, branch: 'main', ahead: 0, behind: 0, changes: [], branches: [], remotes: [], tags: [] })
  git.prRead.mockResolvedValue({ ok: false, error: 'x' })
  const { useWorkStore } = await import('@renderer/13_Loop')
  useWorkStore.setState({ hydrated: true, cwd: A, projects: [A, B], center: 'main', extraTabs: [], right: 'board', archives: [], selectedNode: null })
})
afterEach(async () => {
  stop?.()
  stop = null
  cleanup()
  installed.uninstall()
  const { useAlertStore } = await import('@renderer/13_Loop')
  useAlertStore.setState({ alerts: [] })
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.setState({ workspaceMode: 'single' })
})

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const pushAlerts = async (alerts: LoopAlert[]): Promise<void> => { await act(async () => { for (const h of [...alertHandlers]) h({ alerts }) }); await flush() }

async function start(onOpen: (cwd: string) => void = () => {}): Promise<void> {
  const { startAlerts } = await import('@renderer/13_Loop')
  stop = startAlerts(onOpen)
  await flush()
}

describe('앱 안 알림 표시 (M10 G5)', () => {
  it('현황판 「기다리는 결정」 칸 위에 그 작업 폴더의 알림 띠가 있고, 풀리면 사라진다', async () => {
    await start()
    const { StatusBoard } = await import('@renderer/13_Loop')
    render(<StatusBoard cwd={A} onCwdChange={() => {}} />)
    await flush()
    const band = screen.getByRole('region', { name: '알림' })
    expect(band.getAttribute('data-level')).toBe('now')
    expect(within(band).getByText(NOW.text)).toBeTruthy()
    // 띠는 「기다리는 결정」 칸 바로 앞이다
    expect(band.nextElementSibling?.getAttribute('aria-label')).toBe('기다리는 결정')
    await pushAlerts([LATER])
    expect(screen.queryByRole('region', { name: '알림' })).toBeNull()
  })

  it('나중 사건(마일스톤 병합 대기)의 띠는 그 폴더의 현황판에만 「나중에 봐도 돼」로 있다', async () => {
    await start()
    await pushAlerts([NOW, LATER])
    const { StatusBoard } = await import('@renderer/13_Loop')
    render(<StatusBoard cwd={B} onCwdChange={() => {}} />)
    await flush()
    const bands = screen.getAllByRole('region', { name: '알림' })
    expect(bands.map((b) => b.getAttribute('data-level'))).toEqual(['later'])
    expect(within(bands[0]).getByText('나중에 봐도 돼')).toBeTruthy()
  })

  it('사이드바의 프로젝트 꼬리표 옆에 점이 있고, 나중 사건은 다른 꼴의 점이다', async () => {
    await start()
    await pushAlerts([NOW, LATER])
    const { ProjectSidebar } = await import('@renderer/13_Loop')
    render(<ProjectSidebar />)
    await flush()
    const rows = within(screen.getByRole('list', { name: '프로젝트' })).getAllByRole('listitem').filter((li) => li.classList.contains('sb-proj'))
    expect(rows.map((r) => r.querySelector('.sb-proj-alert')?.getAttribute('data-level') ?? null)).toEqual(['now', 'later'])
    expect(rows[0].querySelector('.sb-proj-head')?.getAttribute('title')).toContain(NOW.text)
    await pushAlerts([])
    expect(rows.map((r) => r.querySelector('.sb-proj-alert'))).toEqual([null, null])
  })

  it('채팅 모드에서는 「작업」 모드 버튼 옆에 점이 붙고 칸 이름은 그대로다. 작업 모드에서는 붙지 않는다', async () => {
    await start()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { Sidebar } = await import('@renderer/12_Window/Sidebar')
    render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
    await flush()
    const work = (): HTMLElement => screen.getByRole('tab', { name: '작업' })
    expect(work().getAttribute('data-waiting')).toBe('true')
    expect(work().querySelector('.sb-mode-wait')).not.toBeNull()
    expect(work().getAttribute('title')).toBe('작업에 사람이 필요한 일이 있어요')
    expect(screen.getByRole('tab', { name: '채팅' }).getAttribute('data-waiting')).toBeNull()
    await act(async () => { useAppStore.setState({ workspaceMode: 'work' }) })
    expect(work().getAttribute('data-waiting')).toBeNull()
    await act(async () => { useAppStore.setState({ workspaceMode: 'single' }) })
    await pushAlerts([])
    expect(work().getAttribute('data-waiting')).toBeNull()
  })

  it('Windows 알림을 누르면(loop.alertOpen) 그 작업 폴더로 연다', async () => {
    const opened: string[] = []
    await start((cwd) => opened.push(cwd))
    await act(async () => { for (const h of [...openHandlers]) h({ cwd: B }) })
    expect(opened).toEqual([B])
  })

  // G5 검수 6 — 끄면 두 push 구독을 모두 푼다. 푼 뒤의 push는 표시도 열기도 바꾸지 않는다
  it('구독을 끄면 알림 목록·알림 열기 push를 더 받지 않는다', async () => {
    const opened: string[] = []
    await start((cwd) => opened.push(cwd))
    expect([alertHandlers.size, openHandlers.size]).toEqual([1, 1])
    stop?.()
    stop = null
    expect([alertHandlers.size, openHandlers.size]).toEqual([0, 0])
    const { useAlertStore } = await import('@renderer/13_Loop')
    const before = useAlertStore.getState().alerts
    await pushAlerts([LATER])
    expect(useAlertStore.getState().alerts).toBe(before)
    expect(opened).toEqual([])
  })

  it('브리지에 알림 길이 없으면(옛 목) 조용히 아무것도 하지 않는다', async () => {
    installed.uninstall()
    installed = installWindowApi({})
    const api = installed.api as unknown as Record<string, unknown>
    delete api.loopAlerts
    delete api.onLoopAlerts
    delete api.onLoopAlertOpen
    await expect(start()).resolves.toBeUndefined()
  })
})

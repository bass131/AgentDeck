// @vitest-environment jsdom
// 루프 화면의 진입점 — M09 G4의 사이드바 버튼·모달은 M10 G1에서 「작업」 모드의 몸체로 바뀌었다.
// 사이드바 모드 전환에는 「채팅」과 「작업」 둘만 있고, 「작업」을 고르면 루프 화면이 가운데(대화 자리)에 모달 없이 그려진다.
// 고른 저장소는 앱 껍데기(Shell)가 기억해 모드를 오가도 같은 저장소의 상태를 읽는다. 작업 모드에 들기 전에는 loop IPC를 부르지 않는다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { LoopStatus, MainChatView } from '../../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const closed: LoopStatus = {
  cwd: CWD, root: null, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
  paused: false, mainBusy: false, mainWaiting: false, mainNode: false, recentLines: [], sessions: [],
}
const blankView: MainChatView = {
  cwd: CWD, root: CWD, chapter: 'c1', sessionId: null, items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0,
}

afterEach(async () => {
  cleanup()
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.getState().setWorkspaceMode('single')
  const { useWorkStore } = await import('@renderer/13_Loop')
  useWorkStore.setState({ hydrated: false, cwd: null, projects: [], center: 'main', extraTabs: [], right: 'board', archives: [] })
})

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

// 껍데기가 마운트 때 부르는 길의 응답 — 기본 stub(undefined)이면 뒤에서 처리되지 않은 거부가 난다
const shellBase = () => ({
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
})

function installMatchMedia(): void {
  // 확대 배율 감시(useGlobalZoom)가 matchMedia를 부른다 — jsdom에는 없다(ZoomControl 시험과 같은 받침)
  const w = window as unknown as { matchMedia: typeof window.matchMedia }
  w.matchMedia = vi.fn(
    (query: string) => ({ media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  )
}

describe('루프 화면 진입점 — 작업 모드 (M10 G1)', () => {
  it('사이드바 모드 전환에는 「채팅」과 「작업」 둘만 있고 「마일스톤 루프」 버튼은 없다', async () => {
    const installed = installWindowApi(shellBase())
    try {
      const { Sidebar } = await import('@renderer/12_Window/Sidebar')
      const { container } = render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
      await flush()
      const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
      expect(tabs).toEqual(['채팅', '작업'])
      expect(screen.queryByRole('button', { name: '마일스톤 루프' })).toBeNull()
      expect(container.querySelector('.sb-loop')).toBeNull()

      const { useAppStore } = await import('@renderer/00_App/appStore')
      fireEvent.click(screen.getByRole('tab', { name: '작업' }))
      expect(useAppStore.getState().workspaceMode).toBe('work')
      expect(screen.getByRole('tab', { name: '작업' }).getAttribute('aria-selected')).toBe('true')
      fireEvent.click(screen.getByRole('tab', { name: '채팅' }))
      expect(useAppStore.getState().workspaceMode).toBe('single')
    } finally {
      installed.uninstall()
    }
  })

  it('「작업」을 고르면 루프 화면이 가운데에 모달 없이 열리고, 모드를 오가도 고른 저장소를 기억한다', async () => {
    const loopStatus = vi.fn().mockResolvedValue(closed)
    const onLoopState = vi.fn(() => () => {})
    const overrides = {
      ...shellBase(),
      loopStatus, onLoopState,
      loopMainRead: vi.fn().mockResolvedValue(blankView),
      onLoopMainState: vi.fn(() => () => {}),
      pickFolder: vi.fn().mockResolvedValue({ path: CWD }),
      getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test' }),
      checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
    }
    const installed = installWindowApi(overrides)
    installMatchMedia()
    try {
      const { loadPrefs } = await import('@renderer/11_Settings/prefs')
      await loadPrefs()
      const { Shell } = await import('@renderer/12_Window/Shell')
      const { container } = render(<Shell />)
      await flush()
      expect(onLoopState).not.toHaveBeenCalled()
      expect(loopStatus).not.toHaveBeenCalled()
      expect(container.querySelector('.status-board')).toBeNull()
      expect(container.querySelector('.pane.chat')).not.toBeNull()
      // 채팅 배치 — 탐색기 열과 대화
      expect(container.querySelector('.pane.explorer')).not.toBeNull()

      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '작업' })) })
      await flush()
      const loop = container.querySelector('.pane.work .status-board')
      expect(loop).not.toBeNull()
      // 모달이 아니다 — 겹침 창·닫기 버튼·전역 모달 감지 클래스가 없다
      expect(document.querySelector('.loop-overlay')).toBeNull()
      expect(document.querySelector('.modal-overlay')).toBeNull()
      expect(screen.queryByRole('dialog', { name: '마일스톤 루프' })).toBeNull()
      expect(screen.queryByRole('button', { name: '화면 닫기' })).toBeNull()
      // 대화 자리를 작업 모드가 차지한다 — 대화·탐색기는 작업 모드에서 그리지 않는다
      expect(container.querySelector('.pane.chat')).toBeNull()
      expect(container.querySelector('.pane.explorer')).toBeNull()
      expect(screen.getByRole('list', { name: '프로젝트' })).toBeTruthy()
      expect(container.querySelector('.pane.work .work-center [role="tablist"][aria-label="가운데 탭"]')).not.toBeNull()
      expect(container.querySelector('.pane.work .work-center .main-chat')).not.toBeNull()
      expect(container.querySelector('.pane.work .work-side [role="tablist"][aria-label="오른쪽 탭"]')).not.toBeNull()
      expect(container.querySelector('.pane.work .work-side .status-board')).not.toBeNull()
      // 작업 모드에 들면 루프 상태 push를 구독한다(현황판·가운데 탭·프로젝트 사이드바)
      expect(onLoopState).toHaveBeenCalled()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '폴더 고르기' })) })
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })
      // 고른 폴더는 사이드바의 프로젝트가 된다
      expect(screen.getByRole('list', { name: '프로젝트' }).textContent).toContain('practice')

      // Esc는 작업 화면을 닫지 않는다
      await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
      expect(container.querySelector('.status-board')).not.toBeNull()

      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '채팅' })) })
      await flush()
      expect(container.querySelector('.status-board')).toBeNull()
      expect(container.querySelector('.pane.chat')).not.toBeNull()
      // 채팅 모드로 돌아가면 지금의 채팅 배치 그대로다 — 탐색기 열, 최근 채팅, 프로젝트 목록 없음
      expect(container.querySelector('.pane.explorer')).not.toBeNull()
      expect(screen.queryByRole('list', { name: '프로젝트' })).toBeNull()
      expect(screen.getByLabelText('대화 검색')).toBeTruthy()

      loopStatus.mockClear()
      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '작업' })) })
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })
    } finally {
      installed.uninstall()
    }
  })

  // M10 G5 — 알림 목록은 채팅 모드에서도 Shell 수명으로 구독한다(「작업」 버튼 점). Windows 알림을 누르면 그 폴더의 작업 모드를 연다
  it('채팅 모드에서도 알림을 구독하고, 알림 열기 push가 오면 그 작업 폴더의 작업 모드로 바꾼다', async () => {
    const opens = new Set<(o: { cwd: string }) => void>()
    const overrides = {
      ...shellBase(),
      loopStatus: vi.fn().mockResolvedValue(closed),
      onLoopState: vi.fn(() => () => {}),
      loopMainRead: vi.fn().mockResolvedValue(blankView),
      onLoopMainState: vi.fn(() => () => {}),
      loopAlerts: vi.fn().mockResolvedValue({ alerts: [] }),
      onLoopAlerts: vi.fn(() => () => {}),
      onLoopAlertOpen: vi.fn((cb: (o: { cwd: string }) => void) => { opens.add(cb); return () => opens.delete(cb) }),
      getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test' }),
      checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
    }
    const installed = installWindowApi(overrides)
    installMatchMedia()
    try {
      const { loadPrefs } = await import('@renderer/11_Settings/prefs')
      await loadPrefs()
      const { Shell } = await import('@renderer/12_Window/Shell')
      const { container } = render(<Shell />)
      await flush()
      expect(overrides.loopAlerts).toHaveBeenCalledTimes(1)
      expect(overrides.onLoopAlerts).toHaveBeenCalled()
      expect(overrides.onLoopAlertOpen).toHaveBeenCalled()
      expect(container.querySelector('.pane.chat')).not.toBeNull()
      await act(async () => { for (const cb of [...opens]) cb({ cwd: CWD }) })
      await flush()
      const { useAppStore } = await import('@renderer/00_App/appStore')
      const { useWorkStore } = await import('@renderer/13_Loop')
      expect(useAppStore.getState().workspaceMode).toBe('work')
      expect(useWorkStore.getState().cwd).toBe(CWD)
      expect(container.querySelector('.pane.work .status-board')).not.toBeNull()
    } finally {
      installed.uninstall()
    }
  })

  // M10 G3(Backlog 6) — 작업 모드로 끈 뒤 다시 켜면 그 작업 폴더로 뜬다. 고른 폴더는 설정(work.cwd)에 남는다.
  // 다시 켤 때 루프를 저절로 열지 않는다(열기는 저장소 잠금을 잡고 실행기를 돌리는 사람의 동작이다) — 읽기만 한다
  it('고른 작업 폴더를 설정에 남기고, 다시 켜면 그 폴더의 루프 상태와 메인 대화를 읽는다(열지는 않는다)', async () => {
    const loopStatus = vi.fn().mockResolvedValue(closed)
    const loopMainRead = vi.fn().mockResolvedValue({ ...blankView, root: null })
    const loopOpen = vi.fn()
    const setUiPref = vi.fn().mockResolvedValue({ ok: true })
    const base = {
      ...shellBase(),
      loopStatus, loopMainRead, loopOpen, setUiPref,
      onLoopState: vi.fn(() => () => {}),
      onLoopMainState: vi.fn(() => () => {}),
      pickFolder: vi.fn().mockResolvedValue({ path: CWD }),
      checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
    }
    installMatchMedia()
    const { loadPrefs } = await import('@renderer/11_Settings/prefs')
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { Shell } = await import('@renderer/12_Window/Shell')

    // 첫 실행 — 작업 모드에서 폴더를 고르면 설정에 남긴다
    let installed = installWindowApi({ ...base, getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test' }) })
    try {
      await loadPrefs()
      useAppStore.getState().setWorkspaceMode('work')
      render(<Shell />)
      await flush()
      expect(loopMainRead).not.toHaveBeenCalled()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '폴더 고르기' })) })
      await flush()
      expect(setUiPref).toHaveBeenCalledWith({ key: 'work.cwd', value: CWD })
      expect(loopMainRead).toHaveBeenCalledWith({ cwd: CWD })
    } finally {
      cleanup()
      installed.uninstall()
    }

    // 다시 켬 — 저장된 작업 폴더로 뜬다(작업 모드 화면 상태는 앱을 다시 켠 것처럼 비운다 — 설정에서 다시 읽는다)
    loopStatus.mockClear()
    loopMainRead.mockClear()
    const { useWorkStore } = await import('@renderer/13_Loop')
    useWorkStore.setState({ hydrated: false, cwd: null, projects: [], center: 'main', extraTabs: [], right: 'board', archives: [] })
    installed = installWindowApi({ ...base, getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test', 'workspace.mode': 'work', 'work.cwd': CWD }) })
    try {
      await loadPrefs()
      useAppStore.getState().setWorkspaceMode('work')
      const { container } = render(<Shell />)
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })
      expect(loopMainRead).toHaveBeenCalledWith({ cwd: CWD })
      expect(loopOpen).not.toHaveBeenCalled()
      expect(container.querySelector('.loop-cwd')?.textContent).toBe(CWD)
      // 저장된 작업 폴더는 목록(work.projects)에 없어도 사이드바의 프로젝트로 보인다(G3 때 고른 폴더)
      expect(screen.getByRole('list', { name: '프로젝트' }).textContent).toContain('practice')
    } finally {
      installed.uninstall()
    }
  })
})

describe('작업 모드 배치 CSS', () => {
  const css = (rel: string): string =>
    readFileSync(resolve(__dirname, '../../../00_Source/renderer/src', rel), 'utf8')

  it('작업 칸(.pane.work)은 대화 칸처럼 남은 너비를 채우고, 사이드바의 옛 루프 버튼 스타일은 없다', () => {
    const shell = css('12_Window/shell.css')
    const rule = shell.match(/\.pane\.work\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/flex:\s*1\s*;/)
    expect(rule![1]).toMatch(/min-width:\s*0\s*;/)
    expect(css('12_Window/Sidebar.css')).not.toMatch(/\.sb-loop\b/)
  })

  // M10 G3 — 작업 칸은 가운데 메인 대화(.work-center, 남은 너비)와 옆의 좁은 루프 화면 열(.work-side, 고정 너비)로 나뉜다
  it('작업 칸 안에서 메인 대화 칸은 남은 너비를 채우고, 루프 화면 열은 좁은 고정 너비다', () => {
    const shell = css('12_Window/shell.css')
    const center = shell.match(/\.work-center\s*\{([^}]*)\}/)
    const side = shell.match(/\.work-side\s*\{([^}]*)\}/)
    expect(center).not.toBeNull()
    expect(side).not.toBeNull()
    expect(center![1]).toMatch(/flex:\s*1\s*;/)
    expect(center![1]).toMatch(/min-width:\s*0\s*;/)
    expect(side![1]).toMatch(/width:\s*\d+px\s*;/)
    expect(side![1]).toMatch(/flex:\s*none\s*;/)
  })

  it('옛 루프 화면 뿌리 스타일은 없고, 현황판·탭·프로젝트 사이드바 스타일이 있다', () => {
    expect(css('12_Window/shell.css')).not.toMatch(/\.loop-screen\b/)
    // 옛 모달 판(패널·머리·제목·몸)도 현황판 칸(.board-box)으로 바뀌어 남지 않는다
    expect(css('13_Loop/LoopScreen.css')).not.toMatch(/\.loop-(screen|panel|head|title|body)\b/)
    const work = css('13_Loop/Work.css')
    expect(work).toMatch(/\.status-board\s*\{/)
    expect(work).toMatch(/\.work-panel\[hidden\]\s*\{[^}]*display:\s*none/)
    const side = css('12_Window/Sidebar.css')
    for (const cls of ['sb-projects', 'sb-proj-head', 'sb-proj-tag', 'sb-proj-item', 'sb-proj-open', 'sb-mode-wait', 'sb-proj-alert']) {
      expect(side, cls).toMatch(new RegExp(`\\.${cls}\\b`))
    }
    // M10 G5 — 현황판의 알림 띠와 프로젝트 점. 나중 사건은 다른 꼴이다
    expect(work).toMatch(/\.board-alert\s*\{/)
    expect(work).toMatch(/\.board-alert\[data-level='later'\]/)
    expect(side).toMatch(/\.sb-proj-alert\[data-level='later'\]/)
    // G5 검수 5 — 건너뛴 노드는 끝남(흐림)과 다른 꼴이다
    expect(css('13_Loop/Graph.css')).toMatch(/\.gc-card\[data-skipped='true'\]\s*\{[^}]*dashed/)
  })
})

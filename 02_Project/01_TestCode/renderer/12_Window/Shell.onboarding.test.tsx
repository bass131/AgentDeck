// @vitest-environment jsdom
// 시작하기 안내 — 처음 켤 때 새 버전 소개·엔진 알림 뒤에 저절로 뜨고, 「나중에」나 모두 끝남이 기록되면 다시 저절로 뜨지 않는다.
// 사이드바에서 다시 열고, 단계 버튼은 그 일을 하는 기존 화면을 연다. 돌아오면 상태를 다시 읽는다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import type { LoopStatus, MainChatView, TasteDocsRead } from '@shared/ipcContract'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:/work/practice'
const closed: LoopStatus = {
  cwd: CWD, root: null, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
  paused: false, mainBusy: false, mainWaiting: false, mainNode: false, recentLines: [], sessions: [],
}
const blankView: MainChatView = {
  cwd: CWD, root: CWD, chapter: 'c1', sessionId: null, items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0,
}
const present = { absent: false as const, path: 'p', raw: 'r', problems: [] }
const allDocs: TasteDocsRead = {
  global: { ...present, doc: { scope: 'global', items: [] } },
  charter: { ...present, doc: { goal: ['목표'], nonGoals: null } },
  project: { absent: true, path: 'p' },
}

afterEach(async () => {
  cleanup()
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.getState().setWorkspaceMode('single')
  const { useWorkStore } = await import('@renderer/13_Loop')
  useWorkStore.setState({ hydrated: false, cwd: null, projects: [], center: 'main', extraTabs: [], right: 'board', archives: [] })
})

const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

function installMatchMedia(): void {
  const w = window as unknown as { matchMedia: typeof window.matchMedia }
  w.matchMedia = vi.fn(
    (query: string) => ({ media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  )
}

const base = (over: Record<string, unknown> = {}) => ({
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
  getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0' }),
  getEngineState: vi.fn().mockResolvedValue({ available: true, authed: false, version: '0.2.0' }),
  githubStatus: vi.fn().mockResolvedValue({ phase: 'disconnected' }),
  onboardingGhCheck: vi.fn().mockResolvedValue({ state: 'absent' }),
  onboardingOpenGhInstall: vi.fn().mockResolvedValue({ ok: true }),
  loopStatus: vi.fn().mockResolvedValue(closed),
  loopMainRead: vi.fn().mockResolvedValue(blankView),
  tasteRead: vi.fn().mockResolvedValue(allDocs),
  pickFolder: vi.fn().mockResolvedValue({ path: CWD }),
  ...over,
})

async function boot(over: Record<string, unknown> = {}, gitRoot: string | null = CWD) {
  const installed = installWindowApi(base(over))
  Object.assign(installed.api.git, { root: vi.fn().mockResolvedValue(gitRoot) })
  installMatchMedia()
  const { loadPrefs } = await import('@renderer/11_Settings/prefs')
  await loadPrefs()
  const { Shell } = await import('@renderer/12_Window/Shell')
  render(<Shell />)
  await flush()
  return installed
}

const guide = () => screen.queryByRole('dialog', { name: '시작하기' })
const stateOf = (title: string): string | null => within(guide()!).getByRole('listitem', { name: title }).getAttribute('data-state')
const prefWrites = (api: { setUiPref: unknown }) => (api.setUiPref as ReturnType<typeof vi.fn>).mock.calls
  .map((c) => c[0] as { key: string; value: unknown })
  .filter((c) => c.key === 'onboarding.closed')

describe('시작하기 안내 — 뜨는 때', () => {
  it('기록이 없으면 처음 켤 때 저절로 뜨고, 여섯 단계가 상태 표식과 함께 보인다', async () => {
    const installed = await boot()
    try {
      expect(guide()).not.toBeNull()
      const list = within(guide()!).getByRole('list', { name: '시작하기 단계' })
      expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-step'))).toEqual(['claude', 'github', 'gh', 'project', 'taste', 'milestone'])
      expect(stateOf('Claude Code 로그인')).toBe('todo')
      expect(stateOf('GitHub 계정')).toBe('todo')
      expect(stateOf('gh CLI')).toBe('todo')
      expect(stateOf('프로젝트 열기')).toBe('todo')
      expect(stateOf('헌장·Taste')).toBe('blocked')
      expect(stateOf('첫 마일스톤')).toBe('blocked')
      expect(within(guide()!).getByRole('button', { name: '헌장·Taste 열기' })).toHaveProperty('disabled', true)
    } finally {
      installed.uninstall()
    }
  })

  it('새 버전 소개가 먼저 뜨고, 닫은 뒤에야 안내가 보인다', async () => {
    const installed = await boot({ getUiPrefs: vi.fn().mockResolvedValue({}) })
    try {
      expect(document.querySelector('.wn-overlay')).not.toBeNull()
      expect(guide()).toBeNull()
      await act(async () => { fireEvent.click(screen.getByText('건너뛰기')) })
      await flush()
      expect(guide()).not.toBeNull()
    } finally {
      installed.uninstall()
    }
  })

  it('엔진 업데이트 알림이 떠 있는 동안에는 안내를 가리고, 「나중에」로 닫으면 보인다', async () => {
    const installed = await boot({ checkEngineUpdate: vi.fn().mockResolvedValue({ current: '1.0.0', latest: '9.9.9', updateAvailable: true }) })
    try {
      expect(guide()).toBeNull()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '나중에' })) })
      await flush()
      expect(guide()).not.toBeNull()
    } finally {
      installed.uninstall()
    }
  })

  it('「나중에」로 닫으면 later를 기록하고, 다시 켜도 저절로 뜨지 않으며 사이드바에서 다시 열린다', async () => {
    let installed = await boot()
    try {
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: '나중에' })) })
      expect(guide()).toBeNull()
      expect(prefWrites(installed.api)).toEqual([{ key: 'onboarding.closed', value: 'later' }])
    } finally {
      installed.uninstall()
      cleanup()
    }
    installed = await boot({ getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0', 'onboarding.closed': 'later' }) })
    try {
      expect(guide()).toBeNull()
      const ghCheck = installed.api.onboardingGhCheck as ReturnType<typeof vi.fn>
      expect(ghCheck).not.toHaveBeenCalled()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '시작하기 열기' })) })
      await flush()
      expect(guide()).not.toBeNull()
      expect(ghCheck).toHaveBeenCalledTimes(1)
    } finally {
      installed.uninstall()
    }
  })

  it('읽기 하나가 던지거나 비어 와도 그 단계만 막힘이고 앱 껍데기는 그대로 그려진다', async () => {
    const installed = await boot({
      getEngineState: vi.fn(() => { throw new Error('no bridge') }),
      githubStatus: vi.fn().mockResolvedValue(undefined),
      onGithubState: vi.fn(() => { throw new Error('no push') }),
      onboardingGhCheck: vi.fn().mockRejectedValue(new Error('ipc')),
    })
    try {
      expect(document.querySelector('.statusbar')).not.toBeNull()
      expect(stateOf('Claude Code 로그인')).toBe('blocked')
      expect(stateOf('GitHub 계정')).toBe('blocked')
      expect(stateOf('gh CLI')).toBe('blocked')
      expect(stateOf('프로젝트 열기')).toBe('todo')
    } finally {
      installed.uninstall()
    }
  })

  it('Esc로 닫아도 「나중에」와 같다', async () => {
    const installed = await boot()
    try {
      await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
      expect(guide()).toBeNull()
      expect(prefWrites(installed.api)).toEqual([{ key: 'onboarding.closed', value: 'later' }])
    } finally {
      installed.uninstall()
    }
  })

  it('여섯 단계가 모두 끝나면 done을 기록하고, 그 기록이면 저절로 뜨지 않는다', async () => {
    const done = {
      getEngineState: vi.fn().mockResolvedValue({ available: true, authed: true, version: '0.2.0' }),
      githubStatus: vi.fn().mockResolvedValue({ phase: 'connected', login: 'octo' }),
      onboardingGhCheck: vi.fn().mockResolvedValue({ state: 'present', version: '2.62.0' }),
      loopStatus: vi.fn().mockResolvedValue({ ...closed, root: CWD, phase: 'running', milestoneId: 'M01' }),
      getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0', 'work.cwd': CWD }),
    }
    let installed = await boot(done)
    try {
      expect(guide()).not.toBeNull()
      for (const t of ['Claude Code 로그인', 'GitHub 계정', 'gh CLI', '프로젝트 열기', '헌장·Taste', '첫 마일스톤']) expect(stateOf(t)).toBe('done')
      expect(prefWrites(installed.api)).toEqual([{ key: 'onboarding.closed', value: 'done' }])
    } finally {
      installed.uninstall()
      cleanup()
    }
    installed = await boot({ ...done, getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0', 'onboarding.closed': 'done' }) })
    try {
      expect(guide()).toBeNull()
    } finally {
      installed.uninstall()
    }
  })
})

describe('시작하기 안내 — 단계 버튼', () => {
  it('「로그인 안내」는 엔진 로그인 안내를 열고, 닫고 돌아오면 안내가 다시 보이며 상태를 다시 읽는다', async () => {
    const installed = await boot()
    try {
      const engineState = installed.api.getEngineState as ReturnType<typeof vi.fn>
      const before = engineState.mock.calls.length
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: '로그인 안내' })) })
      await flush()
      expect(document.querySelector('.eg-auth-dialog')).not.toBeNull()
      expect(guide()).toBeNull()
      engineState.mockResolvedValue({ available: true, authed: true, version: '0.2.0' })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계속 진행' })) })
      await flush()
      expect(document.querySelector('.eg-auth-dialog')).toBeNull()
      expect(guide()).not.toBeNull()
      expect(engineState.mock.calls.length).toBeGreaterThan(before + 1)
      expect(stateOf('Claude Code 로그인')).toBe('done')
      expect(prefWrites(installed.api)).toEqual([])
    } finally {
      installed.uninstall()
    }
  })

  it('「GitHub 계정 열기」는 설정의 GitHub 계정 칸을 열고, 설정을 닫으면 안내로 돌아온다', async () => {
    const installed = await boot()
    try {
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: 'GitHub 계정 열기' })) })
      await flush()
      const settings = screen.getByRole('dialog', { name: '설정' })
      expect(within(settings).getByRole('status', { name: 'GitHub 연결 상태' })).toBeTruthy()
      expect(guide()).toBeNull()
      await act(async () => { fireEvent.click(within(settings).getByRole('button', { name: '닫기' })) })
      await flush()
      expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull()
      expect(guide()).not.toBeNull()
    } finally {
      installed.uninstall()
    }
  })

  it('사이드바의 설정 열기는 여전히 첫 칸(Claude Code)으로 연다', async () => {
    const installed = await boot({ getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0', 'onboarding.closed': 'later' }) })
    try {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '설정 열기' })) })
      await flush()
      const settings = screen.getByRole('dialog', { name: '설정' })
      expect(within(settings).queryByRole('status', { name: 'GitHub 연결 상태' })).toBeNull()
    } finally {
      installed.uninstall()
    }
  })

  it('「설치 안내」는 요청 없이 main의 설치 안내 열기를 부르고, 「다시 확인」은 gh를 다시 확인한다', async () => {
    const installed = await boot()
    try {
      const open = installed.api.onboardingOpenGhInstall as ReturnType<typeof vi.fn>
      const ghCheck = installed.api.onboardingGhCheck as ReturnType<typeof vi.fn>
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: '설치 안내' })) })
      await flush()
      expect(open).toHaveBeenCalledTimes(1)
      expect(open.mock.calls[0]).toEqual([])
      expect(guide()).not.toBeNull()
      ghCheck.mockResolvedValue({ state: 'present', version: '2.62.0' })
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: '다시 확인' })) })
      await flush()
      expect(ghCheck).toHaveBeenCalledTimes(2)
      expect(stateOf('gh CLI')).toBe('done')
    } finally {
      installed.uninstall()
    }
  })

  it('창으로 돌아오면(focus) 상태를 다시 읽는다', async () => {
    const installed = await boot()
    try {
      const ghCheck = installed.api.onboardingGhCheck as ReturnType<typeof vi.fn>
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await flush()
      expect(ghCheck).toHaveBeenCalledTimes(2)
    } finally {
      installed.uninstall()
    }
  })

  it('「폴더 열기」는 작업 모드의 폴더 고르기로 작업 폴더를 정하고, 프로젝트 단계가 끝남이 된다', async () => {
    const installed = await boot()
    try {
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: '폴더 열기' })) })
      await flush()
      expect(installed.api.pickFolder).toHaveBeenCalledTimes(1)
      const { useWorkStore } = await import('@renderer/13_Loop')
      const { useAppStore } = await import('@renderer/00_App/appStore')
      expect(useWorkStore.getState().cwd).toBe(CWD)
      expect(useAppStore.getState().workspaceMode).toBe('work')
      expect(guide()).not.toBeNull()
      expect(stateOf('프로젝트 열기')).toBe('done')
      expect(stateOf('헌장·Taste')).toBe('done')
      expect(stateOf('첫 마일스톤')).toBe('todo')
    } finally {
      installed.uninstall()
    }
  })

  it('git 저장소가 아닌 폴더면 프로젝트 단계가 막힘이다', async () => {
    const installed = await boot({ getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0', 'work.cwd': CWD }) }, null)
    try {
      expect(stateOf('프로젝트 열기')).toBe('blocked')
    } finally {
      installed.uninstall()
    }
  })

  it.each([
    ['헌장·Taste 열기', 'taste'],
    ['현황판 열기', 'board'],
  ])('「%s」는 작업 모드의 그 칸을 열고 안내를 기록 없이 닫는다', async (label, right) => {
    const installed = await boot({ getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0', 'work.cwd': CWD }) })
    try {
      const { useWorkStore } = await import('@renderer/13_Loop')
      const { useAppStore } = await import('@renderer/00_App/appStore')
      useWorkStore.setState({ right: 'files' })
      await act(async () => { fireEvent.click(within(guide()!).getByRole('button', { name: label })) })
      await flush()
      expect(useAppStore.getState().workspaceMode).toBe('work')
      expect(useWorkStore.getState().right).toBe(right)
      expect(guide()).toBeNull()
      expect(prefWrites(installed.api)).toEqual([])
      expect(document.querySelector(`.pane.work [data-tab-panel="${right}"]`)).not.toBeNull()
    } finally {
      installed.uninstall()
    }
  })
})

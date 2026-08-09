// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  fsRead: vi.fn().mockResolvedValue({ content: '' }),
  openFolder: vi.fn().mockResolvedValue({ canceled: true }),
  openReferenceFolder: vi.fn().mockResolvedValue({ canceled: true }),
  onFolderSelected: vi.fn().mockReturnValue(() => {}),
  listDir: vi.fn().mockResolvedValue({ entries: [] }),
  gitStatus: vi.fn().mockResolvedValue({ branch: 'main', staged: [], unstaged: [], untracked: [] }),
  gitLog: vi.fn().mockResolvedValue({ commits: [] }),
  gitDiff: vi.fn().mockResolvedValue({ diff: '' }),
  onGitChange: vi.fn().mockReturnValue(() => {}),
  getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0' }),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

function mockWebdriver(value: boolean | undefined): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver')
  Object.defineProperty(navigator, 'webdriver', {
    value,
    writable: true,
    configurable: true,
  })
  return () => {
    if (descriptor) {
      Object.defineProperty(navigator, 'webdriver', descriptor)
    } else {
      Object.defineProperty(navigator, 'webdriver', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    }
  }
}

async function renderShell() {
  const { loadPrefs } = await import('../../../02_Project/00_Source/renderer/src/lib/prefs')
  await loadPrefs()

  const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    workspaceRoot: null,
    changedFiles: new Set(),
    openedFile: null,
    recentFiles: [],
    workspaceMode: 'single',
  } as Parameters<typeof useAppStore.setState>[0])

  let container!: HTMLElement
  await act(async () => {
    const result = render(<Shell />)
    container = result.container
  })
  return container
}

describe('Shell test-open 훅 — webdriver=false(프로덕션) → 리스너 비활성', () => {
  let restoreWebdriver: () => void

  beforeEach(() => {
    restoreWebdriver = mockWebdriver(false)
    vi.resetModules()
  })

  afterEach(() => {
    restoreWebdriver()
    cleanup()
  })

  it('webdriver=false: whatsnew 이벤트 디스패치 후 .wn-overlay 미표시', async () => {
    const container = await renderShell()
    expect(container.querySelector('.wn-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'whatsnew' }))
    })

    expect(container.querySelector('.wn-overlay')).toBeFalsy()
  })

  it('webdriver=false: updatenotes 이벤트 디스패치 후 .un-overlay 미표시', async () => {
    const container = await renderShell()
    expect(container.querySelector('.un-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'updatenotes' }))
    })

    expect(container.querySelector('.un-overlay')).toBeFalsy()
  })

  it('webdriver=false: profile 이벤트 디스패치 후 .pf-overlay 미표시', async () => {
    const container = await renderShell()
    expect(container.querySelector('.pf-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'profile' }))
    })

    expect(container.querySelector('.pf-overlay')).toBeFalsy()
  })
})

describe('Shell test-open 훅 — webdriver=true(Playwright 자동화) → 리스너 활성', () => {
  let restoreWebdriver: () => void

  beforeEach(() => {
    restoreWebdriver = mockWebdriver(true)
    vi.resetModules()
  })

  afterEach(() => {
    restoreWebdriver()
    cleanup()
  })

  it('webdriver=true: whatsnew 이벤트 → .wn-overlay 표시', async () => {
    const container = await renderShell()
    expect(container.querySelector('.wn-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'whatsnew' }))
    })

    expect(container.querySelector('.wn-overlay')).toBeTruthy()
  })

  it('webdriver=true: updatenotes 이벤트 → .un-overlay 표시', async () => {
    const container = await renderShell()
    expect(container.querySelector('.un-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'updatenotes' }))
    })

    expect(container.querySelector('.un-overlay')).toBeTruthy()
  })

  it('webdriver=true: profile 이벤트 → .pf-overlay 표시', async () => {
    const container = await renderShell()
    expect(container.querySelector('.pf-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'profile' }))
    })

    expect(container.querySelector('.pf-overlay')).toBeTruthy()
  })

  it('webdriver=true: 알 수 없는 detail 값 → 어떤 모달도 열리지 않음', async () => {
    const container = await renderShell()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'unknown-modal' }))
    })

    expect(container.querySelector('.wn-overlay')).toBeFalsy()
    expect(container.querySelector('.un-overlay')).toBeFalsy()
    expect(container.querySelector('.pf-overlay')).toBeFalsy()
  })
})

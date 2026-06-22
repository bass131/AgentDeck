// @vitest-environment jsdom
/**
 * shell-test-open.test.tsx — Shell navigator.webdriver 게이트 test-open 훅 단위 테스트.
 *
 * TDD: 실패 먼저 → 구현(Shell.tsx useEffect 추가) 후 green.
 *
 * 검증:
 *   - navigator.webdriver=true: agentdeck:test-open CustomEvent 디스패치 → 해당 모달 표시.
 *   - navigator.webdriver=false(또는 undefined): 이벤트 디스패치해도 모달 안 열림.
 *
 * 제약:
 *   - renderer + tests/e2e 만. src/main·src/shared·src/preload 수정 없음.
 *   - window.api 신규 호출 0. 새 IPC 0.
 *   - navigator.webdriver는 Object.defineProperty로 모킹 → afterEach에서 복원.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// ── window.api 최소 모킹 (Shell이 useWindowState·useGlobalShortcuts에서 사용) ──
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
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── navigator.webdriver 모킹 헬퍼 ────────────────────────────────────────────

/** navigator.webdriver를 임시로 설정하고 cleanup 함수를 반환 */
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
      // 원본이 없었으면 undefined로 복원
      Object.defineProperty(navigator, 'webdriver', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    }
  }
}

// ── Shell 렌더 헬퍼 ────────────────────────────────────────────────────────
async function renderShell() {
  // 모듈 캐시를 그대로 두고 동적 import
  const { Shell } = await import('../../src/renderer/src/layout/Shell')
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  // store 최소 초기화 (workspaceMode 기본값 유지)
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

// ══════════════════════════════════════════════════════════════════════════════
// webdriver=false → 리스너 비활성: 이벤트 디스패치해도 모달 안 열림
// ══════════════════════════════════════════════════════════════════════════════

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
    // 모달이 모두 닫혀있음을 먼저 확인
    expect(container.querySelector('.wn-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'whatsnew' }))
    })

    // 리스너가 비활성(webdriver=false)이므로 모달 열리지 않음
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

// ══════════════════════════════════════════════════════════════════════════════
// webdriver=true → 리스너 활성: 이벤트 디스패치 → 해당 모달 열림
// ══════════════════════════════════════════════════════════════════════════════

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
    // 초기 상태: 모달 닫힘
    expect(container.querySelector('.wn-overlay')).toBeFalsy()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('agentdeck:test-open', { detail: 'whatsnew' }))
    })

    // 리스너 활성 → setWhatsNewOpen(true) → WhatsNew(open=true) 렌더
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

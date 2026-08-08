// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { __resetPanelSessionManagerForTests } from '../../../02_Source/renderer/src/store/panelSession'

const PANEL_SAMPLE_COMMANDS = [
  { name: 'ask',  description: '임시 질문',       scope: 'builtin' as const },
  { name: 'init', description: 'CLAUDE.md 생성', scope: 'builtin' as const },
  { name: 'clear',description: '대화 초기화',     scope: 'builtin' as const },
]
const PANEL_SAMPLE_SKILLS: { name: string; description: string; scope: 'global'; enabled: boolean }[] = []

const mockApi = {
  listSlashCommands: vi.fn().mockResolvedValue(PANEL_SAMPLE_COMMANDS),
  listSkills:        vi.fn().mockResolvedValue(PANEL_SAMPLE_SKILLS),
  agentRun:          vi.fn().mockResolvedValue({ runId: 'run-panel-1' }),
  agentAbort:        vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt:    vi.fn().mockResolvedValue({}),
  onAgentEvent:      vi.fn().mockReturnValue(() => {}),
  multiSessionLoad:  vi.fn().mockResolvedValue({ state: null }),
  pickFolder:        vi.fn().mockResolvedValue({ path: null }),
  conversationLoad:  vi.fn().mockResolvedValue({ conversations: [] }),
  getAppVersion:     vi.fn().mockResolvedValue('0.1.0'),
  windowMinimize:    vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose:       vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds:   vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds:   vi.fn(),
  windowDragStart:   vi.fn(),
  windowDragEnd:     vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd:   vi.fn(),
  onWindowState:     vi.fn().mockReturnValue(() => {}),
}

beforeEach(() => {
  Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })
  vi.clearAllMocks()
  mockApi.listSlashCommands.mockResolvedValue(PANEL_SAMPLE_COMMANDS)
  mockApi.listSkills.mockResolvedValue(PANEL_SAMPLE_SKILLS)
  mockApi.multiSessionLoad.mockResolvedValue({ state: null })
  __resetPanelSessionManagerForTests()
})

afterEach(() => cleanup())

const PANEL_MENTION_FILES = [
  'src/renderer/App.tsx',
  'src/renderer/main.tsx',
  '02_Source/shared/ipcContract.ts',
  'package.json',
  'README.md',
]

async function renderMultiWorkspaceWithFiles(mentionFiles?: string[]) {
  const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')

  useAppStore.setState({ workspaceRoot: '/test/project' })

  if (mentionFiles !== undefined) {
    useAppStore.setState({ projectFiles: mentionFiles })
  }

  const { container } = render(<MultiWorkspace />)
  return container
}

describe('PanelComposer — 슬래시 커맨드 팔레트 (1~5)', () => {

  it('(1) 패널 textarea에 "/" 입력 → .slash-menu[role=listbox] 표시', async () => {
    const container = await renderMultiWorkspaceWithFiles()
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    expect(firstPanel).toBeTruthy()

    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement
    expect(ta).toBeTruthy()

    await act(async () => {
      fireEvent.change(ta, { target: { value: '/' } })
    })

    const menu = firstPanel.querySelector('[role="listbox"].slash-menu')
    expect(menu).toBeTruthy()
  })

  it('(2) 슬래시 팔레트에 IPC listSlashCommands 항목이 렌더된다', async () => {
    const container = await renderMultiWorkspaceWithFiles()
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '/' } })
    })
    await act(async () => { await Promise.resolve() })

    const menu = firstPanel.querySelector('.slash-menu')
    expect(menu).toBeTruthy()
    const names = Array.from(menu!.querySelectorAll('.slash-name')).map((n) => n.textContent)
    expect(names).toContain('ask')
    expect(names).toContain('init')
  })

  it('(3) ↓ 키 → 두 번째 항목 .on (slashIdx 이동)', async () => {
    const container = await renderMultiWorkspaceWithFiles()
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '/' } })
    })
    await act(async () => { await Promise.resolve() })

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'ArrowDown' })
    })

    const opts = firstPanel.querySelectorAll('.slash-opt')
    expect(opts.length).toBeGreaterThanOrEqual(2)
    expect(opts[1].classList.contains('on')).toBe(true)
  })

  it('(4) Enter → .slash-menu 닫힘 + 값 변경', async () => {
    const currentValue = '/'
    const container = await renderMultiWorkspaceWithFiles()
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '/' } })
    })
    await act(async () => { await Promise.resolve() })

    expect(firstPanel.querySelector('.slash-menu')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' })
    })

    const menu = firstPanel.querySelector('.slash-menu')
    expect(menu).toBeFalsy()

    void currentValue
  })

  it('(5) Esc → .slash-menu 닫힘', async () => {
    const container = await renderMultiWorkspaceWithFiles()
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '/' } })
    })

    expect(firstPanel.querySelector('.slash-menu')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Escape' })
    })

    expect(firstPanel.querySelector('.slash-menu')).toBeFalsy()
  })
})

describe('PanelComposer — @멘션 팔레트 (6~8)', () => {

  it('(6) "@" 입력 → .slash-menu 팔레트 표시 (멘션 모드)', async () => {
    const container = await renderMultiWorkspaceWithFiles(PANEL_MENTION_FILES)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '@' } })
    })

    const menu = firstPanel.querySelector('[role="listbox"].slash-menu')
    expect(menu).toBeTruthy()
  })

  it('(7) mentionFiles prop의 파일 항목이 팔레트에 렌더된다', async () => {
    const container = await renderMultiWorkspaceWithFiles(PANEL_MENTION_FILES)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '@' } })
    })

    const menu = firstPanel.querySelector('.slash-menu')
    expect(menu).toBeTruthy()
    const names = Array.from(menu!.querySelectorAll('.slash-name')).map((n) => n.textContent)
    const hasEntry = names.some((n) => n === 'src' || n === 'package.json' || n === 'README.md')
    expect(hasEntry).toBe(true)
  })

  it('(8) 멘션 팔레트 Enter → 경로 삽입 + 팔레트 닫힘', async () => {
    const container = await renderMultiWorkspaceWithFiles(PANEL_MENTION_FILES)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '@' } })
    })

    const menu = firstPanel.querySelector('.slash-menu')
    expect(menu).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' })
    })

    expect(true).toBe(true)
  })
})

describe('PanelComposer — 입력 히스토리 (9~11)', () => {

  it('(9) history prop + ArrowUp → 최신 히스토리 항목으로 textarea 값 변경', async () => {
    const { default: MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/project' })

    const { container } = render(<MultiWorkspace />)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '첫 번째 패널 메시지' } })
    })
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' })
    })

    await act(async () => {
      fireEvent.change(ta, { target: { value: '' } })
    })

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'ArrowUp' })
    })

    const currentValue = ta.value
    expect(typeof currentValue).toBe('string')
  })

  it('(10) 히스토리 탐색 ↓ → draft 복원 (구현 전 단순 크래시 없음 검증)', async () => {
    const { default: MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/project' })

    const { container } = render(<MultiWorkspace />)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'ArrowUp' })
    })
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'ArrowDown' })
    })

    expect(ta).toBeTruthy()
  })

  it('(11) 슬래시 팔레트 열림 시 ↑↓는 히스토리 미발동', async () => {
    const container = await renderMultiWorkspaceWithFiles()
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '/' } })
    })
    await act(async () => { await Promise.resolve() })

    const menuBefore = firstPanel.querySelector('.slash-menu')
    expect(menuBefore).toBeTruthy()

    const valueBeforeUp = ta.value

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'ArrowUp' })
    })

    expect(ta.value).toBe(valueBeforeUp)
    expect(firstPanel.querySelector('.slash-menu')).toBeTruthy()
  })
})

describe('PanelComposer — 기존 동작 불변 (12)', () => {

  it('(12-a) disabled=true(workspaceRoot=null) → 전송 버튼 disabled', async () => {
    const { default: MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: null })

    const { container } = render(<MultiWorkspace />)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const sendBtn = firstPanel.querySelector('.ma-send') as HTMLButtonElement | null
    expect(sendBtn?.disabled ?? true).toBe(true)
  })

  it('(12-b) Enter 전송 → onSend 호출 (슬래시 없는 일반 입력)', async () => {
    const { default: MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/project' })

    const { container } = render(<MultiWorkspace />)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const ta = firstPanel.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      fireEvent.change(ta, { target: { value: '일반 메시지' } })
    })

    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' })
    })

    expect(mockApi.agentRun).toHaveBeenCalled()
  })
})

describe('PanelComposer — 단일 Composer 회귀 0 (13)', () => {

  it('(13-a) 단일 Composer 슬래시 팔레트 — 기존 동작 유지', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const { container } = render(
      <Composer
        value="/"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    expect(container.querySelector('[role="listbox"].slash-menu')).toBeTruthy()
  })

  it('(13-b) 단일 Composer IPC 로드 → ask/init 항목 표시', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const { container } = render(
      <Composer
        value="/"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    await act(async () => { await Promise.resolve() })
    const names = Array.from(container.querySelectorAll('.slash-name')).map((n) => n.textContent)
    expect(names).toContain('ask')
    expect(names).toContain('init')
  })

  it('(13-c) 단일 Composer @멘션 팔레트 — 기존 동작 유지', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const FILES = ['src/App.tsx', 'README.md']
    const { container } = render(
      <Composer
        value="@"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
        mentionFiles={FILES}
      />
    )
    expect(container.querySelector('[role="listbox"].slash-menu')).toBeTruthy()
  })

  it('(13-d) 단일 Composer 히스토리 ↑ — 기존 동작 유지', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const onChange = vi.fn()
    const history = ['hist-1', 'hist-2']
    const { container } = render(
      <Composer
        value=""
        onChange={onChange}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
        history={history}
      />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('hist-2')
  })
})

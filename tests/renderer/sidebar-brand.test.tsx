// @vitest-environment jsdom
/**
 * sidebar-brand.test.tsx — 사이드바 상단 브랜딩 TDD.
 *
 * 요구사항:
 *   - .sb-name이 "AgentDeck"으로 시작해야 한다 (워크스페이스 폴더명이 아님).
 *   - getAppVersion() IPC mock이 "0.1.0"을 반환하면 .sb-name이 "AgentDeck 0.1.0"을 표시.
 *   - 버전 로드 전(빈 문자열) graceful — "AgentDeck"만 표시.
 *   - .sb-name에 workspaceRoot 폴더명이 노출되지 않아야 한다.
 *   - .sb-sub는 여전히 "Claude Code"를 표시한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store/appStore'
import type { ConversationRecord } from '../../src/shared/ipc-contract'

// ── window.api stub ──────────────────────────────────────────────────────────
const mockGetAppVersion = vi.fn().mockResolvedValue('0.1.0')

const mockApi = {
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
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  getAppVersion: mockGetAppVersion,
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── store 기본 레코드 ─────────────────────────────────────────────────────────
const DUMMY_RECORDS: ConversationRecord[] = [
  {
    id: 'c1',
    title: '테스트 대화',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

function patchStore(overrides: Record<string, unknown> = {}): void {
  useAppStore.setState({
    conversations: DUMMY_RECORDS,
    conversationId: 'c1',
    isRunning: false,
    profile: null,
    workspaceRoot: '/some/project/myapp',
    listConversations: vi.fn().mockResolvedValue(undefined),
    selectConversation: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    newConversation: vi.fn(),
    ...overrides,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderSidebar(): Promise<HTMLElement> {
  const { Sidebar } = await import('../../src/renderer/src/components/00_shell/Sidebar')
  let container!: HTMLElement
  await act(async () => {
    const result = render(
      <Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />,
    )
    container = result.container
  })
  return container
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAppVersion.mockResolvedValue('0.1.0')
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', profile: null, workspaceRoot: null })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('사이드바 브랜딩 — .sb-name', () => {
  it('[RED→GREEN] getAppVersion IPC mock "0.1.0" 반환 시 .sb-name이 "AgentDeck 0.1.0"을 표시한다', async () => {
    patchStore()
    const container = await renderSidebar()
    // 버전 로드 완료 대기 (IPC 비동기)
    await waitFor(() => {
      const nameEl = container.querySelector('.sb-name')
      expect(nameEl?.textContent).toMatch(/AgentDeck\s*0\.1\.0/)
    })
  })

  it('[RED→GREEN] .sb-name이 "AgentDeck"으로 시작한다', async () => {
    patchStore()
    const container = await renderSidebar()
    await waitFor(() => {
      const nameEl = container.querySelector('.sb-name')
      expect(nameEl?.textContent).toMatch(/^AgentDeck/)
    })
  })

  it('[RED→GREEN] workspaceRoot="/some/project/myapp" 이더라도 .sb-name에 "myapp" 폴더명이 노출되지 않는다', async () => {
    patchStore({ workspaceRoot: '/some/project/myapp' })
    const container = await renderSidebar()
    await waitFor(() => {
      const nameEl = container.querySelector('.sb-name')
      // 버전이 로드되면 wsName 분기 없이 AgentDeck {version}만 표시
      expect(nameEl?.textContent).not.toContain('myapp')
    })
  })

  it('[RED→GREEN] getAppVersion IPC가 실패(reject)해도 .sb-name이 "AgentDeck"을 표시한다(graceful)', async () => {
    mockGetAppVersion.mockRejectedValueOnce(new Error('IPC fail'))
    patchStore()
    const container = await renderSidebar()
    // IPC 실패 시 graceful — "AgentDeck" 노출, 크래시 없음
    await waitFor(() => {
      const nameEl = container.querySelector('.sb-name')
      expect(nameEl?.textContent).toMatch(/^AgentDeck/)
    })
  })

  it('[RED→GREEN] getAppVersion IPC가 빈 문자열을 반환하면 "AgentDeck"만 표시한다', async () => {
    mockGetAppVersion.mockResolvedValueOnce('')
    patchStore()
    const container = await renderSidebar()
    await waitFor(() => {
      const nameEl = container.querySelector('.sb-name')
      expect(nameEl?.textContent?.trim()).toBe('AgentDeck')
    })
  })

  it('[RED→GREEN] .sb-sub가 "Claude Code"를 표시한다 (엔진 표시 유지)', async () => {
    patchStore()
    const container = await renderSidebar()
    const subEl = container.querySelector('.sb-sub')
    expect(subEl?.textContent).toBe('Claude Code')
  })

  it('[RED→GREEN] .sb-name title 속성에 workspaceRoot 경로가 없다', async () => {
    patchStore({ workspaceRoot: '/some/project/myapp' })
    const container = await renderSidebar()
    await waitFor(() => {
      const nameEl = container.querySelector('.sb-name') as HTMLElement | null
      const title = nameEl?.getAttribute('title') ?? ''
      expect(title).not.toContain('/some/project/myapp')
      expect(title).not.toContain('myapp')
    })
  })
})

// @vitest-environment jsdom
/**
 * sidebar-multi-mode.test.tsx — Sidebar 모드별 분기 TDD 테스트.
 *
 * TDD 원칙: 먼저 작성 → RED → 구현 후 GREEN.
 *
 * 검증 범위:
 *   - mode='single': 기존 conversations 렌더(회귀 0), 단일챗 액션 호출
 *   - mode='multi': multiSessions 렌더(단일챗 conversations 아님), 멀티 액션 호출
 *   - mode='multi': 빈 제목은 '새 작업' fallback
 *   - mode='multi': 활성표시 = activeMultiSessionId
 *   - mode='multi': "새 작업" 버튼 클릭 → newMultiSession() 호출
 *   - mode='multi': 행 클릭 → selectMultiSession(id) 호출
 *   - mode='multi': rename → renameMultiSession(id, title) 호출
 *   - mode='multi': delete 확인 → deleteMultiSession(id) 호출
 *   - mode='multi': 마운트 시 loadMultiSessions() 호출
 *   - 모드 전환 시 회귀 없음: single→multi→single에서 행 목록 올바름
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store/appStore'
import type { ConversationRecord } from '../../src/shared/ipc-contract'

// ── window.api stub ───────────────────────────────────────────────────────────
const mockApi = {
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn(),
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
  conversationSave: vi.fn().mockResolvedValue({ id: 'new-id' }),
  conversationDelete: vi.fn().mockResolvedValue({ ok: true }),
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'not-found' }),
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
  // 멀티세션 IPC stub (direct-call 검증용 — store 액션 mock이 우선)
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiSessionSave: vi.fn().mockResolvedValue({ ok: true }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 샘플 데이터 ───────────────────────────────────────────────────────────────

const SINGLE_CONVS: ConversationRecord[] = [
  {
    id: 'c1',
    title: '단일채팅1',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  },
  {
    id: 'c2',
    title: '단일채팅2',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:01:00Z',
  },
]

const MULTI_SESSIONS = [
  { id: 'ms1', title: '멀티작업1', count: 2 as const },
  { id: 'ms2', title: '멀티작업2', count: 2 as const },
]

// ── store action mocks ────────────────────────────────────────────────────────

const mockLoadMultiSessions = vi.fn().mockResolvedValue(undefined)
const mockNewMultiSession = vi.fn().mockResolvedValue(undefined)
const mockSelectMultiSession = vi.fn().mockResolvedValue(undefined)
const mockDeleteMultiSession = vi.fn().mockResolvedValue(undefined)
const mockRenameMultiSession = vi.fn().mockResolvedValue(undefined)
const mockListConversations = vi.fn().mockResolvedValue(undefined)
const mockSelectConversation = vi.fn().mockResolvedValue(undefined)
const mockNewConversation = vi.fn()
const mockDeleteConversation = vi.fn().mockResolvedValue(undefined)
const mockRenameConversation = vi.fn().mockResolvedValue(undefined)

// ── store 패치 헬퍼 ───────────────────────────────────────────────────────────

function patchSingleMode(): void {
  useAppStore.setState({
    workspaceMode: 'single',
    conversations: SINGLE_CONVS,
    conversationId: 'c1',
    multiSessions: MULTI_SESSIONS,
    activeMultiSessionId: 'ms1',
    listConversations: mockListConversations,
    selectConversation: mockSelectConversation,
    newConversation: mockNewConversation,
    deleteConversation: mockDeleteConversation,
    renameConversation: mockRenameConversation,
    loadMultiSessions: mockLoadMultiSessions,
    newMultiSession: mockNewMultiSession,
    selectMultiSession: mockSelectMultiSession,
    deleteMultiSession: mockDeleteMultiSession,
    renameMultiSession: mockRenameMultiSession,
  } as Parameters<typeof useAppStore.setState>[0])
}

function patchMultiMode(): void {
  useAppStore.setState({
    workspaceMode: 'multi',
    conversations: SINGLE_CONVS,
    conversationId: 'c1',
    multiSessions: MULTI_SESSIONS,
    activeMultiSessionId: 'ms1',
    listConversations: mockListConversations,
    selectConversation: mockSelectConversation,
    newConversation: mockNewConversation,
    deleteConversation: mockDeleteConversation,
    renameConversation: mockRenameConversation,
    loadMultiSessions: mockLoadMultiSessions,
    newMultiSession: mockNewMultiSession,
    selectMultiSession: mockSelectMultiSession,
    deleteMultiSession: mockDeleteMultiSession,
    renameMultiSession: mockRenameMultiSession,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── renderSidebar 헬퍼 ────────────────────────────────────────────────────────
async function renderSidebar(
  props: { onCollapse?: () => void; onOpenSettings?: () => void } = {},
): Promise<HTMLElement> {
  const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
  let container!: HTMLElement
  await act(async () => {
    const result = render(
      <Sidebar
        onCollapse={props.onCollapse ?? (() => {})}
        onOpenSettings={props.onOpenSettings ?? (() => {})}
      />,
    )
    container = result.container
  })
  return container
}

// ── 리셋 ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single' })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Sidebar mode=single: 기존 conversations 렌더 (회귀 0)', () => {
  it('mode=single → 단일챗 제목이 렌더된다', async () => {
    patchSingleMode()
    await renderSidebar()
    expect(screen.getByText('단일채팅1')).toBeTruthy()
    expect(screen.getByText('단일채팅2')).toBeTruthy()
  })

  it('mode=single → 멀티 세션 제목이 렌더되지 않는다', async () => {
    patchSingleMode()
    await renderSidebar()
    expect(screen.queryByText('멀티작업1')).toBeNull()
  })

  it('mode=single → sb-item 수 = conversations 수', async () => {
    patchSingleMode()
    const container = await renderSidebar()
    expect(container.querySelectorAll('.sb-item')).toHaveLength(SINGLE_CONVS.length)
  })

  it('mode=single → 새 버튼 클릭 시 newConversation() 호출', async () => {
    patchSingleMode()
    await renderSidebar()
    fireEvent.click(screen.getByLabelText('새 대화'))
    expect(mockNewConversation).toHaveBeenCalledOnce()
    expect(mockNewMultiSession).not.toHaveBeenCalled()
  })

  it('mode=single → 행 클릭 시 selectConversation(id) 호출', async () => {
    patchSingleMode()
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    fireEvent.click(items[1])
    expect(mockSelectConversation).toHaveBeenCalledWith('c2')
    expect(mockSelectMultiSession).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Sidebar mode=multi: multiSessions 렌더', () => {
  it('mode=multi → 멀티 세션 제목이 렌더된다', async () => {
    patchMultiMode()
    await renderSidebar()
    expect(screen.getByText('멀티작업1')).toBeTruthy()
    expect(screen.getByText('멀티작업2')).toBeTruthy()
  })

  it('mode=multi → 단일챗 제목이 렌더되지 않는다 (분리)', async () => {
    patchMultiMode()
    await renderSidebar()
    expect(screen.queryByText('단일채팅1')).toBeNull()
    expect(screen.queryByText('단일채팅2')).toBeNull()
  })

  it('mode=multi → sb-item 수 = multiSessions 수', async () => {
    patchMultiMode()
    const container = await renderSidebar()
    expect(container.querySelectorAll('.sb-item')).toHaveLength(MULTI_SESSIONS.length)
  })

  it('mode=multi → 빈 title은 "새 작업" fallback으로 sb-item에 표시된다', async () => {
    useAppStore.setState({
      workspaceMode: 'multi',
      multiSessions: [{ id: 'ms-empty', title: '', count: 2 }],
      activeMultiSessionId: 'ms-empty',
      conversations: [],
      loadMultiSessions: mockLoadMultiSessions,
      newMultiSession: mockNewMultiSession,
      selectMultiSession: mockSelectMultiSession,
      deleteMultiSession: mockDeleteMultiSession,
      renameMultiSession: mockRenameMultiSession,
      listConversations: mockListConversations,
      newConversation: mockNewConversation,
    } as Parameters<typeof useAppStore.setState>[0])
    const container = await renderSidebar()
    // sb-item 내 t1-text에 '새 작업' fallback이 표시됨
    const t1Texts = Array.from(container.querySelectorAll('.sb-item .t1-text'))
    expect(t1Texts.some((el) => el.textContent === '새 작업')).toBe(true)
  })

  it('mode=multi → activeMultiSessionId 행에 .active 클래스', async () => {
    patchMultiMode()
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    const activeItems = Array.from(items).filter((el) => el.classList.contains('active'))
    expect(activeItems).toHaveLength(1)
    expect(activeItems[0].querySelector('.t1-text')?.textContent).toBe('멀티작업1')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Sidebar mode=multi: 멀티 액션 호출', () => {
  it('mode=multi → 새 버튼 클릭 시 newMultiSession() 호출', async () => {
    patchMultiMode()
    await renderSidebar()
    // 새 작업 버튼 (aria-label='새 대화' 또는 버튼 텍스트로 찾기)
    const newBtn = screen.getByLabelText('새 대화')
    fireEvent.click(newBtn)
    expect(mockNewMultiSession).toHaveBeenCalledOnce()
    expect(mockNewConversation).not.toHaveBeenCalled()
  })

  it('mode=multi → 행 클릭 시 selectMultiSession(id) 호출', async () => {
    patchMultiMode()
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    fireEvent.click(items[1])
    expect(mockSelectMultiSession).toHaveBeenCalledWith('ms2')
    expect(mockSelectConversation).not.toHaveBeenCalled()
  })

  it('mode=multi → rename 시 renameMultiSession(id, title) 호출', async () => {
    patchMultiMode()
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)
    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)
    const input = container.querySelector('.sd-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '바뀐 이름' } })
    const saveBtn = container.querySelector('.sd-go') as HTMLElement
    fireEvent.click(saveBtn)
    expect(mockRenameMultiSession).toHaveBeenCalledWith('ms1', '바뀐 이름')
    expect(mockRenameConversation).not.toHaveBeenCalled()
  })

  it('mode=multi → delete 확인 시 deleteMultiSession(id) 호출', async () => {
    patchMultiMode()
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)
    const deleteBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('삭제'),
    ) as HTMLElement
    fireEvent.click(deleteBtn)
    const confirmBtn = container.querySelector('.sd-go.danger') as HTMLElement
    fireEvent.click(confirmBtn)
    expect(mockDeleteMultiSession).toHaveBeenCalledWith('ms1')
    expect(mockDeleteConversation).not.toHaveBeenCalled()
  })

  it('mode=multi → 마운트 시 loadMultiSessions() 호출', async () => {
    patchMultiMode()
    await renderSidebar()
    expect(mockLoadMultiSessions).toHaveBeenCalledOnce()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Sidebar mode=multi: 프롬프트 설정 항목 없음 (멀티 ctx-menu)', () => {
  it('mode=multi → ctx-menu에 프롬프트 설정 항목이 없다', async () => {
    patchMultiMode()
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)
    const ctxMenu = container.querySelector('.ctx-menu')!
    const texts = Array.from(ctxMenu.querySelectorAll('.ctx-item')).map((el) => el.textContent ?? '')
    expect(texts.some((t) => t.includes('프롬프트 설정'))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('Sidebar: 모드 전환 회귀 없음', () => {
  it('single→multi 전환 시 멀티 목록이 즉시 렌더된다', async () => {
    patchSingleMode()
    const container = await renderSidebar()
    // 초기 single: 단일챗
    expect(screen.getByText('단일채팅1')).toBeTruthy()
    // 멀티 탭 클릭
    const tabs = screen.getAllByRole('tab')
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!
    fireEvent.click(multiTab)
    // 멀티 목록 렌더
    expect(screen.getByText('멀티작업1')).toBeTruthy()
    // 단일챗 사라짐
    expect(screen.queryByText('단일채팅1')).toBeNull()
    void container
  })
})

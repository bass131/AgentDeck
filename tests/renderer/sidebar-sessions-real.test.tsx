// @vitest-environment jsdom
/**
 * sidebar-sessions-real.test.tsx — M4-3 sub-wave 23c: 사이드바 실데이터 TDD.
 *
 * 검증 범위:
 *   - store conversations → Sidebar 행 표시 (SAMPLE_SESSIONS 0).
 *   - 빈 title fallback → '새 채팅'.
 *   - 행 클릭 → selectConversation(id) 호출.
 *   - "새 대화" 클릭 → newConversation() 호출.
 *   - ctx-menu/다이얼로그 경유 rename → renameConversation(id, '새이름') 호출.
 *   - delete 확인 → deleteConversation(id) 호출.
 *   - 마운트 시 listConversations() 호출.
 *   - 활성 행 = conversationId 일치 (.active 클래스).
 *   - SAMPLE_SESSIONS 텍스트(고유 제목)가 렌더에서 보이지 않음.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store/appStore'
import type { ConversationRecord } from '../../src/shared/ipc-contract'

// ── window.api 최소 stub ──────────────────────────────────────────────────────
const mockListConversations = vi.fn().mockResolvedValue(undefined)
const mockSelectConversation = vi.fn().mockResolvedValue(undefined)
const mockRenameConversation = vi.fn().mockResolvedValue(undefined)
const mockDeleteConversation = vi.fn().mockResolvedValue(undefined)
const mockNewConversation = vi.fn()

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
  // 브랜딩: Sidebar 마운트 시 getAppVersion() IPC 호출 대응
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 샘플 대화 레코드 ──────────────────────────────────────────────────────────
const SAMPLE_RECORDS: ConversationRecord[] = [
  {
    id: 'c1',
    title: '대화1',
    messages: [{ role: 'user', content: '안녕' }],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  },
  {
    id: 'c2',
    title: '',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:01:00Z',
  },
]

// ── store 패치 헬퍼 ───────────────────────────────────────────────────────────
function patchStore(overrides: Record<string, unknown> = {}): void {
  useAppStore.setState({
    workspaceMode: 'single',
    conversations: SAMPLE_RECORDS,
    conversationId: 'c1',
    messages: [],
    streamingText: '',
    isRunning: false,
    listConversations: mockListConversations,
    selectConversation: mockSelectConversation,
    renameConversation: mockRenameConversation,
    deleteConversation: mockDeleteConversation,
    newConversation: mockNewConversation,
    ...overrides,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── renderSidebar 헬퍼 ────────────────────────────────────────────────────────
async function renderSidebar(
  props: { onCollapse?: () => void; onOpenSettings?: () => void } = {},
) {
  // 모듈 캐시 초기화하지 않고 현재 모듈 사용
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

// ── 리셋 ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(() => {})
  mockListConversations.mockResolvedValue(undefined)
  mockSelectConversation.mockResolvedValue(undefined)
  mockRenameConversation.mockResolvedValue(undefined)
  mockDeleteConversation.mockResolvedValue(undefined)
  mockNewConversation.mockReset()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single' })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: store conversations → 행 표시', () => {
  it('store conversations의 title이 행으로 표시된다 (대화1)', async () => {
    patchStore()
    await renderSidebar()
    expect(screen.getByText('대화1')).toBeTruthy()
  })

  it('빈 title은 "새 채팅"으로 표시된다 (fallback)', async () => {
    patchStore()
    await renderSidebar()
    expect(screen.getByText('새 채팅')).toBeTruthy()
  })

  it('SAMPLE_SESSIONS 고유 텍스트("AuthService 리팩터링")가 렌더에 없다', async () => {
    patchStore()
    await renderSidebar()
    expect(screen.queryByText('AuthService 리팩터링')).toBeNull()
  })

  it('conversations 2개 → sb-item 2행 렌더', async () => {
    patchStore()
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    expect(items).toHaveLength(2)
  })

  it('conversations 빈 배열 → "아직 채팅이 없어요" 빈 상태 표시', async () => {
    patchStore({ conversations: [] })
    await renderSidebar()
    expect(screen.getByText('아직 채팅이 없어요')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: 마운트 시 listConversations 호출', () => {
  it('마운트 시 listConversations()가 호출된다', async () => {
    patchStore()
    await renderSidebar()
    expect(mockListConversations).toHaveBeenCalledOnce()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: 활성 행 = conversationId', () => {
  it('conversationId와 일치하는 행에 .active 클래스가 있다', async () => {
    patchStore({ conversationId: 'c1' })
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    const activeItems = Array.from(items).filter((el) => el.classList.contains('active'))
    expect(activeItems).toHaveLength(1)
    // 첫 번째 행(c1)이 active
    expect(activeItems[0].querySelector('.t1-text')?.textContent).toBe('대화1')
  })

  it('conversationId가 null이면 active 행이 없다', async () => {
    patchStore({ conversationId: null })
    const container = await renderSidebar()
    const activeItems = container.querySelectorAll('.sb-item.active')
    expect(activeItems).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: 행 클릭 → selectConversation', () => {
  it('행 클릭 시 selectConversation(id)가 호출된다', async () => {
    patchStore()
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    // 두 번째 행(c2) 클릭
    fireEvent.click(items[1])
    expect(mockSelectConversation).toHaveBeenCalledWith('c2')
  })

  it('첫 번째 행(c1) 클릭 시 selectConversation("c1") 호출', async () => {
    patchStore()
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    fireEvent.click(items[0])
    expect(mockSelectConversation).toHaveBeenCalledWith('c1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: "새 대화" 클릭 → newConversation', () => {
  it('"새 대화" 버튼 클릭 시 newConversation()이 호출된다', async () => {
    patchStore()
    await renderSidebar()
    const newBtn = screen.getByLabelText('새 대화')
    fireEvent.click(newBtn)
    expect(mockNewConversation).toHaveBeenCalledOnce()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: rename 다이얼로그 → renameConversation', () => {
  it('ctx-menu → 이름 변경 → 저장 시 renameConversation(id, 새이름) 호출', async () => {
    patchStore()
    const container = await renderSidebar()
    // 첫 번째 행 더보기 버튼 클릭
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    // ctx-menu 이름 변경 클릭
    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    // sd-input에 새 이름 입력
    const input = container.querySelector('.sd-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '새이름' } })

    // 저장 클릭
    const saveBtn = container.querySelector('.sd-go') as HTMLElement
    fireEvent.click(saveBtn)

    expect(mockRenameConversation).toHaveBeenCalledWith('c1', '새이름')
  })

  it('sd-input 기본값이 현재 행의 title이다', async () => {
    patchStore()
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    const input = container.querySelector('.sd-input') as HTMLInputElement
    // c1의 title은 '대화1'
    expect(input.value).toBe('대화1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: delete 다이얼로그 → deleteConversation', () => {
  it('ctx-menu → 삭제 → 확인 시 deleteConversation(id) 호출', async () => {
    patchStore()
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const deleteBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('삭제'),
    ) as HTMLElement
    fireEvent.click(deleteBtn)

    const confirmBtn = container.querySelector('.sd-go.danger') as HTMLElement
    fireEvent.click(confirmBtn)

    expect(mockDeleteConversation).toHaveBeenCalledWith('c1')
  })

  it('delete 취소 시 deleteConversation이 호출되지 않는다', async () => {
    patchStore()
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const deleteBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('삭제'),
    ) as HTMLElement
    fireEvent.click(deleteBtn)

    const cancelBtn = container.querySelector('.sd-cancel') as HTMLElement
    fireEvent.click(cancelBtn)

    expect(mockDeleteConversation).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: running status 매핑', () => {
  it('활성 대화 + isRunning=true → 해당 행 dot에 .run 클래스', async () => {
    patchStore({ conversationId: 'c1', isRunning: true })
    const container = await renderSidebar()
    // c1이 첫 번째 행
    const firstItem = container.querySelectorAll('.sb-item')[0]
    expect(firstItem.querySelector('.dot.run')).toBeTruthy()
  })

  it('비활성 대화는 isRunning=true여도 .run 클래스 없음', async () => {
    patchStore({ conversationId: 'c2', isRunning: true })
    const container = await renderSidebar()
    // c1은 비활성 → dot.run 없음
    const firstItem = container.querySelectorAll('.sb-item')[0]
    expect(firstItem.querySelector('.dot.run')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: SAMPLE_SESSIONS export 보호', () => {
  it('sidebarSampleData.SAMPLE_SESSIONS는 export 유지 (타 테스트 보호)', async () => {
    const { SAMPLE_SESSIONS } = await import('../../src/renderer/src/lib/sidebarSampleData')
    expect(Array.isArray(SAMPLE_SESSIONS)).toBe(true)
    expect(SAMPLE_SESSIONS.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('23c: window.api 직접 호출 0 (store 액션 경유)', () => {
  it('마운트 시 conversationLoad IPC가 직접 호출되지 않는다 (store mock 경유)', async () => {
    patchStore()
    await renderSidebar()
    // store의 listConversations가 mock이므로 window.api.conversationLoad는 호출 안 됨
    expect(mockApi.conversationLoad).not.toHaveBeenCalled()
  })
})

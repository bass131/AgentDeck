// @vitest-environment jsdom
/**
 * sidebar-sessions.test.tsx — F8 사이드바 세션 + 멀티 토글 TDD 테스트.
 *
 * F8-01: sb-mode 토글 · 세션 목록 행 · 검색 필터 · sb-foot 설정 트리거.
 * F8-02: ctx-menu · rename 다이얼로그 · delete 확인 다이얼로그.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store/appStore'
import type { ConversationRecord } from '../../src/shared/ipc-contract'

// M4-3 23c: Sidebar가 실 store conversations를 사용하므로
// 기존 F8 테스트가 SAMPLE_SESSIONS 기반 행을 기대하는 경우
// 동등한 ConversationRecord[]를 store에 주입한다.
// SAMPLE_SESSIONS에서 파생: id/title/status/hasPrompt 유지 (createdAt 등 더미)
const SAMPLE_AS_RECORDS: ConversationRecord[] = [
  { id: 'sess-1', title: 'AuthService 리팩터링', messages: [], backendId: 'claude-code', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sess-2', title: 'DB 마이그레이션 스크립트', messages: [], backendId: 'claude-code', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sess-3', title: 'UI 컴포넌트 테스트 작성', messages: [], backendId: 'claude-code', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sess-4', title: 'API 문서 자동 생성', messages: [], backendId: 'claude-code', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'sess-5', title: 'CI/CD 파이프라인 설정', messages: [], backendId: 'claude-code', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
]

beforeEach(() => {
  // store에 SAMPLE_SESSIONS 기반 conversations 주입.
  // listConversations를 no-op spy로 대체 — conversationLoad 없이도 크래시 없음.
  // renameConversation/deleteConversation은 로컬 conversations를 직접 갱신하는 stub으로.
  // 멀티세션 1단계: loadMultiSessions는 no-op, multiSessions는 SAMPLE_AS_RECORDS 동등값.
  useAppStore.setState({
    conversations: [...SAMPLE_AS_RECORDS],
    conversationId: 'sess-1',
    isRunning: true,  // sess-1(active) → status=running, 나머지 idle
    // 멀티세션 슬라이스: 멀티 탭 클릭 시 sb-item이 렌더되도록 주입
    multiSessions: SAMPLE_AS_RECORDS.map((r) => ({ id: r.id, title: r.title, count: 2 })),
    activeMultiSessionId: 'sess-1',
    listConversations: async () => {},
    loadMultiSessions: async () => {},
    selectConversation: async (id: string) => {
      useAppStore.setState({ conversationId: id })
    },
    renameConversation: async (id: string, title: string) => {
      useAppStore.setState((s) => ({
        conversations: s.conversations.map((c) => c.id === id ? { ...c, title } : c),
      }))
    },
    deleteConversation: async (id: string) => {
      useAppStore.setState((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
      }))
    },
    newConversation: () => {
      useAppStore.setState({ conversationId: null, messages: [] })
    },
  } as Parameters<typeof useAppStore.setState>[0])
})

afterEach(() => {
  cleanup()
  // F13: store 격리 — workspaceMode 전역 상태를 케이스간 동기 리셋
  // (Sidebar mode가 로컬→store로 이전됐으므로 케이스간 누수 차단 필수)
  useAppStore.setState({ workspaceMode: 'single' })
})

// window.api 없이도 Sidebar가 렌더되게 모킹
// M4-3 23c: listConversations useEffect 대응 — conversationLoad stub 추가.
// 멀티세션 1단계: loadMultiSessions useEffect 대응 — multiSessionLoad/Save stub 추가.
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
  // 23c: Sidebar 마운트 시 listConversations() → conversationLoad() 경유
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  // 브랜딩: Sidebar 마운트 시 getAppVersion() IPC 호출 대응
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
  // 멀티세션 1단계: loadMultiSessions() → multiSessionLoad IPC 경유
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiSessionSave: vi.fn().mockResolvedValue({ ok: true }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 헬퍼 ──────────────────────────────────────────────────────────────────
async function renderSidebar(
  props: { onCollapse?: () => void; onOpenSettings?: () => void } = {},
) {
  const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
  const { container } = render(
    <Sidebar
      onCollapse={props.onCollapse ?? (() => {})}
      onOpenSettings={props.onOpenSettings ?? (() => {})}
    />,
  )
  return container
}

// ══════════════════════════════════════════════════════════════════════════
describe('F8-01: sb-mode 토글', () => {
  it('단일/멀티 에이전트 탭 버튼 2개를 렌더한다', async () => {
    await renderSidebar()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
  })

  it('초기에 단일 에이전트 탭이 aria-selected=true이다', async () => {
    await renderSidebar()
    const tabs = screen.getAllByRole('tab')
    const singleTab = tabs.find((t) => t.textContent?.includes('단일'))
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))
    expect(singleTab?.getAttribute('aria-selected')).toBe('true')
    expect(multiTab?.getAttribute('aria-selected')).toBe('false')
  })

  it('멀티 탭 클릭 시 aria-selected 전환', async () => {
    await renderSidebar()
    const tabs = screen.getAllByRole('tab')
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!
    fireEvent.click(multiTab)
    expect(multiTab.getAttribute('aria-selected')).toBe('true')
    const singleTab = tabs.find((t) => t.textContent?.includes('단일'))!
    expect(singleTab.getAttribute('aria-selected')).toBe('false')
  })

  it('단일→멀티→단일 순환 전환', async () => {
    await renderSidebar()
    const tabs = screen.getAllByRole('tab')
    const singleTab = tabs.find((t) => t.textContent?.includes('단일'))!
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!

    fireEvent.click(multiTab)
    expect(multiTab.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(singleTab)
    expect(singleTab.getAttribute('aria-selected')).toBe('true')
    expect(multiTab.getAttribute('aria-selected')).toBe('false')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8-01: sb-new 활성 + 세션 목록', () => {
  it('새 대화 버튼이 활성(disabled 아님)이다', async () => {
    await renderSidebar()
    // F8에서 비활성 제거 — aria-label은 '새 대화'
    const newBtn = screen.getByLabelText('새 대화')
    expect((newBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('샘플 세션 행 4개 이상이 렌더된다 (sb-item)', async () => {
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    expect(items.length).toBeGreaterThanOrEqual(4)
  })

  it('각 sb-item에 dot 상태 표시자가 있다', async () => {
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    items.forEach((item) => {
      expect(item.querySelector('.dot')).toBeTruthy()
    })
  })

  it('각 sb-item에 t1 제목 텍스트가 있다', async () => {
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    items.forEach((item) => {
      expect(item.querySelector('.t1')).toBeTruthy()
      expect(item.querySelector('.t1-text')).toBeTruthy()
    })
  })

  it('hasPrompt 세션에 pr-mark가 렌더된다 (23c: MVP에서 hasPrompt 고정 false — pr-mark 0개)', async () => {
    // M4-3 23c: toSessionSummary에서 hasPrompt: false 고정 (per-session 프롬프트 MVP 범위 외).
    // 실데이터 배선 후 pr-mark는 렌더되지 않으므로 0개를 단언한다.
    const container = await renderSidebar()
    const prMarks = container.querySelectorAll('.pr-mark')
    expect(prMarks.length).toBe(0)
  })

  it('running 세션에 t2 상태 부텍스트가 있다', async () => {
    const container = await renderSidebar()
    const t2Elements = container.querySelectorAll('.sb-item .t2')
    expect(t2Elements.length).toBeGreaterThanOrEqual(1)
  })

  it('각 sb-item에 more 버튼이 있다', async () => {
    const container = await renderSidebar()
    const items = container.querySelectorAll('.sb-item')
    items.forEach((item) => {
      expect(item.querySelector('.more')).toBeTruthy()
    })
  })

  it('running 상태 dot에 .run 클래스가 있다', async () => {
    const container = await renderSidebar()
    const runDot = container.querySelector('.dot.run')
    expect(runDot).toBeTruthy()
  })

  it('done 상태 dot에 .done 클래스가 있다 (23c: MVP status는 running|idle만 — done dot 없음)', async () => {
    // M4-3 23c: toSessionSummary에서 status는 running(활성+실행중) 또는 idle만.
    // done status는 실데이터에서 사용되지 않음(MVP). dot.done은 0개.
    const container = await renderSidebar()
    const doneDot = container.querySelector('.dot.done')
    expect(doneDot).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8-01: 검색 필터', () => {
  it('검색 입력이 존재한다', async () => {
    await renderSidebar()
    expect(screen.getByLabelText('대화 검색')).toBeTruthy()
  })

  it('검색어 입력 시 일치 세션만 표시된다', async () => {
    const { SAMPLE_SESSIONS } = await import('../../src/renderer/src/lib/sidebarSampleData')
    const container = await renderSidebar()

    const input = screen.getByLabelText('대화 검색')
    // 첫 번째 세션 제목 앞 3글자로 검색
    const firstTitle = SAMPLE_SESSIONS[0].title.slice(0, 3)
    fireEvent.change(input, { target: { value: firstTitle } })

    const items = container.querySelectorAll('.sb-item')
    expect(items.length).toBeGreaterThanOrEqual(1)

    // 첫 번째 세션 제목이 포함되어야 함
    const firstTitleEl = screen.getByText(SAMPLE_SESSIONS[0].title)
    expect(firstTitleEl).toBeTruthy()
  })

  it('매칭 없는 검색어 입력 시 "검색 결과가 없어요" 빈 상태 표시', async () => {
    await renderSidebar()
    const input = screen.getByLabelText('대화 검색')
    fireEvent.change(input, { target: { value: '존재하지않는검색어xyz' } })
    expect(screen.getByText('검색 결과가 없어요')).toBeTruthy()
  })

  it('검색어 지우면 전체 목록 복원', async () => {
    const { SAMPLE_SESSIONS } = await import('../../src/renderer/src/lib/sidebarSampleData')
    const container = await renderSidebar()
    const input = screen.getByLabelText('대화 검색')

    fireEvent.change(input, { target: { value: '존재하지않는검색어xyz' } })
    fireEvent.change(input, { target: { value: '' } })

    const items = container.querySelectorAll('.sb-item')
    expect(items.length).toBe(SAMPLE_SESSIONS.length)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8-01: sb-foot 설정 트리거', () => {
  it('sb-foot이 버튼(또는 버튼 내부)으로 렌더되고 클릭 시 onOpenSettings 호출', async () => {
    const onOpenSettings = vi.fn()
    await renderSidebar({ onOpenSettings })

    const footBtn = screen.getByLabelText('설정 열기')
    fireEvent.click(footBtn)
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('sb-foot에 아바타(ava)와 이름이 표시된다', async () => {
    const container = await renderSidebar()
    expect(container.querySelector('.ava')).toBeTruthy()
    const whoEl = container.querySelector('.who .n')
    expect(whoEl).toBeTruthy()
    expect(whoEl?.textContent?.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8-02: ctx-menu', () => {
  it('more 버튼 클릭 시 ctx-menu가 표시된다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    expect(firstMore).toBeTruthy()
    fireEvent.click(firstMore)

    const ctxMenu = container.querySelector('.ctx-menu')
    expect(ctxMenu).toBeTruthy()
  })

  it('ctx-menu에 이름 변경·삭제 항목이 있다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const ctxMenu = container.querySelector('.ctx-menu')!
    const items = ctxMenu.querySelectorAll('.ctx-item')
    const texts = Array.from(items).map((i) => i.textContent ?? '')
    expect(texts.some((t) => t.includes('이름 변경'))).toBe(true)
    expect(texts.some((t) => t.includes('삭제'))).toBe(true)
  })

  it('단일모드에서 ctx-menu에 프롬프트 설정 항목이 있다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const ctxMenu = container.querySelector('.ctx-menu')!
    const texts = Array.from(ctxMenu.querySelectorAll('.ctx-item')).map((i) => i.textContent ?? '')
    expect(texts.some((t) => t.includes('프롬프트 설정'))).toBe(true)
  })

  it('멀티모드에서 ctx-menu에 프롬프트 설정 항목이 없다', async () => {
    const container = await renderSidebar()

    // 멀티 탭 선택
    const tabs = screen.getAllByRole('tab')
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!
    fireEvent.click(multiTab)

    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const ctxMenu = container.querySelector('.ctx-menu')!
    const texts = Array.from(ctxMenu.querySelectorAll('.ctx-item')).map((i) => i.textContent ?? '')
    expect(texts.some((t) => t.includes('프롬프트 설정'))).toBe(false)
  })

  it('sb-item 우클릭으로도 ctx-menu가 표시된다', async () => {
    const container = await renderSidebar()
    const firstItem = container.querySelector('.sb-item') as HTMLElement
    fireEvent.contextMenu(firstItem)

    const ctxMenu = container.querySelector('.ctx-menu')
    expect(ctxMenu).toBeTruthy()
  })

  it('Esc 키로 ctx-menu를 닫는다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)
    expect(container.querySelector('.ctx-menu')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(container.querySelector('.ctx-menu')).toBeFalsy()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8-02: rename 다이얼로그', () => {
  it('이름 변경 클릭 시 set-dialog-overlay와 sd-input이 표시된다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    expect(container.querySelector('.sd-input')).toBeTruthy()
  })

  it('sd-input에 현재 제목이 기본값으로 들어온다', async () => {
    const { SAMPLE_SESSIONS } = await import('../../src/renderer/src/lib/sidebarSampleData')
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    const input = container.querySelector('.sd-input') as HTMLInputElement
    expect(input.value).toBe(SAMPLE_SESSIONS[0].title)
  })

  it('sd-input 수정 후 저장 클릭 시 세션 제목이 변경된다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    const input = container.querySelector('.sd-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '새로운 제목 F8' } })

    const saveBtn = container.querySelector('.sd-go') as HTMLElement
    fireEvent.click(saveBtn)

    // 다이얼로그 닫힘
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    // 새 제목이 목록에 표시됨
    expect(screen.getByText('새로운 제목 F8')).toBeTruthy()
  })

  it('Enter 키로 저장 시 제목이 변경된다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    const input = container.querySelector('.sd-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Enter로 저장' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    expect(screen.getByText('Enter로 저장')).toBeTruthy()
  })

  it('취소 클릭 시 다이얼로그 닫힘(제목 무변경)', async () => {
    const { SAMPLE_SESSIONS } = await import('../../src/renderer/src/lib/sidebarSampleData')
    const originalTitle = SAMPLE_SESSIONS[0].title
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    const cancelBtn = container.querySelector('.sd-cancel') as HTMLElement
    fireEvent.click(cancelBtn)

    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    expect(screen.getByText(originalTitle)).toBeTruthy()
  })

  it('Esc로 rename 다이얼로그 닫힘', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const renameBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('이름 변경'),
    ) as HTMLElement
    fireEvent.click(renameBtn)

    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8-02: delete 다이얼로그', () => {
  it('삭제 클릭 시 확인 다이얼로그(sd-msg)가 표시된다', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const deleteBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('삭제'),
    ) as HTMLElement
    fireEvent.click(deleteBtn)

    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    expect(container.querySelector('.sd-msg')).toBeTruthy()
  })

  it('삭제 확인 클릭 시 해당 세션 행이 목록에서 제거된다', async () => {
    const container = await renderSidebar()
    const initialCount = container.querySelectorAll('.sb-item').length

    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const deleteBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('삭제'),
    ) as HTMLElement
    fireEvent.click(deleteBtn)

    // 삭제 확인(danger sd-go)
    const confirmBtn = container.querySelector('.sd-go.danger') as HTMLElement
    fireEvent.click(confirmBtn)

    // 다이얼로그 닫힘
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    // 행 1개 줄어듦
    const afterCount = container.querySelectorAll('.sb-item').length
    expect(afterCount).toBe(initialCount - 1)
  })

  it('삭제 취소 시 행이 유지된다', async () => {
    const container = await renderSidebar()
    const initialCount = container.querySelectorAll('.sb-item').length

    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const deleteBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('삭제'),
    ) as HTMLElement
    fireEvent.click(deleteBtn)

    const cancelBtn = container.querySelector('.sd-cancel') as HTMLElement
    fireEvent.click(cancelBtn)

    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    const afterCount = container.querySelectorAll('.sb-item').length
    expect(afterCount).toBe(initialCount)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F8: scope 안전 검증', () => {
  it('sidebarSampleData는 window.api 참조가 없어야 한다(정적 상수)', async () => {
    // import 자체가 성공하면 OK (window.api 호출 시 에러 났을 것)
    const data = await import('../../src/renderer/src/lib/sidebarSampleData')
    expect(data.SAMPLE_SESSIONS).toBeDefined()
    expect(Array.isArray(data.SAMPLE_SESSIONS)).toBe(true)
    expect(data.SAMPLE_USER).toBeDefined()
  })
})

// @vitest-environment jsdom
/**
 * sidebar-profile-foot.test.tsx — 사이드바 풋터 프로필 실배선 TDD.
 *
 * 버그: Sidebar.tsx sb-foot이 SAMPLE_USER 하드코딩을 사용하고
 *       store profile을 구독하지 않아 실 프로필이 반영되지 않는다.
 *
 * 검증 범위:
 *   - store profile { nickname:'QA테스터', color:'#ff6600' } 주입 → .sb-foot .n "QA테스터", 아바타 글자 "Q", style.background '#ff6600'.
 *   - profile null → SAMPLE_USER fallback("개발자", "D", "#6366f1").
 *   - 기존 onOpenSettings 동작 보존.
 *   - 시각/구조(.sb-foot/.ava/.who/.n) 보존.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord } from '../../../02.Source/shared/ipc-contract'

// ── window.api 최소 stub ──────────────────────────────────────────────────────
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
  // 브랜딩: Sidebar 마운트 시 getAppVersion() IPC 호출 대응
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── store 기본 레코드 (렌더 크래시 방지) ─────────────────────────────────────
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

// ── store 패치 헬퍼 ───────────────────────────────────────────────────────────
function patchStore(overrides: Record<string, unknown> = {}): void {
  useAppStore.setState({
    conversations: DUMMY_RECORDS,
    conversationId: 'c1',
    isRunning: false,
    profile: null,
    listConversations: vi.fn().mockResolvedValue(undefined),
    selectConversation: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    newConversation: vi.fn(),
    ...overrides,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── renderSidebar 헬퍼 ────────────────────────────────────────────────────────
async function renderSidebar(
  props: { onCollapse?: () => void; onOpenSettings?: () => void } = {},
) {
  const { Sidebar } = await import('../../../02.Source/renderer/src/components/00_shell/Sidebar')
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
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', profile: null })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('sb-foot 프로필 실배선', () => {
  it('store profile { nickname:"QA테스터" } 주입 시 .sb-foot .n 이 "QA테스터"를 표시한다', async () => {
    patchStore({ profile: { nickname: 'QA테스터', color: '#ff6600' } })
    const container = await renderSidebar()
    const nameEl = container.querySelector('.sb-foot .who .n')
    expect(nameEl).toBeTruthy()
    expect(nameEl?.textContent).toBe('QA테스터')
  })

  it('store profile { nickname:"QA테스터" } 주입 시 아바타 글자가 "Q"이다', async () => {
    patchStore({ profile: { nickname: 'QA테스터', color: '#ff6600' } })
    const container = await renderSidebar()
    const avaEl = container.querySelector('.sb-foot .ava')
    expect(avaEl).toBeTruthy()
    expect(avaEl?.textContent?.trim()).toBe('Q')
  })

  it('store profile { color:"#ff6600" } 주입 시 아바타 background 인라인 스타일이 profile color를 사용한다', async () => {
    patchStore({ profile: { nickname: 'QA테스터', color: '#ff6600' } })
    const container = await renderSidebar()
    const avaEl = container.querySelector('.sb-foot .ava') as HTMLElement | null
    expect(avaEl).toBeTruthy()
    // jsdom은 hex → rgb() 변환하므로 rgb(255, 102, 0) 또는 원본 hex 모두 허용
    const bg = avaEl?.style.background || avaEl?.style.backgroundColor
    // profile color가 반영되면 SAMPLE_USER fallback(#6366f1=rgb(99,102,241))과 달라야 함
    expect(bg).not.toContain('99, 102, 241')
    expect(bg?.length).toBeGreaterThan(0)
  })

  it('profile null 시 .sb-foot .n 이 SAMPLE_USER fallback("개발자")를 표시한다', async () => {
    patchStore({ profile: null })
    const container = await renderSidebar()
    const nameEl = container.querySelector('.sb-foot .who .n')
    expect(nameEl).toBeTruthy()
    expect(nameEl?.textContent).toBe('개발자')
  })

  it('profile null 시 아바타 글자가 SAMPLE_USER fallback("D")이다', async () => {
    patchStore({ profile: null })
    const container = await renderSidebar()
    const avaEl = container.querySelector('.sb-foot .ava')
    expect(avaEl).toBeTruthy()
    expect(avaEl?.textContent?.trim()).toBe('D')
  })

  it('profile null 시 아바타 background 인라인 스타일이 SAMPLE_USER fallback 색(#6366f1)을 포함한다', async () => {
    patchStore({ profile: null })
    const container = await renderSidebar()
    const avaEl = container.querySelector('.sb-foot .ava') as HTMLElement | null
    expect(avaEl).toBeTruthy()
    // jsdom은 hex → rgb() 변환: #6366f1 = rgb(99, 102, 241)
    const bg = avaEl?.style.background || avaEl?.style.backgroundColor
    expect(bg).toContain('99, 102, 241')
  })

  it('profile nickname 앞뒤 공백이 있어도 첫 글자 대문자가 아바타에 표시된다', async () => {
    patchStore({ profile: { nickname: '  홍길동  ', color: '#abc' } })
    const container = await renderSidebar()
    const avaEl = container.querySelector('.sb-foot .ava')
    expect(avaEl?.textContent?.trim()).toBe('홍')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('sb-foot 구조·동작 보존', () => {
  it('.sb-foot 버튼이 존재한다', async () => {
    patchStore()
    const container = await renderSidebar()
    expect(container.querySelector('.sb-foot')).toBeTruthy()
  })

  it('.sb-foot 클릭 시 onOpenSettings가 호출된다', async () => {
    patchStore()
    const onOpenSettings = vi.fn()
    await renderSidebar({ onOpenSettings })
    const footBtn = screen.getByLabelText('설정 열기')
    fireEvent.click(footBtn)
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('.sb-foot 내부에 .ava와 .who .n 구조가 있다', async () => {
    patchStore()
    const container = await renderSidebar()
    expect(container.querySelector('.sb-foot .ava')).toBeTruthy()
    expect(container.querySelector('.sb-foot .who')).toBeTruthy()
    expect(container.querySelector('.sb-foot .who .n')).toBeTruthy()
  })

  it('profile 변경 시 .sb-foot이 새 nickname으로 갱신된다(reactivity)', async () => {
    patchStore({ profile: null })
    const container = await renderSidebar()

    // 먼저 fallback 확인
    expect(container.querySelector('.sb-foot .who .n')?.textContent).toBe('개발자')

    // store profile 갱신
    await act(async () => {
      useAppStore.setState({ profile: { nickname: '업데이트유저', color: '#123456' } })
    })

    // 리렌더 후 새 nickname 반영
    expect(container.querySelector('.sb-foot .who .n')?.textContent).toBe('업데이트유저')
  })
})

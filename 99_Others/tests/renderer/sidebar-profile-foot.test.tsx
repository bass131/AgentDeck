// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import type { ConversationRecord } from '../../../02_Source/shared/ipcContract'

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
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

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
    listConversations: vi.fn().mockResolvedValue(undefined),
    selectConversation: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    newConversation: vi.fn(),
    ...overrides,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderSidebar(
  props: { onCollapse?: () => void; onOpenSettings?: () => void } = {},
) {
  const { Sidebar } = await import('../../../02_Source/renderer/src/components/00_shell/Sidebar')
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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', profile: null })
})

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
    const bg = avaEl?.style.background || avaEl?.style.backgroundColor
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

    expect(container.querySelector('.sb-foot .who .n')?.textContent).toBe('개발자')

    await act(async () => {
      useAppStore.setState({ profile: { nickname: '업데이트유저', color: '#123456' } })
    })

    expect(container.querySelector('.sb-foot .who .n')?.textContent).toBe('업데이트유저')
  })
})

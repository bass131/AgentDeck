// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

const mockUnsub = vi.fn()
const mockPermissionRespond = vi.fn().mockResolvedValue({ ok: true })
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  permissionRespond: mockPermissionRespond,
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.listFiles.mockResolvedValue({ files: [] })
  mockApi.permissionRespond.mockResolvedValue({ ok: true })
})
afterEach(() => cleanup())

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
    subagents: [],
    pendingPermission: null,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderConv() {
  const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
  return act(async () => render(<Conversation />))
}

describe('BF3 P06 — Conversation: PermissionCard 배선', () => {
  it('pendingPermission 있을 때 .perm-card 렌더', async () => {
    await setStore({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: 'rm -rf 실행',
      },
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.perm-card')).toBeTruthy()
  })

  it('pendingPermission null → .perm-card 미렌더', async () => {
    await setStore({
      pendingPermission: null,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.perm-card')).toBeFalsy()
  })

  it('.perm-card 렌더 시 toolName 표시', async () => {
    await setStore({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Write',
        summary: '파일 생성',
      },
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.perm-card')?.textContent).toContain('Write')
  })

  it('.perm-card는 role="group"이며 role="dialog"가 아니다(모달 아님 — ADR-030)', async () => {
    await setStore({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    const card = container.querySelector('.perm-card')
    expect(card?.getAttribute('role')).toBe('group')
    expect(container.querySelector('.perm-card[role="dialog"]')).toBeFalsy()
  })

  it('onRespond("deny") 클릭 → respondPermission("deny") 호출', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const respondPermission = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
      respondPermission,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConv()
    const buttons = container.querySelectorAll('.perm-card-opt')
    expect(buttons).toHaveLength(3)
    await act(async () => {
      fireEvent.click(buttons[2])
    })
    expect(respondPermission).toHaveBeenCalledWith('deny')
  })

  it('onRespond("allow") 클릭 → respondPermission("allow") 호출', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const respondPermission = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
      respondPermission,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConv()
    const buttons = container.querySelectorAll('.perm-card-opt')
    await act(async () => {
      fireEvent.click(buttons[0])
    })
    expect(respondPermission).toHaveBeenCalledWith('allow')
  })

  it('onRespond("allow_always") 클릭 → respondPermission("allow_always") 호출', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const respondPermission = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
      respondPermission,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConv()
    const buttons = container.querySelectorAll('.perm-card-opt')
    await act(async () => {
      fireEvent.click(buttons[1])
    })
    expect(respondPermission).toHaveBeenCalledWith('allow_always')
  })

  it('data-perm-choice 속성으로도 버튼을 식별할 수 있다(qa 셀렉터 안정성)', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const respondPermission = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
      respondPermission,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConv()
    const allowAlways = container.querySelector('.perm-card-opt[data-perm-choice="allow_always"]')
    expect(allowAlways).toBeTruthy()
    await act(async () => {
      fireEvent.click(allowAlways!)
    })
    expect(respondPermission).toHaveBeenCalledWith('allow_always')
  })

  it('[회귀] thinkingText 있고 isRunning=true, 권한 대기 없음 → .thinking 렌더', async () => {
    await setStore({
      thinkingText: '코드 분석 중…',
      isRunning: true,
      pendingPermission: null,
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeTruthy()
  })

  it('[ADR-030] pendingPermission과 thinkingText 동시 → 카드는 렌더, WorkingIndicator는 억제', async () => {
    await setStore({
      thinkingText: '생각 중…',
      isRunning: true,
      pendingPermission: {
        runId: 'run-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeFalsy()
    expect(container.querySelector('.perm-card')).toBeTruthy()
  })
})

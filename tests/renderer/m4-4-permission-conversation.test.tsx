// @vitest-environment jsdom
/**
 * m4-4-permission-conversation.test.tsx — Phase 24c Conversation + PermissionModal 연결 테스트 (TDD 선행).
 *
 * 검증 대상:
 *   - pendingPermission 있을 때 PermissionModal open 렌더(.q-overlay)
 *   - pendingPermission null → PermissionModal 미렌더
 *   - onRespond('deny') → respondPermission 호출
 *   - onRespond('allow') → respondPermission 호출
 *   - onRespond('allow_always') → respondPermission 호출
 *
 * 기존 회귀:
 *   - thinking 인디케이터 기존 동작 유지
 */
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
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
  const { Conversation } = await import('../../src/renderer/src/components/01_conversation/Conversation')
  return act(async () => render(<Conversation />))
}

describe('Phase 24c — Conversation: PermissionModal 배선', () => {
  it('pendingPermission 있을 때 .q-overlay(PermissionModal) 렌더', async () => {
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
    expect(container.querySelector('.q-overlay')).toBeTruthy()
  })

  it('pendingPermission null → .q-overlay 미렌더', async () => {
    await setStore({
      pendingPermission: null,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.q-overlay')).toBeFalsy()
  })

  it('PermissionModal 렌더 시 toolName 표시', async () => {
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
    // .perm-tool 또는 .perm-modal 내에 toolName 텍스트 존재 확인
    expect(container.querySelector('.perm-modal')).toBeTruthy()
    expect(container.querySelector('.q-overlay')?.textContent).toContain('Write')
  })

  it('onRespond("deny") 클릭 → respondPermission("deny") 호출', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    // PERM_CHOICES[2] = deny = 3번째 버튼
    const buttons = container.querySelectorAll('.q-opt')
    expect(buttons).toHaveLength(3)
    await act(async () => {
      fireEvent.click(buttons[2]) // 거부
    })
    expect(respondPermission).toHaveBeenCalledWith('deny')
  })

  it('onRespond("allow") 클릭 → respondPermission("allow") 호출', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const buttons = container.querySelectorAll('.q-opt')
    await act(async () => {
      fireEvent.click(buttons[0]) // 허용
    })
    expect(respondPermission).toHaveBeenCalledWith('allow')
  })

  it('onRespond("allow_always") 클릭 → respondPermission("allow_always") 호출', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const buttons = container.querySelectorAll('.q-opt')
    await act(async () => {
      fireEvent.click(buttons[1]) // 항상 허용
    })
    expect(respondPermission).toHaveBeenCalledWith('allow_always')
  })

  // ── 기존 회귀: thinking 인디케이터 미영향 ───────────────────────────────────
  it('[회귀] thinkingText 있고 isRunning=true → .thinking 렌더(기존 동작 유지)', async () => {
    await setStore({
      thinkingText: '코드 분석 중…',
      isRunning: true,
      pendingPermission: null,
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeTruthy()
  })

  it('[회귀] pendingPermission과 thinkingText 동시 → 둘 다 렌더', async () => {
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
    expect(container.querySelector('.thinking')).toBeTruthy()
    expect(container.querySelector('.q-overlay')).toBeTruthy()
  })
})

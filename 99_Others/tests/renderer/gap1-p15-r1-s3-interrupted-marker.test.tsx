// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'

const mockApi = {
  conversationLoad: vi.fn(async () => ({ conversations: [] })),
  conversationSave: vi.fn(async () => ({ id: 'cv-1' })),
  listConversations: vi.fn(async () => ({ conversations: [] })),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: vi.fn(async () => ({ accepted: true })),
  agentInterrupt: vi.fn(async () => ({ accepted: true })),
  onAgentEvent: vi.fn(() => () => {}),
  listFiles: vi.fn(async () => ({ files: [] })),
  pathForFile: () => '',
  saveImageData: vi.fn(async () => ({ path: '' })),
  workspaceOpen: vi.fn(async () => ({ rootPath: null, tree: null })),
  referenceList: vi.fn(async () => ({ references: [] })),
  referenceTree: vi.fn(async () => ({ tree: null })),
  referenceAdd: vi.fn(async () => ({ reference: null })),
  fsRead: vi.fn(async () => ({ kind: 'not-found' })),
  permissionRespond: vi.fn(async () => ({ ok: true })),
  questionRespond: vi.fn(async () => ({ ok: true })),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

function streamingThread(): ThreadItem[] {
  return [
    { kind: 'msg', id: 'u1', role: 'user', text: '긴 답변 부탁' },
    { kind: 'msg', id: 'a1', role: 'assistant', text: '첫 문장까지 쓰다가 잘린' },
  ]
}

async function seedRunningStore(): Promise<void> {
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  useAppStore.setState({
    ...makeInitialState(),
    thread: streamingThread(),
    openMsgId: 'a1',
    isRunning: true,
    currentRunId: 'r1',
    runGeneration: null,
    conversationId: null,
    activeLoops: [],
    pendingCommand: null,
    queue: [],
  } as Parameters<typeof useAppStore.setState>[0])
}

function interruptedOf(item: ThreadItem | undefined): unknown {
  return (item as unknown as Record<string, unknown> | undefined)?.['interrupted']
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.agentAbort.mockResolvedValue({ accepted: true })
  mockApi.agentInterrupt.mockResolvedValue({ accepted: true })
})
afterEach(() => cleanup())

describe('GAP1 P15-R1 S3 — store: 잘린 assistant msg에 interrupted 표식 (RED)', () => {
  it('abortRun 로컬 정리 → openMsgId가 가리키던 assistant msg에 interrupted:true', async () => {
    await seedRunningStore()
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    await act(async () => {
      await useAppStore.getState().abortRun()
    })
    const a1 = useAppStore.getState().thread.find((t) => t.kind === 'msg' && t.id === 'a1')
    expect(a1).toBeTruthy()
    expect(interruptedOf(a1)).toBe(true)
    expect(a1 && a1.kind === 'msg' && a1.text).toBe('첫 문장까지 쓰다가 잘린')
  })

  it('interruptRun accepted:true → openMsgId가 가리키던 assistant msg에 interrupted:true (세션 유지 경로)', async () => {
    await seedRunningStore()
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    await act(async () => {
      await useAppStore.getState().interruptRun()
    })
    expect(mockApi.agentInterrupt).toHaveBeenCalledWith({ runId: 'r1' })
    const a1 = useAppStore.getState().thread.find((t) => t.kind === 'msg' && t.id === 'a1')
    expect(interruptedOf(a1)).toBe(true)
  })
})

describe('GAP1 P15-R1 S3 — 렌더: interrupted msg에 "중단됨" 마커 (RED)', () => {
  async function renderConversationWith(thread: ThreadItem[]): Promise<HTMLElement> {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      ...makeInitialState(),
      thread,
      isRunning: false,
      openMsgId: null,
    } as Parameters<typeof useAppStore.setState>[0])
    const { Conversation } = await import(
      '../../../02_Source/renderer/src/features/conversation/Conversation'
    )
    const { container } = await act(async () => render(<Conversation />))
    return container
  }

  it("interrupted:true assistant msg → .msg.ai-msg 안에 [data-interrupted] 마커 + '중단됨' 텍스트", async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '잘린 답변', interrupted: true } as unknown as ThreadItem,
    ]
    const container = await renderConversationWith(thread)
    const marker = container.querySelector('.msg.ai-msg [data-interrupted]')
    expect(marker).toBeTruthy()
    expect(marker?.textContent).toContain('중단됨')
  })

  it('대조군(GREEN 유지): interrupted 미지정 msg엔 마커 없음 — 기존 렌더 회귀 0', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'a2', role: 'assistant', text: '정상 완료 답변' },
    ]
    const container = await renderConversationWith(thread)
    expect(container.querySelector('[data-interrupted]')).toBeNull()
    expect(container.textContent).not.toContain('중단됨')
  })
})

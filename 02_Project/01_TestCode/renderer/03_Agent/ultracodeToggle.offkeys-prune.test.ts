// 작업 ID: bl1-p01 · 옛 이름 bl1-p01-ultracode-offkeys-prune.test.ts
// @vitest-environment jsdom
// M10 G1 — 멀티 에이전트 모드(멀티 세션 삭제와 그 범위 정리)를 지워 B·D 묶음을 뺐다. 대화 삭제의 정리만 남는다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '@renderer/00_App/appStore'
import { useUltracodeToggle, __resetUltracodeToggleForTests } from '@renderer/03_Agent/state/ultracodeToggle'
// 대화의 UltraCode 범위 키는 세션 레지스트리 키 convKey(id)다(G9c, 옛 키는 대화 id 그대로).
import { convKey } from '@renderer/03_Agent/state/sessionKeys'
import type { ConversationRecord } from '../../../../02_Project/00_Source/shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const SAMPLE_CONVS: ConversationRecord[] = [
  {
    id: 'conv-1',
    title: '대화1',
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  },
]

let conversationDeleteImpl = vi.fn(async (_req: { id: string }): Promise<{ ok: boolean }> => ({ ok: true }))

const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: SAMPLE_CONVS }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-new' }),
  conversationDelete: (req: { id: string }) => conversationDeleteImpl(req),
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
}
Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

function resetStore(): void {
  useAppStore.setState({
    conversations: [],
    conversationId: null,
    messages: [],
    thread: [],
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
  } as Parameters<typeof useAppStore.setState>[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  conversationDeleteImpl = vi.fn(async () => ({ ok: true }))
  resetStore()
  __resetUltracodeToggleForTests()
})

describe('bl1-p01-A: 단일챗 대화 삭제(성공) → offKeys prune', () => {
  it('OFF 상태의 대화를 삭제(ok:true)하면 그 키가 offKeys에서 제거되어 기본 ON으로 복귀한다', async () => {
    useAppStore.setState({ conversations: [...SAMPLE_CONVS] } as Parameters<typeof useAppStore.setState>[0])

    const { result } = renderHook(() => useUltracodeToggle(convKey('conv-1')))
    expect(result.current[0]).toBe(true)
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteConversation('conv-1')
    })

    const { result: after } = renderHook(() => useUltracodeToggle(convKey('conv-1')))
    expect(after.current[0]).toBe(true)
  })
})

describe('bl1-p01-C: 단일챗 삭제 실패(ok:false) → offKeys 무변경', () => {
  it('conversationDelete가 ok:false를 반환하면 OFF 키가 offKeys에 그대로 남는다', async () => {
    useAppStore.setState({ conversations: [...SAMPLE_CONVS] } as Parameters<typeof useAppStore.setState>[0])
    conversationDeleteImpl = vi.fn(async () => ({ ok: false }))

    const { result } = renderHook(() => useUltracodeToggle(convKey('conv-1')))
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteConversation('conv-1')
    })

    const { result: after } = renderHook(() => useUltracodeToggle(convKey('conv-1')))
    expect(after.current[0]).toBe(false)
  })
})

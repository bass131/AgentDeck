// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'
import { useUltracodeToggle, __resetUltracodeToggleForTests } from '../../../02_Project/00_Source/renderer/src/store/ultracodeToggle'
import type {
  ConversationRecord,
  PersistedMultiState,
  PersistedMultiSession,
} from '../../../02_Project/00_Source/shared/ipcContract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

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

let _diskState: PersistedMultiState | null = null
function makeSavedState(sessions: PersistedMultiSession[], activeSessionId: string): PersistedMultiState {
  return { version: 2, activeSessionId, sessions }
}
function makeSampleSession(id: string, title?: string): PersistedMultiSession {
  return { id, title, count: 2, panels: [] }
}

const {
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
} = makeMultiCmdMocks(
  () => _diskState,
  (s) => { _diskState = s }
)

let conversationDeleteImpl = vi.fn(async (_req: { id: string }): Promise<{ ok: boolean }> => ({ ok: true }))

const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: SAMPLE_CONVS }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-new' }),
  conversationDelete: (req: { id: string }) => conversationDeleteImpl(req),
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  multiSessionLoad: vi.fn(async () => ({ state: _diskState })),
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

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
    multiSessions: [],
    activeMultiSessionId: '',
  } as Parameters<typeof useAppStore.setState>[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  _diskState = null
  conversationDeleteImpl = vi.fn(async () => ({ ok: true }))
  resetStore()
  __resetUltracodeToggleForTests()
})

describe('bl1-p01-A: 단일챗 대화 삭제(성공) → offKeys prune', () => {
  it('OFF 상태의 대화를 삭제(ok:true)하면 그 키가 offKeys에서 제거되어 기본 ON으로 복귀한다', async () => {
    useAppStore.setState({ conversations: [...SAMPLE_CONVS] } as Parameters<typeof useAppStore.setState>[0])

    const { result } = renderHook(() => useUltracodeToggle('conv-1'))
    expect(result.current[0]).toBe(true)
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteConversation('conv-1')
    })

    const { result: after } = renderHook(() => useUltracodeToggle('conv-1'))
    expect(after.current[0]).toBe(true)
  })
})

describe('bl1-p01-B: 멀티세션 삭제(성공) → 복수 슬롯 offKeys 전수 prune', () => {
  it('세션의 슬롯 0/1을 각각 OFF한 뒤 세션 삭제 → 두 슬롯 키 모두 offKeys에서 제거된다', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1'
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const key0 = 'multi:s1:slot:0'
    const key1 = 'multi:s1:slot:1'
    const { result: r0 } = renderHook(() => useUltracodeToggle(key0))
    const { result: r1 } = renderHook(() => useUltracodeToggle(key1))
    act(() => { r0.current[1](false) })
    act(() => { r1.current[1](false) })
    expect(r0.current[0]).toBe(false)
    expect(r1.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('s1')
    })

    const { result: after0 } = renderHook(() => useUltracodeToggle(key0))
    const { result: after1 } = renderHook(() => useUltracodeToggle(key1))
    expect(after0.current[0]).toBe(true)
    expect(after1.current[0]).toBe(true)
  })

  it('세션 s1 삭제는 세션 s2의 OFF 키에 영향을 주지 않는다(prefix 정확 매칭)', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s2', 'B')],
      's1'
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const keyS1 = 'multi:s1:slot:0'
    const keyS2 = 'multi:s2:slot:0'
    const { result: rS1 } = renderHook(() => useUltracodeToggle(keyS1))
    const { result: rS2 } = renderHook(() => useUltracodeToggle(keyS2))
    act(() => { rS1.current[1](false) })
    act(() => { rS2.current[1](false) })

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('s1')
    })

    const { result: afterS2 } = renderHook(() => useUltracodeToggle(keyS2))
    expect(afterS2.current[0]).toBe(false)
  })

  it('세션 s1 삭제는 세션 s10의 OFF 키에 영향을 주지 않는다(접두 문자열 겹침 방지 — s1 vs s10)', async () => {
    _diskState = makeSavedState(
      [makeSampleSession('s1', 'A'), makeSampleSession('s10', 'B')],
      's1'
    )
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const keyS1 = 'multi:s1:slot:0'
    const keyS10 = 'multi:s10:slot:0'
    const { result: rS1 } = renderHook(() => useUltracodeToggle(keyS1))
    const { result: rS10 } = renderHook(() => useUltracodeToggle(keyS10))
    act(() => { rS1.current[1](false) })
    act(() => { rS10.current[1](false) })
    expect(rS1.current[0]).toBe(false)
    expect(rS10.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('s1')
    })

    const { result: afterS10 } = renderHook(() => useUltracodeToggle(keyS10))
    expect(afterS10.current[0]).toBe(false)
  })
})

describe('bl1-p01-C: 단일챗 삭제 실패(ok:false) → offKeys 무변경', () => {
  it('conversationDelete가 ok:false를 반환하면 OFF 키가 offKeys에 그대로 남는다', async () => {
    useAppStore.setState({ conversations: [...SAMPLE_CONVS] } as Parameters<typeof useAppStore.setState>[0])
    conversationDeleteImpl = vi.fn(async () => ({ ok: false }))

    const { result } = renderHook(() => useUltracodeToggle('conv-1'))
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteConversation('conv-1')
    })

    const { result: after } = renderHook(() => useUltracodeToggle('conv-1'))
    expect(after.current[0]).toBe(false)
  })
})

describe('bl1-p01-D: 멀티세션 삭제 실패(ok:false) → offKeys 무변경', () => {
  it('존재하지 않는 세션 id 삭제 시도(ok:false)는 다른 세션의 OFF 키에 영향을 주지 않는다', async () => {
    _diskState = makeSavedState([makeSampleSession('s1', 'A')], 's1')
    await useAppStore.getState().loadMultiSessions()
    vi.clearAllMocks()

    const key = 'multi:s1:slot:0'
    const { result } = renderHook(() => useUltracodeToggle(key))
    act(() => { result.current[1](false) })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await useAppStore.getState().deleteMultiSession('nonexistent-session')
    })

    const { result: after } = renderHook(() => useUltracodeToggle(key))
    expect(after.current[0]).toBe(false)
  })
})

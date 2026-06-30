/**
 * restore-last-active-conversation.test.ts — 재시작 시 마지막 활성 단일챗 복원 TDD.
 *
 * 검증 범위:
 *   R1: restoreLastActiveConversation() — lastActiveId pref 존재 → selectConversation 호출,
 *       state.messages / state.conversationId / state.sessionId 복원.
 *   R2: restoreLastActiveConversation() — pref null/미설정 → no-op (conversationLoad 미호출).
 *   R3: selectConversation 성공 → setPref('conversation.lastActiveId', id) 호출됨.
 *   R4: saveConversation 신규 id 발급 시 → setPref('conversation.lastActiveId', id) 호출됨.
 *   R5: deleteConversation(활성 id) → setPref('conversation.lastActiveId', null) 호출됨.
 *   R6: deleteConversation(비활성 id) → setPref 미호출(활성 id 불변).
 *
 * 아키텍처 준수:
 *   - window.api mock → store 액션 → 상태 갱신 (단방향 흐름).
 *   - setPref spy: window.api.setUiPref 캡처로 검증.
 *   - renderer untrusted — fs/Node 직접 0. window.api 경유만.
 *   - shared/main 변경 없음.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord } from '../../../02.Source/shared/ipc-contract'

// ── window.api stub ────────────────────────────────────────────────────────────

const SAMPLE_CONV: ConversationRecord = {
  id: 'conv-last-1',
  title: '작업 중이던 대화',
  messages: [
    { role: 'user', content: '안녕' },
    { role: 'assistant', content: '반갑습니다' },
  ],
  backendId: 'claude-code',
  createdAt: '2026-06-24T00:00:00Z',
  updatedAt: '2026-06-24T00:01:00Z',
  sessionId: 'sess-resume-42',
  lastContextWindow: 200000,
  lastUsage: { inputTokens: 900, outputTokens: 120 },
}

/** setUiPref 호출 기록 */
let setUiPrefCalls: Array<{ key: string; value: unknown }> = []

const mockApi = {
  getUiPrefs: vi.fn(async () => ({} as Record<string, unknown>)),
  setUiPref: vi.fn(async (req: { key: string; value: unknown }) => {
    setUiPrefCalls.push(req)
    return { ok: true }
  }),
  conversationLoad: vi.fn(async (req: { id?: string; limit?: number }) => {
    if (req.id === SAMPLE_CONV.id) {
      return { conversations: [SAMPLE_CONV] }
    }
    if (req.id) return { conversations: [] }
    return { conversations: [SAMPLE_CONV] }
  }),
  conversationSave: vi.fn(async (_req: unknown) => ({ id: 'conv-new-99' })),
  conversationDelete: vi.fn(async (_req: { id: string }) => ({ ok: true })),
  conversationRename: vi.fn(async (_req: { id: string; title: string }) => ({ ok: true })),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: vi.fn(async () => ({ accepted: true })),
  onAgentEvent: vi.fn(() => () => {}),
  listFiles: vi.fn(async () => ({ files: [] })),
  pathForFile: vi.fn(() => ''),
  saveImageData: vi.fn(async () => ({ path: '' })),
  workspaceOpen: vi.fn(async () => ({ rootPath: null, tree: null })),
  referenceList: vi.fn(async () => ({ references: [] })),
  referenceTree: vi.fn(async () => ({ tree: null })),
  referenceAdd: vi.fn(async () => ({ reference: null })),
  fsRead: vi.fn(async () => ({ kind: 'not-found' as const })),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function resetSetUiPrefCalls() {
  setUiPrefCalls = []
}

function resetStore() {
  useAppStore.setState({
    conversations: [],
    messages: [],
    conversationId: null,
    thread: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    sessionId: undefined,
    lastContextWindow: undefined,
    lastUsage: undefined,
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── 테스트 ─────────────────────────────────────────────────────────────────────

describe('restoreLastActiveConversation — R1: lastActiveId 존재 → 대화 복원', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetSetUiPrefCalls()
    resetStore()

    // prefs 캐시에 lastActiveId 주입 (loadPrefs + setPref 경유)
    // getUiPrefs가 lastActiveId를 포함하도록 mock 설정
    mockApi.getUiPrefs.mockResolvedValueOnce({
      'conversation.lastActiveId': SAMPLE_CONV.id,
    } as Record<string, unknown>)
    const { loadPrefs } = await import('../../../02.Source/renderer/src/lib/prefs')
    await loadPrefs()
  })

  it('R1a: lastActiveId pref가 있으면 selectConversation이 호출된다', async () => {
    mockApi.conversationLoad.mockClear()

    await useAppStore.getState().restoreLastActiveConversation()

    const idCalls = mockApi.conversationLoad.mock.calls.filter(
      (c) => (c[0] as { id?: string }).id === SAMPLE_CONV.id
    )
    expect(idCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('R1b: lastActiveId pref가 있으면 state.conversationId가 복원된다', async () => {
    await useAppStore.getState().restoreLastActiveConversation()

    expect(useAppStore.getState().conversationId).toBe(SAMPLE_CONV.id)
  })

  it('R1c: lastActiveId pref가 있으면 state.messages가 복원된다', async () => {
    await useAppStore.getState().restoreLastActiveConversation()

    const { messages } = useAppStore.getState()
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('안녕')
  })

  it('R1d: lastActiveId pref가 있으면 state.sessionId가 복원된다 (resume 맥락)', async () => {
    await useAppStore.getState().restoreLastActiveConversation()

    expect(useAppStore.getState().sessionId).toBe('sess-resume-42')
  })

  it('R1e: lastActiveId pref가 있으면 게이지 메타(lastContextWindow/lastUsage)가 복원된다', async () => {
    await useAppStore.getState().restoreLastActiveConversation()

    expect(useAppStore.getState().lastContextWindow).toBe(200000)
    expect(useAppStore.getState().lastUsage).toEqual({ inputTokens: 900, outputTokens: 120 })
  })
})

describe('restoreLastActiveConversation — R2: lastActiveId null → no-op', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetSetUiPrefCalls()
    resetStore()

    // prefs 캐시를 null로 세팅
    mockApi.getUiPrefs.mockResolvedValueOnce({
      'conversation.lastActiveId': null,
    } as Record<string, unknown>)
    const { loadPrefs } = await import('../../../02.Source/renderer/src/lib/prefs')
    await loadPrefs()
  })

  it('R2a: lastActiveId pref가 null이면 conversationLoad({id}) 호출되지 않는다', async () => {
    mockApi.conversationLoad.mockClear()

    await useAppStore.getState().restoreLastActiveConversation()

    const idCalls = mockApi.conversationLoad.mock.calls.filter(
      (c) => (c[0] as { id?: string }).id != null
    )
    expect(idCalls).toHaveLength(0)
  })

  it('R2b: lastActiveId pref가 null이면 state.conversationId가 null로 유지된다', async () => {
    useAppStore.setState({ conversationId: null } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().restoreLastActiveConversation()

    expect(useAppStore.getState().conversationId).toBeNull()
  })
})

describe('selectConversation — R3: 성공 시 setPref("conversation.lastActiveId", id)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetSetUiPrefCalls()
    resetStore()

    // prefs 로드 (빈 상태)
    mockApi.getUiPrefs.mockResolvedValueOnce({} as Record<string, unknown>)
    const { loadPrefs } = await import('../../../02.Source/renderer/src/lib/prefs')
    await loadPrefs()
  })

  it('R3a: selectConversation 성공 후 setUiPref({key:"conversation.lastActiveId", value:id}) 호출됨', async () => {
    resetSetUiPrefCalls()
    mockApi.setUiPref.mockClear()

    await useAppStore.getState().selectConversation(SAMPLE_CONV.id)

    // setPref는 IPC를 void로 fire — 약간 대기
    await new Promise((r) => setTimeout(r, 20))

    const lastActiveCall = setUiPrefCalls.find((c) => c.key === 'conversation.lastActiveId')
    expect(lastActiveCall).toBeDefined()
    expect(lastActiveCall?.value).toBe(SAMPLE_CONV.id)
  })

  it('R3b: selectConversation이 no-op(없는 id)이면 setPref("conversation.lastActiveId") 미호출', async () => {
    resetSetUiPrefCalls()
    mockApi.setUiPref.mockClear()

    await useAppStore.getState().selectConversation('nonexistent-99')

    await new Promise((r) => setTimeout(r, 20))

    const lastActiveCall = setUiPrefCalls.find((c) => c.key === 'conversation.lastActiveId')
    expect(lastActiveCall).toBeUndefined()
  })
})

describe('saveConversation — R4: 신규 id 발급 시 setPref("conversation.lastActiveId", id)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetSetUiPrefCalls()
    resetStore()

    mockApi.getUiPrefs.mockResolvedValueOnce({} as Record<string, unknown>)
    const { loadPrefs } = await import('../../../02.Source/renderer/src/lib/prefs')
    await loadPrefs()
  })

  it('R4a: conversationId가 null인 새 대화 저장 시 발급된 id로 setPref 호출됨', async () => {
    // 신규 대화 세팅 (conversationId=null)
    useAppStore.setState({
      conversationId: null,
      thread: [{ kind: 'msg' as const, id: 'm1', role: 'user' as const, text: '첫 메시지' }],
      messages: [{ id: 'm1', role: 'user' as const, content: '첫 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])

    resetSetUiPrefCalls()
    mockApi.setUiPref.mockClear()

    await useAppStore.getState().saveConversation()

    await new Promise((r) => setTimeout(r, 50))

    const lastActiveCall = setUiPrefCalls.find((c) => c.key === 'conversation.lastActiveId')
    expect(lastActiveCall).toBeDefined()
    expect(lastActiveCall?.value).toBe('conv-new-99')
  })

  it('R4b: conversationId가 이미 있는 대화 저장 시 setPref("conversation.lastActiveId") 미호출', async () => {
    // 기존 대화 (conversationId 존재)
    useAppStore.setState({
      conversationId: 'conv-existing',
      thread: [{ kind: 'msg' as const, id: 'm1', role: 'user' as const, text: '이전 메시지' }],
      messages: [{ id: 'm1', role: 'user' as const, content: '이전 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])

    resetSetUiPrefCalls()
    mockApi.setUiPref.mockClear()

    await useAppStore.getState().saveConversation()

    await new Promise((r) => setTimeout(r, 50))

    const lastActiveCall = setUiPrefCalls.find((c) => c.key === 'conversation.lastActiveId')
    expect(lastActiveCall).toBeUndefined()
  })
})

describe('deleteConversation — R5/R6: 활성 id 삭제 시 setPref(null)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetSetUiPrefCalls()

    mockApi.getUiPrefs.mockResolvedValueOnce({} as Record<string, unknown>)
    const { loadPrefs } = await import('../../../02.Source/renderer/src/lib/prefs')
    await loadPrefs()

    useAppStore.setState({
      conversations: [
        { ...SAMPLE_CONV },
        {
          id: 'conv-other',
          title: '다른 대화',
          messages: [{ role: 'user', content: '다른' }],
          backendId: 'claude-code',
          createdAt: '',
          updatedAt: '',
        },
      ],
      conversationId: SAMPLE_CONV.id,
      messages: [{ id: 'm1', role: 'user' as const, content: '안녕' }],
      thread: [{ kind: 'msg' as const, id: 'm1', role: 'user' as const, text: '안녕' }],
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('R5: 활성 대화(conversationId === 삭제 id) 삭제 시 setPref("conversation.lastActiveId", null) 호출됨', async () => {
    resetSetUiPrefCalls()
    mockApi.setUiPref.mockClear()

    await useAppStore.getState().deleteConversation(SAMPLE_CONV.id)

    await new Promise((r) => setTimeout(r, 20))

    const lastActiveCall = setUiPrefCalls.find((c) => c.key === 'conversation.lastActiveId')
    expect(lastActiveCall).toBeDefined()
    expect(lastActiveCall?.value).toBeNull()
  })

  it('R6: 비활성 대화 삭제 시 setPref("conversation.lastActiveId") 미호출', async () => {
    resetSetUiPrefCalls()
    mockApi.setUiPref.mockClear()

    await useAppStore.getState().deleteConversation('conv-other')

    await new Promise((r) => setTimeout(r, 20))

    const lastActiveCall = setUiPrefCalls.find((c) => c.key === 'conversation.lastActiveId')
    expect(lastActiveCall).toBeUndefined()
  })
})

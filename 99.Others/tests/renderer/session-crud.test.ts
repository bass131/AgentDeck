/**
 * session-crud.test.ts — 세션 CRUD store 액션 단위 테스트 (TDD-first).
 *
 * 검증 범위:
 *   - listConversations: conversations 상태 채워짐
 *   - selectConversation(id): conversationLoad({id}) 호출 + messages/conversationId 설정 + streaming 리셋
 *   - renameConversation(id, title): conversationRename 호출 + 로컬 목록 title 갱신
 *   - deleteConversation(id): conversationDelete 호출 + 목록 제거
 *   - deleteConversation(활성 id): conversationId null + messages [] (clearConversation 경유)
 *   - newConversation: messages [] + conversationId null
 *   - selectConversations 셀렉터: conversations 배열 반환
 *
 * 아키텍처 준수:
 *   - window.api mock → store 액션 → 상태 갱신 (단방향)
 *   - window.api 직접 호출은 액션 내부에서만
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord } from '../../../02.Source/shared/ipc-contract'

// ── window.api 최소 stub ───────────────────────────────────────────────────────
const SAMPLE_RECORDS: ConversationRecord[] = [
  {
    id: 'conv-1',
    title: '첫 번째 대화',
    messages: [{ role: 'user', content: '안녕' }, { role: 'assistant', content: '반가워요' }],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
  },
  {
    id: 'conv-2',
    title: '두 번째 대화',
    messages: [{ role: 'user', content: '코드 작성' }],
    backendId: 'claude-code',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:01:00Z',
  },
]

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id) {
      const found = SAMPLE_RECORDS.find((r) => r.id === req.id)
      return { conversations: found ? [found] : [] }
    }
    return { conversations: SAMPLE_RECORDS }
  },
  conversationSave: async () => ({ id: 'cv-new' }),
  conversationDelete: async (_req: { id: string }) => ({ ok: true }),
  conversationRename: async (_req: { id: string; title: string }) => ({ ok: true }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
  // prefs IPC — selectConversation/saveConversation/deleteConversation 에서 setPref 호출
  setUiPref: async (_req: { key: string; value: unknown }) => ({ ok: true }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 상태 리셋 헬퍼 ──────────────────────────────────────────────────────────────
function resetStore() {
  useAppStore.setState({
    conversations: [],
    messages: [],
    conversationId: null,
    // Phase A-2: streamingText/toolCards 제거 → thread 기반
    thread: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
  } as Parameters<typeof useAppStore.setState>[0])
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — listConversations', () => {
  beforeEach(() => resetStore())

  it('listConversations 호출 후 conversations 상태에 목록이 채워진다', async () => {
    await useAppStore.getState().listConversations()
    const { conversations } = useAppStore.getState()
    expect(conversations).toHaveLength(2)
    expect(conversations[0].id).toBe('conv-1')
    expect(conversations[1].id).toBe('conv-2')
  })

  it('listConversations 후 각 항목에 title·id·backendId가 있다', async () => {
    await useAppStore.getState().listConversations()
    const { conversations } = useAppStore.getState()
    for (const conv of conversations) {
      expect(conv.id).toBeTruthy()
      expect(conv.title).toBeTruthy()
      expect(conv.backendId).toBeTruthy()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — selectConversation', () => {
  beforeEach(() => resetStore())

  it('selectConversation(id) 호출 시 conversationLoad({id}) IPC를 경유한다', async () => {
    const calls: unknown[] = []
    const originalLoad = mockApi.conversationLoad
    mockApi.conversationLoad = async (req) => {
      calls.push(req)
      return originalLoad(req)
    }

    await useAppStore.getState().selectConversation('conv-1')

    mockApi.conversationLoad = originalLoad
    expect(calls.some((c) => (c as { id?: string }).id === 'conv-1')).toBe(true)
  })

  it('selectConversation(id) 후 conversationId가 해당 id로 설정된다', async () => {
    await useAppStore.getState().selectConversation('conv-1')
    expect(useAppStore.getState().conversationId).toBe('conv-1')
  })

  it('selectConversation(id) 후 messages에 해당 대화 내용이 설정된다', async () => {
    await useAppStore.getState().selectConversation('conv-1')
    const { messages } = useAppStore.getState()
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('안녕')
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toBe('반가워요')
  })

  it('selectConversation(id) 후 thread가 해당 대화 msg로 채워진다', async () => {
    // Phase A-2: streamingText 제거 → thread 기반. selectConversation이 thread를 동기화함
    await useAppStore.getState().selectConversation('conv-1')
    const { thread } = useAppStore.getState()
    const msgItems = thread.filter((item) => item.kind === 'msg')
    expect(msgItems).toHaveLength(2)
  })

  it('selectConversation(id) 후 isRunning이 false로 리셋된다', async () => {
    useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().selectConversation('conv-1')
    expect(useAppStore.getState().isRunning).toBe(false)
  })

  it('selectConversation(id) 후 errorMessage가 undefined로 리셋된다', async () => {
    useAppStore.setState({ errorMessage: '이전 오류' } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().selectConversation('conv-1')
    expect(useAppStore.getState().errorMessage).toBeUndefined()
  })

  it('selectConversation(id) 후 attachedImages가 빈 배열로 리셋된다', async () => {
    useAppStore.setState({
      attachedImages: [{ path: '/tmp/a.png', dataUrl: 'data:image/png;base64,X' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().selectConversation('conv-1')
    expect(useAppStore.getState().attachedImages).toHaveLength(0)
  })

  it('존재하지 않는 id selectConversation → no-op (state 미변경)', async () => {
    useAppStore.setState({ conversationId: 'conv-1', messages: [] } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().selectConversation('nonexistent-id')
    // 존재하지 않으면 conversationId 변경 없음 (no-op)
    expect(useAppStore.getState().conversationId).toBe('conv-1')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — renameConversation', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.setState({
      conversations: [
        { ...SAMPLE_RECORDS[0] },
        { ...SAMPLE_RECORDS[1] },
      ],
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('renameConversation 호출 시 conversationRename IPC를 경유한다', async () => {
    const calls: unknown[] = []
    const original = mockApi.conversationRename
    mockApi.conversationRename = async (req) => {
      calls.push(req)
      return { ok: true }
    }

    await useAppStore.getState().renameConversation('conv-1', '새 이름')

    mockApi.conversationRename = original
    expect(calls).toHaveLength(1)
    expect((calls[0] as { id: string; title: string }).id).toBe('conv-1')
    expect((calls[0] as { id: string; title: string }).title).toBe('새 이름')
  })

  it('renameConversation 성공 시 로컬 conversations의 해당 항목 title이 갱신된다', async () => {
    await useAppStore.getState().renameConversation('conv-1', '수정된 제목')
    const { conversations } = useAppStore.getState()
    const target = conversations.find((c) => c.id === 'conv-1')
    expect(target?.title).toBe('수정된 제목')
  })

  it('renameConversation 시 다른 항목 title은 변경되지 않는다', async () => {
    await useAppStore.getState().renameConversation('conv-1', '수정')
    const { conversations } = useAppStore.getState()
    const other = conversations.find((c) => c.id === 'conv-2')
    expect(other?.title).toBe('두 번째 대화')
  })

  it('conversationRename이 ok:false 반환 시 로컬 목록 title 미변경', async () => {
    mockApi.conversationRename = async () => ({ ok: false })
    await useAppStore.getState().renameConversation('conv-1', '실패한 이름')
    mockApi.conversationRename = async () => ({ ok: true })
    const { conversations } = useAppStore.getState()
    const target = conversations.find((c) => c.id === 'conv-1')
    expect(target?.title).toBe('첫 번째 대화')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — deleteConversation', () => {
  beforeEach(() => {
    resetStore()
    useAppStore.setState({
      conversations: [
        { ...SAMPLE_RECORDS[0] },
        { ...SAMPLE_RECORDS[1] },
      ],
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('deleteConversation 호출 시 conversationDelete IPC를 경유한다', async () => {
    const calls: unknown[] = []
    const original = mockApi.conversationDelete
    mockApi.conversationDelete = async (req) => {
      calls.push(req)
      return { ok: true }
    }

    await useAppStore.getState().deleteConversation('conv-2')

    mockApi.conversationDelete = original
    expect(calls).toHaveLength(1)
    expect((calls[0] as { id: string }).id).toBe('conv-2')
  })

  it('deleteConversation 성공 시 해당 id가 conversations에서 제거된다', async () => {
    await useAppStore.getState().deleteConversation('conv-2')
    const { conversations } = useAppStore.getState()
    expect(conversations.find((c) => c.id === 'conv-2')).toBeUndefined()
    expect(conversations).toHaveLength(1)
    expect(conversations[0].id).toBe('conv-1')
  })

  it('활성 대화(conversationId === 삭제 id) 삭제 시 conversationId가 null이 된다', async () => {
    useAppStore.setState({ conversationId: 'conv-1' } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().deleteConversation('conv-1')
    expect(useAppStore.getState().conversationId).toBeNull()
  })

  it('활성 대화 삭제 시 messages가 빈 배열이 된다', async () => {
    useAppStore.setState({
      conversationId: 'conv-1',
      messages: [{ id: 'm-1', role: 'user', content: '텍스트' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().deleteConversation('conv-1')
    expect(useAppStore.getState().messages).toHaveLength(0)
  })

  it('비활성 대화 삭제 시 현재 messages는 유지된다', async () => {
    useAppStore.setState({
      conversationId: 'conv-1',
      messages: [{ id: 'm-1', role: 'user', content: '유지' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().deleteConversation('conv-2')
    expect(useAppStore.getState().conversationId).toBe('conv-1')
    expect(useAppStore.getState().messages).toHaveLength(1)
  })

  it('conversationDelete ok:false 시 목록에서 제거하지 않는다', async () => {
    mockApi.conversationDelete = async () => ({ ok: false })
    await useAppStore.getState().deleteConversation('conv-1')
    mockApi.conversationDelete = async () => ({ ok: true })
    const { conversations } = useAppStore.getState()
    expect(conversations.find((c) => c.id === 'conv-1')).toBeDefined()
    expect(conversations).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — newConversation', () => {
  beforeEach(() => resetStore())

  it('newConversation 호출 후 messages가 빈 배열이 된다', () => {
    useAppStore.setState({
      messages: [{ id: 'm-1', role: 'user', content: '이전 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().messages).toHaveLength(0)
  })

  it('newConversation 호출 후 conversationId가 null이 된다', () => {
    useAppStore.setState({ conversationId: 'conv-1' } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().conversationId).toBeNull()
  })

  it('newConversation 호출 후 thread가 빈 배열이 된다', () => {
    // Phase A-2: streamingText 제거 → thread 기반
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '기존 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().thread).toHaveLength(0)
  })

  it('newConversation 호출 후 isRunning이 false이다', () => {
    useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().isRunning).toBe(false)
  })

  it('newConversation 호출 후 errorMessage가 undefined이다', () => {
    useAppStore.setState({ errorMessage: '오류 메시지' } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().errorMessage).toBeUndefined()
  })

  it('newConversation 호출 후 attachedImages가 빈 배열이다', () => {
    useAppStore.setState({
      attachedImages: [{ path: '/tmp/a.png', dataUrl: 'data:image/png;base64,A' }],
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().attachedImages).toHaveLength(0)
  })

  it('newConversation 호출 후 queue가 빈 배열이다', () => {
    useAppStore.setState({
      queue: [{ id: 'q1', text: '예약', images: [] }],
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().newConversation()
    expect(useAppStore.getState().queue).toHaveLength(0)
  })

  it('newConversation 은 IPC를 호출하지 않는다 (renderer 상태 리셋만)', () => {
    const loadCallsBefore = 0
    let loadCallsAfter = 0
    const original = mockApi.conversationLoad
    mockApi.conversationLoad = async (req) => {
      loadCallsAfter++
      return original(req)
    }
    useAppStore.getState().newConversation()
    mockApi.conversationLoad = original
    // 동기 호출이므로 즉시 검증 가능 (Promise 없음)
    expect(loadCallsAfter).toBe(loadCallsBefore)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — selectConversations 셀렉터', () => {
  beforeEach(() => resetStore())

  it('selectConversations 셀렉터가 conversations 배열을 반환한다', async () => {
    const { selectConversations } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      conversations: [{ ...SAMPLE_RECORDS[0] }],
    } as Parameters<typeof useAppStore.setState>[0])
    const result = selectConversations(useAppStore.getState())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('conv-1')
  })

  it('초기 상태에서 selectConversations는 빈 배열이다', async () => {
    const { selectConversations } = await import('../../../02.Source/renderer/src/store/appStore')
    const result = selectConversations(useAppStore.getState())
    expect(result).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('session-crud — saveConversation 후 listConversations 갱신', () => {
  beforeEach(() => resetStore())

  it('saveConversation 완료 후 listConversations가 호출된다 (사이드바 즉시 반영)', async () => {
    // listConversations 호출 여부 추적
    let listCallCount = 0
    const { listConversations } = useAppStore.getState()
    useAppStore.setState({
      listConversations: async () => {
        listCallCount++
        return listConversations()
      },
    } as Parameters<typeof useAppStore.setState>[0])

    // Phase A-2: thread가 있어야 saveConversation이 동작함
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '저장 테스트' }],
      messages: [{ id: 'm-1', role: 'user', content: '저장 테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().saveConversation()

    // saveConversation 내부에서 listConversations가 호출됐는지 확인
    // (비동기 void 호출이므로 약간의 지연 후 확인)
    await new Promise((r) => setTimeout(r, 50))
    expect(listCallCount).toBeGreaterThanOrEqual(1)
  })
})

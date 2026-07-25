/**
 * cp1-p05-subagent-persist-store.test.ts — CP1 P05 서브에이전트 영속 store 배선 통합 TDD.
 *
 * 대상:
 *   - store/slices/conversation.ts loadConversation — 서브에이전트 앵커 복원 + done 동결.
 *   - store/slices/sessions.ts selectConversation(디스크 경로) — 동일 복원 + S9b stale 봉합.
 *
 * 검증 범위:
 *   T1: loadConversation — conv.subagents 있으면 thread에 마커 재삽입 + state.subagents done 동결.
 *   T2: loadConversation — conv.subagents 없으면 state.subagents=[](빈 배열, undefined 아님).
 *   T3: selectConversation — 서브에이전트 있는 대화 A 선택 → thread/subagents 정확 복원.
 *   T4: selectConversation — S9b 회귀: subagents 있는 대화 A → 없는 대화 B로 전환 시
 *       state.subagents가 A의 값으로 고착되지 않고 []로 리셋된다(stale 미노출).
 *
 * 아키텍처 준수: window.api mock → store 액션 → 상태 갱신(단방향). fs/Node 직접 0.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord } from '../../../02.Source/shared/ipc-contract'

// ── window.api stub ────────────────────────────────────────────────────────────

const CONV_WITH_SUBAGENTS: ConversationRecord = {
  id: 'conv-sub-a',
  title: '서브에이전트 있는 대화',
  messages: [
    { role: 'user', content: '탐색해줘' },
    { role: 'assistant', content: '완료했습니다' },
  ],
  backendId: 'claude-code',
  createdAt: '2026-07-04T00:00:00Z',
  updatedAt: '2026-07-04T00:01:00Z',
  subagents: [
    {
      id: 'sub-1',
      name: 'general-purpose',
      role: 'explorer',
      status: 'running',
      tools: [{ id: 't1', verb: 'bash', target: 'ls', status: 'running' }],
      transcript: [{ kind: 'tool', verb: 'bash', target: 'ls', status: 'running', id: 'tr-1' }],
      afterMessageIndex: 1,
    },
  ],
}

const CONV_WITHOUT_SUBAGENTS: ConversationRecord = {
  id: 'conv-plain-b',
  title: '평범한 대화',
  messages: [{ role: 'user', content: '안녕' }],
  backendId: 'claude-code',
  createdAt: '2026-07-04T00:02:00Z',
  updatedAt: '2026-07-04T00:02:00Z',
}

const mockApi = {
  getUiPrefs: vi.fn(async () => ({} as Record<string, unknown>)),
  setUiPref: vi.fn(async () => ({ ok: true })),
  conversationLoad: vi.fn(async (req: { id?: string; limit?: number }) => {
    if (req.id === CONV_WITH_SUBAGENTS.id) return { conversations: [CONV_WITH_SUBAGENTS] }
    if (req.id === CONV_WITHOUT_SUBAGENTS.id) return { conversations: [CONV_WITHOUT_SUBAGENTS] }
    if (req.id) return { conversations: [] }
    // 목록/마운트 모드: 서브에이전트 있는 대화를 최신으로 반환(loadConversation limit:1 경로).
    return { conversations: [CONV_WITH_SUBAGENTS] }
  }),
  conversationSave: vi.fn(async () => ({ id: 'conv-new-99' })),
  conversationDelete: vi.fn(async () => ({ ok: true })),
  conversationRename: vi.fn(async () => ({ ok: true })),
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

function resetStore() {
  useAppStore.setState({
    conversations: [],
    messages: [],
    conversationId: null,
    thread: [],
    subagents: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    currentRunId: null,
    sessionId: undefined,
    lastContextWindow: undefined,
    lastUsage: undefined,
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
    bgRuns: {},
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── T1/T2: loadConversation ───────────────────────────────────────────────────

describe('loadConversation — 서브에이전트 앵커 복원(T1) + 없으면 빈 배열(T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it('T1a: conv.subagents 있으면 thread에 {kind:subagent,id} 마커가 정확한 위치(afterMessageIndex:1)에 재삽입된다', async () => {
    await useAppStore.getState().loadConversation()

    const { thread } = useAppStore.getState()
    const kinds = thread.map((t) => (t.kind === 'subagent' ? `subagent:${t.id}` : t.kind))
    // messages 2개(user, assistant) + afterMessageIndex:1 → msg[0] 다음, msg[1] 앞.
    expect(kinds).toEqual(['msg', 'subagent:sub-1', 'msg'])
  })

  it('T1b: conv.subagents 있으면 state.subagents가 done으로 동결되어 복원된다', async () => {
    await useAppStore.getState().loadConversation()

    const { subagents } = useAppStore.getState()
    expect(subagents).toHaveLength(1)
    expect(subagents[0].status).toBe('done')
    expect(subagents[0].tools[0].status).toBe('done')
    expect(subagents[0].transcript?.[0].status).toBe('done')
    expect('afterMessageIndex' in subagents[0]).toBe(false)
  })

  it('T2: conv.subagents 없으면 state.subagents는 빈 배열(undefined 아님)', async () => {
    mockApi.conversationLoad.mockResolvedValueOnce({ conversations: [CONV_WITHOUT_SUBAGENTS] })

    await useAppStore.getState().loadConversation()

    expect(useAppStore.getState().subagents).toEqual([])
  })
})

// ── T3/T4: selectConversation(디스크 경로) ────────────────────────────────────

describe('selectConversation — 서브에이전트 복원(T3) + S9b stale 봉합 회귀(T4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it('T3: 서브에이전트 있는 대화 A 선택 → thread 마커 재삽입 + state.subagents done 동결', async () => {
    await useAppStore.getState().selectConversation(CONV_WITH_SUBAGENTS.id)

    const { thread, subagents } = useAppStore.getState()
    const kinds = thread.map((t) => (t.kind === 'subagent' ? `subagent:${t.id}` : t.kind))
    expect(kinds).toEqual(['msg', 'subagent:sub-1', 'msg'])
    expect(subagents).toHaveLength(1)
    expect(subagents[0].status).toBe('done')
  })

  it('T4: A(서브에이전트 있음) → B(서브에이전트 없음) 전환 시 state.subagents가 []로 리셋된다(stale 미노출)', async () => {
    // 1) A 선택 — subagents가 채워진다.
    await useAppStore.getState().selectConversation(CONV_WITH_SUBAGENTS.id)
    expect(useAppStore.getState().subagents).toHaveLength(1)

    // 2) B 선택(다른 대화, 실행 중 아님 — bgRuns 미개입, 디스크 경로 그대로 통과).
    await useAppStore.getState().selectConversation(CONV_WITHOUT_SUBAGENTS.id)

    const state = useAppStore.getState()
    expect(state.conversationId).toBe(CONV_WITHOUT_SUBAGENTS.id)
    // S9b 실봉합 확인 지점: A의 subagents가 B로 전환 후에도 고착되면 실패.
    expect(state.subagents).toEqual([])
  })

  it('T4-역: B(없음) → A(있음) 전환 시 A의 서브에이전트가 정상 표시된다(리셋 로직이 과잉 억제하지 않음)', async () => {
    await useAppStore.getState().selectConversation(CONV_WITHOUT_SUBAGENTS.id)
    expect(useAppStore.getState().subagents).toEqual([])

    await useAppStore.getState().selectConversation(CONV_WITH_SUBAGENTS.id)
    expect(useAppStore.getState().subagents).toHaveLength(1)
    expect(useAppStore.getState().subagents[0].id).toBe('sub-1')
  })
})

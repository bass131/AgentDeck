/**
 * resume-session.test.ts — Phase 1 맥락 복구(REPL_TRANSITION) 렌더러 배선 단위.
 *
 * 검증:
 *   S1: reducer가 session 이벤트 → state.sessionId 설정 (단일·멀티 공유 — applyAgentEvent).
 *   S2: makeInitialState/clearConversation → sessionId undefined (휘발 리셋).
 *   S3: panelSession buildAgentRunArgs가 resumeSessionId 운반.
 *   S4: appStore sendMessage가 저장된 sessionId를 agentRun.resumeSessionId로 전달.
 *   S9: [NG-2(a) 진단, 2026-07-04 영호 재육안] loadConversation은 subagents를 복원하지
 *       않는다 — 영속 스키마(ConversationMessage={role,content})와 저장 필터
 *       (conversationPayload.ts buildConversationSavePayload: thread.filter(kind==='msg'))가
 *       애초에 서브에이전트 카드(따라서 model 필드)를 저장 대상에서 제외하기 때문(main
 *       persistence 변경 없이는 고칠 수 없음 — 재시작 후 서브에이전트 카드/모델 배지 전멸은
 *       "배지 없음이 정답"으로 분류. 회귀 방지: 이 동작이 나중에 실수로 "고쳐진 것처럼"
 *       보이면(예: subagents가 부분 복원되는데 model만 빠짐) 이 테스트가 드러낸다).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  fsRead: async () => ({ kind: 'not-found' }),
  // prefs IPC — saveConversation/selectConversation에서 setPref 호출
  setUiPref: async (_req: { key: string; value: unknown }) => ({ ok: true }),
}
Object.defineProperty(globalThis, 'window', { value: { api: mockApi }, writable: true, configurable: true })

function sessionPayload(sessionId: string): AgentEventPayload {
  return { runId: 'r1', event: { type: 'session', sessionId } }
}

describe('reducer — session 이벤트 (S1/S2)', () => {
  it('S1: session 이벤트 → state.sessionId 설정', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, sessionPayload('sess-111'))
    expect(s1.sessionId).toBe('sess-111')
  })

  it('S1b: 후속 session 이벤트 → sessionId 갱신', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, sessionPayload('sess-A'))
    s = applyAgentEvent(s, sessionPayload('sess-B'))
    expect(s.sessionId).toBe('sess-B')
  })

  it('S2: makeInitialState → sessionId undefined (휘발)', () => {
    expect(makeInitialState().sessionId).toBeUndefined()
  })
})

describe('panelSession — buildAgentRunArgs resumeSessionId (S3)', () => {
  it('S3: opts.resumeSessionId 운반', async () => {
    const { buildAgentRunArgs } = await import('../../../02.Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { resumeSessionId: 'sess-panel-1' },
    )
    expect(args.resumeSessionId).toBe('sess-panel-1')
  })

  it('S3b: resumeSessionId 미전달 → undefined (회귀 0)', async () => {
    const { buildAgentRunArgs } = await import('../../../02.Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs([{ role: 'user', content: 'hi' }])
    expect(args.resumeSessionId).toBeUndefined()
  })
})

describe('appStore — sendMessage resumeSessionId (S4)', () => {
  let captured: Record<string, unknown> | null = null
  beforeEach(() => {
    captured = null
  })

  it('S4: 저장된 sessionId를 agentRun.resumeSessionId로 전달', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    // agentRun 캡처
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.agentRun = async (req: Record<string, unknown>) => {
      captured = req
      return { runId: 'r1' }
    }
    useAppStore.setState({ sessionId: 'sess-restore-9', isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('안녕')
    expect(captured?.resumeSessionId).toBe('sess-restore-9')
  })

  it('S4b: sessionId 없으면 resumeSessionId undefined', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.agentRun = async (req: Record<string, unknown>) => {
      captured = req
      return { runId: 'r1' }
    }
    useAppStore.setState({ sessionId: undefined, isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('안녕')
    expect(captured?.resumeSessionId).toBeUndefined()
  })
})

describe('appStore — sessionId 영속 (S5/S6 Phase 1.5 — 재시작 후 resume)', () => {
  it('S5: saveConversation이 state.sessionId를 conversationSave 페이로드에 포함', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    let saved: Record<string, unknown> | null = null
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationSave = async (req: { conversation: Record<string, unknown> }) => {
      saved = req.conversation
      return { id: 'cv-1' }
    }
    useAppStore.setState({
      sessionId: 'sess-save-1',
      thread: [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }],
      conversationId: null,
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().saveConversation()
    expect((saved as { sessionId?: string } | null)?.sessionId).toBe('sess-save-1')
  })

  it('S6: loadConversation이 conv.sessionId를 state.sessionId로 복원', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationLoad = async () => ({
      conversations: [{
        id: 'c1', title: 't', messages: [{ role: 'user', content: 'hi' }],
        backendId: 'claude-code', createdAt: '', updatedAt: '', sessionId: 'sess-load-9',
      }],
    })
    useAppStore.getState().clearConversation()
    await useAppStore.getState().loadConversation()
    expect(useAppStore.getState().sessionId).toBe('sess-load-9')
  })

  it('S7: saveConversation이 lastContextWindow/lastUsage를 페이로드에 포함 (게이지 영속)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    let saved: Record<string, unknown> | null = null
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationSave = async (req: { conversation: Record<string, unknown> }) => {
      saved = req.conversation
      return { id: 'cv-1' }
    }
    useAppStore.setState({
      lastContextWindow: 200000,
      lastUsage: { inputTokens: 1200, outputTokens: 340 },
      thread: [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }],
      conversationId: null,
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().saveConversation()
    expect((saved as { lastContextWindow?: number } | null)?.lastContextWindow).toBe(200000)
    expect((saved as { lastUsage?: { inputTokens: number } } | null)?.lastUsage).toEqual({ inputTokens: 1200, outputTokens: 340 })
  })

  it('S8: selectConversation이 conv.lastContextWindow/lastUsage를 state로 복원 (재시작 후 게이지)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationLoad = async () => ({
      conversations: [{
        id: 'c1', title: 't', messages: [{ role: 'user', content: 'hi' }],
        backendId: 'claude-code', createdAt: '', updatedAt: '',
        lastContextWindow: 175000, lastUsage: { inputTokens: 900, outputTokens: 120 },
      }],
    })
    useAppStore.getState().clearConversation()
    await useAppStore.getState().selectConversation('c1')
    expect(useAppStore.getState().lastContextWindow).toBe(175000)
    expect(useAppStore.getState().lastUsage).toEqual({ inputTokens: 900, outputTokens: 120 })
  })

  it('S9a: [NG-2(a)] 콜드부팅 복원(재시작 실제 경로) — subagents는 [] 그대로, model 배지 낼 데이터 자체가 없다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationLoad = async () => ({
      conversations: [{
        id: 'c-ng2a',
        title: 't',
        // ConversationMessage={role,content}뿐 — 서브에이전트 name/role/model/tools를
        // 담을 필드가 계약(shared/ipc/agent.ts ConversationMessage)에 애초에 없다.
        messages: [
          { role: 'user', content: 'Task 도구로 서브에이전트 하나 실행해줘' },
          { role: 'assistant', content: '완료했습니다.' },
        ],
        backendId: 'claude-code',
        createdAt: '',
        updatedAt: '',
      }],
    })
    // 앱 콜드부팅 실제 초기값(makeInitialState)과 동일한 subagents:[]에서 시작.
    useAppStore.getState().clearConversation()
    expect(useAppStore.getState().subagents).toEqual([])
    await useAppStore.getState().loadConversation()
    // 대화(+서브에이전트 활동)가 있었던 대화를 로드해도 subagents는 여전히 빈 배열
    // (loadConversation이 subagents 필드를 전혀 채우지 않음 — 카드 자체가 재생성되지 않으므로
    // 모델 배지를 낼 데이터가 원천적으로 없다. "배지 없음이 정답"의 근거).
    expect(useAppStore.getState().subagents).toEqual([])
    // thread에도 서브에이전트 마커(kind:'subagent')가 전혀 없다 — 순수 텍스트 msg만 복원됨.
    const thread = useAppStore.getState().thread
    expect(thread.some((it) => it.kind === 'subagent')).toBe(false)
    expect(thread.every((it) => it.kind === 'msg')).toBe(true)
  })

  it('S9b: [NG-2(a) 부가 실측] loadConversation은 set()이 얕은 병합이라 subagents 필드를 아예 건드리지 않는다(clearConversation 없이 연속 로드 시 이전 대화의 stale subagents가 남을 수 있음 — 별도 잠재 이슈, 이 테스트로 계약만 고정)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationLoad = async () => ({
      conversations: [{
        id: 'c-ng2a-2', title: 't', messages: [{ role: 'user', content: 'hi' }],
        backendId: 'claude-code', createdAt: '', updatedAt: '',
      }],
    })
    const stale = [
      { id: 'sa-stale', name: 'general-purpose', role: '이전 대화 작업', status: 'done' as const, model: 'claude-opus-4-8', tools: [] },
    ]
    useAppStore.setState({ subagents: stale } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().loadConversation()
    // clearConversation 없이 loadConversation만 호출하면 subagents가 그대로 남는다(비의도적
    // side effect — loadConversation의 책임 범위 밖이라 이 테스트는 수정 요구가 아니라 실측 고정).
    expect(useAppStore.getState().subagents).toEqual(stale)
  })
})

/**
 * resume-session.test.ts — Phase 1 맥락 복구(REPL_TRANSITION) 렌더러 배선 단위.
 *
 * 검증:
 *   S1: reducer가 session 이벤트 → state.sessionId 설정 (단일·멀티 공유 — applyAgentEvent).
 *   S2: makeInitialState/clearConversation → sessionId undefined (휘발 리셋).
 *   S3: panelSession buildAgentRunArgs가 resumeSessionId 운반.
 *   S4: appStore sendMessage가 저장된 sessionId를 agentRun.resumeSessionId로 전달.
 *   S9a: [NG-2(a) 진단, 2026-07-04 영호 재육안 — CP1 P05로 해소] 서브에이전트 데이터가
 *       *없는*(subagents 필드 자체가 없는 레거시) 대화를 로드하면 subagents는 []로 남는다
 *       (모델 배지 낼 데이터가 없으니 배지 없음이 정답 — 회귀 0).
 *   S9b: [CP1 P05 봉합] loadConversation의 set()이 subagents를 명시적으로 채운다
 *       (freezePersistedSubagents — conversationPayload.ts) — conv.subagents 있으면 done
 *       동결 복원, 없으면 []. 과거엔 이 필드를 set()에서 아예 건드리지 않아(얕은 병합) 이전
 *       대화의 stale subagents가 clearConversation 없이 연속 로드 시 그대로 남는 버그가
 *       있었다(예전 이 테스트가 그 버그를 "실측 고정"으로 문서화) — CP1 P05가 명시적 필드
 *       배선으로 이를 봉합했다.
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

  it('S9a: [NG-2(a), CP1 P05 이후] subagents 필드가 없는 레거시 대화를 로드하면 subagents는 [] — model 배지 낼 데이터 자체가 없다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    ;(globalThis.window as unknown as { api: Record<string, unknown> }).api.conversationLoad = async () => ({
      conversations: [{
        id: 'c-ng2a',
        title: 't',
        // subagents 필드 자체를 저장하지 않은 레거시/구버전 대화(CP1 P05 이전 저장분과 동형).
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
    // conv.subagents 미설정(undefined) → freezePersistedSubagents(undefined) === []
    // (복원할 데이터가 없으니 배지 없음이 정답 — 회귀 0, CP1 P05 이후에도 동일).
    expect(useAppStore.getState().subagents).toEqual([])
    // thread에도 서브에이전트 마커(kind:'subagent')가 없다 — 순수 텍스트 msg만 복원됨.
    const thread = useAppStore.getState().thread
    expect(thread.some((it) => it.kind === 'subagent')).toBe(false)
    expect(thread.every((it) => it.kind === 'msg')).toBe(true)
  })

  it('S9b: [CP1 P05 봉합] loadConversation의 set()이 subagents를 명시적으로 리셋 — stale 미노출(과거 버그 수정 확인)', async () => {
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
    // CP1 P05: loadConversation의 set()이 subagents: freezePersistedSubagents(conv.subagents)를
    // 명시적으로 포함한다 — conv.subagents 미설정(이 대화)이면 []. clearConversation 없이
    // 연속 로드해도 이전 대화(stale)의 subagents가 더 이상 새어들지 않는다(과거 버그 봉합).
    expect(useAppStore.getState().subagents).toEqual([])
  })
})

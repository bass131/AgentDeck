/**
 * resume-session.test.ts — Phase 1 맥락 복구(REPL_TRANSITION) 렌더러 배선 단위.
 *
 * 검증:
 *   S1: reducer가 session 이벤트 → state.sessionId 설정 (단일·멀티 공유 — applyAgentEvent).
 *   S2: makeInitialState/clearConversation → sessionId undefined (휘발 리셋).
 *   S3: panelSession buildAgentRunArgs가 resumeSessionId 운반.
 *   S4: appStore sendMessage가 저장된 sessionId를 agentRun.resumeSessionId로 전달.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../src/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

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
    const { buildAgentRunArgs } = await import('../../src/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { resumeSessionId: 'sess-panel-1' },
    )
    expect(args.resumeSessionId).toBe('sess-panel-1')
  })

  it('S3b: resumeSessionId 미전달 → undefined (회귀 0)', async () => {
    const { buildAgentRunArgs } = await import('../../src/renderer/src/store/panelSession')
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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
})

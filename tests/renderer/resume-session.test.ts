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

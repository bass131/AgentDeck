/**
 * lr4-p01-interrupt-stuck-repro.test.ts — LR4 Phase 01(c) RED 재현.
 *
 * main의 agent.interrupt 응답이 accepted:false이면 currentRunId는 이미 없거나 완료된
 * 죽은 run이다. 현재 renderer interruptRun은 응답을 무시해 done/error가 다시 오지 않는
 * isRunning=true 상태를 영구 유지한다. P04 전까지 `it.fails`로 박제하고, 죽은 run 로컬
 * 정리가 구현되면 `.fails`를 제거해 GREEN으로 전환한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'

const mockInterrupt = vi.fn(async () => ({ accepted: false }))

Object.defineProperty(globalThis, 'window', {
  value: {
    api: {
      conversationLoad: async () => ({ conversations: [] }),
      conversationSave: async () => ({ id: 'cv-1' }),
      agentRun: async () => ({ runId: 'run-new' }),
      agentAbort: async () => ({ accepted: false }),
      agentInterrupt: mockInterrupt,
      onAgentEvent: () => () => {},
      listFiles: async () => ({ files: [] }),
      pathForFile: () => '',
      workspaceOpen: async () => ({ rootPath: null, tree: null }),
      referenceList: async () => ({ references: [] }),
      referenceTree: async () => ({ tree: null }),
      referenceAdd: async () => ({ reference: null }),
      fsRead: async () => ({ kind: 'not-found' }),
    },
  },
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

describe('LR4-P01 — 죽은 run interrupt의 renderer stuck', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    mockInterrupt.mockClear()
    mockInterrupt.mockResolvedValue({ accepted: false })
    useAppStore.setState({
      ...makeInitialState(),
      currentRunId: 'run-already-dead',
      isRunning: true,
      thinkingText: '끝나지 않는 표시',
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it.fails('(c) interrupt가 accepted:false면 죽은 run의 isRunning/currentRunId를 로컬 정리해야 한다', async () => {
    await useAppStore.getState().interruptRun()

    expect(mockInterrupt).toHaveBeenCalledWith({ runId: 'run-already-dead' })
    const state = useAppStore.getState()
    expect(state.isRunning).toBe(false)
    expect(state.currentRunId).toBeNull()
    expect(state.thinkingText).toBeNull()
  })
})

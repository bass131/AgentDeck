import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getReplModeDefault,
  setReplModeDefault,
  __resetReplModeDefaultForTests,
} from '../../../02_Source/renderer/src/lib/replModeDefault'
import { makeInitialState } from '../../../02_Source/renderer/src/store/reducer'

const recordLegacy = {
  id: 'conv-legacy-migrate',
  title: '옛 대화(마이그 전)',
  messages: [{ role: 'user', content: '옛 메시지' }],
  backendId: 'claude-code',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}
const mockApi = {
  conversationLoad: vi.fn(async () => ({ conversations: [recordLegacy] })),
  conversationSave: vi.fn(async () => ({ id: 'conv-legacy-migrate' })),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
}
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  __resetReplModeDefaultForTests()
})

describe('LR4 P07 — replModeDefault 모듈 계약 (getReplModeDefault/setReplModeDefault/reset)', () => {
  it('미시드 기본값은 true (held-open 지속세션이 기본 — ADR-024/LR3-03 정합)', () => {
    expect(getReplModeDefault()).toBe(true)
  })

  it('setReplModeDefault(false) → getReplModeDefault()===false (전역 마이그값 흡수)', () => {
    setReplModeDefault(false)
    expect(getReplModeDefault()).toBe(false)
  })

  it('setReplModeDefault(true) → getReplModeDefault()===true', () => {
    setReplModeDefault(false)
    setReplModeDefault(true)
    expect(getReplModeDefault()).toBe(true)
  })

  it('__resetReplModeDefaultForTests() → 미시드 기본(true)으로 복귀', () => {
    setReplModeDefault(false)
    __resetReplModeDefaultForTests()
    expect(getReplModeDefault()).toBe(true)
  })
})

describe('LR4 P07 시나리오 4: 시드된 전역 마이그값이 로드 폴백으로 적용', () => {
  async function getStore() {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    return useAppStore
  }

  it('setReplModeDefault(false) 후 옛 레코드 로드 → store.replMode=false (마이그값 폴백)', async () => {
    const useAppStore = await getStore()
    setReplModeDefault(false)
    useAppStore.setState({
      ...makeInitialState(),
      conversationId: null,
      replMode: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().loadConversation()

    expect(useAppStore.getState().replMode).toBe(false)
  })
})

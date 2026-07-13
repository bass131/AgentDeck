/**
 * gap1-p02-model-persist.test.ts — GAP1 P02(c 렌더러 부분, I-03) 모델 대화별 영속 (TDD).
 *
 * Composer.tsx의 로컬 `model` useState(대화 전환/remount마다 DEFAULT_MODEL로 초기화되던
 * 버그)를 store로 리프팅 + 대화별 영속(저장/복원)한다. LR4 P07(replMode 대화별 영속)의
 * 정본 선례를 그대로 미러(시나리오 구조·store 헬퍼·mock window.api 패턴 동일) — main
 * 저장소(02.Source/main/04_persistence/store.ts)의 model sanitize/persist 배선은 이미
 * 완료됨(GAP1 P02 Worker D, 99.Others/tests/main/gap1-p02-model-persist.test.ts).
 * 이 파일은 renderer 측(store slice conversation/sessions + conversationPayload 빌더)만 검증한다.
 *
 * 시나리오:
 *   1. 대화 A(model='sonnet')/B(미설정) 독립 복원 — selectConversation. A의 선택이 B로 새지 않음.
 *   2. 영속 라운드트립 — buildConversationSavePayload({model})→payload.model (미지정 시 omit).
 *   3. loadConversation(마운트 시 최근 1건) 복원 — model 있으면 복원, 없으면 DEFAULT_MODEL 폴백.
 *
 * CRITICAL(신뢰경계): window.api 경유만 — fs/Node 직접 0. 엔진 리터럴 미포함(ADR-003).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import { buildConversationSavePayload } from '../../../02.Source/renderer/src/store/slices/conversationPayload'
import type { ConversationPayloadSource } from '../../../02.Source/renderer/src/store/slices/conversationPayload'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import { DEFAULT_MODEL } from '../../../02.Source/renderer/src/lib/pickerOptions'

// ── mock window.api ──────────────────────────────────────────────────────────────

const recordA = {
  id: 'conv-A',
  title: '대화 A',
  messages: [
    { role: 'user', content: '안녕 A' },
    { role: 'assistant', content: '반가워 A' },
  ],
  backendId: 'claude-code',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  model: 'sonnet',
}
const recordB = {
  id: 'conv-B',
  title: '대화 B',
  messages: [{ role: 'user', content: '안녕 B' }],
  backendId: 'claude-code',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  // model 필드 없음(마이그레이션 전/미선택 레코드)
}

const mockApi = {
  conversationLoad: vi.fn(async (req?: { id?: string; limit?: number }) => {
    if (req?.id === 'conv-A') return { conversations: [recordA] }
    if (req?.id === 'conv-B') return { conversations: [recordB] }
    // limit 모드(loadConversation limit:1) → 기본 A를 최근 대화로.
    return { conversations: [recordA] }
  }),
  conversationSave: vi.fn(async () => ({ id: 'conv-A' })),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => ({ runId: (req.sessionKey as string) ?? 'r1' })),
  agentAbort: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
  pathForFile: () => '',
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 공통 store 헬퍼 (LR4 P07 미러) ──────────────────────────────────────────────

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

/** resetStore — 각 테스트가 깨끗한 대화 상태 + selectedModel을 명시 제어하도록 초기화. */
function resetStore(
  useAppStore: Awaited<ReturnType<typeof getStore>>,
  selectedModel: string
) {
  useAppStore.setState({
    ...makeInitialState(),
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    currentRunId: null,
    isRunning: false,
    bgRuns: {},
    selectedModel,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 1: 대화 A/B 독립 복원 — 한쪽 선택이 다른 쪽에 새지 않음(store-lift 복원 로직)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GAP1 P02 시나리오 1: 대화별 selectedModel 독립 복원(selectConversation)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('대화 A(model=sonnet) 선택 → store.selectedModel="sonnet" 복원', async () => {
    resetStore(useAppStore, DEFAULT_MODEL)
    await useAppStore.getState().selectConversation('conv-A')
    expect(useAppStore.getState().selectedModel).toBe('sonnet')
  })

  it('대화 B(model 미설정) 선택 → DEFAULT_MODEL 폴백(A의 sonnet이 새지 않음)', async () => {
    // 직전 대화가 sonnet이었던 상황에서 B로 전환.
    resetStore(useAppStore, 'sonnet')
    await useAppStore.getState().selectConversation('conv-B')
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 2: 영속 라운드트립 — buildConversationSavePayload가 model을 싣는다
// ═══════════════════════════════════════════════════════════════════════════════

describe('GAP1 P02 시나리오 2: conversationSave payload에 model 포함', () => {
  function sourceWith(model: string | undefined): ConversationPayloadSource {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }]
    return { thread, workspaceRoot: null, ...(model !== undefined ? { model } : {}) } as ConversationPayloadSource
  }

  it('source.model="haiku" → payload.model==="haiku"', () => {
    const payload = buildConversationSavePayload(sourceWith('haiku'), 'conv-x')
    expect(payload).not.toBeNull()
    expect((payload as { model?: string }).model).toBe('haiku')
  })

  it('source.model 미지정 → payload에 model 미포함(compat — 회귀 0)', () => {
    const payload = buildConversationSavePayload(sourceWith(undefined), 'conv-x')
    expect(payload).not.toBeNull()
    expect('model' in (payload as object)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 3: loadConversation(마운트 시 최근 1건) 복원 + 폴백
// ═══════════════════════════════════════════════════════════════════════════════

describe('GAP1 P02 시나리오 3: loadConversation model 복원(폴백 포함)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('최근 대화(recordA, model=sonnet) 로드 → store.selectedModel="sonnet"', async () => {
    resetStore(useAppStore, DEFAULT_MODEL)
    await useAppStore.getState().loadConversation() // limit:1 → recordA(model:'sonnet')
    expect(useAppStore.getState().selectedModel).toBe('sonnet')
  })

  it('conv.model 없는 레코드 로드 → DEFAULT_MODEL 폴백(크래시 0)', async () => {
    mockApi.conversationLoad.mockImplementationOnce(async () => ({ conversations: [recordB] }))
    resetStore(useAppStore, 'sonnet') // 직전 값이 남아있어도(sonnet) 새지 않고 폴백돼야 함
    await expect(useAppStore.getState().loadConversation()).resolves.toBeUndefined()
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)
  })
})

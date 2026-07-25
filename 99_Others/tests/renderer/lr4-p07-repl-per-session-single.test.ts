/**
 * lr4-p07-repl-per-session-single.test.ts — LR4 P07 RED 테스트 (TDD 1단계, 단일챗).
 *
 * 목표: 전역 단일 replMode(system.ts:38)를 대화별(ConversationRecord.replMode)로 이관한다.
 *   shared 계약은 이미 `ConversationRecord.replMode?: boolean`로 확장됨. 이 파일은 renderer
 *   단일챗 경로(store slice conversation/sessions/runtime + conversationPayload 빌더)를 검증한다.
 *
 * 이 파일은 *실패하는 테스트만* 작성한다(구현 없음):
 *   - loadConversation/selectConversation는 아직 conv.replMode를 store.replMode로 복원하지 않는다.
 *   - buildConversationSavePayload는 source.replMode를 payload에 싣지 않는다.
 *   - 그 결과 "복원된 세션의 replMode로 send가 게이트" 단언이 behavioral RED로 실패한다.
 *
 * 시나리오 매핑(코디네이터 4종 중):
 *   1. 세션 A/B 독립 토글(단일) — 대화 A(false) 복원 vs 대화 B(미설정) 기본 true.
 *   2. 영속 라운드트립(단일) — buildConversationSavePayload({replMode})→payload.replMode.
 *   3. held-open 세션별 정합(단일) — 복원 replMode=false 세션은 agentRun에 persistent/sessionKey 미포함.
 *   4. 하위호환 마이그(단일) — replMode 없는 옛 레코드 로드 시 크래시 0 + 폴백(미시드 기본 true).
 *
 * CRITICAL(신뢰경계): window.api 경유만 — fs/Node 직접 0. 엔진 리터럴 미포함(ADR-003).
 * 패턴 재사용: repl-mode.test.ts / lr2-01-replmode-default.test.ts(window.api mock + store).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import { buildConversationSavePayload } from '../../../02.Source/renderer/src/store/slices/conversationPayload'
import type { ConversationPayloadSource } from '../../../02.Source/renderer/src/store/slices/conversationPayload'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

// ── mock window.api ──────────────────────────────────────────────────────────────

// eslint-disable-next-line prefer-const
let capturedAgentRun: { [k: string]: unknown } | null = null

function getCapture(): { [k: string]: unknown } {
  if (!capturedAgentRun) throw new Error('agentRun이 호출되지 않음')
  return capturedAgentRun
}

// 대화 레코드 픽스처: A는 replMode=false(OFF 세션), B는 replMode 미설정(마이그 전).
const recordA = {
  id: 'conv-A',
  title: '대화 A',
  messages: [
    { role: 'user', content: '안녕 A' },
    { role: 'assistant', content: '반가워 A' },
  ],
  backendId: 'claude-code',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  replMode: false,
}
const recordB = {
  id: 'conv-B',
  title: '대화 B',
  messages: [{ role: 'user', content: '안녕 B' }],
  backendId: 'claude-code',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  // replMode 필드 없음 (마이그레이션 전 레코드)
}
// 옛 레코드(하위호환) — replMode 없음, 단일 메시지.
const recordLegacy = {
  id: 'conv-legacy',
  title: '옛 대화',
  messages: [{ role: 'user', content: '옛 메시지' }],
  backendId: 'claude-code',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}

const mockApi = {
  conversationLoad: vi.fn(async (req?: { id?: string; limit?: number }) => {
    if (req?.id === 'conv-A') return { conversations: [recordA] }
    if (req?.id === 'conv-B') return { conversations: [recordB] }
    if (req?.id === 'conv-legacy') return { conversations: [recordLegacy] }
    // limit 모드(loadConversation limit:1 / listConversations limit:20) → A를 최근 대화로.
    return { conversations: [recordA] }
  }),
  conversationSave: vi.fn(async () => ({ id: 'conv-A' })),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => {
    capturedAgentRun = req
    return { runId: (req.sessionKey as string) ?? 'r1' }
  }),
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

// ── 공통 store 헬퍼 ─────────────────────────────────────────────────────────────

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

/** resetStore — 각 테스트가 깨끗한 대화 상태 + replMode를 명시 제어하도록 초기화. */
function resetStore(
  useAppStore: Awaited<ReturnType<typeof getStore>>,
  replMode: boolean
) {
  capturedAgentRun = null
  mockApi.agentRun.mockClear()
  useAppStore.setState({
    ...makeInitialState(),
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    currentRunId: null,
    isRunning: false,
    bgRuns: {},
    replMode,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 1(단일): 대화 A/B 독립 복원 — 한쪽 토글이 다른 쪽에 새지 않음
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 1(단일): 대화별 replMode 독립 복원', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('대화 A(replMode=false) 선택 → store.replMode=false 복원', async () => {
    resetStore(useAppStore, true) // 기본 true 상태에서 시작
    await useAppStore.getState().selectConversation('conv-A')
    // A의 저장된 OFF가 그대로 복원되어야 한다.
    expect(useAppStore.getState().replMode).toBe(false)
  })

  it('대화 B(replMode 미설정) 선택 → 기본 true (A의 false가 새지 않음)', async () => {
    // 직전 대화가 OFF였던 상황(store.replMode=false)에서 B로 전환.
    resetStore(useAppStore, false)
    await useAppStore.getState().selectConversation('conv-B')
    // B는 자기 값이 없으므로 전역 마이그값→기본 true로 폴백 — 이전 대화 false가 새면 안 된다.
    expect(useAppStore.getState().replMode).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 2(단일): 영속 라운드트립 — buildConversationSavePayload가 replMode를 싣는다
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 2(단일): conversationSave payload에 replMode 포함', () => {
  function sourceWith(replMode: boolean | undefined): ConversationPayloadSource {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }]
    // replMode는 구현 후 ConversationPayloadSource에 추가되는 필드 — RED 단계 캐스팅.
    return { thread, workspaceRoot: null, ...(replMode !== undefined ? { replMode } : {}) } as ConversationPayloadSource
  }

  it('source.replMode=false → payload.replMode===false', () => {
    const payload = buildConversationSavePayload(sourceWith(false), 'conv-x')
    expect(payload).not.toBeNull()
    expect((payload as { replMode?: boolean }).replMode).toBe(false)
  })

  it('source.replMode=true → payload.replMode===true', () => {
    const payload = buildConversationSavePayload(sourceWith(true), 'conv-x')
    expect((payload as { replMode?: boolean }).replMode).toBe(true)
  })

  it('source.replMode 미지정 → payload에 replMode 미포함 (compat — 회귀 0)', () => {
    const payload = buildConversationSavePayload(sourceWith(undefined), 'conv-x')
    expect(payload).not.toBeNull()
    expect('replMode' in (payload as object)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 3(단일): held-open 게이트 — 복원 replMode로 send가 persistent 결정
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 3(단일): 복원된 세션 replMode로 send held-open 게이트', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('replMode=false 대화 로드 후 send → agentRun에 persistent/sessionKey 미포함', async () => {
    // 전역 기본 true 상태에서 로드로 시작 — 로드가 replMode를 false로 복원해야 게이트가 OFF로 정합.
    resetStore(useAppStore, true)
    await useAppStore.getState().loadConversation() // limit:1 → recordA(replMode:false)

    capturedAgentRun = null
    await useAppStore.getState().sendMessage('테스트')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    // 복원된 세션이 OFF이므로 held-open 게이트 미주입 — 단발 query 경로.
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 4(단일): 하위호환 마이그 — replMode 없는 옛 레코드 로드 시 폴백 + 크래시 0
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 4(단일): 옛 레코드 로드 하위호환 (크래시 0 + 폴백)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('replMode 미설정 옛 레코드 선택 → 크래시 0 + 폴백 기본 true (미시드 전역 마이그값)', async () => {
    // 직전 세션이 OFF였다고 가정(store.replMode=false)하고 옛 레코드로 전환.
    resetStore(useAppStore, false)
    // 크래시 0: selectConversation이 예외 없이 완료되어야 한다.
    await expect(useAppStore.getState().selectConversation('conv-legacy')).resolves.toBeUndefined()
    // 옛 레코드는 replMode가 없으므로 getReplModeDefault() 미시드 폴백값(true)이 적용되어야 한다.
    expect(useAppStore.getState().replMode).toBe(true)
  })
})

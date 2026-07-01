/**
 * lr2-04-sessionkey-stability.test.ts — LR2-04 held-open sessionKey 전환 안정화 RED 재현.
 *
 * 배경(04-heldopen-sessionkey-stabilize.md): runtime.ts의
 * `resolvedSessionKey = convId ?? currentSessionKey` 때문에 신규 대화의
 * turn1은 currentSessionKey(UUID)로 held-open 세션을 등록하고, turn1 후 저장으로
 * conversationId가 생기면 turn2는 conversationId를 키로 씀 → main의
 * persistentRuns(agent-runs.ts)에서 키 miss → **새 세션 생성 + turn1 세션 고아 잔존**.
 *
 * 처방(키 소스 일관화 — Phase 명시 옵션): replMode에서 conversationId가 없으면
 * agentRun *전에* saveConversation을 await해 id를 선확정 → 키가 대화 생애 내내
 * conversationId로 불변. main(agent-runs.ts, ADR-024 "🔴 회귀 최대위험 구역") 무변경.
 *
 * TDD 순서: 이 파일은 RED(현재 turn1 키=UUID ≠ turn2 키=convId) → 선저장 구현 후 GREEN.
 *
 * T1: 신규 대화 안정성 — replMode ON·convId=null에서 2회 send → 두 agentRun의
 *     sessionKey가 동일하고 conversationId와 일치. (현재 turn1이 UUID → RED)
 * T2: 기존 대화 회귀 0 — convId 보유 시 sessionKey === convId 그대로.
 * T3: 단발(OFF) 회귀 0 — persistent/sessionKey 미포함 유지(선저장이 OFF 경로에 새지 않음).
 *
 * CRITICAL(신뢰경계): window.api 경유만. fs/Node 직접 0.
 * CRITICAL(ADR-003): 엔진 리터럴 미포함.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'

// ── mock window.api (lr2-01 테스트와 동일 패턴) ─────────────────────────────

const capturedRuns: { [k: string]: unknown }[] = []

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: vi.fn(async () => ({ id: 'cv-stable-1' })),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => {
    capturedRuns.push(req)
    return { runId: (req.sessionKey as string) ?? `r${capturedRuns.length}` }
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
  setUiPref: async () => ({ ok: true }),
  getUiPrefs: async () => ({ prefs: {} }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
  capturedRuns.length = 0
  mockApi.agentRun.mockClear()
  mockApi.conversationSave.mockClear()
  useAppStore.setState({
    ...makeInitialState(),
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    activeLoop: null,
    currentRunId: null,
    isRunning: false,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ══════════════════════════════════════════════════════════════════════════════
// T1: 신규 대화 — turn1·turn2 sessionKey 동일 + conversationId 일치
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-04 T1: 신규 대화(convId=null)에서 sessionKey가 대화 생애 안정', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON·2회 send → 두 agentRun sessionKey 동일 && === conversationId (고아 세션 벡터 제거)', async () => {
    useAppStore.getState().setReplMode(true)

    // turn1: 신규 대화(convId=null)에서 send
    await useAppStore.getState().sendMessage('첫 메시지')
    // turn2: isRunning은 mock 이벤트가 없어 수동 해제(턴 경계 모사)
    useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('두 번째 메시지')

    expect(capturedRuns.length).toBe(2)
    const key1 = capturedRuns[0].sessionKey as string
    const key2 = capturedRuns[1].sessionKey as string

    // 핵심 계약: 키가 turn 경계(저장으로 convId 생성)를 넘어 불변이어야
    // main persistentRuns 재사용이 유지되고 turn1 세션이 고아가 되지 않는다.
    expect(key1).toBe(key2)
    // 키 소스 일관화: 안정 키 = conversationId (재시작·전환-복귀에도 동일 소스)
    expect(key1).toBe('cv-stable-1')
    expect(useAppStore.getState().conversationId).toBe('cv-stable-1')
    // held-open 유지 확인
    expect(capturedRuns[0].persistent).toBe(true)
    expect(capturedRuns[1].persistent).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T2: 기존 대화 — sessionKey === conversationId 그대로 (회귀 0)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-04 T2: 기존 대화(convId 보유)는 기존 거동 그대로', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('convId="cv-exist" + replMode ON → sessionKey === "cv-exist" (선저장 미발동)', async () => {
    useAppStore.getState().setReplMode(true)
    useAppStore.setState({ conversationId: 'cv-exist' } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('안녕')

    expect(capturedRuns.length).toBe(1)
    // 기존 대화 키 계약: sessionKey === conversationId 불변. (선저장 분기 자체는 구현
    // 세부 — 호출 카운트 단언은 마이크로태스크 타이밍 결합이라 배제, reviewer 🟡-2.)
    expect(capturedRuns[0].sessionKey).toBe('cv-exist')
    expect(capturedRuns[0].persistent).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T3: 단발(replMode OFF) — persistent/sessionKey 미포함 유지 (회귀 0)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-04 T3: 단발(OFF) 경로 회귀 0', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode OFF·신규 대화 → persistent/sessionKey 미포함 (선저장이 OFF 경로에 새지 않음)', async () => {
    useAppStore.getState().setReplMode(false)

    await useAppStore.getState().sendMessage('안녕')

    expect(capturedRuns.length).toBe(1)
    expect(capturedRuns[0].persistent).toBeFalsy()
    expect(capturedRuns[0].sessionKey).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T4: 선저장 실패 폴백 — currentSessionKey(UUID)로 degrade (send 자체는 진행)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-04 T4: 선저장 실패 시 폴백', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('conversationSave reject → sessionKey는 currentSessionKey 폴백 + send 정상 진행', async () => {
    useAppStore.getState().setReplMode(true)
    const stableKey = useAppStore.getState().currentSessionKey
    // 선저장(첫 호출)만 실패시킴 — 이후 호출(말미 void save)은 기본 구현
    mockApi.conversationSave.mockImplementationOnce(async () => {
      throw new Error('disk full')
    })

    await useAppStore.getState().sendMessage('첫 메시지')

    expect(capturedRuns.length).toBe(1)
    expect(capturedRuns[0].sessionKey).toBe(stableKey)
    expect(capturedRuns[0].persistent).toBe(true)
  })
})

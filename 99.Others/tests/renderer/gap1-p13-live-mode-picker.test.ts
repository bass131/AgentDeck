/**
 * gap1-p13-live-mode-picker.test.ts — GAP1 P13 renderer 피커 라이브 전환 배선 (TDD RED)
 *
 * 대상(R only — 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/store/slices/composer.ts — setPickerMode(단일 지점: Composer 피커
 *     onChange + Shift+Tab cyclePickerMode 공용) 계층에 라이브 전환 side effect 배선.
 *   02.Source/renderer/src/store/slices/runtime.ts — subscribeAgentEvents가 permission_mode
 *     이벤트를 관찰해 활성 대화면 pickerMode를 동기화(상태 동기화 보조 — SDKStatusMessage 유래).
 *
 * 계약 핀(coordinator 확정 2026-07-14 — 임의 변경 금지):
 *   - 활성 지속(REPL) run 존재(replMode=true ∧ currentRunId≠null) + mode ∈ 화이트리스트
 *     4종('normal'|'plan'|'acceptEdits'|'auto') → `window.api.agentSetMode({runId, mode})`
 *     fire-and-forget 호출. mode는 **picker id 원문** — SDK 어휘 매핑은 어댑터 내부(ADR-003).
 *   - 'bypass' 선택 → 호출 없음(라이브 전환 불가 — 세션 생성 시에만). 로컬 상태만 변경.
 *   - 활성 run 없음(currentRunId=null) / REPL 아님(replMode=false) → 호출 없음(로컬만).
 *   - permission_mode AgentEvent 수신 → 해당 대화가 활성(runId===currentRunId)이면
 *     pickerMode 동기화. 타 run 이벤트는 무시(교차오염 0).
 *
 * 현재(RED) 이유: setPickerMode는 `set({ pickerMode })`만 수행(IPC 0) — dogfood 결함 A의
 *   renderer측 원인(조용한 no-op). permission_mode는 reducer 디스패처 default로 드롭.
 *
 * Node 환경 + window.api mock(repl-mode.test.ts 패턴) — fs/Node 직접 0.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

// ── mock window.api (repl-mode.test.ts 베이스라인 + agentSetMode/onAgentEvent 캡처) ──

let agentEventHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: async () => ({ accepted: true }),
  // P13 대상: 라이브 전환 IPC — 현행 setPickerMode는 이를 호출하지 않는다(RED 관찰점).
  agentSetMode: vi.fn(async () => ({ accepted: true })),
  onAgentEvent: vi.fn((cb: (payload: AgentEventPayload) => void) => {
    agentEventHandler = cb
    return () => {
      agentEventHandler = null
    }
  }),
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
  pathForFile: () => '',
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}

// window.api 주입 (Node 환경 — globalThis)
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

type Store = Awaited<ReturnType<typeof getStore>>

function resetStore(useAppStore: Store, patch: Record<string, unknown> = {}) {
  mockApi.agentSetMode.mockClear()
  agentEventHandler = null
  useAppStore.setState({
    ...makeInitialState(),
    conversationId: null,
    currentRunId: null,
    isRunning: false,
    replMode: true,
    pickerMode: 'normal',
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

/** permission_mode 이벤트 payload — P13 additive 신설(구현 전이라 union 밖, 타입 다리 캐스트). */
function permissionModePayload(runId: string, mode: string): AgentEventPayload {
  return { runId, event: { type: 'permission_mode', mode } } as unknown as AgentEventPayload
}

// ═══════════════════════════════════════════════════════════════════════════════
// ① 활성 REPL run + 화이트리스트 모드 → agentSetMode fire-and-forget
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p13 ① setPickerMode — 활성 REPL run 라이브 전환 IPC (RED)', () => {
  let useAppStore: Store

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true })
  })

  it("setPickerMode('plan') → window.api.agentSetMode({runId:'run-live-1', mode:'plan'}) 1회 + 로컬 pickerMode 반영", () => {
    useAppStore.getState().setPickerMode('plan')

    // 로컬 상태 반영은 기존 거동(회귀 0).
    expect(useAppStore.getState().pickerMode).toBe('plan')
    // RED: 현행 setPickerMode는 IPC를 호출하지 않는다(조용한 no-op — dogfood 결함 A).
    expect(mockApi.agentSetMode).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetMode).toHaveBeenCalledWith({ runId: 'run-live-1', mode: 'plan' })
  })

  it("setPickerMode('normal') → mode는 picker id 원문 'normal' 그대로(SDK 'default' 변환 금지 — ADR-003)", () => {
    useAppStore.getState().setPickerMode('normal')

    expect(mockApi.agentSetMode).toHaveBeenCalledTimes(1)
    // renderer는 엔진 어휘를 모른다 — 'default'로 매핑해 보내면 계약 위반.
    expect(mockApi.agentSetMode).toHaveBeenCalledWith({ runId: 'run-live-1', mode: 'normal' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ② 'bypass' — 라이브 전환 불가(호출 없음, 로컬만)
// ═══════════════════════════════════════════════════════════════════════════════

describe("gap1-p13 ② setPickerMode('bypass') — 라이브 전환 제외 (GREEN 핀·구현 후 불변)", () => {
  it('agentSetMode 미호출 + pickerMode는 bypass로 로컬 변경', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true })

    useAppStore.getState().setPickerMode('bypass')

    expect(mockApi.agentSetMode).not.toHaveBeenCalled()
    // 로컬 선택 자체는 유지 — 다음 *새 세션* 생성 시에만 적용되는 모드.
    expect(useAppStore.getState().pickerMode).toBe('bypass')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ③ 활성 run 없음 / REPL 아님 → 호출 없음(로컬만)
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p13 ③ 라이브 전환 게이트 — run 부재·비REPL (GREEN 핀·구현 후 불변)', () => {
  it('currentRunId=null(진행 중 세션 없음) → agentSetMode 미호출 + 로컬 변경만', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: null, replMode: true })

    useAppStore.getState().setPickerMode('plan')

    expect(mockApi.agentSetMode).not.toHaveBeenCalled()
    expect(useAppStore.getState().pickerMode).toBe('plan')
  })

  it('replMode=false(단발 대화) → agentSetMode 미호출 — 라이브 전환은 지속(REPL) 세션 전용', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-oneshot', replMode: false })

    useAppStore.getState().setPickerMode('plan')

    // 단발 run은 어댑터 계약상 setPermissionMode 자체가 no-op(SDK streaming-input 한정)
    // — renderer가 애초에 보내지 않는다(불필요 IPC 0).
    expect(mockApi.agentSetMode).not.toHaveBeenCalled()
    expect(useAppStore.getState().pickerMode).toBe('plan')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ④ permission_mode 이벤트 수신 → 활성 대화 pickerMode 동기화
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p13 ④ permission_mode 이벤트 → pickerMode 동기화 (RED)', () => {
  let useAppStore: Store
  let unsubscribe: (() => void) | null = null

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, pickerMode: 'normal' })
    unsubscribe = useAppStore.getState().subscribeAgentEvents()
  })

  it('활성 run(runId 일치)의 permission_mode 수신 → pickerMode가 이벤트 mode로 동기화', () => {
    expect(agentEventHandler).not.toBeNull()

    // 엔진측 실상태(예: plan 승인 착지로 acceptEdits 전환)가 이벤트로 도착.
    agentEventHandler!(permissionModePayload('run-live-1', 'acceptEdits'))

    // RED: 현행 reducer/구독 계층은 permission_mode를 드롭(default: return state).
    expect(useAppStore.getState().pickerMode).toBe('acceptEdits')
    // 회귀 핀(reviewer 🟡): 동기화는 로컬 set만 — agentSetMode 재발화(echo 왕복) 0.
    expect(mockApi.agentSetMode).not.toHaveBeenCalled()

    unsubscribe?.()
  })

  it('타 run(runId 불일치)의 permission_mode 수신 → pickerMode 불변(교차오염 0 — GREEN 핀)', () => {
    expect(agentEventHandler).not.toBeNull()

    agentEventHandler!(permissionModePayload('other-run', 'acceptEdits'))

    expect(useAppStore.getState().pickerMode).toBe('normal')

    unsubscribe?.()
  })
})

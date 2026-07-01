/**
 * lr2-01-replmode-default.test.ts — LR2-01 replMode 기본값 전환(held-open→resume) RED 재현.
 *
 * 배경(01-replmode-default-flip.md): system.ts:87의 replMode 기본값을 true→false로
 * 전환한다(ADR-024 재고, 영호 확정 — 설계분기 아님). held-open은 옵트인 토글로 유지
 * (ComposerBar.tsx:127-141, setReplMode 배선 — 이미 존재 확인).
 *
 * TDD 순서: 이 파일은 RED(현재 replMode:true 기본값 기준) → flip 구현 후 GREEN.
 * 앱 소스 수정 없음(QA 소유 테스트만) — flip 구현은 renderer Worker 담당.
 *
 * T1: 기본값 계약 — 신선 store의 replMode === false. (현재 true → RED)
 * T2: 기본(false) 시 단발+resume 계약 — sessionId 세팅 + sendMessage →
 *     agentRun 인자에 persistent·sessionKey 미포함 + resumeSessionId 포함. (현재 RED)
 * T3: 옵트인 held-open 생존 계약 — setReplMode(true) 후 sendMessage →
 *     persistent:true + sessionKey 포함. (이미 GREEN — 회귀 방지 고정용)
 * T4: 토글 영속 — setReplMode가 재시작 간 유지되는지는 "보고만"(아래 하단 주석).
 *     실측: system.ts에 zustand persist 미들웨어·localStorage·IPC 저장 경로 0 —
 *     replMode는 순수 인메모리 렌더러 상태(앱 재시작 시 기본값으로 리셋).
 *     → 영속 계약은 아직 없음. 이 Phase에서 "영속시켜야 하는지"는 QA가 결정할 사안이
 *     아니므로 테스트로 고정하지 않고 구현 판단은 renderer Worker에 위임.
 *
 * CRITICAL(신뢰경계): window.api 경유만. fs/Node 직접 0.
 * CRITICAL(ADR-003): 엔진 리터럴 미포함.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'

// ── mock window.api (repl-mode.test.ts와 동일 패턴 — 회귀 방지 위해 재사용) ──────

// eslint-disable-next-line prefer-const
let capturedAgentRun: { [k: string]: unknown } | null = null

function getCapture(): { [k: string]: unknown } {
  if (!capturedAgentRun) throw new Error('agentRun이 호출되지 않음')
  return capturedAgentRun
}

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
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

// ── 공통 store 리셋 헬퍼 ─────────────────────────────────────────────────────

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

/**
 * resetStore — replMode는 의도적으로 건드리지 않는다(T2가 store 기본값을 그대로
 * 검증해야 하므로). 다른 잔여 상태만 초기화.
 */
function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
  capturedAgentRun = null
  mockApi.agentRun.mockClear()
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
// T1: 기본값 계약 — 신선 store의 replMode === false
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-01 T1: replMode 기본값 계약', () => {
  it('store 초기값 replMode === false (resume 단발이 새 기본값 — ADR-024 재고)', async () => {
    const useAppStore = await getStore()
    // 이 assert는 store 모듈이 이 테스트 파일에서 최초 로드된 신선 상태를 전제한다.
    // (다른 it이 setReplMode를 호출하기 전이어야 진짜 "기본값" 검증 — 파일 최상단 배치 이유.)
    expect(useAppStore.getState().replMode).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T2: 기본(false) 시 단발+resume 계약
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-01 T2: 기본값(false)에서 sendMessage → 단발+resume 페이로드', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('sessionId 보유 상태에서 sendMessage → persistent/sessionKey 미포함 + resumeSessionId 포함', async () => {
    // replMode=false 명시 세팅(순서 독립 — 기본값==false 계약 자체는 T1이 보장하므로,
    // 여기선 "false일 때 단발+resume 페이로드"만 검증. test 랜덤화에도 안전).
    useAppStore.getState().setReplMode(false)
    useAppStore.setState({ sessionId: 'sess-prev' } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    // 단발+resume 경로: persistent/sessionKey 미포함(held-open 미주입)
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
    // resume은 독립 배선(runtime.ts:147) — 직전 sessionId를 되돌려 보냄
    expect(cap.resumeSessionId).toBe('sess-prev')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T3: 옵트인 held-open 생존 계약 (회귀 방지 고정 — 현재도 GREEN이어야 함)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-01 T3: 옵트인 setReplMode(true) → held-open 페이로드 생존', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('setReplMode(true) 후 sendMessage → agentRun에 persistent:true + sessionKey 포함', async () => {
    useAppStore.getState().setReplMode(true)
    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBe(true)
    expect(typeof cap.sessionKey).toBe('string')
    expect((cap.sessionKey as string).length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T4: 토글 영속 — 보고만 (테스트로 고정하지 않음, 위 파일 헤더 주석 참고)
// ══════════════════════════════════════════════════════════════════════════════
//
// 실측 결과(system.ts:83-103, appStore.ts grep): setReplMode는 zustand set()만
// 호출 — persist 미들웨어·localStorage·IPC(setProfile류) 저장 경로 0.
// 즉 앱 재시작(렌더러 프로세스 재생성) 시 replMode는 항상 새 기본값으로 리셋되고,
// 사용자가 이전 세션에서 켜둔 held-open 옵트인은 유지되지 않는다.
// 영속화 여부는 이 Phase 범위의 구현 판단(renderer Worker)에 위임 — QA는 계약을
// 임의로 고정하지 않는다(영속 안 하는 게 의도인지 버그인지는 renderer Worker 확인 필요).

/**
 * lr2-01-replmode-default.test.ts — replMode 기본값·명시 모드별 페이로드 계약.
 *
 * 이력: LR2-01(01-replmode-default-flip.md)이 replMode 기본값을 true→false로
 * 전환했었다(ADR-024 재고). LR3-03(앱 타이머 /loop 폐기 + P02 AUTO 세션 수명 —
 * 03-app-timer-loop-retire.md)에서 다시 true로 재전환됐다 — AUTO가 idle 자동정리를
 * 보장해 상주 비용을 상쇄하므로, persistent가 기본인 편이 /loop 등 SDK 내장 크론이
 * 생존하는 경로가 된다. 이 파일은 그 최신 계약을 반영하도록 갱신됐다(의도 보존 —
 * "명시적으로 켠/끈 모드에서 올바른 페이로드가 나가는지"는 LR2-01 때와 동일하게 검증).
 *
 * T1: 기본값 계약 — 신선 store의 replMode === true (LR3-03 최신 기본값).
 * T2: 명시적 OFF 시 단발+resume 계약 — setReplMode(false) + sessionId 세팅 + sendMessage →
 *     agentRun 인자에 persistent·sessionKey 미포함 + resumeSessionId 포함.
 * T3: 명시적 ON(옵트인 유지) held-open 계약 — setReplMode(true) 후 sendMessage →
 *     persistent:true + sessionKey 포함.
 * T4: 토글 영속 — LR3-03에서 uiPrefs(setUiPref/getUiPrefs 재사용) 영속이 추가됐다.
 *     round-trip 단위 계약은 lib/prefs.ts 레벨에서 prefs.test.ts의
 *     "replMode 영속 — getPref/setPref 인터페이스 계약" describe가 전담(중복 방지).
 *     이 파일은 store 레벨(setReplMode 자체는 IPC 미호출) 계약만 유지.
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
 * resetStore — replMode는 의도적으로 건드리지 않는다(T1이 store 기본값을 그대로
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
    currentRunId: null,
    isRunning: false,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ══════════════════════════════════════════════════════════════════════════════
// T1: 기본값 계약 — 신선 store의 replMode === true
// ══════════════════════════════════════════════════════════════════════════════

describe('LR3-03 T1: replMode 기본값 계약', () => {
  it('store 초기값 replMode === true (held-open 지속세션이 기본값 — AUTO 세션 수명이 비용 상쇄)', async () => {
    const useAppStore = await getStore()
    // 이 assert는 store 모듈이 이 테스트 파일에서 최초 로드된 신선 상태를 전제한다.
    // (다른 it이 setReplMode를 호출하기 전이어야 진짜 "기본값" 검증 — 파일 최상단 배치 이유.)
    expect(useAppStore.getState().replMode).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// T2: 명시적 OFF 시 단발+resume 계약
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-01 T2: 명시적 setReplMode(false) → 단발+resume 페이로드', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('sessionId 보유 상태에서 sendMessage → persistent/sessionKey 미포함 + resumeSessionId 포함', async () => {
    // replMode=false 명시 세팅(기본값은 T1이 별도 보장 — 이 테스트는 "OFF일 때
    // 단발+resume 페이로드"만 검증. test 랜덤화에도 안전).
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
// T3: 명시적 ON(옵트인 유지) held-open 계약 (회귀 방지 고정 — 현재도 GREEN이어야 함)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR2-01 T3: 명시적 setReplMode(true) → held-open 페이로드', () => {
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
// T4: 토글 영속 — LR3-03에서 추가됨 (prefs.test.ts로 이관, 여기선 위임 사실만 기록)
// ══════════════════════════════════════════════════════════════════════════════
//
// LR2-01 시점 실측: setReplMode는 zustand set()만 호출 — persist 미들웨어·localStorage·
// IPC 저장 경로 0(순수 인메모리, 앱 재시작 시 기본값으로 리셋). LR3-03에서 기존
// setUiPref/getUiPrefs 채널을 재사용해 영속을 추가했다(신규 IPC 0):
//   - 저장: layout/Shell.tsx의 useEffect(store replMode 변경 → setPref('replMode', v)).
//   - 복원: main.tsx boot(getPref('replMode', true) → setReplMode) — 키 부재 시 true 폴백.
// round-trip 단위 계약(setPref→재로드→getPref)은 prefs.ts 레벨에서 검증하는 편이
// store 의존 없이 더 안정적이므로 prefs.test.ts의
// "replMode 영속 — getPref/setPref 인터페이스 계약" describe가 전담한다(중복 방지).

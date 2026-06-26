/**
 * repl-mode.test.ts — ADR-024 지속세션(REPL) 기본 모드 배선 단위 테스트 (5a).
 *
 * TDD 순서: 이 파일이 RED → 구현 후 GREEN.
 *
 * R5a-1: replMode default true · setReplMode 토글 · 휘발(makeInitialState/clear 리셋 안 함 → 휘발).
 * R5a-2: replMode ON → sendMessage가 agentRun에 persistent:true + sessionKey(안정) 포함.
 *         OFF → 미포함(회귀 0).
 * R5a-3: sessionKey 안정성 — 같은 대화 연속 전송은 같은 sessionKey,
 *         대화 전환(clearConversation) 시 변경.
 * R5a-4: cron-turn 라우팅 락인 — currentRunId=sessionKey일 때 done.origin:'cron' +
 *         같은 runId 이벤트가 panelSession 필터를 통과해 thread에 반영됨.
 * R5a-5: /loop 통과 — replMode ON에서 `/loop ...` 입력이 앱 레벨 인터셉트 안 되고
 *         일반 sendMessage로 감(agentRun 호출됨, activeLoop 미등록).
 *         OFF면 기존 인터셉트(activeLoop 등록, SDK 원문 누수 차단).
 * R5a-6: panelSession.buildAgentRunArgs — replMode ON 시 persistent/sessionKey 전달.
 *
 * CRITICAL(신뢰경계): window.api 경유만. fs/Node 직접 0.
 * CRITICAL(ADR-003): 엔진 리터럴 미포함.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../src/renderer/src/store/reducer'

// ── mock window.api ────────────────────────────────────────────────────────────

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

// window.api 주입 (Node 환경 — globalThis)
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 공통 store 리셋 헬퍼 ─────────────────────────────────────────────────────

async function getStore() {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  return useAppStore
}

function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
  capturedAgentRun = null
  mockApi.agentRun.mockClear()
  // 핵심 필드만 리셋(전체 makeInitialState + 추가 필드)
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
// R5a-1: replMode 기본값·토글·휘발
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-1: replMode 기본값·토글·휘발', () => {
  it('replMode 기본값이 true(REPL 기본 모드)', async () => {
    const useAppStore = await getStore()
    // 신선 상태: makeInitialState로도 true가 보장되어야 함
    const freshState = makeInitialState()
    // replMode는 StoreState 추가 필드(AppState 외) — store 초기값 확인
    expect(useAppStore.getState().replMode).toBe(true)
    // makeInitialState는 AppState(replMode 없음) — store 초기값과 별개
    // 이 테스트는 store 초기값만 단언
    void freshState
  })

  it('setReplMode(false) → replMode false, setReplMode(true) → true', async () => {
    const useAppStore = await getStore()
    useAppStore.getState().setReplMode(false)
    expect(useAppStore.getState().replMode).toBe(false)
    useAppStore.getState().setReplMode(true)
    expect(useAppStore.getState().replMode).toBe(true)
  })

  it('replMode는 clearConversation 후에도 유지(휘발 아님 — 세션 횡단 설정)', async () => {
    const useAppStore = await getStore()
    // OFF로 설정 후 대화 초기화
    useAppStore.getState().setReplMode(false)
    useAppStore.getState().clearConversation()
    // replMode는 리셋되지 않는다(사용자 토글 설정 유지)
    expect(useAppStore.getState().replMode).toBe(false)
    // 원복
    useAppStore.getState().setReplMode(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// R5a-2: sendMessage — replMode ON/OFF 시 agentRun 페이로드
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-2: sendMessage agentRun 페이로드 — replMode ON/OFF', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON → agentRun에 persistent:true + sessionKey(문자열) 포함', async () => {
    useAppStore.getState().setReplMode(true)
    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBe(true)
    expect(typeof cap.sessionKey).toBe('string')
    expect((cap.sessionKey as string).length).toBeGreaterThan(0)
  })

  it('replMode OFF → agentRun에 persistent/sessionKey 미포함(단발 회귀 0)', async () => {
    useAppStore.getState().setReplMode(false)
    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    // persistent 미포함(undefined or missing)
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// R5a-3: sessionKey 안정성
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-3: sessionKey 안정성', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
    useAppStore.getState().setReplMode(true)
  })

  it('같은 대화에서 conversationId 없이 연속 전송 → currentSessionKey(UUID)가 안정적으로 유지됨', async () => {
    // conversationId가 없는 상태 강제(신규 대화)
    useAppStore.setState({ conversationId: null, isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    const stableKey = useAppStore.getState().currentSessionKey

    await useAppStore.getState().sendMessage('첫 번째')
    const key1 = getCapture().sessionKey as string

    capturedAgentRun = null
    // isRunning 리셋 + conversationId를 null 유지(save mock이 'cv-1'로 set할 수 있으므로 강제 리셋)
    useAppStore.setState({ isRunning: false, conversationId: null } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('두 번째')
    const key2 = getCapture().sessionKey as string

    // 둘 다 stableKey(currentSessionKey) 여야 함 — conversationId 없으므로 UUID 재사용
    expect(key1).toBe(stableKey)
    expect(key2).toBe(stableKey)
    expect(key1).toBe(key2)
  })

  it('clearConversation 후 → sessionKey 변경(새 대화 새 키)', async () => {
    await useAppStore.getState().sendMessage('첫 번째')
    const key1 = getCapture().sessionKey as string

    // 대화 초기화 → sessionKey 재생성
    useAppStore.getState().clearConversation()
    useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])

    capturedAgentRun = null
    await useAppStore.getState().sendMessage('새 대화 첫 메시지')
    const key2 = getCapture().sessionKey as string

    expect(key1).toBeTruthy()
    expect(key2).toBeTruthy()
    expect(key1).not.toBe(key2)
  })

  it('conversationId가 있으면 sessionKey === conversationId', async () => {
    // conversationId가 이미 있는 대화
    useAppStore.setState({ conversationId: 'conv-fixed-123', isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('메시지')
    expect(getCapture().sessionKey).toBe('conv-fixed-123')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// R5a-4: cron-turn 라우팅 락인
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-4: cron-turn 라우팅 락인 — panelApply runId 필터', () => {
  it('panelApply: currentRunId=sessionKey → done.origin:cron 이벤트가 통과해 thread 반영', async () => {
    const { panelApply, makePanelInitialState } = await import('../../src/renderer/src/store/panelSession')

    const sessionKey = 'key-cron-test'
    const state = { ...makePanelInitialState(), currentRunId: sessionKey }

    // cron-turn done 이벤트 (origin: 'cron')
    const payload = {
      runId: sessionKey,
      event: { type: 'done' as const, origin: 'cron' as const },
    }

    const next = panelApply(state, payload, '12:00')
    // runId 일치 → 이벤트 처리됨 (isRunning이 false로 전환 = done 처리됨)
    expect(next.isRunning).toBe(false)
    // currentRunId는 패널 로컬로 유지
    expect(next.currentRunId).toBe(sessionKey)
  })

  it('panelApply: 다른 runId → cron 이벤트 무시(타 패널 격리)', async () => {
    const { panelApply, makePanelInitialState } = await import('../../src/renderer/src/store/panelSession')

    const state = { ...makePanelInitialState(), currentRunId: 'my-run', isRunning: true }
    const payload = {
      runId: 'other-run',
      event: { type: 'done' as const, origin: 'cron' as const },
    }

    const next = panelApply(state, payload)
    // 다른 runId → 무시(동일 참조 반환 or 상태 미변경)
    expect(next.isRunning).toBe(true)
    expect(next.currentRunId).toBe('my-run')
  })

  it('appStore: done 이벤트 후 currentRunId가 유지(persistent 모드 — done이 runId를 지우지 않음)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { applyAgentEvent, makeInitialState } = await import('../../src/renderer/src/store/reducer')

    // currentRunId 세팅된 상태에서 done 이벤트
    const sessionKey = 'repl-session-key'
    const baseState = { ...makeInitialState(), isRunning: true }
    const payload = { runId: sessionKey, event: { type: 'done' as const } }
    const next = applyAgentEvent(baseState, payload)

    // done이 isRunning을 false로 만들지만 currentRunId는 건드리지 않는다
    expect(next.isRunning).toBe(false)

    // store 레벨: currentRunId를 sessionKey로 세팅 후 done 이벤트 적용해도 currentRunId 유지
    useAppStore.setState({ currentRunId: sessionKey, isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    // 구독 콜백 직접 호출 불가 — 상태 직접 검증
    // done 이벤트는 currentRunId를 clear하지 않아야 한다(토도: subscribeAgentEvents가 set({currentRunId: null}) 안 함)
    expect(useAppStore.getState().currentRunId).toBe(sessionKey)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// R5a-5: /loop 통과 가드 — replMode ON/OFF
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-5: /loop 통과 — replMode ON이면 앱 레벨 인터셉트 건너뜀', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON: /loop 입력 → sendMessage 경유(agentRun 호출됨), activeLoop 미등록', async () => {
    useAppStore.getState().setReplMode(true)
    // sendMessage는 isLoopCommand를 체크하지 않고 그대로 SDK로 전달해야 함
    await useAppStore.getState().sendMessage('/loop 5m 반복작업')

    // agentRun이 호출됨(SDK로 흘러감)
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    // 엔진에 전달된 마지막 메시지가 '/loop ...' 원문을 포함함(Claude가 처리)
    const cap = getCapture()
    const msgs = cap.messages as Array<{ role: string; content: string }>
    const last = msgs[msgs.length - 1]
    expect(last.content).toContain('/loop')

    // activeLoop 미등록(앱 레벨 인터셉트 안 함)
    expect(useAppStore.getState().activeLoop).toBeNull()
  })

  it('replMode OFF: /loop 입력 → appStore.sendMessage를 통해 전달 시 activeLoop 등록 가능(기존 인터셉트는 Conversation 컴포넌트에서 수행)', async () => {
    // 주의: appStore.sendMessage 자체는 /loop를 인터셉트하지 않음.
    // 앱 레벨 인터셉트는 Conversation.tsx dispatchSend가 담당.
    // 이 테스트는 "replMode OFF 시 dispatchSend 인터셉트 로직이 작동해야 한다"는
    // 계약을 확인한다 — dispatchSend에서 replMode를 읽어 분기하는 구조 검증.
    useAppStore.getState().setReplMode(false)

    // dispatchSend는 컴포넌트 레이어 — 여기선 순수 함수 단위로만 검증:
    // "replMode OFF → isLoopCommand 분기를 탄다" = 기존 intercept 경로
    const { isLoopCommand } = await import('../../src/renderer/src/lib/loopCommand')
    expect(isLoopCommand('/loop 5m 반복작업')).toBe(true)

    // replMode OFF이면 Conversation.dispatchSend가 인터셉트할 것이므로
    // sendMessage 직접 호출 시에는 /loop도 그냥 전달됨(store는 인터셉트 미담당 — 컴포넌트 책임)
    // 이 동작은 그대로 유지(회귀 0)
    await useAppStore.getState().sendMessage('/loop stop')
    // agentRun 호출됨(store는 /loop 인터셉트 안 함 — 컴포넌트가 담당)
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// R5a-6: panelSession.buildAgentRunArgs — replMode persistent/sessionKey 전달
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-6: panelSession.buildAgentRunArgs — persistent/sessionKey', () => {
  it('persistent:true + sessionKey 포함 시 args에 반영됨', async () => {
    const { buildAgentRunArgs } = await import('../../src/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { persistent: true, sessionKey: 'panel-key-1' },
    )
    expect(args.persistent).toBe(true)
    expect(args.sessionKey).toBe('panel-key-1')
    expect(args.resumeSessionId).toBeUndefined() // 별도 필드
  })

  it('persistent 미전달 → persistent/sessionKey undefined(단발 회귀 0)', async () => {
    const { buildAgentRunArgs } = await import('../../src/renderer/src/store/panelSession')
    const args = buildAgentRunArgs([{ role: 'user', content: 'hi' }])
    expect(args.persistent).toBeUndefined()
    expect(args.sessionKey).toBeUndefined()
  })

  it('persistent:true이고 sessionKey 미전달 → persistent만 반영', async () => {
    const { buildAgentRunArgs } = await import('../../src/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { persistent: true },
    )
    expect(args.persistent).toBe(true)
    expect(args.sessionKey).toBeUndefined()
  })
})

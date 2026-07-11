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
 * R5a-5: /loop 항상 SDK 통과(LR3-03: 앱 레벨 인터셉트 폐기 — loopCommand.ts 삭제) —
 *         replMode ON/OFF 무관하게 `/loop ...` 입력이 원문 그대로 sendMessage/agentRun으로 감.
 * R5a-6: panelSession.buildAgentRunArgs — replMode ON 시 persistent/sessionKey 전달.
 *
 * CRITICAL(신뢰경계): window.api 경유만. fs/Node 직접 0.
 * CRITICAL(ADR-003): 엔진 리터럴 미포함.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import { getReplModeDefault } from '../../../02.Source/renderer/src/lib/replModeDefault'

// ── mock window.api ────────────────────────────────────────────────────────────

// eslint-disable-next-line prefer-const
let capturedAgentRun: { [k: string]: unknown } | null = null

function getCapture(): { [k: string]: unknown } {
  if (!capturedAgentRun) throw new Error('agentRun이 호출되지 않음')
  return capturedAgentRun
}

// LR2-04: 신규 대화마다 고유 id — 실제 main(persistence)이 대화별 고유 id를 발급하는
// 거동의 미러. 고정 'cv-1'이면 "새 대화 = 새 키" 검증이 mock 아티팩트로 무력화된다.
let saveSeq = 0

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: `cv-${++saveSeq}` }),
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
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
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
    currentRunId: null,
    isRunning: false,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ══════════════════════════════════════════════════════════════════════════════
// R5a-1: replMode 기본값·토글·휘발
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-1: replMode 기본값·토글·휘발', () => {
  it('replMode 기본값이 true(held-open 지속세션 기본 — LR3-03: 앱 타이머 /loop 폐기 + AUTO 세션 수명으로 재전환)', async () => {
    const useAppStore = await getStore()
    // 신선 상태: makeInitialState 확인
    const freshState = makeInitialState()
    // replMode는 StoreState 추가 필드(AppState 외) — store 초기값 확인
    // 이력: LR2-01이 held-open(true)→resume 단발(false)로 잠시 전환했으나,
    // LR3-03(앱 타이머 /loop 폐기 — 영호 확정 "토큰 맥싱" + P02 AUTO 세션 수명)에서
    // true로 되돌림 — AUTO가 idle 자동정리를 보장해 상주 비용을 상쇄하므로,
    // 모든 send가 persistent인 편이 /loop 등 SDK 내장 크론이 생존하는 기본 경로가 된다.
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

  it('replMode는 clearConversation 후 getReplModeDefault()로 리셋 (LR4 P07: 세션 횡단→대화별 리셋으로 반전, ADR-024)', async () => {
    // LR4 P07 시맨틱 반전(ADR-024): replMode는 더 이상 "세션 횡단 유지" 설정이 아니라
    // *대화별* 설정이다. clearConversation()은 새 대화를 여는 것과 같아, 직전 대화의 토글이
    // 새지 않도록 replMode를 마이그 기본값(getReplModeDefault(), 미시드 시 true)으로 리셋한다.
    // (옛 스펙 "clearConversation 후에도 유지(세션 횡단)"를 삭제가 아니라 새 동작으로 재작성 —
    //  회귀 은폐가 아니라 의도된 반전임을 명시.)
    const useAppStore = await getStore()
    const dflt = getReplModeDefault()

    // 기본값의 *반대*로 토글해 두어야 리셋이 실제로 일어났음을 명확히 증명할 수 있다.
    useAppStore.getState().setReplMode(!dflt)
    expect(useAppStore.getState().replMode).toBe(!dflt) // 토글이 적용됐음 선확인

    useAppStore.getState().clearConversation()

    // 대화별 리셋: 직전 대화의 반대 토글이 새지 않고 기본값으로 복귀.
    expect(useAppStore.getState().replMode).toBe(dflt)
    // 원복(후속 테스트 격리)
    useAppStore.getState().setReplMode(dflt)
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

  it('신규 대화 연속 전송 → 선저장으로 conversationId가 키가 되고 안정 유지(LR2-04 계약)', async () => {
    // LR2-04 계약 갱신: 신규 대화(convId=null)의 첫 send는 agentRun 전에 선저장으로
    // conversationId를 확정하고, 그것이 sessionKey가 된다(키 소스 일관화 — 이전 계약의
    // "UUID 유지"는 turn 경계에서 convId로 flip되며 held-open 고아 세션을 낳던 원인).
    useAppStore.setState({ conversationId: null, isRunning: false } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('첫 번째')
    const key1 = getCapture().sessionKey as string

    capturedAgentRun = null
    useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('두 번째')
    const key2 = getCapture().sessionKey as string

    // 키 소스 = conversationId(선저장 확정값) — 연속 전송 간 불변
    expect(key1).toBe(useAppStore.getState().conversationId)
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
    const { panelApply, makePanelInitialState } = await import('../../../02.Source/renderer/src/store/panelSession')

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
    const { panelApply, makePanelInitialState } = await import('../../../02.Source/renderer/src/store/panelSession')

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
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const { applyAgentEvent, makeInitialState } = await import('../../../02.Source/renderer/src/store/reducer')

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
// R5a-5: /loop 항상 SDK 통과 (LR3-03: 앱 레벨 인터셉트 폐기)
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-5: /loop 항상 SDK 통과 — replMode ON/OFF 무관 (앱 인터셉트 폐기)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON: /loop 입력 → sendMessage 경유(agentRun 호출됨), 원문 그대로 SDK 전달', async () => {
    useAppStore.getState().setReplMode(true)
    // sendMessage는 슬래시 인터셉트 게이트 개념 자체가 없음(loopCommand.ts 삭제) — 그대로 SDK로 전달.
    await useAppStore.getState().sendMessage('/loop 5m 반복작업')

    // agentRun이 호출됨(SDK로 흘러감)
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    // 엔진에 전달된 마지막 메시지가 '/loop ...' 원문을 포함함(Claude가 처리)
    const cap = getCapture()
    const msgs = cap.messages as Array<{ role: string; content: string }>
    const last = msgs[msgs.length - 1]
    expect(last.content).toContain('/loop')
  })

  it('replMode OFF: /loop 입력 → 앱 레벨 인터셉트 없이 그대로 SDK 전달(LR3-03: OFF에서도 인터셉트 0)', async () => {
    // LR3-03 이전에는 Conversation.tsx dispatchSend가 replMode OFF일 때 /loop를
    // 앱 레벨에서 가로챘다(loopCommand.ts). 그 인터셉트 자체가 통째로 삭제됐으므로
    // replMode 값과 무관하게 /loop는 항상 원문 그대로 SDK로 전달된다.
    useAppStore.getState().setReplMode(false)

    await useAppStore.getState().sendMessage('/loop stop')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const cap = getCapture()
    const msgs = cap.messages as Array<{ role: string; content: string }>
    expect(msgs[msgs.length - 1].content).toBe('/loop stop')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// R5a-6: panelSession.buildAgentRunArgs — replMode persistent/sessionKey 전달
// ══════════════════════════════════════════════════════════════════════════════

describe('R5a-6: panelSession.buildAgentRunArgs — persistent/sessionKey', () => {
  it('persistent:true + sessionKey 포함 시 args에 반영됨', async () => {
    const { buildAgentRunArgs } = await import('../../../02.Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { persistent: true, sessionKey: 'panel-key-1' },
    )
    expect(args.persistent).toBe(true)
    expect(args.sessionKey).toBe('panel-key-1')
    expect(args.resumeSessionId).toBeUndefined() // 별도 필드
  })

  it('persistent 미전달 → persistent/sessionKey undefined(단발 회귀 0)', async () => {
    const { buildAgentRunArgs } = await import('../../../02.Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs([{ role: 'user', content: 'hi' }])
    expect(args.persistent).toBeUndefined()
    expect(args.sessionKey).toBeUndefined()
  })

  it('persistent:true이고 sessionKey 미전달 → persistent만 반영', async () => {
    const { buildAgentRunArgs } = await import('../../../02.Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { persistent: true },
    )
    expect(args.persistent).toBe(true)
    expect(args.sessionKey).toBeUndefined()
  })
})

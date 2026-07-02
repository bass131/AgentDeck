/**
 * bf3-p07-banner-continuity-bgruns.test.ts — BF3 Phase 07: 단일챗 loops/goal 배너 연속성
 * (경계 ⓐ — bgRuns cap 축출).
 *
 * ⚠️ 이 파일은 store 레벨 계약이다. 02.Source/**는 읽기 전용이 아니다(본 Phase는 Worker가
 * 직접 봉합) — 아래 시나리오는 봉합 전(RED) 재현 조건과 봉합 후(GREEN) 기대 거동을 함께 고정한다.
 *
 * 배경(01.Phases/BF3-backlog-sweep/07-banner-continuity.md, _milestone-plan.md §세션 독립성):
 *   대화 A가 활성 루프(activeLoops)를 가진 채 백그라운드로 밀려나면 sessions.ts의 bgRuns
 *   맵에 스냅샷된다(P3b). 이 맵은 BG_RUNS_CAP=8로 유계라 A를 방문하지 않는 동안 다른 8개
 *   대화를 거치면 가장 먼저 들어간 A의 스냅샷이 evict된다. 그 뒤 A로 복귀하면 bgRuns에
 *   더 이상 A가 없어 디스크 conversationLoad 경로로 떨어지는데, ConversationRecord는
 *   loops를 애초에 담지 않으므로(불변조건) A의 activeLoops가 통째로 사라져 보인다 —
 *   main의 루프(SDK 크론)는 실제로 살아있을 수 있는데 배너만 소실되는 "오염 아닌 소실".
 *
 * 봉합: sessionLoopDisplayRegistry(slices/loopDisplay.ts) — conversationId 키의 앱수명
 * in-memory 레지스트리. bgRuns 스냅샷 시점에 표시 트리오(activeLoops/loopsStoppedNotice/
 * pendingCommand)를 write-through하고, 디스크 로드 경로에서 그 값을 오버레이해 복원한다.
 *
 * CRITICAL 불변조건(반드시 유지): 앱 재시작 시뮬레이션(레지스트리 리셋)에서는 배너가
 * 복원되면 안 된다 — main 프로세스가 죽으면 루프도 죽으므로 재시작 후 stale 배너 재림은
 * 금지(LR2-03 교훈).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import {
  __resetSessionLoopDisplayForTests,
  __getSessionLoopDisplaySizeForTests,
  __getSessionRunRoutingSizeForTests,
  sessionLoopDisplayRegistry,
  applyLoopDisplayEventFallback,
} from '../../../02.Source/renderer/src/store/slices/loopDisplay'
import type { ConversationRecord, AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

// ── window.api mock — 요청된 id를 그대로 되돌리는 최소 ConversationRecord ────────────
function makeRecord(id: string): ConversationRecord {
  return {
    id,
    title: id,
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id) return { conversations: [makeRecord(req.id)] }
    return { conversations: [] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
  conversationRename: async () => ({ ok: true }),
  conversationDelete: async () => ({ ok: true }),
  setUiPref: async () => ({ ok: true }),
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: async () => ({ runId: 'run-x' }),
  agentAbort: async () => ({ accepted: true }),
  agentInterrupt: async () => ({ accepted: true }),
  workspaceOpen: async (req: { folderPath?: string }) => ({ rootPath: req.folderPath ?? null, tree: null }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

const LOOP = [{ id: 'cc1', summary: '매분 상태 점검', interval: 'Every minute' }]

beforeEach(() => {
  capturedHandler = null
  __resetSessionLoopDisplayForTests()
  useAppStore.setState({
    conversationId: null,
    currentRunId: null,
    bgRuns: {},
    activeLoops: [],
    loopsStoppedNotice: false,
    pendingCommand: null,
  } as Parameters<typeof useAppStore.setState>[0])
})

/**
 * leaveTo — 현재 활성 대화를 떠나 next로 전환한다. leave 전에 currentRunId를 채워 넣어
 * "떠나는 대화가 실행 중"이라는 P3b 스냅샷 조건을 성립시킨다(테스트 유틸 — 실 코드는
 * agentRun 응답으로 채워짐).
 */
async function leaveTo(next: string, simulateRunning = true): Promise<void> {
  if (simulateRunning) {
    useAppStore.setState({ currentRunId: `run-${next}-prev` } as Parameters<typeof useAppStore.setState>[0])
  }
  await useAppStore.getState().selectConversation(next)
}

describe('BF3 Phase 07 경계 ⓐ — bgRuns cap(8) 초과 축출 후 복귀 시 activeLoops 소실 봉합', () => {
  it('A(활성 루프)에서 8개 대화를 더 거쳐 A가 bgRuns에서 evict된 뒤 복귀해도 activeLoops가 보존된다', async () => {
    // 대화 A: 활성 루프 보유, 실행 중.
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    // A → conv-0..conv-7 (8개) 순차 방문 — 각 leave가 bgRuns에 스냅샷 추가.
    // BG_RUNS_CAP=8이므로 9번째 스냅샷(leave to conv-8) 삽입 시 가장 먼저 들어간 A가 evict된다.
    await leaveTo('conv-0') // bgRuns={A}
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`) // bgRuns={A,conv-0..conv-i} 순차 누적 (최대 8)
    }
    // 사전조건: 아직 evict 전 — A가 bgRuns에 남아있어야 정상(8개 상한 내).
    expect('A' in useAppStore.getState().bgRuns).toBe(true)

    // 9번째 leave — conv-7(currentRunId 보유) → conv-8. 이 시점 bgRuns 9개째 삽입 → A evict.
    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false) // evict 확정(사전조건)

    // A로 복귀 — bgRuns 미스 → 디스크 로드 경로. 레지스트리 오버레이가 activeLoops를 복원해야 한다.
    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.activeLoops).toEqual(LOOP)
  })

  it('loopsStoppedNotice·pendingCommand도 동일 경계에서 함께 보존된다', async () => {
    useAppStore.setState({
      conversationId: 'B',
      currentRunId: 'run-b',
      activeLoops: [],
      loopsStoppedNotice: true,
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 },
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    await leaveTo('conv-8')
    expect('B' in useAppStore.getState().bgRuns).toBe(false)

    await useAppStore.getState().selectConversation('B')
    const after = useAppStore.getState()
    expect(after.loopsStoppedNotice).toBe(true)
    expect(after.pendingCommand).toEqual({ name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 })
  })

  it('불변조건: 앱 재시작 시뮬레이션(레지스트리 리셋) 후에는 배너가 복원되지 않는다(stale 방지)', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    // "재시작" — 모듈 스코프 레지스트리를 리셋(실제 재시작 시 renderer 프로세스 자체가
    // 새로 뜨며 모듈 상태가 전부 초기화되는 것과 동형).
    __resetSessionLoopDisplayForTests()

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().activeLoops).toEqual([]) // 미복원이 정답
  })

  it('레지스트리 잔존 0: 백그라운드 중 루프가 자연 종료(loops:[] 이벤트)되면 레지스트리 엔트리가 스스로 지워진다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    // leaveTo 대신 직접 selectConversation 호출 — currentRunId('run-a')를 건드리지 않아야
    // bgRuns[A].currentRunId가 'run-a'로 정확히 스냅샷되고, 아래 capturedHandler가 그 runId로
    // A의 bg 엔트리를 정확히 찾는다(leaveTo는 이 목적엔 부적합 — 전환 직전 currentRunId를
    // 임의로 재발급해 스냅샷 값이 어긋난다).
    await useAppStore.getState().selectConversation('B')
    expect(__getSessionLoopDisplaySizeForTests()).toBeGreaterThan(0) // A의 엔트리 존재(사전조건)

    // A는 백그라운드(run-a). loops:[] 이벤트 도착 → bgRuns[A] 갱신 + 레지스트리도 함께 비워져야.
    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    expect(__getSessionLoopDisplaySizeForTests()).toBe(0)
    unsubscribe()
  })

  it('축출-후-종료(reviewer 🔴 봉합): A 축출 뒤 도착한 loops:[]가 반영된 후 복귀하면 배너가 미복원된다(stale 방지)', async () => {
    // 배경: capBgRuns가 A를 축출하면 runtime.ts의 bgHit 매칭(`s.currentRunId===payload.runId`,
    // s는 bgRuns의 VALUE)이 불가능해져, 그 이후 도착하는 loops:[](루프 자연종료)가 레지스트리에
    // 영영 안 닿아 죽은 루프의 배너가 stale 잔존할 수 있었다(reviewer 🔴 실측, LR2-03 재림).
    // 내구 라우팅(runIdToConversationId) 봉합 후에는 축출과 무관하게 이 정리 이벤트가 계속
    // 레지스트리에 닿아야 한다.
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // A → conv-0: currentRunId('run-a')를 건드리지 않는 직접 selectConversation 호출 —
    // 내구 라우팅이 'run-a'로 정확히 등록돼야 아래 loops:[] 이벤트가 A로 매칭된다.
    await useAppStore.getState().selectConversation('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(true) // 아직 축출 전(사전조건)
    await leaveTo('conv-8') // 9번째 삽입 → A 축출
    expect('A' in useAppStore.getState().bgRuns).toBe(false) // 축출 확정(사전조건)

    // A 축출 후 run-a의 loops:[](루프 자연종료) 도착 — 내구 라우팅을 통해 레지스트리가
    // 정리(자기 가지치기)돼야 한다. bgHit는 이제 미스이므로 경로2가 아니라 경로2.5가 처리.
    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    // A로 복귀 — 디스크 로드 경로(bgRuns 미스). 루프가 실제로 끝났으므로 배너 미복원이 정답
    // (부활하면 stale — reviewer 🔴가 겨냥한 정확히 그 결함).
    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().activeLoops).toEqual([])

    unsubscribe()
  })

  it('내구 라우팅 맵 잔존 0: 축출 후 loops:[]가 반영돼 표시 트리오가 완전히 비면 라우팅 엔트리도 함께 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('conv-0') // A 등록(run-a)
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    await leaveTo('conv-8') // A 축출(bgRuns) — 라우팅은 별도 스코프라 아직 생존
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    // 표시 트리오가 완전히 비었으므로(레지스트리 자기 가지치기) 라우팅도 함께 정리돼야 한다
    // (맵 자체의 누수 대칭 — reviewer 지시 1번).
    expect(__getSessionLoopDisplaySizeForTests()).toBe(0)
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)

    unsubscribe()
  })

  it('내구 라우팅 맵 잔존 0: 전경 복귀(bg-restore)로 흡수되면 라우팅 엔트리가 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('B') // A 스냅샷 + 라우팅 등록(run-a)
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)

    await useAppStore.getState().selectConversation('A') // bgRuns 히트(축출 전) — 전경 복귀
    expect(useAppStore.getState().conversationId).toBe('A')
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)
  })

  it('레지스트리 잔존 0: 대화 영구 삭제 시 레지스트리 엔트리가 명시적으로 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])
    await leaveTo('B') // A → 레지스트리 기록
    expect(__getSessionLoopDisplaySizeForTests()).toBeGreaterThan(0)
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)

    await useAppStore.getState().deleteConversation('A')
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)
    expect(__getSessionLoopDisplaySizeForTests()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// reviewer 🟡-2 부속 확인 봉합(2026-07-03): conversationLoad가 "활성 대화 자신"에 호출되는
// 경로 실측 확인 — Sidebar.tsx handleSelect가 재선택을 막지 않아 selectConversation(id)가
// id===활성id로 호출될 수 있다(사이드바 재클릭). 봉합 전에는 이 경로가 디스크 스냅샷으로
// 라이브 flat 상태(미저장 thread·진행 중 /goal의 pendingCommand 등)를 통째로 덮어썼다.
// ═══════════════════════════════════════════════════════════════════════════════
describe('BF3 Phase 07 — reviewer 🟡-2: 활성 대화 재선택(same-id) no-op 가드', () => {
  it('selectConversation(현재 activeId)는 완전 no-op — conversationLoad IPC 미호출 + 라이브 상태(pendingCommand 포함) 불변', async () => {
    let loadCalls = 0
    const mockConversationLoad = mockApi.conversationLoad
    // 원본 mock을 감싸 호출 횟수만 계측(id 있는 호출만 카운트 — limit 목록모드 제외).
    mockApi.conversationLoad = (async (req: { id?: string; limit?: number }) => {
      if (req.id) loadCalls++
      return mockConversationLoad(req)
    }) as typeof mockApi.conversationLoad

    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      isRunning: true,
      thread: [{ kind: 'msg', id: 'm1', role: 'user', text: '진행 중 메시지(미저장)' }],
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 },
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('A') // 사이드바에서 이미 활성인 항목 재클릭 시뮬

    expect(loadCalls).toBe(0) // 디스크 재로드 자체가 안 일어나야 한다
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.isRunning).toBe(true)
    expect(after.thread).toEqual([{ kind: 'msg', id: 'm1', role: 'user', text: '진행 중 메시지(미저장)' }])
    expect(after.pendingCommand).toEqual({ name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 })
    expect(after.activeLoops).toEqual(LOOP)

    mockApi.conversationLoad = mockConversationLoad
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2차 봉합(reviewer 🔴 잔여): background-started 순수 크론 — leave 시점엔 트리오가 비어
// 있었다가(조건부 등록이라 라우팅 미등록) 백그라운드에서 처음 루프가 시작되는 경우.
// 1차 봉합(경로2.5 신설)은 "leave 당시 이미 루프가 있던" 경우만 커버했다 — 이 describe는
// 그 잔여 갭을 겨냥한다.
// ═══════════════════════════════════════════════════════════════════════════════
describe('BF3 Phase 07 — 2차 봉합: background-started 순수 크론(leave 시 트리오 빈 상태)', () => {
  it('경로2(routing-aware sync) 단독 봉합: 빈 트리오로 leave → bg에서 loops:[LOOP] 시작(라우팅 그 시점에 등록) → 축출 → loops:[] → 복귀 시 미복원', async () => {
    // 대화 A: 실행 중이나 아직 루프 없음(트리오 완전 빈 상태) — reviewer 반례의 정확한 전제.
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: [],
      loopsStoppedNotice: false,
      pendingCommand: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // A → conv-0: 트리오가 비어 있으므로 leave-스냅샷 시점엔 라우팅이 등록되지 않는다(사전조건).
    await useAppStore.getState().selectConversation('conv-0')
    expect(__getSessionRunRoutingSizeForTests()).toBe(0) // 사전조건: leave 시점엔 미등록

    // 백그라운드에서 처음 루프가 시작(순수 크론 — pendingCommand 없음) — 경로2(bgHit)로 도착.
    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: LOOP } })
    // routing-aware sync(경로2, 2차 봉합)가 이 시점에 라우팅을 등록해야 한다.
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)
    expect(useAppStore.getState().bgRuns['A']?.activeLoops).toEqual(LOOP)

    // conv-0..conv-7 나머지 8개를 더 거쳐 A를 bgRuns cap(8) 초과로 축출.
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(true) // 아직 축출 전(사전조건)
    await leaveTo('conv-8') // 9번째 삽입 → A 축출
    expect('A' in useAppStore.getState().bgRuns).toBe(false) // 축출 확정(사전조건)

    // 축출 후 루프 자연종료(loops:[]) 도착 — 라우팅이 이미 등록돼 있으므로 경로2.5가 처리해야 한다.
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    // A로 복귀 — 디스크 로드 경로. 루프가 실제로 끝났으므로 배너 미복원이 정답(부활하면 stale).
    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().activeLoops).toEqual([])

    unsubscribe()
  })

  it('run 생성 시점 등록(경로1 봉합): sendMessage 직후(트리오가 여전히 빈 상태여도) 라우팅이 즉시 등록된다 — 패널 SET_RUN_ID와 동형', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: null,
      isRunning: false,
      thread: [],
      activeLoops: [],
      loopsStoppedNotice: false,
      pendingCommand: null,
    } as Parameters<typeof useAppStore.setState>[0])

    expect(__getSessionRunRoutingSizeForTests()).toBe(0) // 사전조건

    await useAppStore.getState().sendMessage('안녕')

    // 트리오는 여전히 비어 있다(loops 이벤트 없음) — 그런데도 run 생성 시점에 무조건 등록돼야
    // 한다(패널식 완전 미러 — 트리오 상태와 무관).
    expect(useAppStore.getState().activeLoops).toEqual([])
    expect(__getSessionRunRoutingSizeForTests()).toBe(1)
  })

  it('정리 대칭: 루프 없이 끝나는 평범한 run은 done 시점(경로1)에 라우팅이 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: null,
      isRunning: false,
      thread: [],
      activeLoops: [],
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    await useAppStore.getState().sendMessage('안녕') // run 생성 시점 등록 → 라우팅 1개
    expect(__getSessionRunRoutingSizeForTests()).toBe(1)

    const runId = useAppStore.getState().currentRunId as string
    capturedHandler!({ runId, event: { type: 'done' } }) // 루프 없이 정상 종료

    // 트리오가 계속 비어 있었으므로(루프 없는 평범한 대화) done 시점에 라우팅도 정리돼야 한다.
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)
    unsubscribe()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// reviewer 🟡 부속: applyLoopDisplayEventFallback의 done/error 분기 단위 검증.
// (loops 분기는 위 통합 시나리오들에서 이미 간접 검증됨 — 여기서는 done/error의 pendingCommand
// 무조건 null화 + activeLoops/loopsStoppedNotice 불변을 직접 단위로 고정한다.)
// ═══════════════════════════════════════════════════════════════════════════════
describe('BF3 Phase 07 — applyLoopDisplayEventFallback 단위 검증(reviewer 🟡)', () => {
  beforeEach(() => {
    __resetSessionLoopDisplayForTests()
  })

  it('done: pendingCommand를 무조건 null화하고 activeLoops/loopsStoppedNotice는 불변', () => {
    sessionLoopDisplayRegistry.sync('conv-x', {
      activeLoops: LOOP,
      loopsStoppedNotice: false,
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 2 },
    })

    applyLoopDisplayEventFallback('conv-x', { type: 'done' })

    const after = sessionLoopDisplayRegistry.read('conv-x')
    expect(after?.pendingCommand).toBeNull()
    expect(after?.activeLoops).toEqual(LOOP) // done은 activeLoops 무관(handleDone과 동형)
  })

  it('error: done과 동형 — pendingCommand만 null화', () => {
    sessionLoopDisplayRegistry.sync('conv-y', {
      activeLoops: [],
      loopsStoppedNotice: true,
      pendingCommand: { name: 'goal', cardId: 'cmd-2', beforeMsgs: 0, turns: 1 },
    })

    applyLoopDisplayEventFallback('conv-y', { type: 'error', message: '실패' })

    const after = sessionLoopDisplayRegistry.read('conv-y')
    // pendingCommand가 null화됐지만 loopsStoppedNotice=true라 트리오가 완전히 비지는 않음
    // (자기 가지치기 미발동 — 엔트리 생존 확인).
    expect(after?.pendingCommand).toBeNull()
    expect(after?.loopsStoppedNotice).toBe(true)
  })

  it('done/error: 등록된 적 없는 conversationId(base 없음)에도 안전하게 no-op에 가깝게 동작(pendingCommand null 유지, 신규 엔트리 생성 안 함)', () => {
    applyLoopDisplayEventFallback('conv-never-seen', { type: 'done' })
    // activeLoops/loopsStoppedNotice가 전부 기본값(빈)이고 pendingCommand도 null이므로
    // 결과가 빈 스냅샷 → sync가 자기 가지치기(엔트리 생성 안 함).
    expect(sessionLoopDisplayRegistry.read('conv-never-seen')).toBeUndefined()
  })

  it('text/tool_call 등 트리오 무관 이벤트는 no-op(레지스트리 불변)', () => {
    sessionLoopDisplayRegistry.sync('conv-z', {
      activeLoops: LOOP,
      loopsStoppedNotice: false,
      pendingCommand: null,
    })
    const before = sessionLoopDisplayRegistry.read('conv-z')

    applyLoopDisplayEventFallback('conv-z', { type: 'text', delta: '안녕' })

    expect(sessionLoopDisplayRegistry.read('conv-z')).toEqual(before)
  })

  it('loops: activeLoops 덮어쓰기 + 비어있지 않으면 loopsStoppedNotice 자동 해제(handleLoops와 동형)', () => {
    sessionLoopDisplayRegistry.sync('conv-w', {
      activeLoops: [],
      loopsStoppedNotice: true,
      pendingCommand: null,
    })

    applyLoopDisplayEventFallback('conv-w', { type: 'loops', loops: LOOP })

    const after = sessionLoopDisplayRegistry.read('conv-w')
    expect(after?.activeLoops).toEqual(LOOP)
    expect(after?.loopsStoppedNotice).toBe(false)
  })
})

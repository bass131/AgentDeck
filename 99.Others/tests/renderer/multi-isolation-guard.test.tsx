// @vitest-environment jsdom
/**
 * multi-isolation-guard.test.tsx — 전역 subscribeAgentEvents 구독 수명 가드.
 *
 * Phase 07(LR3-multipanel-continuity) 갱신: 이 파일은 원래 "멀티 모드 전환 시 전역 구독이
 * 해제된다"를 방어선으로 삼았으나, 그 전제 자체가 "역방향 유령" 버그였다 — 단일 모드에서
 * Conversation.tsx가 마운트 시 subscribeAgentEvents()를 호출했고, 멀티 모드 진입 시
 * Shell.tsx가 그 컴포넌트를 언마운트하면서 구독도 함께 끊겼다. 그 결과 단일챗 자신의
 * 활성 run이 멀티 체류 중 보내는 done/session 이벤트를 영구히 놓쳐 isRunning/currentRunId가
 * 고착되는 유령이 생겼다(01.Phases/switch-continuity/_diagnosis.md §멀티패널 "역방향
 * 유령" — 착수 서두 재현 RED 확정, 본 Phase에서 GREEN 수리).
 *
 * 수리: subscribeAgentEvents() 호출을 Shell.tsx 자체의 마운트 effect로 승격했다. Shell은
 * workspaceMode와 무관하게 항상 마운트돼 있으므로(App.tsx→AppGate→Shell, key 없음) 구독도
 * 모드 전환과 무관하게 항상 라이브다 — 단일챗의 runId 매칭 라우팅(payload.runId===
 * currentRunId 또는 bgRuns 매치)이 교차오염을 여전히 막는다(runtime.ts 경로1~3, 무변경).
 *
 * 핵심 단언(갱신):
 *   A) single 모드: subscribeAgentEvents 호출됨 + unsubscribe 아직 미호출(구독 라이브).
 *   B) single→multi 전환: 구독이 유지된다(unsubscribe 미호출·재구독 없음) — 옛 "해제" 방어선의 반대.
 *   C) multi 모드로 초기 진입해도 구독은 있다(Shell 마운트 시점에 항상 등록) — 옛 "구독 없음" 기대의 반대.
 *   E) 역방향 유령 회귀 가드: 단일챗 활성 run이 멀티 체류 중 done을 받아 isRunning이 정상 해제된다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api 전체 mock ────────────────────────────────────────────────────
// Shell이 마운트하는 모든 하위 컴포넌트(Sidebar, FileExplorer, AgentPanel,
// Conversation, MultiWorkspace 등)가 store 액션을 통해 간접 호출하는 API 전부 포함.
// onAgentEvent: subscribeAgentEvents()가 호출하는 핵심 API — spy용 unsub 반환.

// liveHandler: 실 IPC listener 제거를 흉내(unsubscribe 호출 시 콜백을 실제로 무효화) — 실
// window.api.onAgentEvent의 unsubscribe는 ipcRenderer 리스너를 진짜로 제거해 그 뒤로는
// main이 이벤트를 보내도 콜백이 절대 다시 불리지 않는다. 이 무효화를 흉내내지 않으면(단순
// vi.fn() 스파이만 두면) "구독 해제됐다"는 상태에서도 캡처해둔 콜백 참조를 테스트가 수동으로
// 호출할 수 있어 회귀 가드 E(역방향 유령)가 실제로는 안 고쳐졌는데 GREEN으로 착시할 수 있다.
let liveHandler: ((payload: { runId: string; event: { type: string } }) => void) | null = null
const mockUnsubscribe = vi.fn(() => {
  liveHandler = null
})
const mockOnAgentEvent = vi.fn().mockImplementation(
  (cb: (payload: { runId: string; event: { type: string } }) => void) => {
    liveHandler = cb
    return mockUnsubscribe
  },
)

const mockApi = {
  // 창 제어
  windowMinimize: vi.fn().mockResolvedValue(undefined),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn().mockResolvedValue(undefined),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn().mockResolvedValue(undefined),
  windowDragStart: vi.fn().mockResolvedValue(undefined),
  windowDragEnd: vi.fn().mockResolvedValue(undefined),
  windowResizeStart: vi.fn().mockResolvedValue(undefined),
  windowResizeEnd: vi.fn().mockResolvedValue(undefined),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  // 대화 / 에이전트 이벤트
  onAgentEvent: mockOnAgentEvent,
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ ok: true }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-guard-0' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  // 파일 시스템
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  fsRead: vi.fn().mockResolvedValue({ content: '' }),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
  // 레퍼런스
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  // git
  git: {
    root: vi.fn().mockResolvedValue(null),
  },
  // 대화 목록 관리
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  conversationDelete: vi.fn().mockResolvedValue({ ok: true }),
  // P1: UI prefs IPC (Shell.tsx가 prefs 연결에서 호출)
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  // P4: 부트 자동 트리거 — 빈 버전 반환 → decideStartupModal null → 모달 자동 표시 없음
  getAppVersion: vi.fn().mockResolvedValue(''),
  // 폴리싱 #2(a): Shell 부트 useEffect가 호출하는 엔진 업데이트 체크 — updateAvailable:false → 알림 미표시
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// 회귀 가드 C가 subscribeAgentEvents를 spy로 교체하는데, useAppStore는 파일 내 테스트가
// 공유하는 싱글톤이라 그 교체가 다음 테스트로 새어나갈 수 있다(afterEach에서 원본으로
// 복원하지 않으면). 모듈 로드 시점(어떤 테스트도 아직 교체하지 않은 시점)의 진짜 액션을
// 캡처해 afterEach마다 되돌린다.
const REAL_SUBSCRIBE_AGENT_EVENTS = useAppStore.getState().subscribeAgentEvents

// ── store 격리 헬퍼 ────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks()는 호출 이력만 지우고 mockImplementation은 보존하지만(vitest 문서),
  // liveHandler 자체는 이전 테스트의 잔재일 수 있으므로 명시적으로 리셋한다.
  liveHandler = null
  useAppStore.setState({ workspaceMode: 'single' })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', subscribeAgentEvents: REAL_SUBSCRIBE_AGENT_EVENTS })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('회귀 가드 A: single 모드에서 전역 구독이 라이브다', () => {
  it('Conversation 마운트 시 subscribeAgentEvents(→ onAgentEvent)가 1회 호출된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // subscribeAgentEvents는 내부적으로 window.api.onAgentEvent를 호출한다
    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
  })

  it('single 모드 렌더 직후 unsubscribe는 아직 호출되지 않았다(구독 라이브)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // Conversation이 마운트된 상태 — cleanup 미실행 → unsubscribe 미호출
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('회귀 가드 B: single→multi 전환해도 전역 구독은 유지된다 (Phase 07 — 역방향 유령 수리)', () => {
  it('workspaceMode를 multi로 바꿔도 unsubscribe가 호출되지 않는다(구독이 Shell 수명으로 승격됨)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // single 모드: 구독 등록됨, unsubscribe 미호출
    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
    expect(mockUnsubscribe).not.toHaveBeenCalled()

    // multi 모드로 전환 → Shell은 그대로 마운트 유지(중앙 대화 컴포넌트만 언마운트)
    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    // Phase 07: 구독은 Shell 마운트 effect 소유 — 중앙 대화 컴포넌트 언마운트와 무관하게 유지.
    // 이 단언이 실패하면(unsubscribe 호출됨): 구독이 다시 컴포넌트 스코프로 퇴행 → 역방향 유령 재발!
    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })

  it('multi 전환 후 전역 onAgentEvent 재호출 없음(중복 구독 없음)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    const callCountAfterSingle = mockOnAgentEvent.mock.calls.length // 1(전역) — 아직 멀티 미진입

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    const callCountAfterMulti = mockOnAgentEvent.mock.calls.length
    const deltaAfterMulti = callCountAfterMulti - callCountAfterSingle

    // Phase 07: MultiWorkspace의 usePanelSlot 6개는 패널 매니저 전역 구독 1개를 지연·멱등
    // 등록한다(첫 사용 시 1회만, 6개 훅이 각자 다시 호출하지 않음) — 증가분은 0~1.
    // 전역 subscribeAgentEvents(단일챗)가 재호출되면 이 델타가 그만큼 더 커진다 — 상한 1로 감지.
    expect(deltaAfterMulti).toBeLessThanOrEqual(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('회귀 가드 C: multi 모드로 초기 진입해도 전역 구독이 있다 (Phase 07 — 역방향 유령 수리)', () => {
  it('workspaceMode=multi로 초기 렌더해도 전역 subscribeAgentEvents가 호출된다(Shell 마운트 시점)', async () => {
    // store spy: subscribeAgentEvents 호출 횟수 추적
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'multi' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // Phase 07: Shell 마운트 effect가 workspaceMode와 무관하게 항상 구독한다.
    // 이 단언이 실패하면(미호출): 구독이 다시 컴포넌트 스코프로 퇴행 → 역방향 유령 재발!
    expect(subscribeSpyFn).toHaveBeenCalledTimes(1)
  })

  it('multi 모드 렌더 직후 전역 onAgentEvent 라이브 구독 수는 1이다', async () => {
    // store의 실 subscribeAgentEvents 대신 spy로 교체해 "전역" 구독 여부만 체크
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'multi' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // subscribeSpyFn이 정확히 1회 호출됨 — Shell 수명 구독 1개(모드 무관)
    expect(subscribeSpyFn).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('회귀 가드 E: 역방향 유령 재현·수리 확정 (Phase 07)', () => {
  it('단일챗 활성 run 진행 중 multi로 전환 → done 도착 → single 복귀 시 isRunning이 정상 해제된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // 단일챗 활성 run 시뮬레이션 — 사전조건(실 sendMessage 없이 상태 직접 셋업, P3a류 테스트와 동형).
    useAppStore.setState({
      currentRunId: 'run-ghost',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    // multi 모드로 전환 — 옛 구현이면 여기서 Conversation 언마운트 → 구독 해제(역방향 유령의 원인).
    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    // multi 체류 중 도착하는 done 이벤트 — liveHandler는 unsubscribe가 실제로 호출되면
    // null로 무효화된다(위 mockOnAgentEvent 정의 참조) — 옛 구현(Conversation 스코프
    // 구독)이면 여기서 이미 null이라 이 단언 자체가 RED로 버그를 잡아낸다. mock.calls[0]의
    // 콜백 참조를 직접 재사용하면 "무효화됨"을 놓쳐 착시 GREEN이 나므로 liveHandler를 쓴다.
    expect(liveHandler).toBeTruthy()
    act(() => {
      liveHandler!({ runId: 'run-ghost', event: { type: 'done' } })
    })

    // single로 복귀 — Phase 07 수리 전: isRunning이 true로 고착(유령). 수리 후: done이 이미 적용돼 false.
    await act(async () => {
      useAppStore.setState({ workspaceMode: 'single' })
    })

    expect(useAppStore.getState().isRunning).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('회귀 가드 D: 보조 — Shell.tsx가 multi에서 null을 렌더 (소스 구조 검증)', () => {
  it('Shell 소스에 workspaceMode=multi 시 Conversation을 null로 대체하는 패턴이 있다', async () => {
    // Shell.tsx 소스 텍스트에서 구조적 패턴을 확인한다.
    // "workspaceMode === 'multi' ? null" 또는 "workspaceMode !== 'multi'"가 존재해야 한다.
    // 이 패턴이 변경(제거/역전)되면 테스트 실패 → 회귀 경고.
    const shellSrc = await import('../../../02.Source/renderer/src/layout/Shell?raw')
    const src: string = (shellSrc as unknown as { default: string }).default

    // Shell.tsx:193 패턴: `workspaceMode === 'multi' ? null` (Conversation 언마운트 조건)
    const hasNullGuard =
      /workspaceMode\s*===\s*['"]multi['"]\s*\?\s*null/.test(src) ||
      /workspaceMode\s*!==\s*['"]multi['"]\s*&&/.test(src) ||
      // 부정 패턴: multi가 아닐 때만 Conversation 렌더
      /workspaceMode\s*!==\s*['"]multi['"]\s*\?/.test(src)

    // 단언: Shell이 multi 모드에서 Conversation을 조건부로 제거하는 패턴 존재
    // 이 단언이 실패하면: Shell 소스에서 해당 패턴이 제거됨 → 회귀 위험 경고!
    expect(hasNullGuard).toBe(true)
  })

  it('Shell 소스에 multi 모드 시 <Conversation>이 렌더 블록 밖에 있음을 확인', async () => {
    const shellSrc = await import('../../../02.Source/renderer/src/layout/Shell?raw')
    const src: string = (shellSrc as unknown as { default: string }).default

    // "workspaceMode === 'multi' ? null" 뒤에 <Conversation이 등장하지 않아야 한다
    // 즉, Conversation은 single 전용 블록(null 반대쪽) 안에만 있어야 한다.
    // 패턴: `workspaceMode === 'multi' ? null : ( ... <Conversation ...`
    const multiNullIdx = src.indexOf("workspaceMode === 'multi' ? null")
    expect(multiNullIdx).toBeGreaterThan(-1)

    // <Conversation이 등장하는 인덱스
    const convIdx = src.indexOf('<Conversation')
    expect(convIdx).toBeGreaterThan(-1)

    // <Conversation은 "? null :" 이후(false 브랜치)에 있어야 한다
    // null 이후의 ': (' 다음에 Conversation이 나와야 한다
    // → convIdx > multiNullIdx (Conversation은 null 뒤에 위치)
    expect(convIdx).toBeGreaterThan(multiNullIdx)
  })
})

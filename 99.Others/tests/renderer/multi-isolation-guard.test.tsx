// @vitest-environment jsdom
/**
 * multi-isolation-guard.test.tsx — M4-3 회귀 가드: 멀티 모드 전환 시 전역 subscribeAgentEvents 구독 해제.
 *
 * 배경:
 *   단일 모드에서 Conversation이 마운트되면 appStore.subscribeAgentEvents()를 호출해
 *   전역 onAgentEvent 구독을 등록한다(Conversation.tsx:262-268).
 *   멀티 모드 진입 시 Shell.tsx:193이 <Conversation>을 언마운트하고, 이때
 *   useEffect cleanup(return unsubscribe)이 자동으로 전역 구독을 해제한다.
 *   이 단일 방어선이 무너지면(multi에서도 Conversation 유지) 전역 구독이 살아나
 *   모든 패널 이벤트로 단일 thread가 오염된다.
 *
 * 핵심 단언:
 *   A) single 모드: subscribeAgentEvents 호출됨 + unsubscribe 아직 미호출(구독 라이브).
 *   B) single→multi 전환: unsubscribe 호출됨(전역 구독 해제).
 *   C) multi 모드에서 전역 subscribeAgentEvents 라이브 구독 수 = 0.
 *
 * 방식:
 *   Shell 레벨 렌더 — store.subscribeAgentEvents를 spy로 교체.
 *   single→multi workspaceMode 전환 후 unsubscribe 호출 여부 단언.
 *
 * TDD 정신: 현 구현(정상)에서 green이어야 한다.
 *   red라면 격리 가정 반증 → 즉시 보고.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api 전체 mock ────────────────────────────────────────────────────
// Shell이 마운트하는 모든 하위 컴포넌트(Sidebar, FileExplorer, AgentPanel,
// Conversation, MultiWorkspace 등)가 store 액션을 통해 간접 호출하는 API 전부 포함.
// onAgentEvent: subscribeAgentEvents()가 호출하는 핵심 API — spy용 unsub 반환.

const mockUnsubscribe = vi.fn()
const mockOnAgentEvent = vi.fn().mockReturnValue(mockUnsubscribe)

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

// ── store 격리 헬퍼 ────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  mockApi.onAgentEvent.mockReturnValue(mockUnsubscribe)
  useAppStore.setState({ workspaceMode: 'single' })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single' })
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
describe('회귀 가드 B: single→multi 전환 시 전역 구독이 해제된다 (핵심 방어선)', () => {
  it('workspaceMode를 multi로 바꾸면 Conversation cleanup이 실행되어 unsubscribe가 호출된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // single 모드: 구독 등록됨, unsubscribe 미호출
    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
    expect(mockUnsubscribe).not.toHaveBeenCalled()

    // multi 모드로 전환 → Shell이 <Conversation>을 언마운트
    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    // Conversation 언마운트 → useEffect cleanup → unsubscribe 호출됨
    // 이 단언이 실패하면: Shell.tsx가 multi에서도 <Conversation>을 렌더 → 회귀!
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  it('multi 전환 후 onAgentEvent 추가 재호출 없음(전역 구독 재등록 없음)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    const callCountAfterSingle = mockOnAgentEvent.mock.calls.length // 1

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    // multi 전환 후 전역 subscribeAgentEvents가 다시 호출되지 않아야 한다
    // (멀티 패널의 usePanelSession은 별도 onAgentEvent를 직접 호출하므로 카운트 증가 가능)
    // 단, 전역 subscribeAgentEvents(→ appStore.subscribeAgentEvents)는 재호출 없어야 함.
    // 여기서는 onAgentEvent 총 호출 횟수가 single 시점과 동일하거나 +panelCount임을 확인.
    // 핵심: Conversation이 multi에서 재마운트되어 전역 구독을 다시 등록하지 않는다.
    const callCountAfterMulti = mockOnAgentEvent.mock.calls.length

    // multi 전환 시 MultiWorkspace의 usePanelSession 6개 훅이 onAgentEvent를 구독하므로
    // 총 카운트는 1(single) + 6(multi panels) = 7이어야 한다.
    // 만약 Conversation이 multi에서도 살아있다면 +1 더 추가되어 8+ → 회귀 감지.
    // 여기서는 "multi 전환 후 증가분이 6이하"를 단언(Conversation 재마운트 없음).
    const deltaAfterMulti = callCountAfterMulti - callCountAfterSingle
    // usePanelSession 6개 고정 패턴(multi-concurrent.test.tsx (5)에서 검증됨) — 6이하.
    // Conversation이 재마운트되면 7+ → 이 단언이 실패.
    expect(deltaAfterMulti).toBeLessThanOrEqual(6)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('회귀 가드 C: multi 모드 직접 진입 시 전역 구독이 없다', () => {
  it('workspaceMode=multi로 초기 렌더 시 전역 subscribeAgentEvents가 호출되지 않는다', async () => {
    // store spy: subscribeAgentEvents 호출 횟수 추적
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'multi' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // multi 모드: Conversation이 마운트되지 않으므로 subscribeAgentEvents 미호출
    // 이 단언이 실패하면: Shell이 multi에서도 Conversation을 렌더 → 회귀!
    expect(subscribeSpyFn).not.toHaveBeenCalled()
  })

  it('multi 모드 렌더 직후 전역 onAgentEvent 라이브 구독 수는 0이다', async () => {
    // store의 실 subscribeAgentEvents 대신 spy로 교체해 "전역" 구독 여부만 체크
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'multi' })
    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    // subscribeSpyFn이 0회 호출됨 → 전역 구독 라이브 0
    expect(subscribeSpyFn).toHaveBeenCalledTimes(0)
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

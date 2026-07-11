// @vitest-environment jsdom
/**
 * lr4-p06-ultracode-toggle-persist.test.tsx — LR4 P06 RED 테스트 (TDD 1단계).
 *
 * 버그(현재): UltraCode 오케스트레이션 토글이 컴포넌트 로컬 useState라
 *   (Composer.tsx:135 / PanelView.tsx:135), 화면 전환으로 언마운트되면 소멸한다.
 *   - 단일→멀티→단일 왕복 시 Shell.tsx:350이 단일챗(<main.pane.chat> → Conversation →
 *     Composer)을 언마운트 → 재진입 시 fresh useState(true) → 사용자가 끈 OFF가 ON으로 리셋.
 *   - 멀티는 Shell.tsx:375 key={activeMultiSessionId}로 재마운트 → PanelView 로컬 상태 소멸.
 *
 * 스코프 결정(확정, P07 REPL 토글 원칙과 통일 = "전역 과대 → 세션별 분리"):
 *   - 단일챗 = 대화별(conversationId 키)
 *   - 멀티   = 패널별(패널 세션 키 multi:{activeMultiSessionId}:slot:{slot})
 *
 * 이 파일은 *실패하는 테스트만* 만든다(구현 없음). 각 it()은 "리마운트/전환 후 OFF 보존"을
 * 관측 가능한 DOM(.orch-toggle .orch-badge / .orch-on)으로 단언한다 — 구현 형상(store 슬라이스
 * vs 상위 리프팅)에 의존하지 않는 *행동 계약* 테스트. 현재 로컬 useState 구현에서는 재마운트가
 * 기본값 ON을 되살리므로 RED가 정상.
 *
 * 결정론: window.api 전면 모킹(시간/랜덤/네트워크 의존 0). setTimeout은 async 완료 대기용
 *   단발(기존 multi-ultracode.test.tsx 관례 동일).
 *
 * CRITICAL: 앱 소스(02.Source/**) 미수정 — 테스트 전용.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup, type RenderResult } from '@testing-library/react'
import { type JSX } from 'react'
import { __resetPanelSessionManagerForTests } from '../../../02.Source/renderer/src/store/panelSession'
import { __resetUltracodeToggleForTests } from '../../../02.Source/renderer/src/store/ultracodeToggle'

// ── window.api 모킹 (단일챗 Conversation + 멀티 MultiWorkspace 공용 슈퍼셋) ────────
const mockApi = {
  // 창 컨트롤 (Shell/공용)
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  // 대화 영속 (단일챗)
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  // 에이전트 실행/이벤트
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  // 멀티세션 영속
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiCmdUpsert: vi.fn().mockResolvedValue({ ok: true, state: { version: 2, activeSessionId: '', sessions: [] } }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  // 컴포저 마운트 부수효과 (graceful — 빈 응답)
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUsage: vi.fn().mockResolvedValue({ pct: null, resetsAt: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(() => {})
  mockApi.agentRun.mockResolvedValue({ runId: 'run-1' })
  mockApi.multiSessionLoad.mockResolvedValue({ state: null })
  mockApi.multiCmdUpsert.mockResolvedValue({ ok: true, state: { version: 2, activeSessionId: '', sessions: [] } })
  mockApi.listFiles.mockResolvedValue({ files: [] })
  mockApi.getUsage.mockResolvedValue({ pct: null, resetsAt: null })
  __resetPanelSessionManagerForTests()
  // LR4 P06: 토글 진실원이 세션별 store(ultracodeToggle.ts)이므로 it() 간 offKeys 누수를 차단
  // (특히 D/E가 공유하는 'single:default' 키). store 싱글턴 결정론 확보.
  __resetUltracodeToggleForTests()
})

afterEach(async () => {
  cleanup()
  // store 싱글턴 오염 방지 — 다음 describe로 상태 누수 차단.
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    workspaceMode: 'single',
    workspaceRoot: null,
    conversationId: null,
    activeMultiSessionId: '',
  } as Parameters<typeof useAppStore.setState>[0])
})

// ── 헬퍼: 단일챗 UltraCode 토글 조회 (aria-label로 REPL 토글과 구분) ──────────────
function ultraToggles(root: ParentNode): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('.orch-toggle')).filter(
    (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
  ) as HTMLButtonElement[]
}
function badgeOf(toggle: Element): string {
  return toggle.querySelector('.orch-badge')?.textContent?.trim() ?? ''
}

// ── 헬퍼: store 세팅 ────────────────────────────────────────────────────────────
async function store() {
  const mod = await import('../../../02.Source/renderer/src/store/appStore')
  return mod.useAppStore
}

// ─────────────────────────────────────────────────────────────────────────────────
// 시나리오 1: 왕복 보존 (핵심 재현) — 단일 OFF → 멀티(언마운트) → 단일 → OFF 유지
// ─────────────────────────────────────────────────────────────────────────────────
describe('lr4-p06-A: 단일챗 왕복 보존 (single→multi→single OFF 유지)', () => {
  // Shell.tsx:350 미러 — workspaceMode==='multi'이면 단일챗을 언마운트한다.
  async function renderSingleShellHarness(): Promise<RenderResult> {
    const useAppStore = await store()
    const { selectWorkspaceMode } = await import('../../../02.Source/renderer/src/store/appStore')
    const { Conversation } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/Conversation'
    )
    function SingleShellHarness(): JSX.Element {
      const mode = useAppStore(selectWorkspaceMode)
      // 멀티 진입 = 단일챗 언마운트(실제 Shell과 동형). 스텁으로 대체.
      return mode === 'multi' ? <div data-testid="multi-stub" /> : <Conversation />
    }
    let r!: RenderResult
    await act(async () => {
      r = render(<SingleShellHarness />)
      await new Promise((res) => setTimeout(res, 20))
    })
    return r
  }

  it('단일 뷰에서 토글 OFF → 멀티 진입(언마운트) → 단일 복귀 시 OFF가 유지된다', async () => {
    const useAppStore = await store()
    // 안정된 대화 스코프 키(대화별 유지의 키) + 컴포저 활성화.
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: 'conv-roundtrip',
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderSingleShellHarness()

    // (기준) 기본값 ON — UC1-P07/ADR-032 v2.
    const t0 = ultraToggles(container)[0]
    expect(t0).toBeTruthy()
    expect(t0.classList.contains('orch-on')).toBe(true)

    // 사용자가 끈다 → OFF.
    await act(async () => { fireEvent.click(t0) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')

    // 멀티 진입 → 단일챗 언마운트.
    await act(async () => {
      useAppStore.getState().setWorkspaceMode('multi')
      await new Promise((res) => setTimeout(res, 10))
    })
    expect(ultraToggles(container).length).toBe(0) // 언마운트 확인(sanity)

    // 단일 복귀 → 재마운트.
    await act(async () => {
      useAppStore.getState().setWorkspaceMode('single')
      await new Promise((res) => setTimeout(res, 20))
    })

    // 핵심 단언: 왕복 후에도 OFF 유지되어야 한다.
    //   현재 구현(Composer 로컬 useState 기본 true)은 재마운트로 ON 리셋 → RED.
    const tBack = ultraToggles(container)[0]
    expect(tBack).toBeTruthy()
    expect(tBack.classList.contains('orch-on')).toBe(false)
    expect(badgeOf(tBack)).toBe('OFF')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────
// 시나리오 2: 세션별(대화별) 독립 — A OFF → B 기본 ON → A 복귀 OFF
// ─────────────────────────────────────────────────────────────────────────────────
describe('lr4-p06-B: 단일챗 대화별 독립 (conversation A/B 격리)', () => {
  async function renderConversation(): Promise<RenderResult> {
    const { Conversation } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/Conversation'
    )
    let r!: RenderResult
    await act(async () => {
      r = render(<Conversation />)
      await new Promise((res) => setTimeout(res, 20))
    })
    return r
  }

  it('대화 A에서 OFF → 대화 B로 전환 시 기본값 ON → 다시 A로 복귀 시 여전히 OFF', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: 'conv-A',
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConversation()

    // 대화 A: 기본 ON → 사용자가 끈다 → OFF.
    const tA = ultraToggles(container)[0]
    expect(tA.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(tA) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')

    // 대화 B로 전환(단일챗은 재마운트 없이 conversationId 갱신 — selectConversation의 순수 효과).
    //   대화별 스코프라면 B는 아직 토글을 만진 적 없으므로 기본값 ON을 보여야 한다.
    //   현재 구현: 단일 로컬 useState라 B로 바꿔도 OFF 고착 → RED.
    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-B' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })
    const tB = ultraToggles(container)[0]
    expect(tB).toBeTruthy()
    expect(badgeOf(tB)).toBe('ON')
    expect(tB.classList.contains('orch-on')).toBe(true)

    // 대화 A로 복귀 → A가 끈 OFF는 그대로 유지되어야 한다.
    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-A' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })
    const tA2 = ultraToggles(container)[0]
    expect(badgeOf(tA2)).toBe('OFF')
    expect(tA2.classList.contains('orch-on')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────
// 시나리오 3: 멀티 패널별 독립 + 리마운트 유지
//   - 패널1 OFF가 패널2로 전염되지 않음(격리)
//   - 멀티↔단일 왕복(MultiWorkspace 재마운트) 후에도 패널1 OFF 유지 / 패널2 ON 유지
// ─────────────────────────────────────────────────────────────────────────────────
describe('lr4-p06-C: 멀티 패널별 독립 + 리마운트 유지', () => {
  // Shell.tsx:375 미러 — multi일 때만 MultiWorkspace를 key={activeMultiSessionId}로 렌더.
  async function renderMultiShellHarness(): Promise<RenderResult> {
    const useAppStore = await store()
    const { selectWorkspaceMode, selectActiveMultiSessionId } = await import(
      '../../../02.Source/renderer/src/store/appStore'
    )
    const { MultiWorkspace } = await import(
      '../../../02.Source/renderer/src/components/00_shell/MultiWorkspace'
    )
    function MultiShellHarness(): JSX.Element {
      const mode = useAppStore(selectWorkspaceMode)
      const activeId = useAppStore(selectActiveMultiSessionId)
      return mode === 'multi' ? <MultiWorkspace key={activeId} /> : <div data-testid="single-stub" />
    }
    let r!: RenderResult
    await act(async () => {
      r = render(<MultiShellHarness />)
      await new Promise((res) => setTimeout(res, 30))
    })
    return r
  }

  function panels(container: ParentNode): HTMLElement[] {
    return Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)')) as HTMLElement[]
  }

  it('패널1 OFF → 멀티↔단일 왕복(재마운트) 후에도 패널1 OFF 유지, 패널2 ON 유지', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      workspaceMode: 'multi',
      activeMultiSessionId: 'm-roundtrip',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderMultiShellHarness()

    const p0 = panels(container)
    expect(p0.length).toBeGreaterThanOrEqual(2)
    const p1Toggle = ultraToggles(p0[0])[0]
    const p2Toggle = ultraToggles(p0[1])[0]
    // (기준) 둘 다 기본 ON.
    expect(p1Toggle.classList.contains('orch-on')).toBe(true)
    expect(p2Toggle.classList.contains('orch-on')).toBe(true)

    // 패널1만 끈다 → 격리: 패널2는 ON 유지(현재 구현도 통과 — 기준선).
    await act(async () => { fireEvent.click(p1Toggle) })
    expect(badgeOf(ultraToggles(panels(container)[0])[0])).toBe('OFF')
    expect(badgeOf(ultraToggles(panels(container)[1])[0])).toBe('ON')

    // 단일 진입 → MultiWorkspace 언마운트.
    await act(async () => {
      useAppStore.getState().setWorkspaceMode('single')
      await new Promise((res) => setTimeout(res, 10))
    })
    expect(container.querySelector('[data-testid="single-stub"]')).toBeTruthy()

    // 멀티 복귀 → 같은 activeMultiSessionId로 재마운트(패널 세션 키 안정 → 유지되어야 함).
    await act(async () => {
      useAppStore.getState().setWorkspaceMode('multi')
      await new Promise((res) => setTimeout(res, 30))
    })

    // 핵심 단언: 왕복 후 패널1 OFF 유지 / 패널2 ON 유지.
    //   현재 구현(PanelView 로컬 useState 기본 true)은 재마운트로 둘 다 ON 리셋 → 패널1에서 RED.
    const pBack = panels(container)
    expect(pBack.length).toBeGreaterThanOrEqual(2)
    expect(badgeOf(ultraToggles(pBack[0])[0])).toBe('OFF')
    expect(ultraToggles(pBack[0])[0].classList.contains('orch-on')).toBe(false)
    expect(badgeOf(ultraToggles(pBack[1])[0])).toBe('ON')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────
// 시나리오 D/E: 신규 미저장 대화 → 첫 전송 시 conversationId 발급(null→id) 마이그레이션
//   reviewer 실측 결함: 새 대화는 conversationId=null → 토글 키 'single:default'. 첫 전송이
//   saveConversation()으로 실제 id를 발급(conversation.ts:116-117)하면 Composer가
//   conversationId를 구독(Composer.tsx:138)해 키가 'single:default' → '<id>'로 flip한다.
//   offKeys엔 'single:default'만 남아 후속 턴부터 토글이 ON으로 오복원된다(첫 턴 자체는 OFF로
//   정상 전송). 수정 = null→id 전이 시 OFF 상태를 새 키로 마이그레이션 + 'single:default' 정리.
//   여기선 store에 conversationId를 세팅해 그 null→id 전이를 최소 재현(코디네이터 지시 —
//   실제 전송 플로우의 발급 전이를 대체). 마이그레이션은 conversationId 변화에 반응해야 함.
// ─────────────────────────────────────────────────────────────────────────────────
describe('lr4-p06-DE: 신규 대화 conversationId 발급(null→id) 마이그레이션', () => {
  async function renderConversation(): Promise<RenderResult> {
    const { Conversation } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/Conversation'
    )
    let r!: RenderResult
    await act(async () => {
      r = render(<Conversation />)
      await new Promise((res) => setTimeout(res, 20))
    })
    return r
  }

  it('D: conversationId=null에서 OFF → id 발급(null→id 전이) 후에도 토글 OFF 유지', async () => {
    const useAppStore = await store()
    // 신규 미저장 대화 = conversationId null → 토글 키 'single:default'.
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: null,
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConversation()

    // 기본 ON → 사용자가 끈다(키 = 'single:default').
    const t0 = ultraToggles(container)[0]
    expect(t0.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(t0) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')

    // 첫 전송으로 실제 id 발급 → conversationId null→id 전이(Composer 키 flip).
    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-issued-id' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })

    // 핵심 단언: 발급 후에도 OFF 유지.
    //   현재 구현(마이그레이션 부재)은 새 키 'conv-issued-id'가 offKeys에 없어 ON 오복원 → RED.
    const tAfter = ultraToggles(container)[0]
    expect(tAfter).toBeTruthy()
    expect(badgeOf(tAfter)).toBe('OFF')
    expect(tAfter.classList.contains('orch-on')).toBe(false)
  })

  it('E: id 발급 후 다음 새 대화(null 복귀)는 기본 ON — OFF 상속 금지(single:default 정리)', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: null,
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConversation()

    // 새 대화 OFF(키 'single:default') → id 발급 전이.
    await act(async () => { fireEvent.click(ultraToggles(container)[0]) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')
    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-migrated-id' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })

    // 또 다른 새 대화 시작 = conversationId 다시 null → 키 'single:default' 재사용.
    //   마이그레이션이 발급 시 'single:default'를 정리했다면 이 새 대화는 기본 ON이어야 한다.
    //   현재 구현은 'single:default'가 offKeys에 잔존 → OFF 상속 → RED.
    await act(async () => {
      useAppStore.setState({ conversationId: null } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })

    const tNew = ultraToggles(container)[0]
    expect(tNew).toBeTruthy()
    expect(badgeOf(tNew)).toBe('ON')
    expect(tNew.classList.contains('orch-on')).toBe(true)
  })
})

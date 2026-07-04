// @vitest-environment jsdom
/**
 * multi-ultracode.test.tsx — 멀티패널 UltraCode 토글 TDD 테스트.
 *
 * 검증 범위:
 *   (A) 각 패널에 .orch-toggle 버튼이 렌더된다
 *   (B) 초기 상태: OFF (.orch-on 없음), aria-pressed="false"
 *   (C) 클릭 → ON (.orch-on), aria-pressed="true"
 *   (D) 다시 클릭 → OFF (.orch-on 없음), aria-pressed="false"
 *   (E) ON 상태로 전송 시 session.send가 { orchestration: true } 포함 호출됨
 *   (F) OFF 상태로 전송 시 session.send가 orchestration 미포함(또는 false) 호출됨
 *   (G) .orch-badge 텍스트 렌더: OFF="OFF", ON="ON"
 *   (H) 토글 aria-label="UltraCode 모드 토글" + pick-lbl "UltraCode"
 *   (I) 비영속: orchestration 상태가 buildPersistState에 포함되지 않음
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { __resetPanelSessionManagerForTests } from '../../../02.Source/renderer/src/store/panelSession'

// ── window.api 모킹 ─────────────────────────────────────────────────────────
const mockApi = {
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
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  // FB2 ④(panelSession.ts ADD_USER_MESSAGE 낙관적 isRunning) 이후 필요 — beforeEach의
  // __resetPanelSessionManagerForTests() 참조 주석과 동일 사유.
  agentInterrupt: vi.fn().mockResolvedValue({}),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  // RMW1-P04/P05: 저장은 multiCmdUpsert(명령 1발) 경유 — 통짜 SAVE(P05 제거)는 더 이상
  // 존재하지 않는다. 응답 state는 main 병합 후 권위 상태(mirrorFromState가 소비) — 빈
  // 세션 목록으로 고정해도 무방(이 파일은 병합 규칙이 아니라 payload 형태만 검증).
  multiCmdUpsert: vi.fn().mockResolvedValue({ ok: true, state: { version: 2, activeSessionId: '', sessions: [] } }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.multiSessionLoad.mockResolvedValue({ state: null })
  mockApi.multiCmdUpsert.mockResolvedValue({ ok: true, state: { version: 2, activeSessionId: '', sessions: [] } })
  mockApi.agentRun.mockResolvedValue({ runId: 'run-1' })
  mockApi.onAgentEvent.mockReturnValue(() => {})
  // usePanelSlot 앱수명 매니저 격리 — 이 파일의 여러 it()가 같은 (activeMultiSessionId,slot)
  // 키를 공유하지 않도록 매 테스트 시작 전 리셋(bf3-p06/bf3-p07/fb2-p08 test 파일과 동일 관례).
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
})

// ── 헬퍼: MultiWorkspace 렌더 ─────────────────────────────────────────────

async function renderMultiWorkspace() {
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  // multiSessionLoad async 완료 대기
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return container
}

// ── A: 각 패널에 .orch-toggle 버튼이 렌더된다 ────────────────────────────
describe('multi-ultracode-A: .orch-toggle 렌더', () => {
  it('기본 count=4 → 패널 4개 각각에 .orch-toggle이 있다', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(4)
    panels.forEach((panel) => {
      expect(panel.querySelector('.orch-toggle')).toBeTruthy()
    })
  })

  it('.orch-toggle은 .ma-p-pickers 행 안에 위치한다', async () => {
    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)')!
    const pickers = panel.querySelector('.ma-p-pickers')!
    expect(pickers.querySelector('.orch-toggle')).toBeTruthy()
  })
})

// ── B: 초기 상태 ON (UC1-P07, ADR-032 개정 v2 — 권한 진실원 단일화 + 기본 ON) ──
describe('multi-ultracode-B: 초기 ON 상태(UC1-P07)', () => {
  it('초기 UltraCode 토글은 .orch-on 클래스를 가진다(기본 ON)', async () => {
    // Phase 5b: REPL 토글도 .orch-toggle을 공유하므로 UltraCode 버튼만 확인.
    const container = await renderMultiWorkspace()
    const ultracodeToggles = Array.from(container.querySelectorAll('.orch-toggle')).filter(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    )
    expect(ultracodeToggles.length).toBeGreaterThan(0)
    ultracodeToggles.forEach((toggle) => {
      expect(toggle.classList.contains('orch-on')).toBe(true)
    })
  })

  it('초기 UltraCode aria-pressed="true"', async () => {
    // UltraCode 버튼 특정 (REPL 버튼과 구분)
    const container = await renderMultiWorkspace()
    const toggle = Array.from(container.querySelectorAll('.orch-toggle')).find(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    ) as HTMLButtonElement
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('초기 UltraCode .orch-badge 텍스트는 "ON"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = Array.from(container.querySelectorAll('.orch-toggle')).find(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    )
    const badge = toggle?.querySelector('.orch-badge')
    expect(badge?.textContent?.trim()).toBe('ON')
  })
})

// ── C: 클릭 → OFF(기본 ON이므로 클릭 1회 = OFF, UC1-P07 플로우 반전) ───────
describe('multi-ultracode-C: 클릭 → OFF', () => {
  it('클릭 후 .orch-on 클래스가 제거된다', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true) // 기본 ON
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)
  })

  it('클릭 후 aria-pressed="false"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('클릭 후 .orch-badge 텍스트는 "OFF"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    const badge = toggle.querySelector('.orch-badge')
    expect(badge?.textContent?.trim()).toBe('OFF')
  })
})

// ── D: 재클릭 → ON 복귀 ──────────────────────────────────────────────────
describe('multi-ultracode-D: 재클릭 → ON 복귀', () => {
  it('OFF 후 재클릭 → .orch-on 복귀', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(true)
  })
})

// ── E: ON(기본) → 전송 시 orchestration: true 포함 ───────────────────────
describe('multi-ultracode-E: 기본 ON + 전송 → session.send orchestration: true', () => {
  it('패널1의 토글 ON(기본, 클릭 없이) 상태로 전송 → agentRun 호출 args에 orchestration: true', async () => {
    // workspaceRoot를 비-null로 설정해야 전송 활성
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement

    // 기본값이 이미 ON(UC1-P07, ADR-032 v2) — 클릭 불필요
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)

    // textarea에 텍스트 입력 후 전송
    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'test task' } })
    })
    const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    // agentRun 호출 확인
    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArgs = mockApi.agentRun.mock.calls[0][0]
    expect(callArgs.orchestration).toBe(true)

    // 정리
    useAppStore.setState({ workspaceRoot: null })
  })
})

// ── F: 명시적 OFF → 전송 시 orchestration 미포함 ─────────────────────────
describe('multi-ultracode-F: 명시적 OFF + 전송 → orchestration 미포함', () => {
  it('토글을 클릭해 OFF로 내린 뒤 전송 → agentRun args에 orchestration 없거나 false', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement

    // 기본값은 ON(UC1-P07) — OFF를 검증하려면 명시적으로 꺼야 한다.
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)

    // textarea + 전송
    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'test task' } })
    })
    const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArgs = mockApi.agentRun.mock.calls[0][0]
    // orchestration은 없거나 falsy
    expect(callArgs.orchestration === undefined || callArgs.orchestration === false).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })

  it('토글 OFF + 본문에 "ultracode" 언급 → orchestration 미포함(키워드 비승격, UC1-P07)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) }) // 명시적 OFF
    expect(toggle.classList.contains('orch-on')).toBe(false)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'please ultracode this task' } })
    })
    const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArgs = mockApi.agentRun.mock.calls[0][0]
    expect(callArgs.orchestration === undefined || callArgs.orchestration === false).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })
})

// ── G: .orch-badge 텍스트 렌더 ───────────────────────────────────────────
describe('multi-ultracode-G: .orch-badge 텍스트', () => {
  it('.pick-lbl "UltraCode" 텍스트가 .orch-toggle 안에 있다', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle')!
    const lbl = toggle.querySelector('.pick-lbl')
    expect(lbl?.textContent?.trim()).toBe('UltraCode')
  })
})

// ── H: aria 속성 ─────────────────────────────────────────────────────────
describe('multi-ultracode-H: 접근성 속성', () => {
  it('aria-label="UltraCode 모드 토글"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.getAttribute('aria-label')).toBe('UltraCode 모드 토글')
  })
})

// ── I: 비영속 — orchestration이 buildPersistState에 포함되지 않음 ────────
describe('multi-ultracode-I: 비영속', () => {
  it('multiCmdUpsert 호출 시 orchestration 필드가 payload에 없다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    // RMW1-P04 이후 저장 effect는 activeMultiSessionId가 비어있으면 no-op(유령 세션
    // 방지 가드) — 디바운스가 실제로 발화하도록 활성 세션 id를 세팅해야 검증이 유효하다.
    useAppStore.setState({ workspaceRoot: '/test/workspace', activeMultiSessionId: 'sess-ultra-persist' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement

    // 상태 변화(기본 ON → OFF, UC1-P07) — 단, orchestration은 PanelView 로컬 useState
    // (비영속 설계 그 자체)라 useMultiPersist의 buildActiveSession 의존성 배열
    // (panelMetas/pickers/session.state 등)에 아예 없다 — 토글 단독으로는 저장 effect가
    // 재실행되지 않는다(비영속의 구현 방식). 검증이 vacuous pass가 되지 않도록, 실제로
    // 저장이 발화하는 상태 변화(메시지 전송으로 패널 thread가 바뀜 → s0.state 변경 →
    // buildActiveSession 재계산)를 함께 일으킨다.
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { fireEvent.change(ta, { target: { value: 'persist probe' } }) })
    const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    // 디바운스 500ms 대기
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })

    // multiCmdUpsert가 호출됐어야 한다(vacuous pass 방지 — 메시지 전송으로 실제 저장 발화 보장).
    expect(mockApi.multiCmdUpsert).toHaveBeenCalled()
    // multiCmdUpsert(session)은 세션 스냅샷을 곧바로 인자로 받는다(.sessions[] 봉투 아님 —
    // preload가 { session }으로 감싸 IPC에 보내지만 window.api 레벨 mock 인자는 session 자체).
    const payload = mockApi.multiCmdUpsert.mock.calls[mockApi.multiCmdUpsert.mock.calls.length - 1][0]
    // panels 배열의 각 항목에 orchestration 필드 없음
    payload.panels?.forEach((p: Record<string, unknown>) => {
      expect('orchestration' in p).toBe(false)
    })

    useAppStore.setState({ workspaceRoot: null, activeMultiSessionId: '' })
  })
})

// ── J: 패널 독립성 — 패널1 토글 변경이 패널2에 영향 없음 ──────────────────
describe('multi-ultracode-J: 패널 독립 상태', () => {
  it('패널1 토글 클릭(OFF) → 패널2 토글은 기본 ON 유지(UC1-P07, 상태 격리)', async () => {
    const container = await renderMultiWorkspace()
    const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
    expect(panels.length).toBeGreaterThanOrEqual(2)

    const toggle1 = panels[0].querySelector('.orch-toggle') as HTMLButtonElement
    const toggle2 = panels[1].querySelector('.orch-toggle') as HTMLButtonElement
    // 기본값은 둘 다 ON
    expect(toggle1.classList.contains('orch-on')).toBe(true)
    expect(toggle2.classList.contains('orch-on')).toBe(true)

    await act(async () => { fireEvent.click(toggle1) })

    expect(toggle1.classList.contains('orch-on')).toBe(false)
    expect(toggle2.classList.contains('orch-on')).toBe(true)
  })
})

// ── K: 지속 토글(UC1-P04, one-shot 폐기) — 기본 ON + 전송 → 전송 후에도 ON 유지 ──
describe('multi-ultracode-K: 지속 토글(전송 후에도 ON 유지)', () => {
  it('패널 토글 기본 ON(클릭 없이) + 전송 → 전송 후에도 .orch-on 유지(one-shot 폐기, ADR-032)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement

    // UC1-P07: 기본값이 이미 ON — 클릭 불필요
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { fireEvent.change(ta, { target: { value: 'persistent toggle task' } }) })
    const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    // 전송 payload엔 orchestration:true가 들어갔어야 하고(테스트 E), 지속 토글이므로 전송 후에도 ON 유지
    expect(mockApi.agentRun).toHaveBeenCalled()
    expect(mockApi.agentRun.mock.calls[0][0].orchestration).toBe(true)
    expect(toggle.classList.contains('orch-on')).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })
})

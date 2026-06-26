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
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiSessionSave: vi.fn().mockResolvedValue({ ok: true }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.multiSessionLoad.mockResolvedValue({ state: null })
  mockApi.multiSessionSave.mockResolvedValue({ ok: true })
  mockApi.agentRun.mockResolvedValue({ runId: 'run-1' })
  mockApi.onAgentEvent.mockReturnValue(() => {})
})

afterEach(() => {
  cleanup()
})

// ── 헬퍼: MultiWorkspace 렌더 ─────────────────────────────────────────────

async function renderMultiWorkspace() {
  const { MultiWorkspace } = await import('../../src/renderer/src/components/00_shell/MultiWorkspace')
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

// ── B: 초기 상태 OFF ────────────────────────────────────────────────────
describe('multi-ultracode-B: 초기 OFF 상태', () => {
  it('초기 UltraCode 토글은 .orch-on 클래스가 없다', async () => {
    // Phase 5b: REPL 토글도 .orch-toggle을 공유하므로 UltraCode 버튼만 확인.
    // REPL은 기본 ON이므로 전체 .orch-toggle 순회 단정은 부정확 → UltraCode만 대상.
    const container = await renderMultiWorkspace()
    const ultracodeToggles = Array.from(container.querySelectorAll('.orch-toggle')).filter(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    )
    expect(ultracodeToggles.length).toBeGreaterThan(0)
    ultracodeToggles.forEach((toggle) => {
      expect(toggle.classList.contains('orch-on')).toBe(false)
    })
  })

  it('초기 UltraCode aria-pressed="false"', async () => {
    // UltraCode 버튼 특정 (REPL 버튼과 구분)
    const container = await renderMultiWorkspace()
    const toggle = Array.from(container.querySelectorAll('.orch-toggle')).find(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    ) as HTMLButtonElement
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('초기 UltraCode .orch-badge 텍스트는 "OFF"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = Array.from(container.querySelectorAll('.orch-toggle')).find(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    )
    const badge = toggle?.querySelector('.orch-badge')
    expect(badge?.textContent?.trim()).toBe('OFF')
  })
})

// ── C: 클릭 → ON ─────────────────────────────────────────────────────────
describe('multi-ultracode-C: 클릭 → ON', () => {
  it('클릭 후 .orch-on 클래스가 붙는다', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(true)
  })

  it('클릭 후 aria-pressed="true"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('클릭 후 .orch-badge 텍스트는 "ON"', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    const badge = toggle.querySelector('.orch-badge')
    expect(badge?.textContent?.trim()).toBe('ON')
  })
})

// ── D: 다시 클릭 → OFF ────────────────────────────────────────────────────
describe('multi-ultracode-D: 다시 클릭 → OFF', () => {
  it('ON 후 재클릭 → .orch-on 제거', async () => {
    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)
  })
})

// ── E: ON → 전송 시 orchestration: true 포함 ─────────────────────────────
describe('multi-ultracode-E: ON + 전송 → session.send orchestration: true', () => {
  it('패널1의 토글 ON 후 전송 → agentRun 호출 args에 orchestration: true', async () => {
    // workspaceRoot를 비-null로 설정해야 전송 활성
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement

    // 토글 ON
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
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

// ── F: OFF → 전송 시 orchestration 미포함 ────────────────────────────────
describe('multi-ultracode-F: OFF + 전송 → orchestration 미포함', () => {
  it('토글 OFF 상태 전송 → agentRun args에 orchestration 없거나 false', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement

    // 토글 OFF(초기값)
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
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
  it('multiSessionSave 호출 시 orchestration 필드가 payload에 없다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement

    // ON으로 변경 → 저장 트리거
    await act(async () => { fireEvent.click(toggle) })

    // 디바운스 500ms 대기
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })

    // multiSessionSave가 호출되었으면 payload 확인
    if (mockApi.multiSessionSave.mock.calls.length > 0) {
      const payload = mockApi.multiSessionSave.mock.calls[mockApi.multiSessionSave.mock.calls.length - 1][0]
      // panels 배열의 각 항목에 orchestration 필드 없음
      payload.sessions?.[0]?.panels?.forEach((panel: Record<string, unknown>) => {
        expect('orchestration' in panel).toBe(false)
      })
    }
    // multiSessionSave가 미호출이어도 패스(restoredRef gate)

    useAppStore.setState({ workspaceRoot: null })
  })
})

// ── J: 패널 독립성 — 패널1 ON이 패널2에 영향 없음 ────────────────────────
describe('multi-ultracode-J: 패널 독립 상태', () => {
  it('패널1 토글 ON → 패널2 토글은 OFF 유지', async () => {
    const container = await renderMultiWorkspace()
    const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
    expect(panels.length).toBeGreaterThanOrEqual(2)

    const toggle1 = panels[0].querySelector('.orch-toggle') as HTMLButtonElement
    const toggle2 = panels[1].querySelector('.orch-toggle') as HTMLButtonElement

    await act(async () => { fireEvent.click(toggle1) })

    expect(toggle1.classList.contains('orch-on')).toBe(true)
    expect(toggle2.classList.contains('orch-on')).toBe(false)
  })
})

// ── K: 단발성(one-shot) — ON + 전송 → 전송 후 자동 OFF ────────────────────
describe('multi-ultracode-K: 단발성 자동 OFF', () => {
  it('패널 토글 ON + 전송 → 전송 후 .orch-on 제거(단발성)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement

    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(true)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { fireEvent.change(ta, { target: { value: 'one-shot task' } }) })
    const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    // 전송 payload엔 orchestration:true가 들어갔어야 하고(테스트 E), 전송 후 토글은 OFF여야 함
    expect(mockApi.agentRun).toHaveBeenCalled()
    expect(mockApi.agentRun.mock.calls[0][0].orchestration).toBe(true)
    expect(toggle.classList.contains('orch-on')).toBe(false)

    useAppStore.setState({ workspaceRoot: null })
  })
})

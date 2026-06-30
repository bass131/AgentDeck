// @vitest-environment jsdom
/**
 * multi-usage-wiring.test.tsx — 멀티 헤더 usage 실배선 TDD.
 *
 * 이전: USAGE_5H=37 / USAGE_WEEKLY=12 하드코딩.
 * 이후: store.usage(getUsage IPC)에서 실 OAuth 레이트리밋 pct를 표시.
 *  - getUsage가 {fiveHour:{pct:73}, weekly:{pct:41}} 반환 → 헤더 pill이 73%/41%.
 *  - 하드코딩 37%/12%는 노출되지 않는다.
 *  - 데이터 없음(null) → '—'.
 *  - 마운트 시 getUsage IPC 호출.
 *
 * 신뢰경계: renderer는 window.api.getUsage(화이트리스트)만 호출 — fs/Node 직접 0.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api 모킹 ──────────────────────────────────────────────────────
const mockApi = {
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiSessionSave: vi.fn().mockResolvedValue({}),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  getUsage: vi.fn().mockResolvedValue({
    fiveHour: { pct: 73, resetsAt: null },
    weekly: { pct: 41, resetsAt: null },
  }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  // 싱글톤 store usage 초기화 — 테스트 간 누수 방지
  useAppStore.setState({ usage: { fiveHour: null, weekly: null } })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderMulti(): Promise<HTMLElement> {
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  const r = render(<MultiWorkspace />)
  // loadUsage 비동기 resolve 대기
  await act(async () => { await Promise.resolve() })
  return r.container
}

function pctTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ma-usage-pct')).map((e) => e.textContent ?? '')
}

// ══════════════════════════════════════════════════════════════════════════
describe('멀티 헤더 usage 실배선', () => {
  it('getUsage 실데이터(73%/41%)를 헤더 pill에 표시한다', async () => {
    const container = await renderMulti()
    await waitFor(() => {
      const pcts = pctTexts(container)
      expect(pcts).toContain('73%')
      expect(pcts).toContain('41%')
    })
  })

  it('하드코딩 37%/12%를 더 이상 노출하지 않는다', async () => {
    const container = await renderMulti()
    await waitFor(() => {
      const pcts = pctTexts(container)
      expect(pcts).not.toContain('37%')
      expect(pcts).not.toContain('12%')
    })
  })

  it('usage 데이터 없으면(null) "—"를 표시한다', async () => {
    mockApi.getUsage.mockResolvedValueOnce({ fiveHour: null, weekly: null })
    const container = await renderMulti()
    await waitFor(() => {
      const pcts = pctTexts(container)
      expect(pcts.filter((p) => p === '—').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('마운트 시 getUsage IPC를 호출한다', async () => {
    await renderMulti()
    await waitFor(() => {
      expect(mockApi.getUsage).toHaveBeenCalled()
    })
  })
})

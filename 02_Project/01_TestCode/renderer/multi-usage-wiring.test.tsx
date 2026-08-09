// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'

const mockApi = {
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  getUsage: vi.fn().mockResolvedValue({
    fiveHour: { pct: 73, resetsAt: null },
    weekly: { pct: 41, resetsAt: null },
  }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  useAppStore.setState({ usage: { fiveHour: null, weekly: null } })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function renderMulti(): Promise<HTMLElement> {
  const { MultiWorkspace } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
  const r = render(<MultiWorkspace />)
  await act(async () => { await Promise.resolve() })
  return r.container
}

function pctTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.ma-usage-pct')).map((e) => e.textContent ?? '')
}

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

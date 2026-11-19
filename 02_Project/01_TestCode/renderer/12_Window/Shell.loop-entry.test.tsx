// @vitest-environment jsdom
// M09 G4 루프 화면의 최소 진입점 — 사이드바의 「마일스톤 루프」가 루프 화면을 열고, 화면을 닫으면 사라진다.
// 고른 저장소는 앱 껍데기(Shell)가 기억해 다시 연 화면이 같은 저장소의 상태를 읽는다. 화면을 열기 전에는 loop IPC를 부르지 않는다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { LoopStatus } from '../../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const closed: LoopStatus = {
  cwd: CWD, root: null, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
}

afterEach(() => cleanup())

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

// 사이드바·껍데기가 마운트 때 부르는 길의 응답 — 기본 stub(undefined)이면 뒤에서 처리되지 않은 거부가 난다
const shellBase = () => ({
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  multiCmdCreate: vi.fn().mockResolvedValue({ state: { sessions: [], activeSessionId: '' } }),
})

describe('루프 화면 진입점 (M09 G4)', () => {
  it('사이드바는 onOpenLoop를 받을 때만 「마일스톤 루프」 버튼을 보이고, 누르면 그 콜백을 부른다', async () => {
    const installed = installWindowApi(shellBase())
    try {
      const { Sidebar } = await import('@renderer/12_Window/Sidebar')
      const r = render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
      await flush()
      expect(screen.queryByRole('button', { name: '마일스톤 루프' })).toBeNull()
      const onOpenLoop = vi.fn()
      r.rerender(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} onOpenLoop={onOpenLoop} />)
      fireEvent.click(screen.getByRole('button', { name: '마일스톤 루프' }))
      expect(onOpenLoop).toHaveBeenCalledTimes(1)
    } finally {
      installed.uninstall()
    }
  })

  it('사이드바의 「마일스톤 루프」가 화면을 열고, 닫았다 다시 열면 고른 저장소를 기억한다', async () => {
    const loopStatus = vi.fn().mockResolvedValue(closed)
    const onLoopState = vi.fn(() => () => {})
    const installed = installWindowApi({
      ...shellBase(),
      loopStatus, onLoopState,
      pickFolder: vi.fn().mockResolvedValue({ path: CWD }),
      getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test' }),
      checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
    })
    // 확대 배율 감시(useGlobalZoom)가 matchMedia를 부른다 — jsdom에는 없다(ZoomControl 시험과 같은 받침)
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn(
      (query: string) => ({ media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
    )
    try {
      const { loadPrefs } = await import('@renderer/11_Settings/prefs')
      await loadPrefs()
      const { Shell } = await import('@renderer/12_Window/Shell')
      const { container } = render(<Shell />)
      await flush()
      expect(onLoopState).not.toHaveBeenCalled()
      expect(loopStatus).not.toHaveBeenCalled()
      expect(container.ownerDocument.querySelector('.loop-overlay')).toBeNull()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '마일스톤 루프' })) })
      await flush()
      expect(document.querySelector('.loop-overlay')).not.toBeNull()
      expect(onLoopState).toHaveBeenCalledTimes(1)

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '폴더 고르기' })) })
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })

      fireEvent.click(screen.getByRole('button', { name: '화면 닫기' }))
      await flush()
      expect(document.querySelector('.loop-overlay')).toBeNull()

      loopStatus.mockClear()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '마일스톤 루프' })) })
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })

      // Esc도 화면만 닫는다
      await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
      expect(document.querySelector('.loop-overlay')).toBeNull()
    } finally {
      installed.uninstall()
    }
  })
})

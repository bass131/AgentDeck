// @vitest-environment jsdom
// 루프 화면의 진입점 — M09 G4의 사이드바 버튼·모달은 M10 G1에서 「작업」 모드의 몸체로 바뀌었다.
// 사이드바 모드 전환에는 「채팅」과 「작업」 둘만 있고, 「작업」을 고르면 루프 화면이 가운데(대화 자리)에 모달 없이 그려진다.
// 고른 저장소는 앱 껍데기(Shell)가 기억해 모드를 오가도 같은 저장소의 상태를 읽는다. 작업 모드에 들기 전에는 loop IPC를 부르지 않는다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { LoopStatus } from '../../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const closed: LoopStatus = {
  cwd: CWD, root: null, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
}

afterEach(async () => {
  cleanup()
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.getState().setWorkspaceMode('single')
})

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

// 껍데기가 마운트 때 부르는 길의 응답 — 기본 stub(undefined)이면 뒤에서 처리되지 않은 거부가 난다
const shellBase = () => ({
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
})

function installMatchMedia(): void {
  // 확대 배율 감시(useGlobalZoom)가 matchMedia를 부른다 — jsdom에는 없다(ZoomControl 시험과 같은 받침)
  const w = window as unknown as { matchMedia: typeof window.matchMedia }
  w.matchMedia = vi.fn(
    (query: string) => ({ media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  )
}

describe('루프 화면 진입점 — 작업 모드 (M10 G1)', () => {
  it('사이드바 모드 전환에는 「채팅」과 「작업」 둘만 있고 「마일스톤 루프」 버튼은 없다', async () => {
    const installed = installWindowApi(shellBase())
    try {
      const { Sidebar } = await import('@renderer/12_Window/Sidebar')
      const { container } = render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
      await flush()
      const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
      expect(tabs).toEqual(['채팅', '작업'])
      expect(screen.queryByRole('button', { name: '마일스톤 루프' })).toBeNull()
      expect(container.querySelector('.sb-loop')).toBeNull()

      const { useAppStore } = await import('@renderer/00_App/appStore')
      fireEvent.click(screen.getByRole('tab', { name: '작업' }))
      expect(useAppStore.getState().workspaceMode).toBe('work')
      expect(screen.getByRole('tab', { name: '작업' }).getAttribute('aria-selected')).toBe('true')
      fireEvent.click(screen.getByRole('tab', { name: '채팅' }))
      expect(useAppStore.getState().workspaceMode).toBe('single')
    } finally {
      installed.uninstall()
    }
  })

  it('「작업」을 고르면 루프 화면이 가운데에 모달 없이 열리고, 모드를 오가도 고른 저장소를 기억한다', async () => {
    const loopStatus = vi.fn().mockResolvedValue(closed)
    const onLoopState = vi.fn(() => () => {})
    const installed = installWindowApi({
      ...shellBase(),
      loopStatus, onLoopState,
      pickFolder: vi.fn().mockResolvedValue({ path: CWD }),
      getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test' }),
      checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
    })
    installMatchMedia()
    try {
      const { loadPrefs } = await import('@renderer/11_Settings/prefs')
      await loadPrefs()
      const { Shell } = await import('@renderer/12_Window/Shell')
      const { container } = render(<Shell />)
      await flush()
      expect(onLoopState).not.toHaveBeenCalled()
      expect(loopStatus).not.toHaveBeenCalled()
      expect(container.querySelector('.loop-screen')).toBeNull()
      expect(container.querySelector('.pane.chat')).not.toBeNull()

      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '작업' })) })
      await flush()
      const loop = container.querySelector('.pane.work .loop-screen')
      expect(loop).not.toBeNull()
      // 모달이 아니다 — 겹침 창·닫기 버튼·전역 모달 감지 클래스가 없다
      expect(document.querySelector('.loop-overlay')).toBeNull()
      expect(document.querySelector('.modal-overlay')).toBeNull()
      expect(screen.queryByRole('dialog', { name: '마일스톤 루프' })).toBeNull()
      expect(screen.queryByRole('button', { name: '화면 닫기' })).toBeNull()
      // 대화 자리를 루프 화면이 차지한다 — 대화·탐색기는 작업 모드에서 그리지 않는다
      expect(container.querySelector('.pane.chat')).toBeNull()
      expect(container.querySelector('.pane.explorer')).toBeNull()
      expect(onLoopState).toHaveBeenCalledTimes(1)

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '폴더 고르기' })) })
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })

      // Esc는 작업 화면을 닫지 않는다
      await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
      expect(container.querySelector('.loop-screen')).not.toBeNull()

      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '채팅' })) })
      await flush()
      expect(container.querySelector('.loop-screen')).toBeNull()
      expect(container.querySelector('.pane.chat')).not.toBeNull()

      loopStatus.mockClear()
      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '작업' })) })
      await flush()
      expect(loopStatus).toHaveBeenCalledWith({ cwd: CWD })
    } finally {
      installed.uninstall()
    }
  })
})

describe('작업 모드 배치 CSS', () => {
  const css = (rel: string): string =>
    readFileSync(resolve(__dirname, '../../../00_Source/renderer/src', rel), 'utf8')

  it('작업 칸(.pane.work)은 대화 칸처럼 남은 너비를 채우고, 사이드바의 옛 루프 버튼 스타일은 없다', () => {
    const shell = css('12_Window/shell.css')
    const rule = shell.match(/\.pane\.work\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/flex:\s*1\s*;/)
    expect(rule![1]).toMatch(/min-width:\s*0\s*;/)
    expect(css('12_Window/Sidebar.css')).not.toMatch(/\.sb-loop\b/)
  })
})

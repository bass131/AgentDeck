// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

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
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SAMPLE_TITLES = [
  '프론트엔드 리팩토링',
  '백엔드 API 구현',
  '테스트 작성',
  '문서화',
  '성능 최적화',
]

const SAMPLE_CWD_FRAGMENTS = [
  'C:/Dev/AgentDeck/src/renderer',
  'C:/Dev/AgentDeck/src/main',
  'C:/Dev/AgentDeck/tests',
  'C:/Dev/AgentDeck/docs',
]

async function renderMultiWorkspace() {
  const { MultiWorkspace } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

describe('SAMPLE 누수 방지: .ma-p-title DOM 단언', () => {
  it('빈 first-run 상태에서 .ma-p-title에 SAMPLE 제목이 없다', async () => {
    const container = await renderMultiWorkspace()

    const titleEls = Array.from(container.querySelectorAll('.ma-p-title'))
    const renderedTitles = titleEls.map((el) => el.textContent ?? '')

    for (const sampleTitle of SAMPLE_TITLES) {
      const found = renderedTitles.some((t) => t.includes(sampleTitle))
      expect(found, `SAMPLE 제목 "${sampleTitle}"이 DOM에 노출됨`).toBe(false)
    }
  })

  it('빈 패널 제목은 "새 작업"으로 폴백 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    const titleEls = Array.from(container.querySelectorAll('.ma-p-title'))
    expect(titleEls.length).toBe(4)
    titleEls.forEach((el) => {
      expect(el.textContent?.trim()).toBe('새 작업')
    })
  })
})

describe('SAMPLE 누수 방지: 일괄 폴더 FolderSwitchDialog from 값', () => {
  it('일괄 폴더 다이얼로그에 SAMPLE cwd 경로가 "현재 폴더" 텍스트로 노출되지 않는다', async () => {
    const container = await renderMultiWorkspace()

    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })

    const dialogEl = container.querySelector('.set-dialog-overlay')
    expect(dialogEl).toBeTruthy()

    const dialogText = dialogEl?.textContent ?? ''
    for (const cwdFrag of SAMPLE_CWD_FRAGMENTS) {
      expect(
        dialogText.includes(cwdFrag),
        `SAMPLE cwd "${cwdFrag}"이 FolderSwitchDialog에 노출됨`
      ).toBe(false)
    }
  })
})

describe('SAMPLE 누수 방지: 프롬프트 버튼 상태', () => {
  it('빈 상태에서 .ma-p-prompt는 .on 클래스가 없다(sysPrompt 미노출)', async () => {
    const container = await renderMultiWorkspace()
    const promptOn = container.querySelectorAll('.ma-p-prompt.on')
    expect(
      promptOn.length,
      'SAMPLE sysPrompt가 .ma-p-prompt.on으로 누출됨'
    ).toBe(0)
  })
})

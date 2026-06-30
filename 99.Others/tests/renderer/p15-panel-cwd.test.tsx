// @vitest-environment jsdom
/**
 * p15-panel-cwd.test.tsx — P15 멀티 패널별 cwd 배선 TDD (jsdom).
 *
 * 검증 범위:
 *   (1) 패널 폴더 버튼 클릭 → pickFolder IPC 호출.
 *   (2) pickFolder 반환 path → 해당 패널 cwdLabel에 반영.
 *   (3) 취소(path=null) → 해당 패널 cwd 변경 없음.
 *   (4) 패널별 독립: 패널0에 A 설정 후 패널1은 전역/기본 유지.
 *   (5) 패널 유효 cwd가 session.send workspaceRoot로 전달됨 (agentRun 인자 확인).
 *   (6) 전역 workspaceRoot=null이고 패널 cwd도 없으면 send 비활성(agentRun 미호출).
 *   (7) 일괄 폴더(batch): 일괄 폴더 버튼 → FolderSwitchDialog → 변경 클릭 → pickFolder 호출 → 모든 패널 cwd 동일 설정.
 *   (8) 기존 회귀 없음 — MultiWorkspace 기본 구조 유지.
 *
 * TDD 원칙: 먼저 실패(RED) → 구현 후 통과(GREEN).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api 모킹 ─────────────────────────────────────────────────────────

let runIdCounter = 0

const mockPickFolder = vi.fn()
const mockAgentRun = vi.fn()

const mockApi = {
  // 패널 폴더 선택 — P15 핵심
  pickFolder: mockPickFolder,
  // 에이전트 실행
  agentRun: mockAgentRun,
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  // Sidebar 등 기타
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ ok: true }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
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
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function renderMultiWorkspace(workspaceRoot: string | null = null) {
  useAppStore.setState({ workspaceRoot, workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

/** 패널 n번(0-indexed)의 폴더 버튼을 반환. count=4 기본, slot 순서대로 렌더. */
function getPanelFolderBtn(container: Element, panelIndex: number): HTMLButtonElement | null {
  const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
  if (panelIndex >= panels.length) return null
  return panels[panelIndex].querySelector('.ma-p-folder') as HTMLButtonElement | null
}

/** 패널 n번의 폴더명 레이블 텍스트 */
function getPanelFolderLabel(container: Element, panelIndex: number): string {
  const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
  if (panelIndex >= panels.length) return ''
  const labelEl = panels[panelIndex].querySelector('.ma-p-folder-name')
  return labelEl?.textContent?.trim() ?? ''
}

// ── beforeEach / afterEach ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  mockAgentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockPickFolder.mockResolvedValue({ path: null }) // 기본: 취소
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-01: 패널 폴더 버튼 → pickFolder IPC 호출', () => {
  it('패널0 폴더 버튼 클릭 → window.api.pickFolder가 1회 호출된다', async () => {
    mockPickFolder.mockResolvedValue({ path: '/some/path' })
    const container = await renderMultiWorkspace()

    const btn = getPanelFolderBtn(container, 0)
    expect(btn).toBeTruthy()

    await act(async () => {
      fireEvent.click(btn!)
    })

    expect(mockPickFolder).toHaveBeenCalledTimes(1)
  })

  it('패널1 폴더 버튼 클릭 → window.api.pickFolder가 1회 호출된다', async () => {
    mockPickFolder.mockResolvedValue({ path: '/another/path' })
    const container = await renderMultiWorkspace()

    const btn = getPanelFolderBtn(container, 1)
    expect(btn).toBeTruthy()

    await act(async () => {
      fireEvent.click(btn!)
    })

    expect(mockPickFolder).toHaveBeenCalledTimes(1)
  })

  it('패널 폴더 버튼 클릭 시 인자를 전달하지 않는다 (신뢰경계 — renderer 경로 주입 불가)', async () => {
    mockPickFolder.mockResolvedValue({ path: '/a' })
    const container = await renderMultiWorkspace()
    const btn = getPanelFolderBtn(container, 0)

    await act(async () => {
      fireEvent.click(btn!)
    })

    // pickFolder는 인자 없이 호출됨
    expect(mockPickFolder).toHaveBeenCalledWith()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-02: pickFolder 반환 path → 패널 cwdLabel 반영', () => {
  it('패널0 폴더 선택 → cwdLabel이 선택 폴더 basename으로 표시된다', async () => {
    mockPickFolder.mockResolvedValue({ path: '/projects/my-app' })
    const container = await renderMultiWorkspace()

    const btn = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(btn!)
    })

    const label = getPanelFolderLabel(container, 0)
    expect(label).toBe('my-app')
  })

  it('패널1 폴더 선택 → 패널1 cwdLabel이 선택 폴더 basename으로 표시된다', async () => {
    mockPickFolder.mockResolvedValue({ path: '/home/user/workspace' })
    const container = await renderMultiWorkspace()

    const btn = getPanelFolderBtn(container, 1)
    await act(async () => {
      fireEvent.click(btn!)
    })

    const label = getPanelFolderLabel(container, 1)
    expect(label).toBe('workspace')
  })

  it('윈도우 경로(백슬래시)도 basename 정상 추출', async () => {
    mockPickFolder.mockResolvedValue({ path: 'C:\\Dev\\my-project' })
    const container = await renderMultiWorkspace()

    const btn = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(btn!)
    })

    const label = getPanelFolderLabel(container, 0)
    expect(label).toBe('my-project')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-03: 취소(path=null) → 패널 cwd 변경 없음', () => {
  it('pickFolder가 null 반환 시 패널 cwdLabel이 "폴더 선택"(기본값) 유지', async () => {
    mockPickFolder.mockResolvedValue({ path: null })
    const container = await renderMultiWorkspace(null)

    const labelBefore = getPanelFolderLabel(container, 0)

    const btn = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(btn!)
    })

    const labelAfter = getPanelFolderLabel(container, 0)
    // 전역 workspaceRoot=null이고 패널 cwd도 없으므로 "폴더 선택" 유지
    expect(labelAfter).toBe(labelBefore)
    expect(mockPickFolder).toHaveBeenCalledTimes(1)
  })

  it('이미 설정된 패널 cwd가 있을 때 취소하면 기존 cwd 유지', async () => {
    // 1차: 폴더 설정
    mockPickFolder.mockResolvedValueOnce({ path: '/projects/first' })
    const container = await renderMultiWorkspace(null)
    const btn = getPanelFolderBtn(container, 0)

    await act(async () => {
      fireEvent.click(btn!)
    })
    expect(getPanelFolderLabel(container, 0)).toBe('first')

    // 2차: 취소
    mockPickFolder.mockResolvedValueOnce({ path: null })
    await act(async () => {
      fireEvent.click(btn!)
    })

    // 기존 'first' 유지
    expect(getPanelFolderLabel(container, 0)).toBe('first')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-04: 패널별 독립 — 패널0 설정이 패널1에 영향 없음', () => {
  it('패널0에 폴더A 설정 후 패널1 레이블은 변경되지 않는다', async () => {
    mockPickFolder.mockResolvedValue({ path: '/team/project-a' })
    const container = await renderMultiWorkspace(null)

    // 패널1 초기 레이블 기록 (샘플 데이터 cwd 또는 "폴더 선택")
    const labelBefore1 = getPanelFolderLabel(container, 1)

    // 패널0 폴더 선택
    const btn0 = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(btn0!)
    })

    expect(getPanelFolderLabel(container, 0)).toBe('project-a')
    // 패널1은 변경 없이 초기값 유지
    expect(getPanelFolderLabel(container, 1)).toBe(labelBefore1)
  })

  it('패널0=A, 패널1=B 각각 독립 설정 가능', async () => {
    const container = await renderMultiWorkspace(null)

    mockPickFolder.mockResolvedValueOnce({ path: '/projects/folder-a' })
    const btn0 = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(btn0!)
    })

    mockPickFolder.mockResolvedValueOnce({ path: '/projects/folder-b' })
    const btn1 = getPanelFolderBtn(container, 1)
    await act(async () => {
      fireEvent.click(btn1!)
    })

    expect(getPanelFolderLabel(container, 0)).toBe('folder-a')
    expect(getPanelFolderLabel(container, 1)).toBe('folder-b')
  })

  it('전역 workspaceRoot 있고 패널 개별 cwd 없으면 전역 기본 사용', async () => {
    const container = await renderMultiWorkspace('/global/workspace')

    // 패널별 선택 없이 전역만 있는 상태 → cwdLabel = 'workspace'
    const label0 = getPanelFolderLabel(container, 0)
    const label1 = getPanelFolderLabel(container, 1)
    expect(label0).toBe('workspace')
    expect(label1).toBe('workspace')
  })

  it('패널0 개별 cwd가 전역보다 우선', async () => {
    // 전역 workspaceRoot = /global/root
    mockPickFolder.mockResolvedValue({ path: '/panel/specific' })
    const container = await renderMultiWorkspace('/global/root')

    // 패널0만 개별 선택
    const btn0 = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(btn0!)
    })

    // 패널0: 개별 cwd 우선 → 'specific'
    expect(getPanelFolderLabel(container, 0)).toBe('specific')
    // 패널1: 개별 cwd 없어 전역 사용 → 'root'
    expect(getPanelFolderLabel(container, 1)).toBe('root')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-05: 유효 cwd가 session.send workspaceRoot로 전달됨', () => {
  it('패널0에 /mydir 설정 후 send → agentRun workspaceRoot=/mydir', async () => {
    mockPickFolder.mockResolvedValue({ path: '/mydir' })
    const container = await renderMultiWorkspace(null)

    // 먼저 패널0에 폴더 설정
    const folderBtn = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(folderBtn!)
    })

    // 패널 수 2로 줄여 textarea 찾기 쉽게
    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn2 = countBtns.find((b) => b.textContent?.trim() === '2')
    if (btn2) {
      await act(async () => { fireEvent.click(btn2) })
    }

    const textarea = container.querySelector('.ma-panel:not(.ma-placeholder) textarea') as HTMLTextAreaElement | null
    if (!textarea) return // 렌더 안 된 경우 스킵

    await act(async () => {
      fireEvent.change(textarea, { target: { value: '작업 시작' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const callArgs = mockAgentRun.mock.calls[0][0]
    expect(callArgs.workspaceRoot).toBe('/mydir')
  })

  it('패널1에 /dir-b, 패널0은 전역 /global → 각 agentRun workspaceRoot 독립', async () => {
    const container = await renderMultiWorkspace('/global')

    // 패널1에만 개별 폴더 선택
    mockPickFolder.mockResolvedValue({ path: '/dir-b' })
    const btn1 = getPanelFolderBtn(container, 1)
    await act(async () => {
      fireEvent.click(btn1!)
    })

    // count=2로 줄임
    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn2 = countBtns.find((b) => b.textContent?.trim() === '2')
    if (btn2) {
      await act(async () => { fireEvent.click(btn2) })
    }

    const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
    if (panels.length < 2) return

    // 패널0 send
    const ta0 = panels[0].querySelector('textarea') as HTMLTextAreaElement | null
    if (ta0) {
      await act(async () => {
        fireEvent.change(ta0, { target: { value: 'msg0' } })
        fireEvent.keyDown(ta0, { key: 'Enter', shiftKey: false })
      })
    }

    // 패널1 send
    const ta1 = panels[1].querySelector('textarea') as HTMLTextAreaElement | null
    if (ta1) {
      await act(async () => {
        fireEvent.change(ta1, { target: { value: 'msg1' } })
        fireEvent.keyDown(ta1, { key: 'Enter', shiftKey: false })
      })
    }

    expect(mockAgentRun).toHaveBeenCalledTimes(2)
    const call0 = mockAgentRun.mock.calls[0][0]
    const call1 = mockAgentRun.mock.calls[1][0]
    expect(call0.workspaceRoot).toBe('/global') // 패널0: 전역
    expect(call1.workspaceRoot).toBe('/dir-b')  // 패널1: 개별
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-06: 전역 workspaceRoot=null + 패널 cwd 없으면 send 비활성', () => {
  it('전역 null + 패널 cwd 없으면 textarea disabled', async () => {
    const container = await renderMultiWorkspace(null)

    const textarea = container.querySelector('textarea')
    expect(textarea?.disabled).toBe(true)
  })

  it('전역 null + 패널 cwd 없으면 send 버튼 disabled', async () => {
    const container = await renderMultiWorkspace(null)

    const sendBtn = container.querySelector('.ma-send') as HTMLButtonElement | null
    expect(sendBtn?.disabled).toBe(true)
  })

  it('전역 null + 패널 cwd 없으면 Enter → agentRun 미호출', async () => {
    const container = await renderMultiWorkspace(null)

    const textarea = container.querySelector('textarea')
    if (textarea) {
      await act(async () => {
        fireEvent.change(textarea, { target: { value: '테스트' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
    }

    expect(mockAgentRun).not.toHaveBeenCalled()
  })

  it('패널 cwd 설정 후 send 활성화됨', async () => {
    mockPickFolder.mockResolvedValue({ path: '/now-active' })
    const container = await renderMultiWorkspace(null)

    // 초기: disabled
    const textarea = container.querySelector('textarea')
    expect(textarea?.disabled).toBe(true)

    // 폴더 선택
    const folderBtn = getPanelFolderBtn(container, 0)
    await act(async () => {
      fireEvent.click(folderBtn!)
    })

    // 해당 패널 textarea는 이제 활성화되어야 함
    // (첫 패널 textarea)
    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)')
    const ta = firstPanel?.querySelector('textarea') as HTMLTextAreaElement | null
    expect(ta?.disabled).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-07: 일괄 폴더(batch) → 모든 패널 cwd 동일 설정', () => {
  it('일괄 폴더 버튼 클릭 → FolderSwitchDialog 렌더', async () => {
    const container = await renderMultiWorkspace()
    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
  })

  it('FolderSwitchDialog 변경 클릭 → pickFolder 호출', async () => {
    mockPickFolder.mockResolvedValue({ path: '/batch/target' })
    const container = await renderMultiWorkspace()

    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })

    // "변경" 버튼 클릭
    const confirmBtn = container.querySelector('.sd-go') as HTMLButtonElement | null
    if (confirmBtn) {
      await act(async () => { fireEvent.click(confirmBtn) })
    }

    expect(mockPickFolder).toHaveBeenCalledTimes(1)
  })

  it('일괄 폴더 변경 → count=4 모든 패널 cwdLabel 동일', async () => {
    mockPickFolder.mockResolvedValue({ path: '/batch/all-panels' })
    const container = await renderMultiWorkspace()

    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })

    const confirmBtn = container.querySelector('.sd-go') as HTMLButtonElement | null
    if (confirmBtn) {
      await act(async () => { fireEvent.click(confirmBtn) })
    }

    // count=4 기본, 모든 패널 cwdLabel = 'all-panels'
    for (let i = 0; i < 4; i++) {
      const label = getPanelFolderLabel(container, i)
      expect(label).toBe('all-panels')
    }
  })

  it('일괄 폴더 취소 → pickFolder 미호출, 패널 cwd 변경 없음', async () => {
    const container = await renderMultiWorkspace('/global/root')

    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })

    // "취소" 클릭
    const cancelBtn = screen.getByText('취소')
    await act(async () => { fireEvent.click(cancelBtn) })

    // pickFolder 미호출 (취소이므로)
    expect(mockPickFolder).not.toHaveBeenCalled()
    // 모든 패널 여전히 전역 기본
    expect(getPanelFolderLabel(container, 0)).toBe('root')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('P15-08: 회귀 가드 — 기존 MultiWorkspace 구조 유지', () => {
  it('ma-head가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.ma-head')).toBeTruthy()
  })

  it('ma-grid가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.ma-grid')).toBeTruthy()
  })

  it('count=4 기본 → 패널 4개', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(4)
  })

  it('각 패널에 ma-p-folder 버튼이 있다', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    panels.forEach((panel) => {
      expect(panel.querySelector('.ma-p-folder')).toBeTruthy()
    })
  })

  it('pickFolder 오류 발생해도 컴포넌트가 크래시되지 않는다 (graceful)', async () => {
    mockPickFolder.mockRejectedValue(new Error('IPC 실패'))
    const container = await renderMultiWorkspace()

    const btn = getPanelFolderBtn(container, 0)
    // 오류가 발생해도 컴포넌트는 살아있어야 함
    await act(async () => {
      fireEvent.click(btn!)
    })

    // ma-grid가 여전히 렌더됨
    expect(container.querySelector('.ma-grid')).toBeTruthy()
  })
})

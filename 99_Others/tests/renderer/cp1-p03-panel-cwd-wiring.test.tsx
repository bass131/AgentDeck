// @vitest-environment jsdom
/**
 * cp1-p03-panel-cwd-wiring.test.tsx — CP1 P03 TDD: 패널 cwd send·팔레트 배선.
 *
 * 배경(Phase 정의 01.Phases/CP1-cwd-persist-sweep/03-cwd-renderer-wiring.md):
 *   패널 send가 panel.cwd를 workspaceRoot로 전달(전역 폴백) + 패널 팔레트 목록이
 *   패널 root 기준으로 조회되는지 검증. 라벨 표시와 실제 run cwd가 일치해야 한다.
 *
 * 사전 스카우트 정정(이 파일이 실증): MultiWorkspace.tsx의 `effectiveCwd` 계산
 * (panelCwds[slot] ?? panelMetas[slot]?.cwd ?? 전역 workspaceRoot, P15부터 존재)이
 * 이미 PanelView의 `workspaceRoot` prop으로 패널별 우선순위를 해결해 넘긴다 —
 * PanelView.tsx:265-267의 session.send가 이 prop을 그대로 쓰므로 라벨(cwdLabel)과
 * 실제 run cwd는 이미 같은 소스를 공유한다. 아래 ①번 그룹은 가장 까다로운 분기
 * (복원된 panelMetas.cwd가 이후 재선택으로 stale해지는 경우)까지 포함해 이 정합을
 * 실증한다 — panel.cwd(panelMetas 필드) 자체를 send의 1순위로 승격시키면 오히려
 * 이 stale 값이 최신 선택을 덮어써 회귀를 유발하므로 PanelView.tsx는 수정하지 않았다.
 *
 * ②번 그룹은 실제 갭(P01 root 파라미터가 팔레트 IPC 호출에 배선되지 않음)을 검증한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import type { PersistedMultiState } from '../../../02.Source/shared/ipc-contract'
import { __resetPanelSessionManagerForTests } from '../../../02.Source/renderer/src/store/panelSession'

// ── window.api 모킹 ─────────────────────────────────────────────────────────
let runIdCounter = 0

const mockPickFolder = vi.fn()
const mockAgentRun = vi.fn()
const mockListSlashCommands = vi.fn()
const mockListSkills = vi.fn()
const mockMultiSessionLoad = vi.fn()

const mockApi = {
  pickFolder: mockPickFolder,
  agentRun: mockAgentRun,
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  listSlashCommands: mockListSlashCommands,
  listSkills: mockListSkills,
  multiSessionLoad: mockMultiSessionLoad,
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

function makeDiskWithPanel0Cwd(cwd: string): PersistedMultiState {
  return {
    version: 2,
    activeSessionId: 'sess-cp1p03',
    sessions: [
      {
        id: 'sess-cp1p03',
        title: '',
        count: 2,
        panels: [
          { title: '', cwd, picker: { model: 'opus', effort: 'medium', mode: 'auto' } },
          { title: '', picker: { model: 'opus', effort: 'medium', mode: 'auto' } },
        ],
      },
    ],
  }
}

function getPanelFolderBtn(container: Element, panelIndex: number): HTMLButtonElement | null {
  const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
  if (panelIndex >= panels.length) return null
  return panels[panelIndex].querySelector('.ma-p-folder') as HTMLButtonElement | null
}

function getPanelFolderLabel(container: Element, panelIndex: number): string {
  const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
  if (panelIndex >= panels.length) return ''
  const labelEl = panels[panelIndex].querySelector('.ma-p-folder-name')
  return labelEl?.textContent?.trim() ?? ''
}

function getPanelTextarea(container: Element, panelIndex: number): HTMLTextAreaElement | null {
  const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)'))
  if (panelIndex >= panels.length) return null
  return panels[panelIndex].querySelector('textarea')
}

async function renderMultiWorkspace(workspaceRoot: string | null = null): Promise<Element> {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({ workspaceRoot, workspaceMode: 'multi', activeMultiSessionId: '' })
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  let container: Element = document.body
  await act(async () => {
    const result = render(<MultiWorkspace />)
    container = result.container
  })
  // 마운트 복원(multiSessionLoad) 완료 대기
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return container
}

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  mockAgentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter++}`
    return Promise.resolve({ runId })
  })
  mockPickFolder.mockResolvedValue({ path: null })
  mockListSlashCommands.mockResolvedValue([])
  mockListSkills.mockResolvedValue([])
  mockMultiSessionLoad.mockResolvedValue({ state: null })
  __resetPanelSessionManagerForTests()
})

afterEach(async () => {
  cleanup()
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null, activeMultiSessionId: '' })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('CP1-P03-①: 패널 send workspaceRoot — 라벨·run cwd 정합', () => {
  it('패널0 cwd 설정 후 send → agentRun workspaceRoot가 라벨과 동일(P15 회귀 가드)', async () => {
    mockPickFolder.mockResolvedValue({ path: '/mydir' })
    const container = await renderMultiWorkspace(null)

    const folderBtn = getPanelFolderBtn(container, 0)
    await act(async () => { fireEvent.click(folderBtn!) })
    expect(getPanelFolderLabel(container, 0)).toBe('mydir')

    const textarea = getPanelTextarea(container, 0)!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '작업 시작' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    expect(mockAgentRun.mock.calls[0][0].workspaceRoot).toBe('/mydir')
  })

  it('복원된 panelMetas.cwd가 있어도, 그 후 재선택한 최신 cwd가 라벨·run 양쪽에 반영된다(stale 값 미사용)', async () => {
    // 복원본: 패널0.cwd = '/restored/old-proj'
    mockMultiSessionLoad.mockResolvedValue({ state: makeDiskWithPanel0Cwd('/restored/old-proj') })
    const container = await renderMultiWorkspace(null)

    // 복원 직후 라벨은 restored 값
    expect(getPanelFolderLabel(container, 0)).toBe('old-proj')

    // 사용자가 같은 패널에서 새 폴더로 재선택(panelMetas.cwd는 갱신되지 않고 panelCwds만 갱신됨)
    mockPickFolder.mockResolvedValue({ path: '/fresh/new-proj' })
    const folderBtn = getPanelFolderBtn(container, 0)
    await act(async () => { fireEvent.click(folderBtn!) })

    // 라벨은 최신 선택으로 갱신
    expect(getPanelFolderLabel(container, 0)).toBe('new-proj')

    // send workspaceRoot도 라벨과 동일한 최신 값이어야 한다 — 복원된 stale 값(old-proj) 아님
    const textarea = getPanelTextarea(container, 0)!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '작업 재개' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    expect(mockAgentRun.mock.calls[0][0].workspaceRoot).toBe('/fresh/new-proj')
  })

  it('패널 cwd 미설정 + 전역 workspaceRoot 설정 → 전역 값이 라벨·run 양쪽에 폴백(회귀 0)', async () => {
    const container = await renderMultiWorkspace('/global/workspace')

    expect(getPanelFolderLabel(container, 0)).toBe('workspace')

    const textarea = getPanelTextarea(container, 0)!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'hi' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockAgentRun.mock.calls[0][0].workspaceRoot).toBe('/global/workspace')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('CP1-P03-②: 패널 팔레트 root 파라미터 배선 — 패널별 커맨드/스킬 목록 조회', () => {
  it('패널 cwd 설정 후 "/" 입력 → listSlashCommands/listSkills가 그 패널 cwd를 root로 전달', async () => {
    mockPickFolder.mockResolvedValue({ path: '/panel/proj-a' })
    const container = await renderMultiWorkspace(null)

    const folderBtn = getPanelFolderBtn(container, 0)
    await act(async () => { fireEvent.click(folderBtn!) })
    expect(getPanelFolderLabel(container, 0)).toBe('proj-a')

    const textarea = getPanelTextarea(container, 0)!
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '/' } })
    })
    await act(async () => { await Promise.resolve() })

    expect(mockListSlashCommands).toHaveBeenCalledWith({ root: '/panel/proj-a' })
    expect(mockListSkills).toHaveBeenCalledWith({ root: '/panel/proj-a' })
  })

  it('패널0=A, 패널1=B — 각 패널이 서로 다른 root로 목록을 조회한다(FB2 슬래시 증상 봉합)', async () => {
    const container = await renderMultiWorkspace(null)

    mockPickFolder.mockResolvedValueOnce({ path: '/team/proj-a' })
    const btn0 = getPanelFolderBtn(container, 0)
    await act(async () => { fireEvent.click(btn0!) })

    mockPickFolder.mockResolvedValueOnce({ path: '/team/proj-b' })
    const btn1 = getPanelFolderBtn(container, 1)
    await act(async () => { fireEvent.click(btn1!) })

    const ta0 = getPanelTextarea(container, 0)!
    await act(async () => { fireEvent.change(ta0, { target: { value: '/' } }) })
    await act(async () => { await Promise.resolve() })
    expect(mockListSlashCommands).toHaveBeenLastCalledWith({ root: '/team/proj-a' })

    // 패널0 팔레트 닫고 패널1 팔레트 오픈
    await act(async () => { fireEvent.keyDown(ta0, { key: 'Escape' }) })

    const ta1 = getPanelTextarea(container, 1)!
    await act(async () => { fireEvent.change(ta1, { target: { value: '/' } }) })
    await act(async () => { await Promise.resolve() })
    expect(mockListSlashCommands).toHaveBeenLastCalledWith({ root: '/team/proj-b' })
  })

  it('패널 cwd 없음 + 전역 workspaceRoot만 설정 → 전역 값이 root로 폴백', async () => {
    const container = await renderMultiWorkspace('/global/ws')

    const textarea = getPanelTextarea(container, 0)!
    await act(async () => { fireEvent.change(textarea, { target: { value: '/' } }) })
    await act(async () => { await Promise.resolve() })

    expect(mockListSlashCommands).toHaveBeenCalledWith({ root: '/global/ws' })
  })
})

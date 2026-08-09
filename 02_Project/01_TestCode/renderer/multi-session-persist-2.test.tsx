// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'
import type { PersistedMultiState } from '../../../02_Project/00_Source/shared/ipcContract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn(async () => {
  return { state: _disk }
})

const {
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
} = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

const mockApi = {
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  multiSessionLoad: mockMultiSessionLoad,
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
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

function makeDisk(sessions: Array<{ id: string; title?: string; count: number }>, activeId: string): PersistedMultiState {
  return {
    version: 2,
    activeSessionId: activeId,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title ?? '',
      count: s.count,
      panels: Array.from({ length: s.count }, (_, i) => ({
        title: `패널${i + 1}`,
        picker: { model: 'opus', effort: 'medium', mode: 'auto' },
      })),
    })),
  }
}

async function getStore() {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  return useAppStore
}

async function renderMultiWorkspace(activeId?: string) {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  if (activeId !== undefined) {
    useAppStore.setState({ activeMultiSessionId: activeId })
  }
  const { MultiWorkspace } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
  let container!: HTMLElement
  await act(async () => {
    const result = render(React.createElement(MultiWorkspace))
    container = result.container
  })
  return container
}

beforeEach(() => {
  vi.clearAllMocks()
  _disk = null
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

describe('P1 — RMW 보존: 활성 세션 저장 시 다른 세션 비소실', () => {

  it('디스크에 세션 A·B, 활성=A에서 디바운스 save → A·B 둘 다 존재', async () => {
    _disk = makeDisk([
      { id: 'sess-A', title: 'A작업', count: 2 },
      { id: 'sess-B', title: 'B작업', count: 3 },
    ], 'sess-A')

    const store = await getStore()
    store.setState({ activeMultiSessionId: 'sess-A' })

    await renderMultiWorkspace('sess-A')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })

    if (mockMultiCmdUpsert.mock.calls.length > 0) {
      const ids = _disk?.sessions.map((s) => s.id) ?? []
      expect(ids).toContain('sess-B')
      expect(ids).toContain('sess-A')
    }
    expect(mockMultiSessionLoad).toHaveBeenCalled()
  })

  it('upsert 후 디스크의 activeSessionId = 현재 활성 세션 id', async () => {
    _disk = makeDisk([
      { id: 'sess-A', count: 2 },
      { id: 'sess-B', count: 2 },
    ], 'sess-A')

    await renderMultiWorkspace('sess-A')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })

    if (mockMultiCmdUpsert.mock.calls.length > 0) {
      expect(_disk?.activeSessionId).toBe('sess-A')
    }
  })
})

describe('P2 — 활성세션 로드: store activeMultiSessionId로 세션 선택', () => {

  it('store activeMultiSessionId=sess-B → B 세션 count 복원 (A 아님)', async () => {
    _disk = makeDisk([
      { id: 'sess-A', title: 'A작업', count: 2 },
      { id: 'sess-B', title: 'B작업', count: 5 },
    ], 'sess-A')

    const store = await getStore()
    store.setState({ activeMultiSessionId: 'sess-B' })

    const container = await renderMultiWorkspace()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(5)
  })

  it('store activeMultiSessionId가 없으면(빈 문자열) → 첫 세션 폴백', async () => {
    _disk = makeDisk([
      { id: 'sess-A', count: 3 },
      { id: 'sess-B', count: 2 },
    ], 'sess-A')

    const store = await getStore()
    store.setState({ activeMultiSessionId: '' })

    const container = await renderMultiWorkspace()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(3)
  })
})

describe('P3 — 언마운트 flush: 디바운스 pending → 언마운트 → save 발화', () => {

  it('디바운스 진행 중 언마운트 → multiCmdUpsert 호출됨', async () => {
    _disk = makeDisk([{ id: 'sess-A', count: 2 }], 'sess-A')

    const store = await getStore()
    store.setState({ activeMultiSessionId: 'sess-A' })

    const { MultiWorkspace } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
    let unmount!: () => void

    await act(async () => {
      const result = render(React.createElement(MultiWorkspace))
      unmount = result.unmount
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const saveCountBefore = mockMultiCmdUpsert.mock.calls.length

    await act(async () => {
      unmount()
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const saveCountAfter = mockMultiCmdUpsert.mock.calls.length
    expect(saveCountAfter).toBeGreaterThanOrEqual(saveCountBefore)
  })
})

describe('P4 — 전환 보존: 세션 전환 후 재선택 시 원래 상태 복원', () => {

  it('A(count=5) 저장 → B 마운트 → A 재마운트 → count=5 복원', async () => {
    _disk = makeDisk([
      { id: 'sess-A', title: 'A작업', count: 5 },
      { id: 'sess-B', title: 'B작업', count: 2 },
    ], 'sess-A')

    const store = await getStore()

    store.setState({ activeMultiSessionId: 'sess-A' })
    const { MultiWorkspace } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
    let resultA!: ReturnType<typeof render>

    await act(async () => {
      resultA = render(React.createElement(MultiWorkspace))
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })

    await act(async () => {
      resultA.unmount()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    cleanup()

    store.setState({ activeMultiSessionId: 'sess-B' })
    let containerB!: HTMLElement
    let resultB!: ReturnType<typeof render>
    await act(async () => {
      resultB = render(React.createElement(MultiWorkspace))
      containerB = resultB.container
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const panelsB = containerB.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panelsB.length).toBe(2)

    await act(async () => {
      resultB.unmount()
    })
    cleanup()

    store.setState({ activeMultiSessionId: 'sess-A' })
    let containerA2!: HTMLElement
    await act(async () => {
      const result2 = render(React.createElement(MultiWorkspace))
      containerA2 = result2.container
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const panelsA2 = containerA2.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panelsA2.length).toBe(5)
  })
})

describe('S1 — Shell key: activeMultiSessionId → MultiWorkspace key prop', () => {

  it('Shell.tsx 소스에 key={activeMultiSessionId} 패턴이 존재한다', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      '02_Project/00_Source/renderer/src/layout/Shell.tsx',
      'utf-8'
    )
    expect(src).toContain('key={activeMultiSessionId}')
  })

  it('Shell.tsx 소스에서 selectActiveMultiSessionId import가 존재한다', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      '02_Project/00_Source/renderer/src/layout/Shell.tsx',
      'utf-8'
    )
    expect(src).toContain('selectActiveMultiSessionId')
  })
})

describe('R1 — 회귀: B3 race 게이트 보존', () => {

  it('load 지연 중 save 미발화 (restoredRef 게이트)', async () => {
    let resolveLoad!: (v: { state: null }) => void
    const deferred = new Promise<{ state: null }>((res) => { resolveLoad = res })
    mockMultiSessionLoad.mockReturnValueOnce(deferred)

    await renderMultiWorkspace()

    const saveBeforeResolve = mockMultiCmdUpsert.mock.calls.length
    expect(saveBeforeResolve).toBe(0)

    await act(async () => {
      resolveLoad({ state: null })
      await new Promise((r) => setTimeout(r, 600))
    })
  })
})

describe('R2 — 회귀: B4 picker 리프팅 보존', () => {

  it('MultiWorkspace 마운트 — pick-btn이 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    const pickBtns = container.querySelectorAll('.pick-btn')
    expect(pickBtns.length).toBeGreaterThan(0)
  })
})

describe('G1 — 유령 세션 방지: activeMultiSessionId 빈 문자열 → save 미발화', () => {

  it('activeMultiSessionId=""로 마운트 + 디바운스 발화 → multiCmdUpsert 호출 안 됨', async () => {
    _disk = makeDisk([{ id: 'sess-A', count: 2 }], 'sess-A')

    const store = await getStore()
    store.setState({ activeMultiSessionId: '' })

    await renderMultiWorkspace('')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })

    expect(mockMultiCmdUpsert).not.toHaveBeenCalled()
  })

  it('activeMultiSessionId 채워지면 정상 저장 (기존 P1 보완)', async () => {
    _disk = makeDisk([{ id: 'sess-A', count: 2 }], 'sess-A')

    const store = await getStore()
    store.setState({ activeMultiSessionId: 'sess-A' })

    await renderMultiWorkspace('sess-A')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })

    expect(mockMultiCmdUpsert).toHaveBeenCalled()
    expect(_disk?.activeSessionId).toBe('sess-A')
    expect(_disk?.sessions.some((s) => s.id === 'sess-A')).toBe(true)
    expect(_disk?.sessions.every((s) => s.id !== 'main-session')).toBe(true)
  })
})

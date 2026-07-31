// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

async function getStore() {
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  return useAppStore
}

async function renderRecentFiles(props: {
  files: string[]
  activePath: string | null
  onOpen?: (p: string) => void
  onRemove?: (paths: string[]) => void
  onReorder?: (files: string[]) => void
}) {
  const { RecentFiles } = await import('../../../02_Source/renderer/src/components/02_file/RecentFiles')
  const onOpen = props.onOpen ?? vi.fn()
  const onRemove = props.onRemove ?? vi.fn()
  const onReorder = props.onReorder ?? vi.fn()
  return act(async () =>
    render(
      <RecentFiles
        files={props.files}
        activePath={props.activePath}
        onOpen={onOpen}
        onRemove={onRemove}
        onReorder={onReorder}
      />
    )
  )
}

beforeEach(async () => {
  const store = await getStore()
  store.setState({
    recentFiles: [],
    openedFile: null,
  } as Parameters<typeof store.setState>[0])
})

describe('store.recentFiles — openFile 누적', () => {
  it('openFile 호출 시 recentFiles 최신순 누적 (dedup)', async () => {
    const store = await getStore()

    vi.stubGlobal('window', {
      api: {
        fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
        onAgentEvent: vi.fn().mockReturnValue(() => {}),
        workspaceOpen: vi.fn(),
        agentRun: vi.fn(),
        agentAbort: vi.fn(),
        conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
        conversationSave: vi.fn(),
        referenceAdd: vi.fn(),
        referenceList: vi.fn(),
        referenceTree: vi.fn(),
      },
    })

    await act(async () => {
      await store.getState().openFile('src/a.ts')
    })
    await act(async () => {
      await store.getState().openFile('src/b.ts')
    })

    const recent = store.getState().recentFiles
    expect(recent[0]).toBe('src/b.ts')
    expect(recent[1]).toBe('src/a.ts')
    expect(recent.length).toBe(2)

    vi.unstubAllGlobals()
  })

  it('6개 이상 열면 최근 5개만 유지 (마지막 열었던 파일부터)', async () => {
    const store = await getStore()

    vi.stubGlobal('window', {
      api: {
        fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
        onAgentEvent: vi.fn().mockReturnValue(() => {}),
        workspaceOpen: vi.fn(),
        agentRun: vi.fn(),
        agentAbort: vi.fn(),
        conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
        conversationSave: vi.fn(),
        referenceAdd: vi.fn(),
        referenceList: vi.fn(),
        referenceTree: vi.fn(),
      },
    })

    for (const p of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      await act(async () => { await store.getState().openFile(`src/${p}.ts`) })
    }

    const recent = store.getState().recentFiles
    expect(recent.length).toBe(5)
    expect(recent).toEqual(['src/g.ts', 'src/f.ts', 'src/e.ts', 'src/d.ts', 'src/c.ts'])

    vi.unstubAllGlobals()
  })

  it('중복 openFile → dedup (이동만)', async () => {
    const store = await getStore()

    vi.stubGlobal('window', {
      api: {
        fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
        onAgentEvent: vi.fn().mockReturnValue(() => {}),
        workspaceOpen: vi.fn(),
        agentRun: vi.fn(),
        agentAbort: vi.fn(),
        conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
        conversationSave: vi.fn(),
        referenceAdd: vi.fn(),
        referenceList: vi.fn(),
        referenceTree: vi.fn(),
      },
    })

    await act(async () => { await store.getState().openFile('src/a.ts') })
    await act(async () => { await store.getState().openFile('src/b.ts') })
    await act(async () => { await store.getState().openFile('src/a.ts') })

    const recent = store.getState().recentFiles
    expect(recent[0]).toBe('src/a.ts')
    expect(recent[1]).toBe('src/b.ts')
    expect(recent.length).toBe(2)

    vi.unstubAllGlobals()
  })

  it('removeRecentFiles — 경로 제거', async () => {
    const store = await getStore()
    store.setState({ recentFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'] } as Parameters<typeof store.setState>[0])
    act(() => store.getState().removeRecentFiles(['src/b.ts']))
    expect(store.getState().recentFiles).toEqual(['src/a.ts', 'src/c.ts'])
  })

  it('reorderRecentFiles — 순서 교체', async () => {
    const store = await getStore()
    store.setState({ recentFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'] } as Parameters<typeof store.setState>[0])
    act(() => store.getState().reorderRecentFiles(['src/c.ts', 'src/a.ts', 'src/b.ts']))
    expect(store.getState().recentFiles).toEqual(['src/c.ts', 'src/a.ts', 'src/b.ts'])
  })
})

describe('RecentFiles 컴포넌트', () => {
  it('빈 배열 → null (미렌더)', async () => {
    const { container } = await renderRecentFiles({ files: [], activePath: null })
    expect(container.querySelector('.chat-files')).toBeNull()
  })

  it('files 2개 → cf-tab 2개 (badge + name)', async () => {
    const { container } = await renderRecentFiles({
      files: ['src/a.ts', 'src/b.tsx'],
      activePath: null,
    })
    const tabs = container.querySelectorAll('.cf-tab')
    expect(tabs.length).toBe(2)
    expect(container.querySelector('.cf-name')?.textContent).toBe('a.ts')
  })

  it('activePath → .cf-tab.on', async () => {
    const { container } = await renderRecentFiles({
      files: ['src/a.ts', 'src/b.ts'],
      activePath: 'src/a.ts',
    })
    const onTabs = container.querySelectorAll('.cf-tab.on')
    expect(onTabs.length).toBe(1)
    expect(onTabs[0].querySelector('.cf-name')?.textContent).toBe('a.ts')
  })

  it('x 클릭 → onRemove 호출', async () => {
    const onRemove = vi.fn()
    const { container } = await renderRecentFiles({
      files: ['src/a.ts'],
      activePath: null,
      onRemove,
    })
    const xBtn = container.querySelector('.cf-x')!
    act(() => fireEvent.click(xBtn))
    expect(onRemove).toHaveBeenCalledWith(['src/a.ts'])
  })

  it('탭 클릭 → onOpen 호출', async () => {
    const onOpen = vi.fn()
    const { container } = await renderRecentFiles({
      files: ['src/a.ts'],
      activePath: null,
      onOpen,
    })
    const tab = container.querySelector('.cf-tab')!
    act(() => fireEvent.click(tab))
    expect(onOpen).toHaveBeenCalledWith('src/a.ts')
  })

  it('우클릭 → ctx-menu(닫기 + 모두 닫기) 표시', async () => {
    const { container } = await renderRecentFiles({
      files: ['src/a.ts', 'src/b.ts'],
      activePath: null,
    })
    const tab = container.querySelector('.cf-tab')!
    act(() => fireEvent.contextMenu(tab))
    const menu = container.querySelector('.ctx-menu')
    expect(menu).toBeTruthy()
    const items = menu!.querySelectorAll('.ctx-item')
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(Array.from(items).some((i) => i.textContent?.includes('닫기'))).toBe(true)
    expect(Array.from(items).some((i) => i.textContent?.includes('모두 닫기'))).toBe(true)
  })

  it('ctx-menu 닫기 클릭 → onRemove(해당 파일)', async () => {
    const onRemove = vi.fn()
    const { container } = await renderRecentFiles({
      files: ['src/a.ts', 'src/b.ts'],
      activePath: null,
      onRemove,
    })
    const tab = container.querySelector('.cf-tab')!
    act(() => fireEvent.contextMenu(tab))
    const closeItem = Array.from(container.querySelectorAll('.ctx-item')).find(
      (i) => i.textContent?.trim() === '닫기'
    )!
    act(() => fireEvent.click(closeItem))
    expect(onRemove).toHaveBeenCalled()
  })

  it('ctx-menu 모두 닫기 클릭 → onRemove(전체)', async () => {
    const onRemove = vi.fn()
    const { container } = await renderRecentFiles({
      files: ['src/a.ts', 'src/b.ts'],
      activePath: null,
      onRemove,
    })
    const tab = container.querySelector('.cf-tab')!
    act(() => fireEvent.contextMenu(tab))
    const allItem = Array.from(container.querySelectorAll('.ctx-item')).find(
      (i) => i.textContent?.includes('모두 닫기')
    )!
    act(() => fireEvent.click(allItem))
    expect(onRemove).toHaveBeenCalledWith(['src/a.ts', 'src/b.ts'])
  })

  it('reorderRecentFiles 액션 — 배열 순서 교체 단언', async () => {
    const store = await getStore()
    store.setState({ recentFiles: ['src/a.ts', 'src/b.ts'] } as Parameters<typeof store.setState>[0])
    const onReorder = vi.fn()
    const { container } = await renderRecentFiles({
      files: ['src/a.ts', 'src/b.ts'],
      activePath: null,
      onReorder,
    })
    act(() => onReorder(['src/b.ts', 'src/a.ts']))
    expect(onReorder).toHaveBeenCalledWith(['src/b.ts', 'src/a.ts'])

    act(() => store.getState().reorderRecentFiles(['src/b.ts', 'src/a.ts']))
    expect(store.getState().recentFiles).toEqual(['src/b.ts', 'src/a.ts'])

    expect(container.querySelectorAll('.cf-tab').length).toBe(2)
  })
})

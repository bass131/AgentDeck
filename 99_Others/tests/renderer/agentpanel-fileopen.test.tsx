// @vitest-environment jsdom
/**
 * agentpanel-fileopen.test.tsx — AgentPanel FileRow 클릭 → openFile 호출 TDD.
 *
 * 단방향 데이터 흐름 검증:
 *   FileRow 클릭 → store.openFile(path) 호출
 *
 * CRITICAL: renderer untrusted — 이 테스트는 window.api를 직접 호출하지 않음.
 *           store action(openFile)이 IPC를 담당하므로 store 레벨에서 spy.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

async function renderPanel(props: {
  files?: Array<{ path: string; add?: number; del?: number; tag?: 'new' | 'edit' }>
  changedFiles?: string[]
} = {}) {
  const store = await getStore()
  store.setState({
    isRunning: false,
    changedFiles: new Set<string>(props.changedFiles ?? props.files?.map((f) => f.path) ?? []),
    toolCards: [],
    errorMessage: undefined,
  } as Parameters<typeof store.setState>[0])
  const { AgentPanel } = await import('../../../02.Source/renderer/src/components/05_agent/AgentPanel')
  return act(async () =>
    render(
      <AgentPanel
        files={props.files}
      />
    )
  )
}

// ── FileRow 클릭 → openFile 호출 ──────────────────────────────────────────────
describe('AgentPanel — FileRow 클릭 → openFile (단방향 흐름)', () => {
  let openFileSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // store.openFile을 spy로 교체 — IPC 실제 호출 없이 action 호출 검증
    const store = await getStore()
    openFileSpy = vi.fn().mockResolvedValue(undefined)
    store.setState({ openFile: openFileSpy } as Parameters<typeof store.setState>[0])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('files prop FileRow 클릭 → openFile(path) 호출', async () => {
    const files = [{ path: 'src/components/App.tsx' }]
    const { container } = await renderPanel({ files })

    const fileRow = container.querySelector('.file') as HTMLElement
    expect(fileRow).toBeTruthy()

    act(() => fireEvent.click(fileRow))

    expect(openFileSpy).toHaveBeenCalledTimes(1)
    expect(openFileSpy).toHaveBeenCalledWith('src/components/App.tsx')
  })

  it('store changedFiles FileRow 클릭 → openFile(path) 호출', async () => {
    const { container } = await renderPanel({ changedFiles: ['02.Source/main/index.ts'] })

    const fileRow = container.querySelector('.file') as HTMLElement
    expect(fileRow).toBeTruthy()

    act(() => fireEvent.click(fileRow))

    expect(openFileSpy).toHaveBeenCalledTimes(1)
    expect(openFileSpy).toHaveBeenCalledWith('02.Source/main/index.ts')
  })

  it('파일 여러 개 — 각 행 클릭 → 해당 path로 openFile 호출', async () => {
    const files = [
      { path: 'src/a.ts' },
      { path: 'src/b.ts' },
      { path: 'src/c.ts' },
    ]
    const { container } = await renderPanel({ files })

    const fileRows = container.querySelectorAll('.file')
    expect(fileRows.length).toBe(3)

    // 두 번째 행 클릭
    act(() => fireEvent.click(fileRows[1]))
    expect(openFileSpy).toHaveBeenCalledWith('src/b.ts')
  })

  it('stat 있는 FileRow(add/del/tag) 클릭 → openFile 호출', async () => {
    const files = [{ path: 'src/new.ts', add: 42, del: 3, tag: 'new' as const }]
    const { container } = await renderPanel({ files })

    const fileRow = container.querySelector('.file') as HTMLElement
    act(() => fireEvent.click(fileRow))

    expect(openFileSpy).toHaveBeenCalledWith('src/new.ts')
  })

  it('Enter 키 → openFile(path) 호출 (접근성)', async () => {
    const files = [{ path: 'src/keyboard.ts' }]
    const { container } = await renderPanel({ files })

    const fileRow = container.querySelector('.file') as HTMLElement
    expect(fileRow).toBeTruthy()

    act(() => fireEvent.keyDown(fileRow, { key: 'Enter' }))

    expect(openFileSpy).toHaveBeenCalledWith('src/keyboard.ts')
  })

  it('Space 키 → openFile(path) 호출 (접근성)', async () => {
    const files = [{ path: 'src/space.ts' }]
    const { container } = await renderPanel({ files })

    const fileRow = container.querySelector('.file') as HTMLElement
    expect(fileRow).toBeTruthy()

    act(() => fireEvent.keyDown(fileRow, { key: ' ' }))

    expect(openFileSpy).toHaveBeenCalledWith('src/space.ts')
  })

  it('FileRow 요소는 button 태그 또는 role="button" + tabIndex≥0 (접근성)', async () => {
    const files = [{ path: 'src/a11y.ts' }]
    const { container } = await renderPanel({ files })

    const fileRow = container.querySelector('.file') as HTMLElement
    expect(fileRow).toBeTruthy()

    const isButton =
      fileRow.tagName.toLowerCase() === 'button' ||
      (fileRow.getAttribute('role') === 'button' && Number(fileRow.getAttribute('tabindex') ?? '-1') >= 0)
    expect(isButton).toBe(true)
  })
})

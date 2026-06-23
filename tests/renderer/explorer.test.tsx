// @vitest-environment jsdom
/**
 * explorer.test.tsx — F2-02 Explorer 개편 DOM 단언(plan-auditor 시각검증 주 게이트).
 * 파일배지·접이식 트리(chevron 토글)·검색 필터·변경색. 로컬 상태/렌더만(window.api 불요).
 *
 * P14b: FileExplorer 가 setPref(→ window.api.setUiPref)를 호출하므로 최소 stub 추가.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { FileTreeNode } from '../../src/shared/ipc-contract'

// window.api 최소 stub (P14b: setUiPref/getUiPrefs 필요)
Object.defineProperty(window, 'api', {
  value: {
    workspaceOpen: async () => ({ rootPath: null, tree: null }),
    fsRead: async () => ({ kind: 'text', content: '', language: 'text' }),
    referenceAdd: async () => ({ reference: null }),
    referenceList: async () => ({ references: [] }),
    referenceTree: async () => ({ tree: null }),
    getUiPrefs: async () => ({}),
    setUiPref: async () => ({ ok: true }),
  },
  writable: true,
  configurable: true,
})

const tree: FileTreeNode = {
  name: 'root',
  path: '',
  kind: 'directory',
  children: [
    { name: 'app.ts', path: 'app.ts', kind: 'file' },
    { name: 'README.md', path: 'README.md', kind: 'file' },
    {
      name: 'src',
      path: 'src',
      kind: 'directory',
      children: [
        { name: 'index.ts', path: 'src/index.ts', kind: 'file' },
        { name: 'util.css', path: 'src/util.css', kind: 'file' },
      ],
    },
  ],
}

async function renderExplorer() {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  useAppStore.setState({
    fileTree: tree,
    workspaceRoot: '/ws',
    changedFiles: new Set(['app.ts']),
    openedFile: null,
    references: [],
  } as Parameters<typeof useAppStore.setState>[0])
  const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
  return act(async () => render(<FileExplorer />))
}

beforeEach(() => {
  // localStorage 없는 환경 대비 무시
})
afterEach(() => cleanup())

describe('Explorer 개편 (F2-02)', () => {
  it('파일 행에 파일타입 배지(.ftbadge)가 렌더된다', async () => {
    const { container } = await renderExplorer()
    expect(container.querySelectorAll('.ftbadge').length).toBeGreaterThanOrEqual(1)
  })

  it('중첩 디렉토리는 기본 접힘 — 자식 미표시, chevron 토글 시 표시', async () => {
    const { container } = await renderExplorer()
    // 기본: src/index.ts 안 보임(src 접힘)
    expect(screen.queryByText('index.ts')).toBeNull()
    // 루트 파일은 보임
    expect(screen.getByText('app.ts')).toBeTruthy()
    // src 디렉토리 클릭 → 펼침
    const beforeFiles = container.querySelectorAll('.fe-file').length
    await act(async () => {
      fireEvent.click(screen.getByText('src'))
    })
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(container.querySelectorAll('.fe-file').length).toBeGreaterThan(beforeFiles)
  })

  it('검색 입력 시 트리가 평탄 결과로 필터된다', async () => {
    const { container } = await renderExplorer()
    const input = screen.getByLabelText('파일 검색')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'css' } })
    })
    // util.css만 매치 (app.ts/README.md/index.ts 제외)
    const files = Array.from(container.querySelectorAll('.fe-file .fe-node-name')).map(
      (n) => n.textContent
    )
    expect(files).toContain('util.css')
    expect(files).not.toContain('app.ts')
  })

  it('변경 파일은 .fe-file--changed + .fe-changed-dot', async () => {
    const { container } = await renderExplorer()
    const changed = container.querySelector('.fe-file--changed')
    expect(changed).toBeTruthy()
    expect(changed?.textContent).toContain('app.ts')
    expect(container.querySelector('.fe-changed-dot')).toBeTruthy()
  })
})

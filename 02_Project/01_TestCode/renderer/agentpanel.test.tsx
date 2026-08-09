// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

afterEach(() => cleanup())

async function renderPanel(patch: Record<string, unknown> = {}) {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    isRunning: false, changedFiles: new Set<string>(), toolCards: [], errorMessage: undefined,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
  const { AgentPanel } = await import('../../../02_Project/00_Source/renderer/src/features/agent/AgentPanel')
  return act(async () => render(<AgentPanel />))
}

describe('AgentPanel — 구조 (F4-01)', () => {
  it('헤더 + 상태 pill + 섹션 3(할일/서브에이전트/변경파일)', async () => {
    const { container } = await renderPanel()
    expect(container.querySelector('.ag-head')).toBeTruthy()
    expect(container.querySelector('.ag-pill')).toBeTruthy()
    expect(container.querySelectorAll('.ag-sec').length).toBe(3)
    expect(screen.getByText('할 일')).toBeTruthy()
    expect(screen.getByText('서브에이전트')).toBeTruthy()
    expect(screen.getByText('변경된 파일')).toBeTruthy()
  })

  it('기본(idle) → 상태 pill "대기 중"', async () => {
    await renderPanel()
    expect(screen.getByText(/대기 중/)).toBeTruthy()
  })

  it('실행 중 → 상태 pill "작업 중"', async () => {
    const { container } = await renderPanel({ isRunning: true })
    expect(container.querySelector('.ag-pill.running')).toBeTruthy()
    expect(screen.getByText(/작업 중/)).toBeTruthy()
  })

  it('할일/서브에이전트 = 빈 placeholder(0/0)', async () => {
    const { container } = await renderPanel()
    const counts = Array.from(container.querySelectorAll('.ag-count')).map((e) => e.textContent)
    expect(counts).toContain('0/0')
  })

  it('변경된 파일 데이터 반영(카운트 + 행)', async () => {
    const { container } = await renderPanel({ changedFiles: new Set(['src/a.ts', 'src/b.ts']) })
    expect(container.querySelectorAll('.file').length).toBe(2)
    const paths = Array.from(container.querySelectorAll('.file .path')).map((el) => el.textContent ?? '')
    expect(paths.some((p) => p.includes('a.ts'))).toBe(true)
  })
})

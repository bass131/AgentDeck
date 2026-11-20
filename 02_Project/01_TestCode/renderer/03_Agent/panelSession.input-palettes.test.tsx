// @vitest-environment jsdom
// M11 G6 — 패널 입력창 사례(1~12)는 그리는 곳이 없던 PanelView와 함께 지웠다(M10 Backlog 3).
// 같은 입력창 본체(ComposerView)의 팔레트·히스토리는 아래 단일 Composer 사례와 Composer.slash-ipc·useInputHistory 시험이 본다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const SAMPLE_COMMANDS = [
  { name: 'ask',  description: '임시 질문',       scope: 'builtin' as const },
  { name: 'init', description: 'CLAUDE.md 생성', scope: 'builtin' as const },
  { name: 'clear',description: '대화 초기화',     scope: 'builtin' as const },
]
const SAMPLE_SKILLS: { name: string; description: string; scope: 'global'; enabled: boolean }[] = []

const mockApi = {
  listSlashCommands: vi.fn().mockResolvedValue(SAMPLE_COMMANDS),
  listSkills:        vi.fn().mockResolvedValue(SAMPLE_SKILLS),
  onAgentEvent:      vi.fn().mockReturnValue(() => {}),
}

beforeEach(() => {
  Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })
  vi.clearAllMocks()
  mockApi.listSlashCommands.mockResolvedValue(SAMPLE_COMMANDS)
  mockApi.listSkills.mockResolvedValue(SAMPLE_SKILLS)
})

afterEach(() => cleanup())

describe('단일 Composer — 팔레트와 히스토리 (13)', () => {

  it('(13-a) 단일 Composer 슬래시 팔레트 — 기존 동작 유지', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer
        value="/"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    expect(container.querySelector('[role="listbox"].slash-menu')).toBeTruthy()
  })

  it('(13-b) 단일 Composer IPC 로드 → ask/init 항목 표시', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer
        value="/"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    await act(async () => { await Promise.resolve() })
    const names = Array.from(container.querySelectorAll('.slash-name')).map((n) => n.textContent)
    expect(names).toContain('ask')
    expect(names).toContain('init')
  })

  it('(13-c) 단일 Composer @멘션 팔레트 — 기존 동작 유지', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const FILES = ['src/App.tsx', 'README.md']
    const { container } = render(
      <Composer
        value="@"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
        mentionFiles={FILES}
      />
    )
    expect(container.querySelector('[role="listbox"].slash-menu')).toBeTruthy()
  })

  it('(13-d) 단일 Composer 히스토리 ↑ — 기존 동작 유지', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const onChange = vi.fn()
    const history = ['hist-1', 'hist-2']
    const { container } = render(
      <Composer
        value=""
        onChange={onChange}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
        history={history}
      />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('hist-2')
  })
})

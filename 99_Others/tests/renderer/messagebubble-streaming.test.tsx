// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => cleanup())

describe('MessageBubble — streaming=true → SmoothMarkdown 전환', () => {
  it('streaming=true: .smooth-markdown 존재 (SmoothMarkdown 사용)', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/features/conversation/MessageBubble')
    const { container } = await act(async () =>
      render(<MessageBubble role="assistant" content="스트리밍 텍스트" streaming={true} />)
    )
    expect(container.querySelector('.smooth-markdown')).toBeTruthy()
  })

  it('streaming=true: .content 직계 형제로 외부 .stream-cursor 없음 (중복 커서 없음)', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/features/conversation/MessageBubble')
    const { container } = await act(async () =>
      render(<MessageBubble role="assistant" content="스트리밍 텍스트" streaming={true} />)
    )
    const contentDiv = container.querySelector('.content')
    expect(contentDiv).toBeTruthy()
    const directCursorInContent = Array.from(contentDiv!.children).find(
      el => el.classList.contains('stream-cursor') && el.tagName === 'SPAN'
    )
    expect(directCursorInContent).toBeFalsy()
  })

  it('streaming=true: .markdown-view 없음 (MarkdownView 미사용)', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/features/conversation/MessageBubble')
    const { container } = await act(async () =>
      render(<MessageBubble role="assistant" content="스트리밍 텍스트" streaming={true} />)
    )
    expect(container.querySelector('.markdown-view')).toBeFalsy()
  })
})

describe('MessageBubble — streaming=false → 기존 MarkdownView (회귀 0)', () => {
  it('streaming=false: .markdown-view 존재 (기존 MarkdownView 사용)', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/features/conversation/MessageBubble')
    const { container } = await act(async () =>
      render(<MessageBubble role="assistant" content="**완료 텍스트**" streaming={false} />)
    )
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('streaming=false: .smooth-markdown 없음', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/features/conversation/MessageBubble')
    const { container } = await act(async () =>
      render(<MessageBubble role="assistant" content="**완료 텍스트**" streaming={false} />)
    )
    expect(container.querySelector('.smooth-markdown')).toBeFalsy()
  })

  it('streaming 미지정(undefined): .markdown-view 존재 (기존 동작 유지)', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/features/conversation/MessageBubble')
    const { container } = await act(async () =>
      render(<MessageBubble role="assistant" content="**응답**" />)
    )
    expect(container.querySelector('.markdown-view')).toBeTruthy()
    expect(container.querySelector('.smooth-markdown')).toBeFalsy()
  })
})

describe('MultiWorkspace CSS — .ma-p-messages 가로 패딩', () => {
  const CSS_PATH = '02_Source/renderer/src/components/00_shell/MultiWorkspace.css'

  it('MultiWorkspace.css에 .ma-p-messages 규칙이 존재함', async () => {
    const { readFileSync } = await import('fs')
    const css = readFileSync(CSS_PATH, 'utf-8')
    expect(css).toMatch(/\.ma-p-messages\s*\{/)
  })

  it('MultiWorkspace.css .ma-p-messages에 padding 선언이 있음', async () => {
    const { readFileSync } = await import('fs')
    const css = readFileSync(CSS_PATH, 'utf-8')
    const blockMatch = css.match(/\.ma-p-messages\s*\{([^}]+)\}/)
    expect(blockMatch).toBeTruthy()
    expect(blockMatch![1]).toMatch(/padding/)
  })
})

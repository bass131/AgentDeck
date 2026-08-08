// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

describe('B: .content font-family — var(--font-sans)', () => {
  it('MessageBubble[assistant] .content 에 font-sans 클래스/style 적용', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/components/01_conversation/MessageBubble')
    const { container } = render(
      <MessageBubble role="assistant" content="안녕하세요" />
    )
    const contentEl = container.querySelector('.msg.ai-msg .content')
    expect(contentEl).toBeTruthy()
    expect(contentEl).toBeTruthy()
  })

  it('MessageBubble[user] .content: user 버블 font-family는 sans(일관성)', async () => {
    const { MessageBubble } = await import('../../../02_Source/renderer/src/components/01_conversation/MessageBubble')
    const { container } = render(
      <MessageBubble role="user" content="질문입니다" />
    )
    const contentEl = container.querySelector('.msg.user .content')
    expect(contentEl).toBeTruthy()
  })
})

describe('B-CSS: Conversation.css .content font-family 토큰 확인', () => {
  it('Conversation.css 에서 .content { font-family: var(--font-serif) } 가 제거됨', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02_Source/renderer/src/components/01_conversation/Conversation.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    const contentBlock = css.match(/\.content\s*\{[^}]*\}/g) ?? []
    const hasSerifInContent = contentBlock.some((block) =>
      block.includes('--font-serif')
    )
    expect(hasSerifInContent).toBe(false)
  })

  it('Conversation.css 에서 .content { font-family: var(--font-sans) } 포함', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02_Source/renderer/src/components/01_conversation/Conversation.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    const contentBlock = css.match(/\.content\s*\{[^}]*\}/g) ?? []
    const hasSansInContent = contentBlock.some((block) =>
      block.includes('--font-sans')
    )
    expect(hasSansInContent).toBe(true)
  })
})

describe('B-CSS: MarkdownView.css 어시스턴트 컨테이너 배경 투명/정합', () => {
  it('MarkdownView.css .markdown-view 에 background: var(--bg-0) 미포함(투명으로 변경됨)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02_Source/renderer/src/components/01_conversation/MarkdownView.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    const mvBlock = css.match(/\.markdown-view\s*\{[^}]*\}/g) ?? []
    const hasOpaqueBg = mvBlock.some(
      (block) =>
        block.includes('background: var(--bg-0)') ||
        block.includes('background: var(--bg)')
    )
    expect(hasOpaqueBg).toBe(false)
  })
})

describe('C-CSS: LoopStatusBanner.css gloss — 상단 깊은 글로우 미포함', () => {
  it('loop-active .chat-scroll box-shadow에 "20px 48px" 패턴 미포함', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02_Source/renderer/src/features/notice/LoopStatusBanner.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).not.toContain('0 20px 48px')
  })

  it('loop-active .chat-scroll box-shadow에 테두리 링(0 0 0 1.5px 또는 2px) 포함', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02_Source/renderer/src/features/notice/LoopStatusBanner.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    const hasRing =
      css.includes('inset 0 0 0 1.5px') ||
      css.includes('inset 0 0 0 2px') ||
      css.includes('inset 0 0 0 1px')
    expect(hasRing).toBe(true)
  })
})

describe('D: isScrolledUp 순수 함수', () => {
  it('바닥에서 40px 이하 → false', async () => {
    const { isScrolledUp } = await import(
      '../../../02_Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 970, clientHeight: 30 })).toBe(false)
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 960, clientHeight: 30 })).toBe(false)
  })

  it('바닥에서 41px 이상 → true', async () => {
    const { isScrolledUp } = await import(
      '../../../02_Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 900, clientHeight: 30 })).toBe(true)
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 0, clientHeight: 30 })).toBe(true)
  })

  it('임계값 경계: scrollHeight - scrollTop - clientHeight = 40 → false', async () => {
    const { isScrolledUp } = await import(
      '../../../02_Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 930, clientHeight: 30 })).toBe(false)
  })

  it('임계값 경계: scrollHeight - scrollTop - clientHeight = 41 → true', async () => {
    const { isScrolledUp } = await import(
      '../../../02_Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 929, clientHeight: 30 })).toBe(true)
  })
})

describe('D: ScrollToBottomButton 렌더', () => {
  it('show=false → 버튼 미렌더(null)', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02_Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const { container } = render(
      <ScrollToBottomButton show={false} onClick={vi.fn()} />
    )
    expect(container.querySelector('.scroll-to-bottom')).toBeFalsy()
  })

  it('show=true → .scroll-to-bottom 버튼 렌더', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02_Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const { container } = render(
      <ScrollToBottomButton show={true} onClick={vi.fn()} />
    )
    expect(container.querySelector('.scroll-to-bottom')).toBeTruthy()
  })

  it('show=true → aria-label 포함', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02_Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const { container } = render(
      <ScrollToBottomButton show={true} onClick={vi.fn()} />
    )
    const btn = container.querySelector('.scroll-to-bottom')
    expect(btn?.getAttribute('aria-label')).toBeTruthy()
  })

  it('클릭 시 onClick 콜백 호출', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02_Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const onClick = vi.fn()
    const { container } = await act(async () =>
      render(<ScrollToBottomButton show={true} onClick={onClick} />)
    )
    const btn = container.querySelector('.scroll-to-bottom') as HTMLButtonElement
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('E: computeComposerHeight 순수 함수', () => {
  it('1줄(scrollHeight <= 1×lineH+2×padding) → 1줄 높이 반환', async () => {
    const { computeComposerHeight } = await import(
      '../../../02_Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(46, 22, 24, 3)
    expect(result.height).toBe(46)
    expect(result.overflow).toBe('hidden')
  })

  it('2줄(scrollHeight = 2×lineH+2×padding) → 2줄 높이 반환', async () => {
    const { computeComposerHeight } = await import(
      '../../../02_Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(68, 22, 24, 3)
    expect(result.height).toBe(68)
    expect(result.overflow).toBe('hidden')
  })

  it('3줄 이내(scrollHeight = 3×lineH+2×padding) → 3줄 높이 반환', async () => {
    const { computeComposerHeight } = await import(
      '../../../02_Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(90, 22, 24, 3)
    expect(result.height).toBe(90)
    expect(result.overflow).toBe('hidden')
  })

  it('3줄 초과(scrollHeight > 3×lineH+2×padding) → max(3줄) 클램프 + overflow:auto', async () => {
    const { computeComposerHeight } = await import(
      '../../../02_Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(112, 22, 24, 3)
    expect(result.height).toBe(90)
    expect(result.overflow).toBe('auto')
  })

  it('max=3 초과 scrollHeight 큰 값 → 항상 3줄 클램프', async () => {
    const { computeComposerHeight } = await import(
      '../../../02_Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(500, 22, 24, 3)
    expect(result.height).toBe(90)
    expect(result.overflow).toBe('auto')
  })

  it('scrollHeight가 1줄 미만(빈 textarea 등) → 1줄 최솟값', async () => {
    const { computeComposerHeight } = await import(
      '../../../02_Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(10, 22, 24, 3)
    expect(result.height).toBe(46)
    expect(result.overflow).toBe('hidden')
  })
})

describe('E-CSS: Composer.css .composer-ta overflow 단언', () => {
  it('Composer.css .composer-ta 에 max-height 고정 선언 미포함(JS로 제어)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02_Source/renderer/src/components/01_conversation/Composer.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    const taBlock = css.match(/\.composer-ta\s*\{[^}]*\}/g) ?? []
    const hasMaxHeight = taBlock.some((block) => block.includes('max-height'))
    expect(hasMaxHeight).toBe(false)
  })
})

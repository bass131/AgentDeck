// @vitest-environment jsdom
/**
 * ux-fixes-bcd-e.test.tsx — B/C/D/E UX 수정 TDD 테스트.
 *
 * B: .content font-family = var(--font-sans) / 어시스턴트 컨테이너 배경 투명
 * C: gloss 규칙에 상단 깊은 글로우(inset 0 20px 48px) 미포함
 * D: 맨 아래로 플로팅 버튼 — isScrolledUp 로직 순수 함수 + 버튼 렌더
 * E: computeComposerHeight 순수 함수 (1·2·3줄 신축, 3줄 초과 클램프)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

// ─────────────────────────────────────────────────────────────────────────────
// B: .content font-family
// ─────────────────────────────────────────────────────────────────────────────

describe('B: .content font-family — var(--font-sans)', () => {
  it('MessageBubble[assistant] .content 에 font-sans 클래스/style 적용', async () => {
    const { MessageBubble } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(
      <MessageBubble role="assistant" content="안녕하세요" />
    )
    const contentEl = container.querySelector('.msg.ai-msg .content')
    expect(contentEl).toBeTruthy()
    // font-family 인라인 스타일 또는 CSS 변수 참조가 --font-sans여야 함
    // CSS 변수는 jsdom에서 계산 불가이므로, CSS 파일에서 --font-serif가 아닌지 구조 단언
    // (실제 CSS 파일 변경 후 통과되는 구조 단언)
    // content 엘리먼트가 존재하고 font-sans 클래스 또는 data 속성을 가지거나
    // Conversation.css 에서 font-family 변경됨을 스냅샷으로 확인
    // → CSS 파일에서 직접 --font-sans 사용 여부는 B-CSS 단언 테스트로 분리
    expect(contentEl).toBeTruthy()
  })

  it('MessageBubble[user] .content: user 버블 font-family는 sans(일관성)', async () => {
    const { MessageBubble } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
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
      '../../../02.Source/renderer/src/components/01_conversation/Conversation.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    // .content 블록에서 --font-serif 사용 금지 확인
    // (코드블록/pre/code는 --font-mono 유지하므로 전체 파일에서 --font-serif가 없어도 됨)
    // .content { font-family: var(--font-serif) } 패턴이 존재하지 않아야 함
    // 단: .wc-title/.meta .name/.notice-text 등 다른 곳에 --font-serif는 허용
    // .content 블록에만 국한 — 정규식으로 추출
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
      '../../../02.Source/renderer/src/components/01_conversation/Conversation.css'
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
      '../../../02.Source/renderer/src/components/01_conversation/MarkdownView.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    // .markdown-view 블록에 background: var(--bg-0) 또는 background: var(--bg) 미포함
    const mvBlock = css.match(/\.markdown-view\s*\{[^}]*\}/g) ?? []
    const hasOpaqueBg = mvBlock.some(
      (block) =>
        block.includes('background: var(--bg-0)') ||
        block.includes('background: var(--bg)')
    )
    expect(hasOpaqueBg).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C: gloss 규칙 — 상단 깊은 글로우 미포함
// ─────────────────────────────────────────────────────────────────────────────

describe('C-CSS: LoopRunningIndicator.css gloss — 상단 깊은 글로우 미포함', () => {
  it('loop-active .chat-scroll box-shadow에 "20px 48px" 패턴 미포함', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    // inset 0 20px 48px 패턴이 제거되었는지 확인
    expect(css).not.toContain('0 20px 48px')
  })

  it('loop-active .chat-scroll box-shadow에 테두리 링(0 0 0 1.5px 또는 2px) 포함', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(
      __dirname,
      '../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    // 테두리 링 패턴: inset 0 0 0 [1-2px]
    const hasRing =
      css.includes('inset 0 0 0 1.5px') ||
      css.includes('inset 0 0 0 2px') ||
      css.includes('inset 0 0 0 1px')
    expect(hasRing).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D: 맨 아래로 버튼 — isScrolledUp 순수 함수 + 버튼 렌더
// ─────────────────────────────────────────────────────────────────────────────

describe('D: isScrolledUp 순수 함수', () => {
  it('바닥에서 40px 이하 → false', async () => {
    const { isScrolledUp } = await import(
      '../../../02.Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 970, clientHeight: 30 })).toBe(false)
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 960, clientHeight: 30 })).toBe(false)
  })

  it('바닥에서 41px 이상 → true', async () => {
    const { isScrolledUp } = await import(
      '../../../02.Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 900, clientHeight: 30 })).toBe(true)
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 0, clientHeight: 30 })).toBe(true)
  })

  it('임계값 경계: scrollHeight - scrollTop - clientHeight = 40 → false', async () => {
    const { isScrolledUp } = await import(
      '../../../02.Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 930, clientHeight: 30 })).toBe(false)
  })

  it('임계값 경계: scrollHeight - scrollTop - clientHeight = 41 → true', async () => {
    const { isScrolledUp } = await import(
      '../../../02.Source/renderer/src/lib/scrollHelpers'
    )
    expect(isScrolledUp({ scrollHeight: 1000, scrollTop: 929, clientHeight: 30 })).toBe(true)
  })
})

describe('D: ScrollToBottomButton 렌더', () => {
  it('show=false → 버튼 미렌더(null)', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const { container } = render(
      <ScrollToBottomButton show={false} onClick={vi.fn()} />
    )
    expect(container.querySelector('.scroll-to-bottom')).toBeFalsy()
  })

  it('show=true → .scroll-to-bottom 버튼 렌더', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const { container } = render(
      <ScrollToBottomButton show={true} onClick={vi.fn()} />
    )
    expect(container.querySelector('.scroll-to-bottom')).toBeTruthy()
  })

  it('show=true → aria-label 포함', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/ScrollToBottomButton'
    )
    const { container } = render(
      <ScrollToBottomButton show={true} onClick={vi.fn()} />
    )
    const btn = container.querySelector('.scroll-to-bottom')
    expect(btn?.getAttribute('aria-label')).toBeTruthy()
  })

  it('클릭 시 onClick 콜백 호출', async () => {
    const { ScrollToBottomButton } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/ScrollToBottomButton'
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

// ─────────────────────────────────────────────────────────────────────────────
// E: computeComposerHeight 순수 함수
// ─────────────────────────────────────────────────────────────────────────────

describe('E: computeComposerHeight 순수 함수', () => {
  it('1줄(scrollHeight <= 1×lineH+2×padding) → 1줄 높이 반환', async () => {
    const { computeComposerHeight } = await import(
      '../../../02.Source/renderer/src/lib/composerHeight'
    )
    // lineHeight=22, paddingY=24(상하 각 12), 1줄=22+24=46
    const result = computeComposerHeight(46, 22, 24, 3)
    expect(result.height).toBe(46)
    expect(result.overflow).toBe('hidden')
  })

  it('2줄(scrollHeight = 2×lineH+2×padding) → 2줄 높이 반환', async () => {
    const { computeComposerHeight } = await import(
      '../../../02.Source/renderer/src/lib/composerHeight'
    )
    // 2줄: 2*22+24=68
    const result = computeComposerHeight(68, 22, 24, 3)
    expect(result.height).toBe(68)
    expect(result.overflow).toBe('hidden')
  })

  it('3줄 이내(scrollHeight = 3×lineH+2×padding) → 3줄 높이 반환', async () => {
    const { computeComposerHeight } = await import(
      '../../../02.Source/renderer/src/lib/composerHeight'
    )
    // 3줄: 3*22+24=90
    const result = computeComposerHeight(90, 22, 24, 3)
    expect(result.height).toBe(90)
    expect(result.overflow).toBe('hidden')
  })

  it('3줄 초과(scrollHeight > 3×lineH+2×padding) → max(3줄) 클램프 + overflow:auto', async () => {
    const { computeComposerHeight } = await import(
      '../../../02.Source/renderer/src/lib/composerHeight'
    )
    // 4줄: 4*22+24=112 > max(90)
    const result = computeComposerHeight(112, 22, 24, 3)
    expect(result.height).toBe(90) // 3줄 클램프
    expect(result.overflow).toBe('auto')
  })

  it('max=3 초과 scrollHeight 큰 값 → 항상 3줄 클램프', async () => {
    const { computeComposerHeight } = await import(
      '../../../02.Source/renderer/src/lib/composerHeight'
    )
    const result = computeComposerHeight(500, 22, 24, 3)
    expect(result.height).toBe(90)
    expect(result.overflow).toBe('auto')
  })

  it('scrollHeight가 1줄 미만(빈 textarea 등) → 1줄 최솟값', async () => {
    const { computeComposerHeight } = await import(
      '../../../02.Source/renderer/src/lib/composerHeight'
    )
    // scrollHeight=10 < 1줄(46) → 최솟값(1줄)
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
      '../../../02.Source/renderer/src/components/01_conversation/Composer.css'
    )
    const css = fs.readFileSync(cssPath, 'utf-8')
    // .composer-ta 블록에 max-height 고정값 없어야 함 (JS로 동적 제어)
    const taBlock = css.match(/\.composer-ta\s*\{[^}]*\}/g) ?? []
    const hasMaxHeight = taBlock.some((block) => block.includes('max-height'))
    expect(hasMaxHeight).toBe(false)
  })
})

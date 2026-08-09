// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

const CONVERSATION_CSS = resolve(__dirname, '../../../02_Project/00_Source/renderer/src/features/conversation/Conversation.css')
const MARKDOWN_VIEW_CSS = resolve(__dirname, '../../../02_Project/00_Source/renderer/src/features/conversation/MarkdownView.css')

describe('foldSoftLinebreaks — 순수 함수(마크다운 soft break 규칙)', () => {
  it('단일 개행은 공백 1개로 접힌다(같은 문단)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('1\n2\n3')).toBe('1 2 3')
  })

  it('개행 2개(빈 줄)는 문단 경계로 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('가\n\n나')).toBe('가\n\n나')
  })

  it('개행 3개 이상도 문단 경계 1개(개행 2개)로 정규화된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('가\n\n\n\n나')).toBe('가\n\n나')
  })

  it('개행이 없으면 원문 그대로', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('그대로')).toBe('그대로')
  })

  it('빈 문자열은 빈 문자열', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('')).toBe('')
  })

  it('혼합: 문단 내부 개행 접힘 + 문단 경계 보존 공존', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('1\n2\n\n3\n4')).toBe('1 2\n\n3 4')
  })
})

describe('foldSoftLinebreaks — 블록 인지 가드(리스트/펜스/인용/표는 접지 않음)', () => {
  it('불릿 리스트("- ")는 항목 사이 개행이 보존된다(병합 후 스냅 방지)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('- a\n- b')).toBe('- a\n- b')
  })

  it('불릿 리스트("* ", "+ ")도 동일하게 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('* a\n* b')).toBe('* a\n* b')
    expect(foldSoftLinebreaks('+ a\n+ b')).toBe('+ a\n+ b')
  })

  it('순서 리스트("1. ")는 항목 사이 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('1. a\n2. b')).toBe('1. a\n2. b')
  })

  it('헤딩("#") 앞 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('문단\n# 제목')).toBe('문단\n# 제목')
  })

  it('인용(">")은 줄 사이 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('> a\n> b')).toBe('> a\n> b')
  })

  it('표("|")는 행 사이 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('|a|b|\n|1|2|')).toBe('|a|b|\n|1|2|')
  })

  it('펜스드 코드블록(```)은 내부 개행이 전부 보존된다(완료 후 코드블록 스냅 방지)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('```\nx\ny\n```')).toBe('```\nx\ny\n```')
  })

  it('펜스드 코드블록 내부의 빈 줄도 접히거나 축약되지 않는다(문단 경계 규칙 미적용)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('```\nx\n\ny\n```')).toBe('```\nx\n\ny\n```')
  })

  it('미종결 펜스(스트리밍 중 닫는 펜스 미도착)도 그 시점까지 전부 개행 보존', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('```\nx\ny')).toBe('```\nx\ny')
  })

  it('~~~ 펜스도 ``` 와 동일하게 인식된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('~~~\nx\ny\n~~~')).toBe('~~~\nx\ny\n~~~')
  })

  it('혼합: 산문은 여전히 접히고, 리스트로 진입한 뒤부터는 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('hello\nworld\n- item1\n- item2')).toBe('hello world\n- item1\n- item2')
  })

  it('혼합: 산문 문단 다음에 펜스드 코드블록이 와도 코드 내부는 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02_Project/00_Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('설명\n텍스트\n```\ncode1\ncode2\n```')).toBe('설명 텍스트\n```\ncode1\ncode2\n```')
  })
})

function mockRafFrames(max = 400): void {
  let calls = 0
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    if (calls < max) {
      calls++
      cb(performance.now() + calls * 16)
    }
    return calls
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
}

describe('SmoothMarkdown — plain 모드도 문단 규칙 적용(완료 순간 점프 방지)', () => {
  it('running=true, 충분한 프레임 후 plain 텍스트의 단일 개행이 공백으로 접혀 렌더됨', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/SmoothMarkdown')
    const text = '1\n2\n3'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre).toBeTruthy()
    expect(pre!.textContent).toBe('1 2 3')

    vi.restoreAllMocks()
  })

  it('running=true, 빈 줄(문단 경계)이 있는 텍스트는 그대로 두 줄로 보존됨', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/SmoothMarkdown')
    const text = '문단1\n\n문단2'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre!.textContent).toBe('문단1\n\n문단2')

    vi.restoreAllMocks()
  })

  it('running=true, 리스트 스트리밍 중에도 항목이 병합되지 않는다(완료 순간 리스트 스냅 방지)', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/SmoothMarkdown')
    const text = '- a\n- b'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre!.textContent).toBe('- a\n- b')

    vi.restoreAllMocks()
  })

  it('running=true, 펜스드 코드블록 스트리밍 중엔 내부 개행이 전부 보존된다(코드블록 스냅 방지)', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/SmoothMarkdown')
    const text = '```\ncode1\ncode2\n```'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre!.textContent).toBe('```\ncode1\ncode2\n```')

    vi.restoreAllMocks()
  })
})

describe('CSS 정합 — .smooth-pre와 .markdown-body가 동일 타이포/패딩 토큰 공유', () => {
  it('.smooth-markdown--plain .smooth-pre 블록이 존재한다', () => {
    const css = readFileSync(CONVERSATION_CSS, 'utf-8')
    expect(css).toMatch(/\.smooth-markdown--plain\s+\.smooth-pre\s*\{/)
  })

  it('.markdown-body 블록이 존재한다', () => {
    const css = readFileSync(MARKDOWN_VIEW_CSS, 'utf-8')
    expect(css).toMatch(/\.markdown-body\s*\{/)
  })

  function extractBlock(css: string, selectorRe: RegExp): string {
    const match = css.match(selectorRe)
    if (!match) throw new Error('selector not found')
    const start = match.index! + match[0].length
    const end = css.indexOf('}', start)
    return css.slice(start, end)
  }

  it('font-family가 두 블록에서 완전히 동일한 토큰 표현식을 쓴다(세리프/산세리프 갈림 회귀 방지)', () => {
    const convCss = readFileSync(CONVERSATION_CSS, 'utf-8')
    const mdCss = readFileSync(MARKDOWN_VIEW_CSS, 'utf-8')
    const smoothBlock = extractBlock(convCss, /\.smooth-markdown--plain\s+\.smooth-pre\s*\{/)
    const mdBlock = extractBlock(mdCss, /\.markdown-body\s*\{/)

    const smoothFont = smoothBlock.match(/font-family:\s*([^;]+);/)?.[1]?.trim()
    const mdFont = mdBlock.match(/font-family:\s*([^;]+);/)?.[1]?.trim()
    expect(smoothFont).toBeTruthy()
    expect(smoothFont).toBe(mdFont)
    expect(smoothFont).not.toMatch(/--font-serif/)
  })

  it('font-size가 두 블록에서 동일하다', () => {
    const convCss = readFileSync(CONVERSATION_CSS, 'utf-8')
    const mdCss = readFileSync(MARKDOWN_VIEW_CSS, 'utf-8')
    const smoothBlock = extractBlock(convCss, /\.smooth-markdown--plain\s+\.smooth-pre\s*\{/)
    const mdBlock = extractBlock(mdCss, /\.markdown-body\s*\{/)

    const smoothSize = smoothBlock.match(/font-size:\s*([^;]+);/)?.[1]?.trim()
    const mdSize = mdBlock.match(/font-size:\s*([^;]+);/)?.[1]?.trim()
    expect(smoothSize).toBe(mdSize)
  })

  it('line-height가 두 블록에서 동일하다', () => {
    const convCss = readFileSync(CONVERSATION_CSS, 'utf-8')
    const mdCss = readFileSync(MARKDOWN_VIEW_CSS, 'utf-8')
    const smoothBlock = extractBlock(convCss, /\.smooth-markdown--plain\s+\.smooth-pre\s*\{/)
    const mdBlock = extractBlock(mdCss, /\.markdown-body\s*\{/)

    const smoothLh = smoothBlock.match(/line-height:\s*([^;]+);/)?.[1]?.trim()
    const mdLh = mdBlock.match(/line-height:\s*([^;]+);/)?.[1]?.trim()
    expect(smoothLh).toBe(mdLh)
  })

  it('padding이 두 블록에서 동일하다(완료 순간 여백 점프 방지)', () => {
    const convCss = readFileSync(CONVERSATION_CSS, 'utf-8')
    const mdCss = readFileSync(MARKDOWN_VIEW_CSS, 'utf-8')
    const smoothBlock = extractBlock(convCss, /\.smooth-markdown--plain\s+\.smooth-pre\s*\{/)
    const mdBlock = extractBlock(mdCss, /\.markdown-body\s*\{/)

    const smoothPad = smoothBlock.match(/padding:\s*([^;]+);/)?.[1]?.trim()
    const mdPad = mdBlock.match(/padding:\s*([^;]+);/)?.[1]?.trim()
    expect(smoothPad).toBeTruthy()
    expect(smoothPad).toBe(mdPad)
  })
})

// @vitest-environment jsdom
/**
 * stream-render-parity.test.tsx — FB1 Phase 01: 스트리밍/완료 렌더 정합 TDD.
 *
 * 실측 원인(01-stream-render-parity.md):
 *   1. Conversation.css `.smooth-markdown--plain .smooth-pre`가 `--font-serif`를
 *      사용(주석은 "sans로 재설정"이라 적혀 있지만 실제 값은 반대) — 완료 후
 *      MarkdownView.css `.markdown-body`(--font-ui = --font-sans)와 폰트가 갈린다.
 *   2. 두 규칙의 font-size(14px vs 13px)·line-height(1.7 vs 1.6)·padding(0 vs
 *      16px 20px)도 서로 다른 리터럴 — 완료 순간 크기·여백이 점프한다.
 *   3. plain 모드(`<pre>` + white-space:pre-wrap)는 원문의 모든 단일 개행을
 *      줄바꿈으로 보존하지만, 완료 후 react-markdown은 CommonMark 규칙대로
 *      단일 개행을 공백으로 접어 문단을 병합한다 — 개행 의미론이 다르다.
 *
 * reviewer 후속 지시(1차 통과 후 🟡, CRITICAL 0 + 필수보완 2건):
 *   1. [필수] foldSoftLinebreaks가 마크다운 구조를 모른 채 모든 단일 개행을 접어서
 *      리스트("- a\n- b")·펜스드 코드블록("```\nx\ny\n```")에 "없던 점프"를 새로
 *      만든다(스트리밍 중 "- a - b" 한 줄 → 완료 순간 리스트 2항목으로 스냅 등).
 *      → 블록 인지 가드 추가: 펜스 내부(미종결 포함) 개행 전부 보존 + 다음 줄이
 *      블록 마커(리스트/순서리스트/헤딩/인용/표/펜스)로 시작하면 그 개행 보존.
 *      여전히 줄 단위 단일 패스(O(n)) — AST 파싱 없음.
 *   2. [권장] CSS 소스 경로가 cwd 상대경로라 vitest 실행 위치에 의존적 —
 *      resolve(__dirname, ...)로 견고화(w7-time-bash.test.ts 기존 관례 미러).
 *
 * 검증:
 *   A. foldSoftLinebreaks 순수 함수 — 단일 개행 접기 / 문단 경계 보존 / 블록 가드.
 *   B. SmoothMarkdown plain 모드가 접힌 텍스트를 렌더(원문 그대로의 개행 미보존,
 *      단 리스트/코드펜스는 예외적으로 보존).
 *   C. CSS 소스 정합 — smooth-pre와 markdown-body가 동일 폰트/패딩 토큰 공유.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// 권장사항 2: vitest 실행 cwd가 아니라 이 테스트 파일 위치 기준 상대경로로 고정
// (w7-time-bash.test.ts:117,136 기존 관례 미러).
const CONVERSATION_CSS = resolve(__dirname, '../../../02.Source/renderer/src/components/01_conversation/Conversation.css')
const MARKDOWN_VIEW_CSS = resolve(__dirname, '../../../02.Source/renderer/src/components/01_conversation/MarkdownView.css')

// ── A. foldSoftLinebreaks 순수 함수 ────────────────────────────────────────────

describe('foldSoftLinebreaks — 순수 함수(마크다운 soft break 규칙)', () => {
  it('단일 개행은 공백 1개로 접힌다(같은 문단)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('1\n2\n3')).toBe('1 2 3')
  })

  it('개행 2개(빈 줄)는 문단 경계로 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('가\n\n나')).toBe('가\n\n나')
  })

  it('개행 3개 이상도 문단 경계 1개(개행 2개)로 정규화된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('가\n\n\n\n나')).toBe('가\n\n나')
  })

  it('개행이 없으면 원문 그대로', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('그대로')).toBe('그대로')
  })

  it('빈 문자열은 빈 문자열', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('')).toBe('')
  })

  it('혼합: 문단 내부 개행 접힘 + 문단 경계 보존 공존', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('1\n2\n\n3\n4')).toBe('1 2\n\n3 4')
  })
})

// ── A-2. foldSoftLinebreaks — 블록 인지 가드(reviewer 필수 보완) ───────────────

describe('foldSoftLinebreaks — 블록 인지 가드(리스트/펜스/인용/표는 접지 않음)', () => {
  it('불릿 리스트("- ")는 항목 사이 개행이 보존된다(병합 후 스냅 방지)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('- a\n- b')).toBe('- a\n- b')
  })

  it('불릿 리스트("* ", "+ ")도 동일하게 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('* a\n* b')).toBe('* a\n* b')
    expect(foldSoftLinebreaks('+ a\n+ b')).toBe('+ a\n+ b')
  })

  it('순서 리스트("1. ")는 항목 사이 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('1. a\n2. b')).toBe('1. a\n2. b')
  })

  it('헤딩("#") 앞 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('문단\n# 제목')).toBe('문단\n# 제목')
  })

  it('인용(">")은 줄 사이 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('> a\n> b')).toBe('> a\n> b')
  })

  it('표("|")는 행 사이 개행이 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('|a|b|\n|1|2|')).toBe('|a|b|\n|1|2|')
  })

  it('펜스드 코드블록(```)은 내부 개행이 전부 보존된다(완료 후 코드블록 스냅 방지)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('```\nx\ny\n```')).toBe('```\nx\ny\n```')
  })

  it('펜스드 코드블록 내부의 빈 줄도 접히거나 축약되지 않는다(문단 경계 규칙 미적용)', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('```\nx\n\ny\n```')).toBe('```\nx\n\ny\n```')
  })

  it('미종결 펜스(스트리밍 중 닫는 펜스 미도착)도 그 시점까지 전부 개행 보존', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('```\nx\ny')).toBe('```\nx\ny')
  })

  it('~~~ 펜스도 ``` 와 동일하게 인식된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('~~~\nx\ny\n~~~')).toBe('~~~\nx\ny\n~~~')
  })

  it('혼합: 산문은 여전히 접히고, 리스트로 진입한 뒤부터는 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('hello\nworld\n- item1\n- item2')).toBe('hello world\n- item1\n- item2')
  })

  it('혼합: 산문 문단 다음에 펜스드 코드블록이 와도 코드 내부는 보존된다', async () => {
    const { foldSoftLinebreaks } = await import('../../../02.Source/renderer/src/lib/softLinebreak')
    expect(foldSoftLinebreaks('설명\n텍스트\n```\ncode1\ncode2\n```')).toBe('설명 텍스트\n```\ncode1\ncode2\n```')
  })
})

// ── B. SmoothMarkdown 컴포넌트 — 개행 의미론 정합 ──────────────────────────────

/** RAF를 N프레임 동기 실행하는 mock 헬퍼 — reveal을 끝까지 진행시킨다(공통 추출). */
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

    const { SmoothMarkdown } = await import('../../../02.Source/renderer/src/components/01_conversation/SmoothMarkdown')
    const text = '1\n2\n3'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre).toBeTruthy()
    // 완료 후 렌더(react-markdown)라면 "1 2 3"(공백 접힘)이 될 텍스트 —
    // plain 모드도 동일해야 완료 순간 점프가 없다. 커서(span) 텍스트는 비어 있어 무관.
    expect(pre!.textContent).toBe('1 2 3')

    vi.restoreAllMocks()
  })

  it('running=true, 빈 줄(문단 경계)이 있는 텍스트는 그대로 두 줄로 보존됨', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02.Source/renderer/src/components/01_conversation/SmoothMarkdown')
    const text = '문단1\n\n문단2'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre!.textContent).toBe('문단1\n\n문단2')

    vi.restoreAllMocks()
  })

  it('running=true, 리스트 스트리밍 중에도 항목이 병합되지 않는다(완료 순간 리스트 스냅 방지)', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02.Source/renderer/src/components/01_conversation/SmoothMarkdown')
    const text = '- a\n- b'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    // 회귀 확인: "- a - b" 한 줄로 접히면 안 된다.
    expect(pre!.textContent).toBe('- a\n- b')

    vi.restoreAllMocks()
  })

  it('running=true, 펜스드 코드블록 스트리밍 중엔 내부 개행이 전부 보존된다(코드블록 스냅 방지)', async () => {
    mockRafFrames()

    const { SmoothMarkdown } = await import('../../../02.Source/renderer/src/components/01_conversation/SmoothMarkdown')
    const text = '```\ncode1\ncode2\n```'
    const { container } = await act(async () => render(<SmoothMarkdown text={text} running={true} />))

    const pre = container.querySelector('.smooth-pre')
    expect(pre!.textContent).toBe('```\ncode1\ncode2\n```')

    vi.restoreAllMocks()
  })
})

// ── C. CSS 소스 정합 — 폰트·패딩 토큰 공유(문자열 리터럴 이원화 회귀 방지) ──────

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
    // 회귀 확정: --font-serif가 아니어야 한다(실측 버그의 재발 방지)
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

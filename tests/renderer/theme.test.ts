// @vitest-environment jsdom
/**
 * theme.test.ts — F1-a 디자인시스템 토대 가드 (TDD RED 먼저).
 *
 * 검증 대상:
 *   1) lib/theme.ts — data-theme 적용 / 기본값 / localStorage 영속.
 *   2) theme/tokens.css — 원본 AgentCodeGUI OKLCH 듀얼테마 토큰 + 기존
 *      컴포넌트 CSS가 의존하는 옛 토큰명 호환 alias(마이그레이션 무파손) +
 *      radius 12px(충실도 타깃, ADR-014).
 *
 * 색은 CSS 변수 한 곳(tokens.css)에서만 — 인라인 색상 금지(헌법).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { applyTheme, getTheme, setTheme } from '../../src/renderer/src/lib/theme'

const css = readFileSync(
  join(process.cwd(), 'src', 'renderer', 'src', 'theme', 'tokens.css'),
  'utf-8'
)

describe('lib/theme — 테마 적용/영속', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('getTheme 기본값은 dark (현행 유지 — F6에서 원본 기본 정렬)', () => {
    expect(getTheme()).toBe('dark')
  })

  it('getTheme 은 저장된 유효 값을 반환한다', () => {
    localStorage.setItem('agentdeck.theme', 'light')
    expect(getTheme()).toBe('light')
  })

  it('잘못된 저장 값은 기본값으로 폴백한다', () => {
    localStorage.setItem('agentdeck.theme', 'rainbow')
    expect(getTheme()).toBe('dark')
  })

  it('applyTheme 은 <html> 의 data-theme 을 설정한다', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('applyTheme 인자 생략 시 getTheme 결과를 적용한다', () => {
    localStorage.setItem('agentdeck.theme', 'light')
    applyTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme 은 localStorage 영속 + 즉시 적용한다', () => {
    setTheme('light')
    expect(localStorage.getItem('agentdeck.theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

describe('tokens.css — OKLCH 듀얼테마', () => {
  it('OKLCH 색공간을 사용한다', () => {
    expect(css).toMatch(/oklch\(/)
  })

  it('다크 테마 셀렉터(:root[data-theme="dark"])가 존재한다', () => {
    expect(css).toContain(':root[data-theme="dark"]')
  })

  it('핵심 라이트 토큰이 정의된다 (--bg/--surface/--inset/--accent)', () => {
    for (const t of ['--bg:', '--surface:', '--inset:', '--accent:']) {
      expect(css).toContain(t)
    }
  })

  it('기능색 토큰이 정의된다 (--green/--red/--yellow/--blue)', () => {
    for (const t of ['--green:', '--red:', '--yellow:', '--blue:']) {
      expect(css).toContain(t)
    }
  })

  it('텍스트 강조 4단계가 정의된다 (--text ~ --text-4)', () => {
    for (const t of ['--text:', '--text-2:', '--text-3:', '--text-4:']) {
      expect(css).toContain(t)
    }
  })

  it('radius 가 12px (충실도 타깃)', () => {
    expect(css).toMatch(/--radius:\s*12px/)
  })

  it('소프트 윈도우 섀도우 토큰이 정의된다', () => {
    expect(css).toContain('--shadow-win:')
  })
})

describe('tokens.css — 옛 토큰명 호환 alias (마이그레이션 무파손)', () => {
  // 기존 컴포넌트 CSS가 참조하는 옛 이름 → 새 OKLCH 토큰으로 매핑.
  // F2~F6에서 컴포넌트를 원본 토큰명으로 재작성하면 alias는 제거된다.
  const aliases: Record<string, string> = {
    '--bg-0': '--bg',
    '--bg-1': '--surface',
    '--bg-2': '--surface-2',
    '--border': '--line',
    '--text-0': '--text',
    '--text-1': '--text-2',
    '--ok': '--green',
    '--del': '--red',
    '--run': '--yellow',
    '--font-ui': '--font-sans',
  }

  for (const [old, neu] of Object.entries(aliases)) {
    it(`${old} 가 ${neu} 로 매핑된다`, () => {
      const re = new RegExp(`${old}:\\s*var\\(${neu}\\)`)
      expect(css).toMatch(re)
    })
  }

  it('레이아웃 변수(--titlebar-h 등)는 보존된다', () => {
    for (const t of ['--titlebar-h', '--statusbar-h', '--pane-left-w', '--pane-right-w']) {
      expect(css).toContain(t)
    }
  })
})

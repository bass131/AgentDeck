// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { applyTheme, getTheme, setTheme } from '../../../02_Source/renderer/src/lib/theme'

const css = readFileSync(
  join(process.cwd(), '02_Source', 'renderer', 'src', 'theme', 'tokens.css'),
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

describe('tokens.css — Clay 듀얼테마', () => {
  it('Clay 액센트 + 입체/세리프/덱 토큰을 정의한다 (코랄/OKLCH 대체)', () => {
    expect(css).toMatch(/--accent:\s*#D97757/i)
    for (const t of ['--clay:', '--bevel:', '--recess:', '--font-serif:', '--deck-0:']) {
      expect(css).toContain(t)
    }
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

  it('radius 가 11px (클레이 라운드)', () => {
    expect(css).toMatch(/--radius:\s*11px/)
  })

  it('소프트 윈도우 섀도우 토큰이 정의된다', () => {
    expect(css).toContain('--shadow-win:')
  })
})

describe('tokens.css — 옛 토큰명 호환 alias (마이그레이션 무파손)', () => {
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

  it('셸 레이아웃 변수(타이틀바·4컬럼 폭)가 정의된다', () => {
    for (const t of ['--titlebar-h', '--statusbar-h', '--sidebar-w', '--explorer-w', '--agent-w', '--rail-w']) {
      expect(css).toContain(t)
    }
  })
})

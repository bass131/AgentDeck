import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../../../02_Project/00_Source/renderer/src', relPath), 'utf-8')
}

describe('FB2 P08② — LoopStatusBanner ↔ ContextStrip 폭 정합(토큰 공유)', () => {
  it('tokens.css가 --composer-max-w/--composer-pad-x를 정의한다', () => {
    const css = readSrc('02_Common/tokens.css')
    expect(css).toMatch(/--composer-max-w:\s*760px/)
    expect(css).toMatch(/--composer-pad-x:\s*28px/)
  })

  it('Composer.css(.composer-inner/.composer-wrap)가 리터럴이 아니라 공유 토큰을 참조한다', () => {
    const css = readSrc('05_Conversation/Composer.css')
    expect(css).toContain('max-width: var(--composer-max-w)')
    expect(css).toContain('var(--composer-pad-x)')
    expect(css).not.toMatch(/max-width:\s*760px/)
  })

  it('LoopStatusBanner.css(.conversation > .loop-indicator)가 같은 토큰으로 최종 폭을 계산한다', () => {
    const css = readSrc('03_Agent/LoopStatusBanner.css')
    expect(css).toContain('.conversation > .loop-indicator')
    expect(css).toContain('var(--composer-max-w)')
    expect(css).toContain('var(--composer-pad-x)')
  })

  it('멀티패널 변형(.ma-p-body 자식)은 이 폭 규칙의 영향을 받지 않는다 — 선택자가 .conversation 한정', () => {
    const css = readSrc('03_Agent/LoopStatusBanner.css')
    expect(css).not.toContain('.ma-p-body > .loop-indicator')
    expect(css).not.toContain('.ma-p-body .loop-indicator')
  })
})

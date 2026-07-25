/**
 * readLanguage.test.ts — GAP1 P01(a) 파일 확장자 → CodeViewer language 매핑 (순수).
 */
import { describe, it, expect } from 'vitest'
import { languageFromPath } from '../../../02.Source/renderer/src/lib/readLanguage'

describe('languageFromPath', () => {
  it('대표 확장자 매핑', () => {
    expect(languageFromPath('src/a.ts')).toBe('typescript')
    expect(languageFromPath('src/a.tsx')).toBe('typescript')
    expect(languageFromPath('src/a.js')).toBe('javascript')
    expect(languageFromPath('src/a.py')).toBe('python')
    expect(languageFromPath('pkg/data.json')).toBe('json')
    expect(languageFromPath('README.md')).toBe('markdown')
    expect(languageFromPath('index.html')).toBe('html')
    expect(languageFromPath('style.css')).toBe('css')
  })

  it('대소문자 무관', () => {
    expect(languageFromPath('src/A.TS')).toBe('typescript')
  })

  it('확장자 없음/미지원 → text(판별 실패 안전 폴백)', () => {
    expect(languageFromPath('Makefile')).toBe('text')
    expect(languageFromPath('src/a.unknown')).toBe('text')
    expect(languageFromPath('')).toBe('text')
  })
})

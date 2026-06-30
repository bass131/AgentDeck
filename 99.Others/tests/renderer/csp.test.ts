/**
 * csp.test.ts — index.html CSP 회귀 가드 (node env).
 *
 * TDD RED: 구현 전에 먼저 작성.
 * 신뢰경계: CSP가 올바른 정책을 유지하는지 자동 검증.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// index.html 읽기
const htmlPath = join(process.cwd(), '02.Source', 'renderer', 'index.html')
const html = readFileSync(htmlPath, 'utf-8')

// CSP meta 태그에서 content 추출
const cspMatch = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
const cspContent = cspMatch ? cspMatch[1] : ''

describe('CSP 회귀 가드', () => {
  it('CSP 메타 태그가 존재한다', () => {
    expect(cspMatch).toBeTruthy()
    expect(cspContent.length).toBeGreaterThan(0)
  })

  it('script-src 에 unsafe-inline 이 없다', () => {
    // script-src 'self' 만 허용 — unsafe-inline/eval 금지
    const scriptSrcMatch = cspContent.match(/script-src\s+([^;]+)/)
    if (scriptSrcMatch) {
      const scriptSrc = scriptSrcMatch[1]
      expect(scriptSrc).not.toContain('unsafe-inline')
      expect(scriptSrc).not.toContain('unsafe-eval')
    } else {
      // default-src 'self' 상속이면 script-src 없어도 되지만
      // 명시적 script-src가 없으면 통과하지 않도록 함
      expect(scriptSrcMatch).toBeTruthy()
    }
  })

  it('script-src 에 unsafe-eval 이 없다', () => {
    const scriptSrcMatch = cspContent.match(/script-src\s+([^;]+)/)
    if (scriptSrcMatch) {
      expect(scriptSrcMatch[1]).not.toContain('unsafe-eval')
    }
  })

  it('img-src 가 self 와 data: 만 허용한다', () => {
    const imgSrcMatch = cspContent.match(/img-src\s+([^;]+)/)
    if (imgSrcMatch) {
      const imgSrc = imgSrcMatch[1]
      // http/https 외부 이미지는 허용하지 않음
      expect(imgSrc).not.toContain('http:')
      expect(imgSrc).not.toContain('https:')
      // self와 data:는 포함
      expect(imgSrc).toContain("'self'")
      expect(imgSrc).toContain('data:')
    } else {
      // img-src 없으면 default-src 상속 — 이 경우 별도 검증 불필요하지만
      // 명시적으로 img-src data: 가 있어야 함
      expect(imgSrcMatch).toBeTruthy()
    }
  })

  it('img-src 에 http 외부 소스가 없다', () => {
    // http: 나 https: 가 있으면 원격 이미지 추적 가능해짐
    const imgSrcMatch = cspContent.match(/img-src\s+([^;]+)/)
    if (imgSrcMatch) {
      expect(imgSrcMatch[1]).not.toMatch(/https?:/)
    }
  })

  it("object-src 가 'none' 이다 — 플러그인/object-embedded SVG 차단", () => {
    // SVG는 <img>로만 미리보기. <object>/<embed> 경로를 CSP 레벨에서 봉쇄(심층방어).
    expect(cspContent).toContain("object-src 'none'")
  })

  it('connect-src 가 self 만 허용한다', () => {
    expect(cspContent).toContain('connect-src')
    const connectSrcMatch = cspContent.match(/connect-src\s+([^;]+)/)
    expect(connectSrcMatch).toBeTruthy()
    if (connectSrcMatch) {
      const connectSrc = connectSrcMatch[1]
      expect(connectSrc).toContain("'self'")
    }
  })

  it('connect-src 에 외부 도메인이 없다', () => {
    const connectSrcMatch = cspContent.match(/connect-src\s+([^;]+)/)
    if (connectSrcMatch) {
      // http 또는 https 외부 출처가 없어야 함
      expect(connectSrcMatch[1]).not.toMatch(/https?:/)
    }
  })
})

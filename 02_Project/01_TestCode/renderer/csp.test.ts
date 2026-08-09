import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const htmlPath = join(process.cwd(), '02_Project/00_Source', 'renderer', 'index.html')
const html = readFileSync(htmlPath, 'utf-8')

const cspMatch = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
const cspContent = cspMatch ? cspMatch[1] : ''

describe('CSP 회귀 가드', () => {
  it('CSP 메타 태그가 존재한다', () => {
    expect(cspMatch).toBeTruthy()
    expect(cspContent.length).toBeGreaterThan(0)
  })

  it('script-src 에 unsafe-inline 이 없다', () => {
    const scriptSrcMatch = cspContent.match(/script-src\s+([^;]+)/)
    if (scriptSrcMatch) {
      const scriptSrc = scriptSrcMatch[1]
      expect(scriptSrc).not.toContain('unsafe-inline')
      expect(scriptSrc).not.toContain('unsafe-eval')
    } else {
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
      expect(imgSrc).not.toContain('http:')
      expect(imgSrc).not.toContain('https:')
      expect(imgSrc).toContain("'self'")
      expect(imgSrc).toContain('data:')
    } else {
      expect(imgSrcMatch).toBeTruthy()
    }
  })

  it('img-src 에 http 외부 소스가 없다', () => {
    const imgSrcMatch = cspContent.match(/img-src\s+([^;]+)/)
    if (imgSrcMatch) {
      expect(imgSrcMatch[1]).not.toMatch(/https?:/)
    }
  })

  it("object-src 가 'none' 이다 — 플러그인/object-embedded SVG 차단", () => {
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
      expect(connectSrcMatch[1]).not.toMatch(/https?:/)
    }
  })
})

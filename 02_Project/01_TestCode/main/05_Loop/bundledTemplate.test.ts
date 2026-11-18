// M09 G2 템플릿 배선 — main이 program-dev.json을 번들(JSON import)로 싣고 loadTemplate에 넘긴다.
// 해시는 파싱한 값의 정규 직렬화라, 번들 값을 다시 직렬화해 넘겨도 파일 본문의 해시와 같아야 한다(재개 때 해시 대조가 깨지지 않게).
import { describe, expect, it } from 'vitest'
import { BUNDLED_TEMPLATE_ID, loadBundledTemplate } from '@main/05_Loop/bundledTemplate'
import { loadTemplate } from '@main/05_Loop/template'
import { programDevText } from '../00_Helpers/loopFakes'

describe('번들 템플릿', () => {
  it('스키마 검사를 통과하고 파일 본문과 같은 해시를 낸다', () => {
    const bundled = loadBundledTemplate()
    const fromFile = loadTemplate(programDevText())
    expect(bundled.ok && fromFile.ok).toBe(true)
    if (!bundled.ok || !fromFile.ok) return
    expect(bundled.template.id).toBe(BUNDLED_TEMPLATE_ID)
    expect(bundled.hash).toBe(fromFile.hash)
    expect(bundled.template).toEqual(fromFile.template)
  })

  it('부를 때마다 새 객체다 — 한 실행기가 고친 값이 다음 실행기에 새지 않는다', () => {
    const a = loadBundledTemplate()
    const b = loadBundledTemplate()
    if (!a.ok || !b.ok) throw new Error('번들 템플릿을 읽지 못했다')
    expect(a.template).not.toBe(b.template)
    a.template.nodes.length = 0
    expect(b.template.nodes.length).toBeGreaterThan(0)
  })
})

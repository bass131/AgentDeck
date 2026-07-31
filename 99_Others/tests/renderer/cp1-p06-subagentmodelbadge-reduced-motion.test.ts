import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function readCss(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}

describe('CP1 P06 ④ — SubAgentModelBadge.css reduced-motion opacity 폴백', () => {
  it('OrchestrationCard.css 선례: .orch-spinner reduced-motion에 opacity 폴백 존재(회귀 고정)', () => {
    const css = readCss('../../../02_Source/renderer/src/components/05_agent/OrchestrationCard.css')
    const reducedMotionBlocks = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const orchBlock = reducedMotionBlocks.find((b) => b.includes('.orch-spinner'))
    expect(orchBlock).toBeDefined()
    expect(orchBlock).toMatch(/opacity:\s*0\.6/)
  })

  it('SubAgentModelBadge.css의 .sa-model-badge.running .sa-model-dot reduced-motion 블록에 opacity 폴백 포함', () => {
    const css = readCss('../../../02_Source/renderer/src/components/05_agent/SubAgentModelBadge.css')
    const reducedMotionBlocks = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const badgeBlock = reducedMotionBlocks.find((b) => b.includes('.sa-model-badge.running .sa-model-dot'))
    expect(badgeBlock).toBeDefined()
    expect(badgeBlock).toMatch(/animation:\s*none/)
    expect(badgeBlock).toMatch(/opacity:\s*0\.6/)
  })
})

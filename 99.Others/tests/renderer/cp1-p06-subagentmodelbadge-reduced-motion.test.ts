/**
 * cp1-p06-subagentmodelbadge-reduced-motion.test.ts — CP1 Phase 06 ④:
 * SubAgentModelBadge.css reduced-motion에 opacity 폴백 추가.
 *
 * 배경(01.Phases/CP1-cwd-persist-sweep/06-backlog-sweep-renderer.md ④):
 * OrchestrationCard.css의 reduced-motion 블록(.orch-spinner)은 `animation: none` 외에
 * `opacity: 0.6`도 함께 줘서 "정지된 상태에서도 진행 중임을 흐릿하게" 표시한다.
 * SubAgentModelBadge.css의 .sa-model-badge.running .sa-model-dot reduced-motion
 * 블록은 animation만 끄고 opacity 폴백이 없어(선례와 비대칭) 모션이 꺼지면 도트가
 * 그냥 완전 불투명한 정적 점으로 보여 "실행 중" 신호가 사라진다. 선례와 동형으로
 * opacity: 0.6을 추가한다.
 *
 * CSS는 jsdom에서 media-query 계산이 불가하므로(선례: ux-fixes-bcd-e.test.tsx) 원본
 * CSS 텍스트를 읽어 구조 단언한다.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function readCss(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}

describe('CP1 P06 ④ — SubAgentModelBadge.css reduced-motion opacity 폴백', () => {
  it('OrchestrationCard.css 선례: .orch-spinner reduced-motion에 opacity 폴백 존재(회귀 고정)', () => {
    const css = readCss('../../../02.Source/renderer/src/components/05_agent/OrchestrationCard.css')
    const reducedMotionBlocks = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const orchBlock = reducedMotionBlocks.find((b) => b.includes('.orch-spinner'))
    expect(orchBlock).toBeDefined()
    expect(orchBlock).toMatch(/opacity:\s*0\.6/)
  })

  it('SubAgentModelBadge.css의 .sa-model-badge.running .sa-model-dot reduced-motion 블록에 opacity 폴백 포함', () => {
    const css = readCss('../../../02.Source/renderer/src/components/05_agent/SubAgentModelBadge.css')
    const reducedMotionBlocks = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const badgeBlock = reducedMotionBlocks.find((b) => b.includes('.sa-model-badge.running .sa-model-dot'))
    expect(badgeBlock).toBeDefined()
    expect(badgeBlock).toMatch(/animation:\s*none/)
    // OrchestrationCard.css 선례와 동형 — 같은 0.6 값(신규 값 발명 0)
    expect(badgeBlock).toMatch(/opacity:\s*0\.6/)
  })
})

// @vitest-environment jsdom
/**
 * tg1-p06-subagent-status-line.test.tsx — TG1 P06 표면 전파: SubAgentChatStream 상태 라인화.
 *
 * 배경(01.Phases/18_TG1-thinking-gui/06-surface-propagation.md (b)(c)): 서브에이전트
 * transcript는 완료된 과거 기록(라이브 아님)이라 StatusLine 컴포넌트(setInterval 경과초 틱 +
 * CSS 무한 spin/pulse 애니메이션)를 그대로 재사용하면 "지금 진행 중"이라는 거짓 신호가 된다.
 * 그래서 ✻ 심볼 + 사고 라벨의 시각 문법만 정적으로 채택한다(경과초·토큰 세그먼트는 P05
 * "데이터 원천 부재" 판정으로 애초에 없음 — 우아한 부재, 조용한 드롭 아님).
 *
 * 잠그는 계약:
 *   SL1: thinking 아이템 → .saf-msg--thinking 안에 정적 ✻ 심볼(.saf-status-symbol) + 텍스트.
 *   SL2: .saf-status-symbol에는 라이브 애니메이션 클래스(.status-line-symbol)가 붙지 않는다
 *        (거짓 신호 회피 — StatusLine.css의 전역 keyframes를 얹지 않기 위한 클래스 분리).
 *   SL3: 훅 배지(.hook-badge)·토큰 세그먼트가 서브에이전트 사고 버블에 전혀 렌더되지 않는다
 *        (P05 명시 보류 — 우아한 부재).
 *   SL4: 사고→응답 연속 연출(.saf-msg-continues/.saf-msg-continuation)은 그대로 유지된다
 *        (saf 연출 CSS 유지 결정 — 옵트인 shot p16-subagent-continuity 재베이스라인 불요).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'
import { SubAgentChatStream } from '../../../02.Source/renderer/src/components/05_agent/SubAgentChatStream'

afterEach(() => cleanup())

const agent: SubAgentInfo = {
  id: 'toolu_sa1',
  name: '탐색 에이전트',
  role: 'explorer',
  status: 'done',
  tools: [],
  transcript: [
    { kind: 'thinking', text: '파일 구조를 분석하는 중' },
    { kind: 'text', text: '분석을 마쳤습니다.' },
  ],
}

describe('SL1 — 정적 ✻ 심볼 + 사고 텍스트', () => {
  it('.saf-msg--thinking 안에 .saf-status-symbol(✻) + 사고 텍스트가 함께 렌더', () => {
    const { container } = render(<SubAgentChatStream agent={agent} />)
    const thinking = container.querySelector('.saf-msg--thinking')
    expect(thinking).toBeTruthy()
    const symbol = thinking!.querySelector('.saf-status-symbol')
    expect(symbol).toBeTruthy()
    expect(symbol!.textContent).toContain('✻')
    expect(thinking!.textContent).toContain('파일 구조를 분석하는 중')
  })
})

describe('SL2 — 라이브 애니메이션 클래스 미부착(거짓 신호 회피)', () => {
  it('.saf-status-symbol은 .status-line-symbol(라이브 spin/pulse 전용) 클래스를 갖지 않는다', () => {
    const { container } = render(<SubAgentChatStream agent={agent} />)
    const symbol = container.querySelector('.saf-status-symbol')
    expect(symbol).toBeTruthy()
    expect(symbol!.classList.contains('status-line-symbol')).toBe(false)
  })

  it('StatusLine 전용 data-testid(status-line)가 서브에이전트 표면엔 존재하지 않는다', () => {
    const { container } = render(<SubAgentChatStream agent={agent} />)
    expect(container.querySelector('[data-testid="status-line"]')).toBeNull()
  })
})

describe('SL3 — P05 우아한 부재: 훅 배지·토큰 세그먼트 미렌더', () => {
  it('사고 버블에 .hook-badge가 없다(서브 계약에 훅 귀속 데이터 자체가 없음 — P05 명시 보류)', () => {
    const { container } = render(<SubAgentChatStream agent={agent} />)
    const thinking = container.querySelector('.saf-msg--thinking')
    expect(thinking!.querySelector('.hook-badge')).toBeNull()
  })

  it('사고 버블에 토큰 세그먼트(status-line-meta류) 텍스트가 없다(estimatedTokens 데이터 부재)', () => {
    const { container } = render(<SubAgentChatStream agent={agent} />)
    const thinking = container.querySelector('.saf-msg--thinking')
    expect(thinking!.querySelector('.status-line-meta')).toBeNull()
  })
})

describe('SL4 — 연속 연출 CSS 클래스 유지(saf 연출 유지 결정)', () => {
  it('사고 다음이 응답이면 .saf-msg-continues/.saf-msg-continuation이 그대로 붙는다', () => {
    const { container } = render(<SubAgentChatStream agent={agent} />)
    expect(container.querySelector('.saf-msg--thinking.saf-msg-continues')).toBeTruthy()
    expect(container.querySelector('.saf-msg--agent.saf-msg-continuation')).toBeTruthy()
  })
})

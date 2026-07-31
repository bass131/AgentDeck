// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02_Source/renderer/src/lib/agentSampleData'
import { SubAgentChatStream } from '../../../02_Source/renderer/src/components/05_agent/SubAgentChatStream'

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

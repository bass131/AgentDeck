// @vitest-environment jsdom
/**
 * SubAgentInline.test.tsx — F-G 채팅 인라인 서브에이전트 카드 컴포넌트 (TDD)
 *
 * SI1: agent undefined → 미렌더(null)
 * SI2: running → aria-busy + 스피너 + 이름 + "실행 중"
 * SI3: done → 체크 + "완료"
 * SI4: 실행 중 도구 있으면 활동 표시(verb target)
 * SI5: 클릭 → onOpen(agent.id)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SubAgentInline } from '../../src/renderer/src/components/05_agent/SubAgentInline'
import type { SubAgentInfo } from '../../src/renderer/src/lib/agentSampleData'

afterEach(() => cleanup())

function mkAgent(over: Partial<SubAgentInfo> = {}): SubAgentInfo {
  return {
    id: 'sa-1',
    name: 'explorer',
    role: '코드 탐색',
    status: 'running',
    tools: [],
    ...over,
  }
}

describe('SubAgentInline', () => {
  it('SI1: agent undefined → 미렌더(null)', () => {
    const { container } = render(<SubAgentInline agent={undefined} onOpen={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('SI2: running → aria-busy + 스피너 + 이름 + "실행 중"', () => {
    const { container } = render(<SubAgentInline agent={mkAgent({ status: 'running' })} onOpen={() => {}} />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(container.querySelector('.spin')).not.toBeNull()
    expect(screen.getByText('explorer')).not.toBeNull()
    expect(screen.getByText(/실행 중/)).not.toBeNull()
  })

  it('SI3: done → "완료" 표시', () => {
    render(<SubAgentInline agent={mkAgent({ status: 'done' })} onOpen={() => {}} />)
    expect(screen.getByText(/완료/)).not.toBeNull()
  })

  it('SI4: 실행 중 도구 있으면 활동(verb target) 표시', () => {
    const agent = mkAgent({
      status: 'running',
      tools: [{ id: 't1', verb: 'read', target: 'src/app.ts', status: 'running' }],
    })
    render(<SubAgentInline agent={agent} onOpen={() => {}} />)
    expect(screen.getByText(/read/)).not.toBeNull()
    expect(screen.getByText(/src\/app\.ts/)).not.toBeNull()
  })

  it('SI5: 클릭 → onOpen(agent.id)', () => {
    const onOpen = vi.fn()
    render(<SubAgentInline agent={mkAgent({ id: 'sa-42' })} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('sa-42')
  })
})

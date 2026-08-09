// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SubAgentInline } from '../../../02_Project/00_Source/renderer/src/features/agent/SubAgentInline'
import type { SubAgentInfo } from '../../../02_Project/00_Source/renderer/src/lib/agentSampleData'

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

  it('SI6: model 있으면 compact 모델 배지 렌더(넘버링 포함, 축약 없음)', () => {
    const { container } = render(
      <SubAgentInline agent={mkAgent({ model: 'claude-sonnet-5' })} onOpen={() => {}} />
    )
    const badge = container.querySelector('.sa-model-badge.compact')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain('Sonnet 5')
  })

  it('SI7: model 없으면 배지 미렌더(기존 동작 비파괴)', () => {
    const { container } = render(<SubAgentInline agent={mkAgent()} onOpen={() => {}} />)
    expect(container.querySelector('.sa-model-badge')).toBeNull()
  })

  it('SI8: [NG-1] 이름(.sa-inline-name)=subagent_type 고정, role/model 배지와 절대 혼입되지 않음', () => {
    const agent = mkAgent({
      name: 'general-purpose',
      role: 'Sonnet 테스트 에이전트 1',
      model: 'claude-opus-4-8',
    })
    const { container } = render(<SubAgentInline agent={agent} onOpen={() => {}} />)
    const nameEl = container.querySelector('.sa-inline-name')
    const roleEl = container.querySelector('.sa-inline-role')
    const badgeEl = container.querySelector('.sa-model-badge')
    expect(nameEl?.textContent).toBe('general-purpose')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
    expect(badgeEl?.textContent).toContain('Opus 4.8')
    expect(nameEl?.textContent).not.toContain('Sonnet')
    expect(nameEl?.textContent).not.toContain('테스트')
    expect(nameEl?.textContent).not.toContain('Opus')
  })

  it('SI9: displayName 있으면 .sa-inline-name에 displayName 우선 노출(name 대신)', () => {
    const agent = mkAgent({ name: 'general-purpose', displayName: '소네트 테스트 에이전트 1' })
    const { container } = render(<SubAgentInline agent={agent} onOpen={() => {}} />)
    expect(container.querySelector('.sa-inline-name')?.textContent).toBe('소네트 테스트 에이전트 1')
  })

  it('SI9b: displayName 없으면 기존대로 name(subagent_type) 폴백(비파괴)', () => {
    const agent = mkAgent({ name: 'general-purpose', displayName: undefined })
    const { container } = render(<SubAgentInline agent={agent} onOpen={() => {}} />)
    expect(container.querySelector('.sa-inline-name')?.textContent).toBe('general-purpose')
  })

  it('SI10: [NG-1] displayName 표시 중에도 role/모델 배지와 혼입되지 않는다', () => {
    const agent = mkAgent({
      name: 'general-purpose',
      displayName: '소네트 테스트 에이전트 1',
      role: 'Sonnet 테스트 에이전트 1',
      model: 'claude-opus-4-8',
    })
    const { container } = render(<SubAgentInline agent={agent} onOpen={() => {}} />)
    const nameEl = container.querySelector('.sa-inline-name')
    const roleEl = container.querySelector('.sa-inline-role')
    const badgeEl = container.querySelector('.sa-model-badge')
    expect(nameEl?.textContent).toBe('소네트 테스트 에이전트 1')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
    expect(badgeEl?.textContent).toContain('Opus 4.8')
    expect(nameEl?.textContent).not.toContain('Opus')
  })

  it('SI11: 조기 별칭(model="opus", 버전 없음) → compact 배지 미렌더(모델 미확정 취급)', () => {
    const { container } = render(
      <SubAgentInline agent={mkAgent({ model: 'opus' })} onOpen={() => {}} />
    )
    expect(container.querySelector('.sa-model-badge')).toBeNull()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SubAgentModal } from '../../../02_Project/00_Source/renderer/src/features/agent/SubAgentModal'
import type { SubAgentInfo } from '../../../02_Project/00_Source/renderer/src/lib/agentSampleData'

afterEach(() => cleanup())

function mkAgent(over: Partial<SubAgentInfo> = {}): SubAgentInfo {
  return {
    id: 'sa-1',
    name: 'general-purpose',
    role: '코드 탐색',
    status: 'done',
    tools: [],
    ...over,
  }
}

describe('SM1 — agent=null → 미렌더', () => {
  it('null이면 아무것도 안 그림', () => {
    const { container } = render(<SubAgentModal agent={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SM2/SM3 — CP1 P07 displayName 소비 배선', () => {
  it('SM2: displayName 있으면 .sa-card-name에 displayName 우선 노출', () => {
    const { container } = render(
      <SubAgentModal agent={mkAgent({ displayName: '소네트 테스트 에이전트 1' })} onClose={() => {}} />
    )
    expect(container.querySelector('.sa-card-name')?.textContent).toBe('소네트 테스트 에이전트 1')
  })

  it('SM3: displayName 없으면 기존대로 name(subagent_type) 폴백(비파괴)', () => {
    const { container } = render(
      <SubAgentModal agent={mkAgent({ displayName: undefined })} onClose={() => {}} />
    )
    expect(container.querySelector('.sa-card-name')?.textContent).toBe('general-purpose')
  })
})

describe('SM4 — [NG-1] displayName 표시 중에도 role과 혼입되지 않는다', () => {
  it('.sa-card-name=displayName, .sa-card-role=role — 서로 섞이지 않음', () => {
    const agent = mkAgent({
      name: 'general-purpose',
      displayName: '소네트 테스트 에이전트 1',
      role: 'Sonnet 테스트 에이전트 1',
    })
    const { container } = render(<SubAgentModal agent={agent} onClose={() => {}} />)
    const nameEl = container.querySelector('.sa-card-name')
    const roleEl = container.querySelector('.sa-card-role')
    expect(nameEl?.textContent).toBe('소네트 테스트 에이전트 1')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
  })
})

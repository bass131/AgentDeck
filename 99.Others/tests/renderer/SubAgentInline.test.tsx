// @vitest-environment jsdom
/**
 * SubAgentInline.test.tsx — F-G 채팅 인라인 서브에이전트 카드 컴포넌트 (TDD)
 *
 * SI1: agent undefined → 미렌더(null)
 * SI2: running → aria-busy + 스피너 + 이름 + "실행 중"
 * SI3: done → 체크 + "완료"
 * SI4: 실행 중 도구 있으면 활동 표시(verb target)
 * SI5: 클릭 → onOpen(agent.id)
 * SI6: model 있으면 compact 모델 배지 렌더(영호 육안 피드백 2026-07-04 — 상세를 열지
 *      않아도 어떤 모델이 뛰는지 인라인 카드에서 보이게, SubAgentModelBadge 재사용)
 * SI7: model 없으면 배지 미렌더(기존 동작 비파괴)
 * SI8: NG-1 회귀 잠금(2026-07-04 영호 재육안) — 이름(.sa-inline-name)=subagent_type 고정,
 *      role(.sa-inline-role)/model 배지와 혼입 금지. 영호가 실제로 목격한 문자열을
 *      role에 재현해 name과 절대 섞이지 않음을 잠근다(claude-stream.ts:315-322 실증,
 *      renderer 쪽 합성 지점 0 — 본 파일이 그 렌더 계약을 고정).
 * SI9: CP1 P07 displayName 소비 배선(CP1 렌더러 후속) — displayName 있으면 .sa-inline-name에
 *      displayName 우선 노출(subagent_type 대신). displayName 없으면 SI8처럼 name 폴백.
 * SI10: SI9 + NG-1 동시 확인 — displayName이 표시돼도 role/모델 배지와는 여전히 혼입되지
 *      않는다(표시 우선순위 전환일 뿐 합성 아님).
 * SI11: 조기 별칭 배지 UX(CP1 렌더러 후속) — model이 버전 없는 조기 별칭('opus')이면
 *      compact 배지 자체가 미렌더(모델 미확정 취급, isBareModelAlias 가드).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SubAgentInline } from '../../../02.Source/renderer/src/components/05_agent/SubAgentInline'
import type { SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'

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
    // name에 role/모델 텍스트가 섞여 들어가지 않는다(합성 금지).
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
    // displayName 표시가 role/모델 텍스트를 흡수하지 않는다(합성 여전히 금지).
    expect(nameEl?.textContent).not.toContain('Opus')
  })

  it('SI11: 조기 별칭(model="opus", 버전 없음) → compact 배지 미렌더(모델 미확정 취급)', () => {
    const { container } = render(
      <SubAgentInline agent={mkAgent({ model: 'opus' })} onOpen={() => {}} />
    )
    expect(container.querySelector('.sa-model-badge')).toBeNull()
  })
})

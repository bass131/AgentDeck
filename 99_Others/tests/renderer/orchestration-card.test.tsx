// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OrchestrationCard } from '../../../02_Source/renderer/src/components/05_agent/OrchestrationCard'

if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).api) {
  (window as unknown as Record<string, unknown>).api = {}
}

afterEach(() => cleanup())

describe('OrchestrationCard', () => {
  it('OC1: running=true → aria-busy + progress 스피너 표시', () => {
    const { container } = render(
      <OrchestrationCard
        id="wf1"
        name="my-flow"
        running={true}
      />
    )
    const busy = container.querySelector('[aria-busy="true"]') ??
                 container.querySelector('[role="progressbar"]') ??
                 container.querySelector('.orch-spinner, .progress-circle, .spin, .dots')
    expect(busy).not.toBeNull()
  })

  it('OC1-b: running=true → "UltraCode 실행 중" 텍스트 포함', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name="my-flow"
        running={true}
      />
    )
    expect(screen.getByText(/UltraCode 실행 중/)).not.toBeNull()
  })

  it('OC2: running=false, failed=false → 완료 표시', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name="my-flow"
        running={false}
        failed={false}
        result="완료 결과"
      />
    )
    expect(screen.getByText(/완료/)).not.toBeNull()
  })

  it('OC3: running=false, failed=true → 실패 표시', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name="my-flow"
        running={false}
        failed={true}
        result="오류"
      />
    )
    expect(screen.getByText(/실패/)).not.toBeNull()
  })

  it('OC4: 카드 클릭 → 풀스크린 열림 + phases/result 렌더', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name="my-flow"
        running={false}
        failed={false}
        phases={['Phase1', 'Phase2']}
        result="최종 결과"
      />
    )
    const card = screen.getByRole('button')
    fireEvent.click(card)
    expect(screen.getByText('Phase1')).not.toBeNull()
    expect(screen.getByText('Phase2')).not.toBeNull()
    expect(screen.getByText('최종 결과')).not.toBeNull()
  })

  it('OC5: 풀스크린 Esc → 닫힘', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name="my-flow"
        running={false}
        phases={['Phase1']}
        result="결과"
      />
    )
    const card = screen.getByRole('button')
    fireEvent.click(card)
    expect(screen.getByText('Phase1')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Phase1')).toBeNull()
  })

  it('OC6: name 빈 문자열 → "UltraCode" fallback 표시', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name=""
        running={true}
      />
    )
    expect(screen.getByText(/UltraCode/)).not.toBeNull()
  })

  it('OC7: agents 있으면 카드 본문에 작업 done/total 요약', () => {
    const { container } = render(
      <OrchestrationCard
        id="wf1"
        name="flow"
        running={true}
        agents={[
          { label: 'a', phase: 'Probe', state: 'done' },
          { label: 'b', phase: 'Probe', state: 'running' },
        ]}
      />
    )
    expect(container.querySelector('.orch-live-line')?.textContent).toContain('1/2')
  })

  it('OC8: 풀스크린 → 라이브 작업 목록(라벨·상태) 렌더 + 한계 안내 미표시', () => {
    render(
      <OrchestrationCard
        id="wf1"
        name="flow"
        running={true}
        livePhases={['Probe']}
        agents={[{ label: 'probe', phase: 'Probe', state: 'done', resultPreview: 'WORKFLOW_RESULT_OK' }]}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('probe')).not.toBeNull()
    expect(screen.getByText('WORKFLOW_RESULT_OK')).not.toBeNull()
    expect(screen.queryByText(/라이브 내부 진행은 표시되지 않습니다/)).toBeNull()
  })

  it('OC9: 라이브 데이터 없으면 한계 안내 표시(폴백)', () => {
    render(<OrchestrationCard id="wf1" name="flow" running={true} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/라이브 내부 진행은 표시되지 않습니다/)).not.toBeNull()
  })
})

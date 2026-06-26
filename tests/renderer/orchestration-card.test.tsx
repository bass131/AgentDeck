// @vitest-environment jsdom
/**
 * orchestration-card.test.tsx — OrchestrationCard 컴포넌트 단위 테스트 (TDD)
 *
 * 검증:
 *   OC1: running=true → aria-busy + 스피너(progress-circle) + "UltraCode 실행 중" 텍스트
 *   OC2: running=false, failed=false → 완료 표시(체크 아이콘 또는 "완료")
 *   OC3: running=false, failed=true → 실패 표시
 *   OC4: 클릭 → 풀스크린 열림 (phases/result 포함)
 *   OC5: 풀스크린 Esc → 닫힘
 *   OC6: name 없으면 'UltraCode' fallback 표시
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OrchestrationCard } from '../../src/renderer/src/components/OrchestrationCard'

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
    // aria-busy 또는 role=progressbar/status
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
    // 풀스크린 열림
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
    // 열려 있음
    expect(screen.getByText('Phase1')).not.toBeNull()

    // Esc → 닫힘
    fireEvent.keyDown(document, { key: 'Escape' })
    // Phase1은 풀스크린 내부에만 있으므로 닫히면 사라짐
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
    // 이름 없으면 'UltraCode'만 표시
    expect(screen.getByText(/UltraCode/)).not.toBeNull()
  })

  // ── F-C: 라이브 진행 렌더링 ──────────────────────────────────────────────────

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
    // 작업 라벨 + 결과 미리보기 표시
    expect(screen.getByText('probe')).not.toBeNull()
    expect(screen.getByText('WORKFLOW_RESULT_OK')).not.toBeNull()
    // 라이브 데이터 있으면 "엔진 한계"류 안내 미표시
    expect(screen.queryByText(/라이브 내부 진행은 표시되지 않습니다/)).toBeNull()
  })

  it('OC9: 라이브 데이터 없으면 한계 안내 표시(폴백)', () => {
    render(<OrchestrationCard id="wf1" name="flow" running={true} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/라이브 내부 진행은 표시되지 않습니다/)).not.toBeNull()
  })
})

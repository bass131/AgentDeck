// @vitest-environment jsdom
/**
 * cmdresult-render.test.tsx — M6 CmdResultCard 렌더 단위 테스트.
 *
 * TDD: 이 파일이 먼저 FAIL → 구현 후 PASS.
 *
 * 검증:
 *   (1) running=true → 스피너(dots) 표시
 *   (2) running=false, failed=false → 완료 제목 표시
 *   (3) running=false, failed=true → 실패 제목 표시
 *   (4) sub 텍스트 표시
 *   (5) time 표시
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CmdResultCard } from '../../src/renderer/src/components/CmdResultCard'

// window.api mock (renderer 단위 테스트 환경)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof window !== 'undefined' && !(window as any).api) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).api = {}
}

afterEach(() => cleanup())

describe('CmdResultCard — 렌더', () => {
  it('running=true → 스피너(dots) 표시', () => {
    const { container } = render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="대화를 요약하는 중…"
        running={true}
        sub={null}
        time="오전 10:00"
      />
    )
    // 스피너 클래스 또는 role=progressbar 기대
    expect(container.querySelector('.cmd-spinner, .dots, [role="progressbar"]')).not.toBeNull()
  })

  it('running=true → running 제목 표시', () => {
    render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="대화를 요약하는 중…"
        running={true}
        sub={null}
        time="오전 10:00"
      />
    )
    expect(screen.getByText('대화를 요약하는 중…')).toBeTruthy()
  })

  it('running=false, failed=false → 완료 제목 표시', () => {
    render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="대화를 요약했어요"
        running={false}
        sub="이전 3개 메시지를 핵심 요약으로 압축했습니다."
        time="오전 10:00"
      />
    )
    expect(screen.getByText('대화를 요약했어요')).toBeTruthy()
  })

  it('sub 텍스트 표시', () => {
    render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="대화를 요약했어요"
        running={false}
        sub="이전 3개 메시지를 핵심 요약으로 압축했습니다."
        time="오전 10:00"
      />
    )
    expect(screen.getByText('이전 3개 메시지를 핵심 요약으로 압축했습니다.')).toBeTruthy()
  })

  it('running=false, failed=true → 실패 카드 클래스 적용', () => {
    const { container } = render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="명령을 완료하지 못했어요"
        running={false}
        failed={true}
        sub="네트워크 오류"
        time="오전 10:00"
      />
    )
    // failed 상태 카드에 failed 클래스
    expect(container.querySelector('.cmd-result-card.failed, .cmd-result-card--failed, [data-failed="true"]')).not.toBeNull()
  })

  it('실패 제목 표시', () => {
    render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="명령을 완료하지 못했어요"
        running={false}
        failed={true}
        sub="네트워크 오류"
        time="오전 10:00"
      />
    )
    expect(screen.getByText('명령을 완료하지 못했어요')).toBeTruthy()
  })

  it('time 표시', () => {
    render(
      <CmdResultCard
        id="cmd1"
        name="compact"
        title="대화를 요약했어요"
        running={false}
        sub={null}
        time="오전 10:00"
      />
    )
    expect(screen.getByText('오전 10:00')).toBeTruthy()
  })
})

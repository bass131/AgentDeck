// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CmdResultCard } from '../../../02_Project/00_Source/renderer/src/features/conversation/CmdResultCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof window !== 'undefined' && !(window as any).api) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {}
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

// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { copyForOrchestrationDenied } from '../../../02_Source/renderer/src/lib/orchestrationDeniedCopy'

afterEach(() => cleanup())

describe('orchestration_denied 시스템 라인 — NoticeItem 재사용 표시', () => {
  it('deny 카피가 .notice-row(.notice-ic + .notice-text)로 렌더되고 assistant 말풍선 클래스가 없다', async () => {
    const { NoticeItem } = await import(
      '../../../02_Source/renderer/src/components/01_conversation/Conversation'
    )
    const text = copyForOrchestrationDenied('orchestration-off')
    const { container } = render(<NoticeItem text={text} />)

    expect(container.querySelector('.notice-row')).toBeTruthy()
    expect(container.querySelector('.notice-ic')).toBeTruthy()
    expect(container.querySelector('.notice-text')).toBeTruthy()
    expect(screen.getByText(text)).toBeTruthy()

    expect(container.querySelector('.msg')).toBeFalsy()
    expect(container.querySelector('.ai-msg')).toBeFalsy()
  })

  it('알 수 없는 reason의 기본 카피도 동일한 시스템 라인 구조로 렌더된다', async () => {
    const { NoticeItem } = await import(
      '../../../02_Source/renderer/src/components/01_conversation/Conversation'
    )
    const text = copyForOrchestrationDenied('unknown-reason-xyz')
    const { container } = render(<NoticeItem text={text} />)

    expect(container.querySelector('.notice-row')).toBeTruthy()
    expect(container.querySelector('.msg')).toBeFalsy()
  })
})

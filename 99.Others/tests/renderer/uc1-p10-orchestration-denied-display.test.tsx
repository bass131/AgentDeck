// @vitest-environment jsdom
/**
 * uc1-p10-orchestration-denied-display.test.tsx — UC1 Phase 10: orchestration_denied
 * 시스템 라인 표시 컴포넌트 검증.
 *
 * 표시는 기존 model-fallback과 동일한 notice 관례(NoticeItem, Conversation.tsx export)를
 * 재사용한다 — 새 컴포넌트/새 시각 문법을 신설하지 않는다.
 *
 * 검증: 발화 주체 혼동 방지 — 시스템 라인(.notice-row)이 assistant 말풍선(.msg.ai-msg)과
 * 다른 클래스/DOM 구조로 렌더되어 "모델이 말한 것"처럼 보이지 않는다.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { copyForOrchestrationDenied } from '../../../02.Source/renderer/src/lib/orchestrationDeniedCopy'

afterEach(() => cleanup())

describe('orchestration_denied 시스템 라인 — NoticeItem 재사용 표시', () => {
  it('deny 카피가 .notice-row(.notice-ic + .notice-text)로 렌더되고 assistant 말풍선 클래스가 없다', async () => {
    const { NoticeItem } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/Conversation'
    )
    const text = copyForOrchestrationDenied('orchestration-off')
    const { container } = render(<NoticeItem text={text} />)

    // 시스템 라인 관례(경고색 notice-row) — model-fallback과 동일 DOM.
    expect(container.querySelector('.notice-row')).toBeTruthy()
    expect(container.querySelector('.notice-ic')).toBeTruthy()
    expect(container.querySelector('.notice-text')).toBeTruthy()
    expect(screen.getByText(text)).toBeTruthy()

    // 발화 주체 혼동 방지: assistant 말풍선(.msg/.ai-msg) 클래스가 이 트리에 없어야 한다.
    expect(container.querySelector('.msg')).toBeFalsy()
    expect(container.querySelector('.ai-msg')).toBeFalsy()
  })

  it('알 수 없는 reason의 기본 카피도 동일한 시스템 라인 구조로 렌더된다', async () => {
    const { NoticeItem } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/Conversation'
    )
    const text = copyForOrchestrationDenied('unknown-reason-xyz')
    const { container } = render(<NoticeItem text={text} />)

    expect(container.querySelector('.notice-row')).toBeTruthy()
    expect(container.querySelector('.msg')).toBeFalsy()
  })
})

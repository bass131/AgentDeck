// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MessageBubble } from '../../../02_Project/00_Source/renderer/src/features/conversation/MessageBubble'

afterEach(() => cleanup())

describe('MB1 — assistant 기본 아바타 = Claude Spark', () => {
  it('bare 미지정 → .ava.ai.ava-spark 안에 공식 로고 img', () => {
    const { container } = render(<MessageBubble role="assistant" content="답변" />)
    const ava = container.querySelector('.ava.ai.ava-spark')
    expect(ava).toBeTruthy()
    expect(ava!.querySelector('img')).toBeTruthy()
  })
})

describe('MB2 — bare=true → 아바타 생략', () => {
  it('bare=true → .ava가 렌더되지 않는다', () => {
    const { container } = render(<MessageBubble role="assistant" content="답변" bare />)
    expect(container.querySelector('.ava')).toBeNull()
  })
})

describe('MB3 — bare여도 .meta/.hook-badge는 유지', () => {
  it('bare=true + hookBadge=true → .msg.ai-msg .meta .hook-badge 렌더', () => {
    const { container } = render(
      <MessageBubble role="assistant" content="답변" bare hookBadge />,
    )
    expect(container.querySelector('.msg.ai-msg .meta .hook-badge')).toBeTruthy()
    expect(container.querySelector('.ava')).toBeNull()
  })
})

describe('MB4 — user 역할은 영향 없음(회귀 0)', () => {
  it('user 역할 bare 지정해도 기존 .ava.user 그대로', () => {
    const { container } = render(<MessageBubble role="user" content="질문" bare />)
    expect(container.querySelector('.ava.user')).toBeTruthy()
  })
})

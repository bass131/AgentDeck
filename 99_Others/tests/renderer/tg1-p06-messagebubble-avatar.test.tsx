// @vitest-environment jsdom
/**
 * tg1-p06-messagebubble-avatar.test.tsx — TG1 P06 표면 전파: MessageBubble 아바타 배선.
 *
 * 배경(01.Phases/18_TG1-thinking-gui/06-surface-propagation.md): MessageBubble은 멀티패널·
 * 서브에이전트 표면의 화자 아바타 단일 소유지(01-scout-report.md §1.5) — 여기 한 곳을
 * 바꾸면 두 표면 모두 자동 전파된다("공유 리프에 넣으면 표면이 공짜로 는다"). 설계 결정:
 * ② 기본값 Claude Spark + IconClaude 폴백 분기 보존(옵션① prop 주입 대신) — MessageBubble이
 * store 비접근 순수 리프 원칙을 유지하면서도 호출부 3곳(PanelView/SubAgentChatStream×2)이
 * 매번 같은 신호를 계산해 넘기는 중복을 피하기 위함.
 *
 * 잠그는 계약:
 *   MB1: assistant 기본 렌더 → 공식 로고(Claude Spark, .ava.ai.ava-spark img).
 *   MB2: bare=true → 아바타 자체(.ava)가 렌더되지 않는다.
 *   MB3: bare=true여도 .meta/.hook-badge는 그대로 유지된다(패널 훅 배지 shot 회귀 방지).
 *   MB4: user 역할은 bare/스파크 로직 영향 없음(회귀 0).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MessageBubble } from '../../../02.Source/renderer/src/components/01_conversation/MessageBubble'

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

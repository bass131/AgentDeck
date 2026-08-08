// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { PendingPermission } from '../../../02_Source/renderer/src/store/reducer'

afterEach(() => cleanup())

const PLAN_MD =
  '# Plan: Print Hello\n\n## Context\nThe user wants to print "hello" to the console.\n\n## Implementation\n1. Output "hello" to the console\n'

const PLAN_PENDING: PendingPermission = {
  runId: 'run-p07',
  requestId: 'req-p07',
  toolName: 'ExitPlanMode',
  summary: 'ExitPlanMode 실행',
  planReview: {
    plan: PLAN_MD,
    planFilePath: 'C:\\Users\\bass1\\.claude\\plans\\you-are-in-plan.md',
  },
}

const PLAN_PENDING_EMPTY: PendingPermission = {
  runId: 'run-p07e',
  requestId: 'req-p07e',
  toolName: 'ExitPlanMode',
  summary: 'ExitPlanMode 실행',
  planReview: { plan: '', planFilePath: undefined },
}

const CARD_PATH = '../../../02_Source/renderer/src/features/notice'

describe('GAP1 P07 — PermissionCard plan 전용 모드 렌더 (RED)', () => {
  it('planReview != null → .perm-card 에 data-plan-mode 판별자 부여', async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={vi.fn()} />)
    const card = container.querySelector('.perm-card')
    expect(card).toBeTruthy()
    expect(card?.hasAttribute('data-plan-mode')).toBe(true)
  })

  it('planReview.plan 본문(마크다운) 제목 "Plan: Print Hello"가 DOM에 노출된다(접힘이면 토글 후)', async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={vi.fn()} />)
    const toggle = container.querySelector('[data-plan-toggle]') as HTMLElement | null
    if (toggle) fireEvent.click(toggle)
    expect(container.textContent).toContain('Plan: Print Hello')
  })
})

describe('GAP1 P07 — PermissionCard plan 액션 세트 (RED)', () => {
  it("액션은 '실행 승인'/'계속 계획' 2개뿐 — allow_always 버튼 없음", async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={vi.fn()} />)

    const allowBtn = container.querySelector('[data-perm-choice="allow"]')
    const denyBtn = container.querySelector('[data-perm-choice="deny"]')
    expect(allowBtn).toBeTruthy()
    expect(denyBtn).toBeTruthy()

    expect(allowBtn?.textContent).toContain('실행 승인')
    expect(denyBtn?.textContent).toContain('계속 계획')

    expect(container.querySelector('[data-perm-choice="allow_always"]')).toBeFalsy()
  })

  it("'실행 승인' 클릭 → onRespond('allow')", async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={onRespond} />)
    const allowBtn = container.querySelector('[data-perm-choice="allow"]') as HTMLElement
    expect(allowBtn.textContent).toContain('실행 승인')
    fireEvent.click(allowBtn)
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it("'계속 계획' 클릭 → onRespond('deny')", async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={onRespond} />)
    const denyBtn = container.querySelector('[data-perm-choice="deny"]') as HTMLElement
    expect(denyBtn.textContent).toContain('계속 계획')
    fireEvent.click(denyBtn)
    expect(onRespond).toHaveBeenCalledWith('deny')
  })
})

describe('GAP1 P07 — PermissionCard plan 본문 미확보 fallback (RED)', () => {
  it("planReview 있으나 plan이 빈 문자열 → '계획 본문을 가져올 수 없음' 노출", async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const { container } = render(<PermissionCard pending={PLAN_PENDING_EMPTY} onRespond={vi.fn()} />)
    expect(container.textContent).toContain('계획 본문을 가져올 수 없음')
  })
})

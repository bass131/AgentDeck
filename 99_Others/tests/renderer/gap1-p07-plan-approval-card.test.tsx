// @vitest-environment jsdom
/**
 * gap1-p07-plan-approval-card.test.tsx — GAP1 P07 Plan 모드 승인 카드 RED(TDD 선행).
 *
 * 대상(R only, qa는 앱 소스 미편집):
 *   02.Source/renderer/src/components/07_notice/PermissionCard.tsx
 *   02.Source/renderer/src/store/reducer/types.ts (PendingPermission)
 *
 * 계약(interface-of-record — 구현 renderer Worker가 여기 맞춘다):
 *   - 판별자: pending.planReview != null → 카드가 plan 전용 모드로 렌더.
 *     · 카드 루트 .perm-card 에 data-plan-mode 속성 부여(머신 판별 훅).
 *   - 본문: pending.planReview.plan 이 마크다운 렌더(제목 텍스트 'Plan: Print Hello'가 DOM에 존재).
 *     · 접힘/펼침 토글이 있으면 [data-plan-toggle] 클릭 후 본문 노출(기본 접힘/펼침에 견고).
 *   - 액션 2개(plan 모드엔 allow_always 없음):
 *     · [data-perm-choice="allow"] 텍스트에 '실행 승인' → 클릭 시 onRespond('allow').
 *     · [data-perm-choice="deny"]  텍스트에 '계속 계획' → 클릭 시 onRespond('deny').
 *     · [data-perm-choice="allow_always"] 는 존재하지 않음.
 *   - fallback: planReview는 있으나 plan이 빈/undefined → '계획 본문을 가져올 수 없음' 노출.
 *
 * TDD 상태: RED. 현행 PermissionCard는 planReview를 무시하고 summary + 3버튼
 *   (허용/항상 허용/거부)만 렌더한다. PendingPermission에 planReview? 필드가 아직 없어
 *   타입 에러(RED)가 날 수 있음 — 그것도 정상(구현이 필드 추가).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { PendingPermission } from '../../../02.Source/renderer/src/store/reducer'

afterEach(() => cleanup())

// 계획 본문(마크다운) — 제목은 fixture(probe-3-exitplan-input.json)와 동일 형상.
const PLAN_MD =
  '# Plan: Print Hello\n\n## Context\nThe user wants to print "hello" to the console.\n\n## Implementation\n1. Output "hello" to the console\n'

// summary는 일부러 generic('ExitPlanMode 실행') — 계획 제목 텍스트가 summary가 아니라
// planReview.plan(본문 렌더)에서만 나와야 함을 보장(가짜 통과 방지).
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

// plan은 있으나 본문 미확보(빈 문자열) — fallback 상태 검증용.
const PLAN_PENDING_EMPTY: PendingPermission = {
  runId: 'run-p07e',
  requestId: 'req-p07e',
  toolName: 'ExitPlanMode',
  summary: 'ExitPlanMode 실행',
  planReview: { plan: '', planFilePath: undefined },
}

const CARD_PATH = '../../../02.Source/renderer/src/components/07_notice/PermissionCard'

describe('GAP1 P07 — PermissionCard plan 전용 모드 렌더 (RED)', () => {
  it('planReview != null → .perm-card 에 data-plan-mode 판별자 부여', async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={vi.fn()} />)
    const card = container.querySelector('.perm-card')
    expect(card).toBeTruthy()
    // 현행 카드는 이 속성을 부여하지 않음 → RED.
    expect(card?.hasAttribute('data-plan-mode')).toBe(true)
  })

  it('planReview.plan 본문(마크다운) 제목 "Plan: Print Hello"가 DOM에 노출된다(접힘이면 토글 후)', async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={vi.fn()} />)
    // 접힘 상태일 수 있으므로 토글 컨트롤이 있으면 펼친다(기본 접힘/펼침 하드단정 회피).
    const toggle = container.querySelector('[data-plan-toggle]') as HTMLElement | null
    if (toggle) fireEvent.click(toggle)
    // summary('ExitPlanMode 실행')엔 이 텍스트가 없으므로, 본문 렌더가 있어야만 통과 → RED.
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

    // plan 모드 라벨(현행은 '허용'/'거부' → RED).
    expect(allowBtn?.textContent).toContain('실행 승인')
    expect(denyBtn?.textContent).toContain('계속 계획')

    // plan 모드엔 3번째 '항상 허용' 버튼이 없어야 한다(현행 3버튼 → RED).
    expect(container.querySelector('[data-perm-choice="allow_always"]')).toBeFalsy()
  })

  it("'실행 승인' 클릭 → onRespond('allow')", async () => {
    const { PermissionCard } = await import(CARD_PATH)
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={PLAN_PENDING} onRespond={onRespond} />)
    const allowBtn = container.querySelector('[data-perm-choice="allow"]') as HTMLElement
    // 라벨 계약도 함께 검증(RED 유발점) — 텍스트가 '실행 승인'이어야 한다.
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

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { PendingPermission } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import { PermissionCard } from '../../../02_Project/00_Source/renderer/src/features/notice'

afterEach(() => cleanup())

const PLAN_MD = '# Plan: Trim Path\n\n1. basename만 표시\n'

function mkPlanPending(planFilePath: string): PendingPermission {
  return {
    runId: 'run-p15-s2',
    requestId: 'req-p15-s2',
    toolName: 'ExitPlanMode',
    summary: 'ExitPlanMode 실행',
    planReview: { plan: PLAN_MD, planFilePath },
  }
}

const WIN_PATH = 'C:\\Users\\bass1\\.claude\\plans\\you-are-in-plan.md'
const POSIX_PATH = '/home/bass1/.claude/plans/unix-style-plan.md'

describe('GAP1 P15-R1 S2 — planFilePath 표시는 basename만 (RED)', () => {
  it('Windows 절대경로 → 표시 텍스트는 basename(you-are-in-plan.md)뿐', () => {
    const { container } = render(
      <PermissionCard pending={mkPlanPending(WIN_PATH)} onRespond={vi.fn()} />
    )
    const pathEl = container.querySelector('.perm-card-plan-path')
    expect(pathEl).toBeTruthy()
    expect(pathEl?.textContent).toBe('you-are-in-plan.md')
  })

  it('POSIX 절대경로 → 표시 텍스트는 basename(unix-style-plan.md)뿐 (`/` 구분자도 처리)', () => {
    const { container } = render(
      <PermissionCard pending={mkPlanPending(POSIX_PATH)} onRespond={vi.fn()} />
    )
    const pathEl = container.querySelector('.perm-card-plan-path')
    expect(pathEl).toBeTruthy()
    expect(pathEl?.textContent).toBe('unix-style-plan.md')
  })

  it('title 속성엔 전체 경로 유지(호버 확인 — 정보 손실 0, 현행 GREEN 회귀 핀)', () => {
    const { container } = render(
      <PermissionCard pending={mkPlanPending(WIN_PATH)} onRespond={vi.fn()} />
    )
    const pathEl = container.querySelector('.perm-card-plan-path')
    expect(pathEl?.getAttribute('title')).toBe(WIN_PATH)
  })
})

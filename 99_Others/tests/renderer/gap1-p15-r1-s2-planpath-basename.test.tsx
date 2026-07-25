// @vitest-environment jsdom
/**
 * gap1-p15-r1-s2-planpath-basename.test.tsx — GAP1 P15 라운드1 시드 S2 RED.
 *
 * 결함(라운드 0 시드 — dogfood 관찰 B): PermissionCard plan 토글의 경로 라벨
 * (`.perm-card-plan-path`, PermissionCard.tsx:175-179)이 planFilePath **전체 절대경로**를
 * 그대로 노출한다 — 긴 Windows 경로가 토글 한 줄을 점령해 계획 제목/토글 라벨을 밀어낸다.
 *
 * 기대 스펙(interface-of-record — 봉합은 renderer Worker):
 *   - 표시 텍스트 = basename만 (`\`·`/` 구분자 모두 지원 — Windows/POSIX 양쪽).
 *   - title 속성 = 전체 경로 유지(호버로 전체 경로 확인 가능 — 정보 손실 0).
 *
 * TDD 상태: RED 2건(win/posix 표시 텍스트) + title 유지 단정은 현행도 GREEN(회귀 핀).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { PendingPermission } from '../../../02.Source/renderer/src/store/reducer'
import { PermissionCard } from '../../../02.Source/renderer/src/components/07_notice/PermissionCard'

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
    // 현행: 전체 경로 노출 → RED. 봉합: basename만.
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

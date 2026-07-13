/**
 * gap1-p02-permission-reclassify.test.ts — GAP1 P02(b) 태스크 종료 도구 MUTATING 재분류(TDD)
 *
 * 실측 결함: permissionCoordinator의 READONLY_TOOLS에 TaskStop·TaskOutput가 있어
 *   TaskStop(백그라운드 태스크/셸 **종료** — 부수효과 있음)이 자동 허용됐다. MUTATING_TOOLS엔
 *   stale 이름 KillBash만 있고 신형 이름 KillShell이 없어 새 SDK가 이 이름으로 보고하면
 *   조용히 게이트를 우회한다. BashOutput(조회, 부수효과 없음)은 MUTATING에 잘못 들어있었다.
 *
 * SDK 정본 확인(sdk-tools.d.ts:628 TaskStopInput — "The ID of the background task to stop")
 *   + sdk.mjs 런타임 alias 테이블(`Mj`): KillShell/KillBash → TaskStop(같은 종료 도구의 구·신
 *   이름), BashOutput/AgentOutput/BashOutputTool/AgentOutputTool → TaskOutput(같은 조회 도구의
 *   구 이름). 즉 BashOutput은 SDK 자체가 TaskOutput의 별칭으로 취급하는 조회 전용 도구 —
 *   READONLY 재분류가 정합.
 *
 * 판정은 공개 API(makeCanUseTool)의 관찰가능한 거동으로만 단정한다 — Set을 직접 참조하지
 * 않음(ADR-003 어댑터 내부 격리 유지, 이 파일도 permissionCoordinator.test.ts와 같은 패턴).
 *   - MUTATING 판정 ⇔ normal 모드에서 permission_request가 push됨(자동 allow 아님).
 *   - READONLY 판정 ⇔ push 없이 즉시 allow.
 */

import { describe, it, expect } from 'vitest'
import { PermissionCoordinator } from '../../../02.Source/main/01_agents/permissionCoordinator'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

function mk(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

describe('GAP1 P02(b) — TaskStop/KillShell/KillBash MUTATING 재분류', () => {
  it('TaskStop(normal) → permission_request push(자동 allow 아님)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('TaskStop', { task_id: 't1' })
    expect(pushed.length).toBe(1)
    expect((pushed[0] as { type: string }).type).toBe('permission_request')
    // 대기 중인 요청을 정리(누수 방지) — allow로 해제.
    coord.respond((pushed[0] as { requestId: string }).requestId, {
      kind: 'permission',
      behavior: 'allow',
    })
    const r = await p
    expect(r.behavior).toBe('allow')
  })

  it('KillShell(normal, 신형 SDK 이름) → permission_request push(구 게이트 우회 금지)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('KillShell', { shell_id: 's1' })
    expect(pushed.length).toBe(1)
    expect((pushed[0] as { type: string }).type).toBe('permission_request')
    coord.respond((pushed[0] as { requestId: string }).requestId, {
      kind: 'permission',
      behavior: 'deny',
    })
    const r = await p
    expect(r.behavior).toBe('deny')
  })

  it('KillBash(normal, 구형 호환 alias) → 여전히 permission_request push(회귀 방지)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('KillBash', { shell_id: 's1' })
    expect(pushed.length).toBe(1)
    expect((pushed[0] as { type: string }).type).toBe('permission_request')
    coord.respond((pushed[0] as { requestId: string }).requestId, {
      kind: 'permission',
      behavior: 'deny',
    })
    await p
  })

  it('TaskStop(acceptEdits) → 여전히 발화(MUTATING이라 acceptEdits 자동허용에서 제외, L281 회귀 없음)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('acceptEdits', () => false)
    const p = canUse('TaskStop', { task_id: 't1' })
    expect(pushed.length).toBe(1)
    expect((pushed[0] as { type: string }).type).toBe('permission_request')
    coord.respond((pushed[0] as { requestId: string }).requestId, {
      kind: 'permission',
      behavior: 'deny',
    })
    await p
  })

  // reviewer 🟡 봉합(GAP1 P02): 최고 위험 신규 항목 KillShell의 acceptEdits 경로 회귀 락.
  // 변경 전 KillShell은 READONLY·MUTATING 어느 집합에도 없어 acceptEdits 분기(L298
  // `mode==='acceptEdits' && toolName!=='Bash' && !MUTATING_TOOLS.has(toolName)`)를 타고
  // 조용히 자동허용됐다. MUTATING 편입 후엔 그 분기를 빠져 step5 `_requestPermission`으로
  // 직행해야 한다 — TaskStop(acceptEdits) 케이스를 정본 패턴으로 미러한다.
  it('KillShell(acceptEdits, 신형 SDK 이름) → 여전히 발화(자동허용 금지, MUTATING 편입 효과 step5 검증)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('acceptEdits', () => false)
    const p = canUse('KillShell', { shell_id: 's1' })
    expect(pushed.length).toBe(1)
    expect((pushed[0] as { type: string }).type).toBe('permission_request')
    coord.respond((pushed[0] as { requestId: string }).requestId, {
      kind: 'permission',
      behavior: 'deny',
    })
    await p
  })
})

describe('GAP1 P02(b) — TaskOutput READONLY 유지(조회 도구, 회귀 없음)', () => {
  it('TaskOutput(normal) → push 없이 즉시 allow', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const r = await canUse('TaskOutput', { task_id: 't1' })
    expect(r.behavior).toBe('allow')
    expect(pushed).toEqual([])
  })
})

describe('GAP1 P02(b) — BashOutput 조회 분류 정리(결정: READONLY, SDK가 TaskOutput 별칭으로 취급)', () => {
  it('BashOutput(normal) → push 없이 즉시 allow(조회 도구, 부수효과 없음)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const r = await canUse('BashOutput', { bash_id: 'b1' })
    expect(r.behavior).toBe('allow')
    expect(pushed).toEqual([])
  })

  it('BashOutput(acceptEdits) → push 없이 즉시 allow(READONLY는 acceptEdits 분기보다 먼저 판정)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('acceptEdits', () => false)
    const r = await canUse('BashOutput', { bash_id: 'b1' })
    expect(r.behavior).toBe('allow')
    expect(pushed).toEqual([])
  })
})

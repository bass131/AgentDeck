import { describe, it, expect } from 'vitest'
import { PermissionCoordinator } from '../../../02_Project/00_Source/main/01_agents/permissionCoordinator'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

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

// M06 G3 — 가드가 물은 호출(훅 ask)은 모드와 관계없이 승인 카드로 간다.
// 픽스처의 모양은 2단계 실측(SDK 0.3.201, 독립 clone)에서 canUseTool이 실제로 받은 인자다.
//   훅 ask: decisionReason = 훅의 permissionDecisionReason 원문, suggestions 없음 (default·acceptEdits·bypassPermissions·실행 중 auto 넷 다)
//   일반 질의: suggestions(addRules 등)가 붙어 온다 (acceptEdits의 `git config`, default의 `mkdir`)
// 공개 타입(sdk.d.ts의 CanUseTool)의 options에는 훅 유래를 알리는 필드가 없으므로, 판별은 「사유가 있고 규칙 제안이 없는 질의」로 한다.
import { describe, it, expect } from 'vitest'
import { PermissionCoordinator } from '@main/04_Claude/permission/permissionCoordinator'
import type { AgentEvent } from '../../../../02_Project/00_Source/shared/agentEvents'

const GUARD_REASON =
  '비가역 작업 — master가 보이는 git push (master 진입 시도). 승인하면 실행되고, 거부하면 실행되지 않습니다.'
const LONG_CMD =
  'git -c core.quotepath=false -c color.ui=never -c advice.pushUpdateRejected=false push --verbose --no-progress origin HEAD:master'

type Opts = Parameters<ReturnType<PermissionCoordinator['makeCanUseTool']>>[2] & Record<string, unknown>

function guardOpts(): Opts {
  return {
    signal: new AbortController().signal,
    toolUseID: 'toolu_guard',
    requestId: 'req-guard',
    decisionReason: GUARD_REASON,
    displayName: 'Bash',
    description: 'Push current branch HEAD to master on origin',
  }
}

function ordinaryOpts(): Opts {
  return {
    signal: new AbortController().signal,
    toolUseID: 'toolu_plain',
    requestId: 'req-plain',
    suggestions: [
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'git config *' }], behavior: 'allow', destination: 'localSettings' },
    ],
    decisionReason: 'This command requires approval',
    displayName: 'Bash',
  }
}

type PermReq = Extract<AgentEvent, { type: 'permission_request' }> & { askReason?: string }

function mk(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

function onlyRequest(pushed: AgentEvent[]): PermReq {
  const reqs = pushed.filter((e) => e.type === 'permission_request') as PermReq[]
  expect(reqs).toHaveLength(1)
  return reqs[0]
}

describe('가드 질문 — 모드와 관계없이 카드 경로', () => {
  for (const mode of ['auto', 'bypass', 'acceptEdits', 'normal']) {
    it(`mode=${mode}: 가드 ask Bash → permission_request(askReason=가드 사유), 거부하면 deny`, async () => {
      const { coord, pushed } = mk()
      const canUse = coord.makeCanUseTool(mode, () => false)
      const p = canUse('Bash', { command: 'git push origin HEAD:master' }, guardOpts())
      const req = onlyRequest(pushed)
      expect(req.toolName).toBe('Bash')
      expect(req.askReason).toBe(GUARD_REASON)
      coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
      const r = await p
      expect(r.behavior).toBe('deny')
    })
  }

  it('실행 중 모드 전환으로 auto가 된 뒤에도(getter) 가드 ask는 카드로 간다', async () => {
    const { coord, pushed } = mk()
    let mode = 'normal'
    const canUse = coord.makeCanUseTool(() => mode, () => false)
    mode = 'auto'
    const p = canUse('Bash', { command: 'git push origin HEAD:master' }, guardOpts())
    const req = onlyRequest(pushed)
    expect(req.askReason).toBe(GUARD_REASON)
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })

  it('READONLY 분기보다 먼저 본다 — 사유 있고 제안 없는 Read 질의도 auto에서 카드로 간다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', () => false)
    const p = canUse('Read', { file_path: '/x' }, guardOpts())
    const req = onlyRequest(pushed)
    expect(req.askReason).toBe(GUARD_REASON)
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })

  it('알려진 오탐 갈래: 민감 파일 안전 검사(suggestions: [])도 auto에서 카드로 간다 — 안전한 쪽으로 넘친다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', () => false)
    const reason = 'Claude requested permissions to edit C:\\repo\\.claude\\x.txt which is a sensitive file.'
    const p = canUse('Write', { file_path: 'C:\\repo\\.claude\\x.txt' }, {
      signal: new AbortController().signal, toolUseID: 't', suggestions: [], decisionReason: reason,
    } as Opts)
    const req = onlyRequest(pushed)
    expect(req.askReason).toBe(reason)
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })
})

describe('가드가 묻지 않는 호출 — 모드대로', () => {
  for (const mode of ['auto', 'bypass']) {
    it(`mode=${mode}: 규칙 제안이 붙은 일반 질의 → 카드 없이 allow`, async () => {
      const { coord, pushed } = mk()
      const canUse = coord.makeCanUseTool(mode, () => false)
      const r = await canUse('Bash', { command: 'git config --local g3.probe 1' }, ordinaryOpts())
      expect(r).toEqual({ behavior: 'allow', updatedInput: { command: 'git config --local g3.probe 1' } })
      expect(pushed).toEqual([])
    })

    it(`mode=${mode}: 사유 없는 호출(옵션에 decisionReason 없음) → 카드 없이 allow`, async () => {
      const { coord, pushed } = mk()
      const canUse = coord.makeCanUseTool(mode, () => false)
      const r = await canUse('Bash', { command: 'git status' }, { signal: new AbortController().signal, toolUseID: 't' })
      expect(r.behavior).toBe('allow')
      expect(pushed).toEqual([])
    })
  }

  it('mode=normal: 일반 질의 카드에는 askReason이 없다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: 'git config --local g3.probe 1' }, ordinaryOpts())
    const req = onlyRequest(pushed)
    expect(req.askReason).toBeUndefined()
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })
})

describe('가드 질문 카드의 내용', () => {
  it('Bash 명령을 자르지 않는다 — 긴 명령의 push·master가 요약에 남는다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: LONG_CMD }, guardOpts())
    const req = onlyRequest(pushed)
    expect(req.summary).toContain(LONG_CMD)
    expect(req.summary).toContain('push')
    expect(req.summary).toContain('HEAD:master')
    expect(req.askReason).toContain('master')
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })

  it('여러 줄 명령도 줄바꿈을 지우지 않고 그대로 싣는다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', () => false)
    const cmd = 'git fetch\ngit push origin HEAD:master'
    const p = canUse('Bash', { command: cmd }, guardOpts())
    const req = onlyRequest(pushed)
    expect(req.summary).toContain(cmd)
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })

  it('일반 Bash 카드의 80자 요약은 그대로다(가드 질문만 전문)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: LONG_CMD }, ordinaryOpts())
    const req = onlyRequest(pushed)
    expect(req.summary).not.toContain('HEAD:master')
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    await p
  })
})

describe('가드 질문에는 「항상 허용」이 없다 — 코디네이터에서도 집행', () => {
  it('가드 질문 카드에 allow_always가 와도 세션 규칙(addRules)을 내지 않고 이번 한 번만 허용한다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', () => false)
    const p = canUse('Bash', { command: 'git push origin HEAD:master' }, guardOpts())
    const req = onlyRequest(pushed)
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow_always' })
    const r = await p
    expect(r).toEqual({ behavior: 'allow', updatedInput: { command: 'git push origin HEAD:master' } })
    expect((r as { updatedPermissions?: unknown[] }).updatedPermissions).toBeUndefined()
  })

  it('일반 질의의 allow_always는 지금처럼 세션 규칙을 낸다', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: 'git config --local g3.probe 1' }, ordinaryOpts())
    const req = onlyRequest(pushed)
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow_always' })
    const r = await p
    expect((r as { updatedPermissions?: unknown[] }).updatedPermissions).toBeDefined()
  })
})

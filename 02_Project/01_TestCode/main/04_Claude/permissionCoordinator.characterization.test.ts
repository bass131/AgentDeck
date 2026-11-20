// M07 G2 판정 특성 테스트 — 권한 콜백을 노드 등록부로 옮기기 전 코드의 판정을 고정한다.
// 기대값은 옮기기 전 `makeCanUseTool`의 분기 순서를 그대로 적은 명세 함수(expected)다.
// 이 테스트는 옮기기 전 코드에서 먼저 통과했고(G2 검증 기록), 옮긴 뒤에도 고치지 않고 통과해야 한다.
import { describe, it, expect } from 'vitest'
import { PermissionCoordinator, type CanUseToolOptions } from '@main/04_Claude/permission/permissionCoordinator'
import type { AgentEvent } from '@shared/agentEvents'

const MODES = ['normal', 'plan', 'acceptEdits', 'auto', 'bypass', undefined] as const
const SUGGESTION = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }
const OPTION_VARIANTS: Record<string, CanUseToolOptions | undefined> = {
  none: undefined,
  suggested: { toolUseID: 't', suggestions: [SUGGESTION] },
  emptySuggestions: { toolUseID: 't', suggestions: [] },
  reasonOnly: { toolUseID: 't', decisionReason: '가드 사유' },
  reasonSuggested: { toolUseID: 't', decisionReason: '가드 사유', suggestions: [SUGGESTION] },
  blankReason: { toolUseID: 't', decisionReason: '   ' },
}

type Outcome =
  | { kind: 'allow' }
  | { kind: 'orchestration-denied' }
  | { kind: 'question' }
  | { kind: 'card'; escalated: boolean; askReason?: string }

const READONLY = new Set(['Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'BashOutput'])
const MUTATING = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'TaskStop', 'KillShell', 'KillBash'])
// 두 묶음의 전 구성원과, 묶음 밖 도구를 함께 돌린다 — 묶음에서 하나가 빠지면 판정이 바뀌어 표가 빨개진다 (G2 검수 2).
const TOOLS = ['AskUserQuestion', 'Workflow', 'ExitPlanMode', 'mcp__x__y', ...READONLY, ...MUTATING]

// 옮기기 전 분기 순서의 명세 (permissionCoordinator.ts 150~181행, master ffdfc8a5)
function expected(tool: string, mode: string | undefined, opts: CanUseToolOptions | undefined, orchestration: boolean): Outcome {
  if (tool === 'AskUserQuestion') return { kind: 'question' }
  if (tool === 'Workflow') return orchestration ? { kind: 'card', escalated: false } : { kind: 'orchestration-denied' }
  const s = opts?.suggestions
  if (!(Array.isArray(s) && s.length > 0)) {
    const r = opts?.decisionReason
    return typeof r === 'string' && r.trim() !== '' ? { kind: 'card', escalated: true, askReason: r } : { kind: 'card', escalated: true }
  }
  if (mode === 'auto' || mode === 'bypass') return { kind: 'allow' }
  if (READONLY.has(tool)) return { kind: 'allow' }
  if (mode === 'acceptEdits' && tool !== 'Bash' && !MUTATING.has(tool)) return { kind: 'allow' }
  return { kind: 'card', escalated: false }
}

const INPUT: Record<string, unknown> = {
  command: 'git status',
  file_path: 'a.txt',
  questions: [{ question: 'q?', options: [{ label: 'A' }] }],
}

async function observe(tool: string, mode: string | undefined, opts: CanUseToolOptions | undefined, orchestration: boolean): Promise<Outcome> {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  const canUse = coord.makeCanUseTool(mode, () => orchestration)
  const pending = canUse(tool, INPUT, opts)
  await Promise.resolve()
  await Promise.resolve()
  const ev = pushed[0] as (AgentEvent & Record<string, unknown>) | undefined
  if (ev?.type === 'permission_request') {
    coord.respond(String(ev['requestId']), { kind: 'permission', behavior: 'deny' })
    await pending
    return {
      kind: 'card',
      escalated: ev['escalated'] === true,
      ...(ev['askReason'] !== undefined ? { askReason: String(ev['askReason']) } : {}),
    }
  }
  if (ev?.type === 'question_request') {
    coord.respond(String(ev['requestId']), { kind: 'question', answers: null })
    await pending
    return { kind: 'question' }
  }
  const result = await pending
  if (ev?.type === 'orchestration_denied' && result.behavior === 'deny') return { kind: 'orchestration-denied' }
  expect(pushed).toHaveLength(0)
  expect(result.behavior).toBe('allow')
  return { kind: 'allow' }
}

describe('권한 콜백 판정 특성 (M07 G2 — 노드 이관 전후 동일)', () => {
  for (const orchestration of [false, true]) {
    for (const tool of TOOLS) {
      for (const mode of MODES) {
        for (const [variant, opts] of Object.entries(OPTION_VARIANTS)) {
          it(`orch=${orchestration} ${tool} mode=${String(mode)} opts=${variant}`, async () => {
            expect(await observe(tool, mode, opts, orchestration)).toEqual(expected(tool, mode, opts, orchestration))
          })
        }
      }
    }
  }

  it('실행 중 모드 전환(getter)도 판정 때의 모드를 읽는다', async () => {
    let mode = 'normal'
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const canUse = coord.makeCanUseTool(() => mode, () => false)
    mode = 'auto'
    const r = await canUse('Bash', INPUT, OPTION_VARIANTS.suggested)
    expect(r.behavior).toBe('allow')
    expect(pushed).toHaveLength(0)
  })

  it('오케스트레이션 여부는 Workflow 호출에서만 읽는다', async () => {
    let reads = 0
    const coord = new PermissionCoordinator(() => {})
    const canUse = coord.makeCanUseTool('auto', () => { reads++; return false })
    await canUse('Bash', INPUT, OPTION_VARIANTS.suggested)
    await canUse('Read', INPUT, OPTION_VARIANTS.suggested)
    expect(reads).toBe(0)
    await canUse('Workflow', INPUT, OPTION_VARIANTS.suggested)
    expect(reads).toBe(1)
  })

  it('cancelAll은 대기 중인 카드를 거부로, 질문을 건너뜀 안내로 끝낸다', async () => {
    const coord = new PermissionCoordinator(() => {})
    const canUse = coord.makeCanUseTool('normal', () => false)
    const card = canUse('Bash', INPUT, OPTION_VARIANTS.suggested)
    const ask = canUse('AskUserQuestion', INPUT, undefined)
    await Promise.resolve()
    coord.cancelAll()
    expect(await card).toEqual({ behavior: 'deny', message: '사용자가 거부했습니다.' })
    const a = await ask
    expect(a.behavior === 'deny' && a.message).toContain('건너뛰었습니다')
  })

  it('카드 대기 중 중단 신호가 오면 거부로 끝난다', async () => {
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const ac = new AbortController()
    const pending = coord.makeCanUseTool('normal', () => false)('Bash', INPUT, { signal: ac.signal, toolUseID: 't', suggestions: [SUGGESTION] })
    await Promise.resolve()
    expect(pushed[0]?.type).toBe('permission_request')
    ac.abort()
    expect(await pending).toEqual({ behavior: 'deny', message: '사용자가 거부했습니다.' })
  })

  it('질문 대기 중 중단 신호가 오면 건너뜀 안내로 끝난다', async () => {
    const coord = new PermissionCoordinator(() => {})
    const ac = new AbortController()
    const pending = coord.makeCanUseTool('normal', () => false)('AskUserQuestion', INPUT, { signal: ac.signal })
    await Promise.resolve()
    ac.abort()
    const r = await pending
    expect(r.behavior).toBe('deny')
    expect(r.behavior === 'deny' && r.message).toContain('건너뛰었습니다')
  })

  it('ExitPlanMode 허용은 acceptEdits로 착지시키고, 일반 질의의 항상 허용은 세션 규칙을 더한다', async () => {
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('ExitPlanMode', { plan: '# 계획' }, { toolUseID: 't', suggestions: [SUGGESTION] })
    await Promise.resolve()
    coord.respond(String((pushed[0] as unknown as Record<string, unknown>)['requestId']), { kind: 'permission', behavior: 'allow_always' })
    expect(await p).toEqual({
      behavior: 'allow',
      updatedInput: { plan: '# 계획' },
      updatedPermissions: [
        { type: 'addRules', rules: [{ toolName: 'ExitPlanMode' }], behavior: 'allow', destination: 'session' },
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ],
    })
  })
})

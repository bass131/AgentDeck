// M11 G3 — M07 Backlog 13. 노드마다 메모리 안의 최근 판정 고리(상한, 입력 요약은 비밀을 가림). 파일로 남기지 않는다.
import { describe, it, expect, beforeEach } from 'vitest'
import { recordVerdict, recentVerdicts, verdictCounts, clearVerdicts, withVerdictLog, VERDICT_RING, VERDICT_INPUT_MAX } from '@main/04_Claude/permission/verdictLog'
import { runPermissionNodes, PERMISSION_NODES, type ControlNode } from '@main/04_Claude/permission/controlNodes'
import { buildClaudeSdkOptions } from '@main/04_Claude/sdkOptions'

beforeEach(() => clearVerdicts())

const ctx = (toolName: string, input: Record<string, unknown> = {}, mode = 'default') => ({
  toolName, input, mode, orchestration: false, options: { toolUseID: 't', suggestions: [{ type: 'addRules' }] },
})

describe('노드 판정 기록 (M11 G3)', () => {
  it('[M11-G3 M07-13] 권한 콜백 노드가 정하면 그 노드에 시각·입력 요약·결과가 한 줄 쌓인다 — 지나친 노드는 쌓지 않는다', () => {
    runPermissionNodes(ctx('Read', { file_path: 'C:/r/a.ts' }))
    const rows = recentVerdicts('readonly-allow')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ nodeId: 'readonly-allow', tool: 'Read', result: 'allow' })
    expect(rows[0].input).toContain('a.ts')
    expect(typeof rows[0].at).toBe('number')
    expect(recentVerdicts('ask-question')).toEqual([])
    expect(verdictCounts()).toEqual({ 'readonly-allow': 1 })
  })

  it('[M11-G3 M07-13] 노드가 던져 막은 판정도 사유와 함께 남는다', () => {
    const boom: ControlNode = { ...PERMISSION_NODES[0], id: 'boom', decide: () => { throw new Error('x') } }
    expect(runPermissionNodes(ctx('Bash', { command: 'ls' }), [boom]).kind).toBe('deny')
    expect(recentVerdicts('boom')[0]).toMatchObject({ result: 'deny', tool: 'Bash' })
    expect(recentVerdicts('boom')[0].reason).toContain('판정하지 못해')
  })

  it('[M11-G3 M07-13] 고리는 노드마다 상한까지만 — 넘치면 오래된 것부터 버린다', () => {
    for (let i = 0; i < VERDICT_RING + 5; i++) recordVerdict('n', 'Bash', { command: `echo ${i}` }, 'allow')
    const rows = recentVerdicts('n')
    expect(rows).toHaveLength(VERDICT_RING)
    expect(rows[0].input).toContain('echo 5')
    expect(verdictCounts()['n']).toBe(VERDICT_RING)
  })

  it('[M11-G3 M07-13] 입력 요약은 자격 증명을 가리고 길이를 자른다', () => {
    recordVerdict('n', 'Bash', { command: `git push https://u:ghp_secret@github.com/o/r.git ${'x'.repeat(500)}` }, 'deny', '막음')
    const [row] = recentVerdicts('n')
    expect(row.input).not.toContain('ghp_secret')
    expect(row.input).toContain('***@')
    expect(row.input.length).toBeLessThanOrEqual(VERDICT_INPUT_MAX)
  })

  it('[M11-G3 M07-13] 조립된 훅(병합 거부·엔진 경로 잠금)의 거부도 그 노드에 남고, 통과는 남지 않는다', async () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [{ role: 'user', content: 'x' }] },
      abortController: new AbortController(),
      canUseTool: async () => ({ behavior: 'deny', message: '' }),
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: async () => ({ behavior: 'deny' }) as never,
      userDataDir: 'C:\\Users\\x\\AppData\\Roaming\\agentdeck',
    }) as { hooks: { PreToolUse: { hooks: ((i: unknown) => Promise<unknown>)[] }[] } }
    const callAll = async (command: string): Promise<void> => {
      for (const m of opts.hooks.PreToolUse) for (const h of m.hooks) await h({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
    }
    await callAll('gh pr merge 1')
    await callAll('rm -rf C:/Users/x/AppData/Roaming/agentdeck/engines')
    await callAll('git status')
    expect(recentVerdicts('merge-deny').map((r) => r.result)).toEqual(['deny'])
    expect(recentVerdicts('merge-deny')[0]).toMatchObject({ tool: 'Bash' })
    expect(recentVerdicts('merge-deny')[0].input).toContain('gh pr merge 1')
    expect(recentVerdicts('engine-path-bash-lock').map((r) => r.result)).toEqual(['deny'])
    expect(Object.values(verdictCounts()).reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('[M11-G3 M07-13] 감싼 훅은 원래 훅의 출력과 칸을 그대로 둔다', async () => {
    const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'r' } }
    const matcher = { hooks: [async (_input: unknown) => out], timeout: 5, onFailure: 'block' as const }
    const wrapped = withVerdictLog('w', matcher)
    expect(wrapped.timeout).toBe(5)
    expect(wrapped.onFailure).toBe('block')
    expect(await wrapped.hooks[0]({ tool_name: 'Bash', tool_input: { command: 'x' } })).toBe(out)
    expect(recentVerdicts('w')[0]).toMatchObject({ result: 'deny', reason: 'r' })
  })
})

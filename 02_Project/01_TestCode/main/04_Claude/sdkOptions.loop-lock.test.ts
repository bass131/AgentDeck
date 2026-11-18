// M09 G2 — 루프 잠금 노드와 자격 없는 환경은 실행 입력에 loopLock·env가 있을 때만 SDK 옵션에 실린다.
// 일반 앱 세션(그 칸이 없는 입력)에는 잠금 훅이 붙지 않고 환경도 그대로다.
import { describe, it, expect } from 'vitest'
import { buildClaudeSdkOptions } from '@main/04_Claude/sdkOptions'
import type { AgentRunInput } from '@main/03_Agent/AgentBackend'

type Hook = (i: unknown, id: string, o: { signal: AbortSignal }) => Promise<{ hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string } }>
type Matcher = { hooks: Hook[]; onFailure: string }

const LOOP = { repoRoot: 'C:\\work\\repo', appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop' }
const WIN_UD = 'C:\\Users\\u\\AppData\\Roaming\\agentdeck'
const signal = new AbortController().signal

function build(req: Partial<AgentRunInput>, userDataDir?: string): Record<string, unknown> {
  return buildClaudeSdkOptions({
    req: { messages: [{ role: 'user', content: 'x' }], mode: 'auto', ...req } as AgentRunInput,
    abortController: new AbortController(),
    canUseTool: async (_n, input) => ({ behavior: 'allow', updatedInput: input }),
    skillOverrides: null,
    mcpDenied: null,
    onUserDialog: async () => ({ behavior: 'cancelled' }),
    ...(userDataDir ? { userDataDir } : {}),
  })
}

async function decisions(opts: Record<string, unknown>, command: string): Promise<(string | undefined)[]> {
  const list = (opts['hooks'] as { PreToolUse: Matcher[] }).PreToolUse
  const out: (string | undefined)[] = []
  for (const m of list) {
    const r = await m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, 't', { signal })
    out.push(r.hookSpecificOutput?.permissionDecision)
  }
  return out
}

describe('루프 잠금 노드 배선 (M09 G2)', () => {
  it('일반 앱 세션에는 루프 잠금 훅이 없다 — git push를 거부하는 훅이 하나도 없다', async () => {
    for (const opts of [build({}), build({}, WIN_UD)]) {
      expect((await decisions(opts, 'git push')).every((d) => d === undefined)).toBe(true)
    }
    expect((build({}, WIN_UD)['hooks'] as { PreToolUse: unknown[] }).PreToolUse).toHaveLength(2)
  })

  it('loopLock이 있으면 루프 잠금 훅이 PreToolUse 맨 앞에 붙고, 엔진 잠금·병합 거부 훅은 그 뒤에 그대로 남는다', async () => {
    const opts = build({ loopLock: LOOP }, WIN_UD)
    const list = (opts['hooks'] as { PreToolUse: Matcher[] }).PreToolUse
    expect(list).toHaveLength(3)
    expect(list.map((m) => m.onFailure)).toEqual(['block', 'block', 'block'])
    expect(await decisions(opts, 'git push')).toEqual(['deny', undefined, undefined])
    expect((await decisions(opts, 'gh pr merge 1'))[2]).toBe('deny')
    const write = await list[0].hooks[0](
      { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.agentdeck/run-state.json', content: '{}' } }, 't', { signal })
    expect(write.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(write.hookSpecificOutput?.permissionDecisionReason).toContain('로컬 커밋까지만')
  })

  it('자동 모드의 시작 모드는 그대로다 (훅은 모드 허용보다 앞에서 판정한다)', () => {
    const settings = build({ loopLock: LOOP })['settings'] as { permissions: { defaultMode: string } }
    expect(settings.permissions.defaultMode).toBe('acceptEdits')
  })

  it('env가 있으면 그 환경으로 열고 session_state 옵트인만 더한다 — 이 프로세스의 환경을 섞지 않는다', () => {
    const marker = 'AGENTDECK_LOOPLOCK_TEST_MARKER'
    process.env[marker] = '1'
    try {
      const env = build({ env: { PATH: '/bin', GH_TOKEN: 'agentdeck-no-credential' } })['env'] as Record<string, string>
      expect(env).toEqual({ PATH: '/bin', GH_TOKEN: 'agentdeck-no-credential', CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' })
      const plain = build({})['env'] as Record<string, string>
      expect(plain[marker]).toBe('1')
    } finally {
      delete process.env[marker]
    }
  })
})

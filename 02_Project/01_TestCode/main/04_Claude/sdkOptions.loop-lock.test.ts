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

  // M09 G4 Backlog — 루프 세션은 사용자 MCP 서버를 읽지 않는다. 공개 타입(sdk.d.ts Options.strictMcpConfig)의 설명:
  // mcpServers 옵션의 서버만 쓰고 .mcp.json·사용자 설정·플러그인의 MCP 서버를 무시한다. 런타임 효과는 실측하지 않았다(mcp__ 거부 훅이 겹).
  it('loopLock이 있으면 strictMcpConfig로 사용자 MCP 서버를 읽지 않고 mcpServers를 주지 않는다 — 일반 앱 세션에는 없다', () => {
    const loop = build({ loopLock: LOOP }, WIN_UD)
    expect(loop['strictMcpConfig']).toBe(true)
    expect(loop['mcpServers']).toBeUndefined()
    expect(build({}, WIN_UD)['strictMcpConfig']).toBeUndefined()
  })

  it('읽기 전용 꼴(검수 세션)의 loopLock은 훅에 그대로 실려 저장소 쓰기를 거부한다', async () => {
    const opts = build({ loopLock: { ...LOOP, readOnly: true } }, WIN_UD)
    expect(opts['strictMcpConfig']).toBe(true)
    expect((await decisions(opts, 'echo x > src/a.ts'))[0]).toBe('deny')
    expect((await decisions(build({ loopLock: LOOP }, WIN_UD), 'echo x > src/a.ts'))[0]).toBeUndefined()
  })

  // M10 G2 — 메인 대화의 앱 안 도구 서버(loopMcpServers)는 루프 잠금이 붙은 입력에서만 mcpServers로 실린다. strictMcpConfig는 그대로라
  // 사용자 MCP 서버는 여전히 읽지 않는다(sdk.d.ts: mcpServers 옵션의 서버만 쓴다). 잠금 없는 입력에 그 칸이 있어도 싣지 않는다.
  it('메인 대화 꼴(mainChat)의 loopLock은 앱 안 도구 서버를 mcpServers로 싣고, 셸을 거부하며, 쓰기 창이 닫히면 스펙 쓰기를 거부한다', async () => {
    let open = true
    const servers = { 'agentdeck-main': { type: 'sdk', name: 'agentdeck-main', instance: {} } }
    const opts = build({ loopLock: { ...LOOP, mainChat: { toolServer: 'agentdeck-main', canWrite: () => open } }, loopMcpServers: servers }, WIN_UD)
    expect(opts['strictMcpConfig']).toBe(true)
    expect(opts['mcpServers']).toBe(servers)
    expect((await decisions(opts, 'git status'))[0]).toBe('deny')
    const list = (opts['hooks'] as { PreToolUse: Matcher[] }).PreToolUse
    const spec = { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.agentdeck/milestone-spec.md', content: '# M1' } }
    expect((await list[0].hooks[0](spec, 't', { signal })).hookSpecificOutput).toBeUndefined()
    open = false
    expect((await list[0].hooks[0](spec, 't', { signal })).hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(build({ loopMcpServers: servers }, WIN_UD)['mcpServers']).toBeUndefined()
  })

  it('자동 모드의 시작 모드는 그대로다 (훅은 모드 허용보다 앞에서 판정한다)', () => {
    const settings = build({ loopLock: LOOP })['settings'] as { permissions: { defaultMode: string } }
    expect(settings.permissions.defaultMode).toBe('auto')
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

// M07 G3 엔진 경로 잠금 — 보호 대상 경로, 인라인 거부 규칙 글자, Bash 잠금 노드, SDK 옵션 배선을 고정한다.
// 규칙 경로 꼴 `//c/...`와 훅 실패 시 막힘은 SDK 블랙박스 실측으로 골랐다(G3 goal 검증 기록 1단계).
import { describe, it, expect, vi } from 'vitest'
import {
  protectedTargets,
  enginePathDenyRules,
  bashLockReason,
  buildEnginePathLockHook,
  ENGINE_PATH_NODES,
} from '@main/04_Claude/permission/enginePathLock'
import { listControlNodes, PERMISSION_NODES } from '@main/04_Claude/permission/controlNodes'
import { buildClaudeSdkOptions } from '@main/04_Claude/sdkOptions'
import type { AgentRunInput } from '@main/03_Agent/AgentBackend'

const WIN_UD = 'C:\\Users\\x\\AppData\\Roaming\\agentdeck'

describe('보호 대상과 거부 규칙 (M07 G3)', () => {
  it('보호 대상은 userData 아래 engines 폴더, engine-config.json, controls.json이다', () => {
    expect(protectedTargets(WIN_UD)).toEqual([
      'C:/Users/x/AppData/Roaming/agentdeck/engines',
      'C:/Users/x/AppData/Roaming/agentdeck/engine-config.json',
      'C:/Users/x/AppData/Roaming/agentdeck/controls.json',
    ])
  })

  it('Windows 경로는 실측으로 통한 //c/ 꼴의 Edit 거부 규칙이 된다', () => {
    expect(enginePathDenyRules(WIN_UD)).toEqual([
      'Edit(//c/Users/x/AppData/Roaming/agentdeck/engines/**)',
      'Edit(//c/Users/x/AppData/Roaming/agentdeck/engine-config.json)',
      'Edit(//c/Users/x/AppData/Roaming/agentdeck/controls.json)',
    ])
  })

  it('끝 구분자가 붙은 경로도 같은 규칙이 된다', () => {
    expect(enginePathDenyRules(WIN_UD + '\\')).toEqual(enginePathDenyRules(WIN_UD))
  })

  it('POSIX 경로는 // 뒤에 그대로 붙는다', () => {
    expect(enginePathDenyRules('/home/u/.config/agentdeck')[0]).toBe('Edit(//home/u/.config/agentdeck/engines/**)')
  })
})

describe('Bash 잠금 노드 (M07 G3)', () => {
  const denied = [
    'echo x > "C:\\Users\\x\\AppData\\Roaming\\agentdeck\\engine-config.json"',
    'echo x > C:/Users/x/AppData/Roaming/agentdeck/engine-config.json',
    'cp a.js "$APPDATA/agentdeck/engines/0.3.325/node_modules/x.js"',
    'node -e "require(\'fs\').writeFileSync(process.env.APPDATA + \'/agentdeck/controls.json\', \'{}\')"',
    'echo {} > ~/AppData/Roaming/AgentDeck/ENGINE-CONFIG.JSON',
    'rm -r /c/Users/x/AppData/Roaming/agentdeck/engines',
    // G3 검수: 폴더로 들어가서 이름만 쓰는 꼴, 접두 와일드카드, 리다이렉트 바로 뒤
    'cd "$APPDATA/agentdeck" && rm -r engines',
    'rm -rf $APPDATA/agentdeck/engine*',
    'cd $APPDATA && echo x >agentdeck/controls.json',
    'rm $APPDATA/agentdeck/*',
  ]
  for (const cmd of denied) {
    it(`거부: ${cmd}`, () => {
      expect(bashLockReason(cmd, WIN_UD)).toMatch(/엔진/)
    })
  }

  const passed = [
    'echo ok',
    'cat "$APPDATA/agentdeck/chats/a.json"',
    'ls engines',
    'npm run build',
    'cat engine-config.json',
    'ls $APPDATA/agentdeck/chats/*',
    'cd C:/Dev/AgentDeck && npm test',
  ]
  for (const cmd of passed) {
    it(`통과: ${cmd}`, () => {
      expect(bashLockReason(cmd, WIN_UD)).toBeNull()
    })
  }

  it('훅은 command 입력의 보호 대상을 거부 결정으로, 나머지는 빈 출력으로 돌려준다', async () => {
    const matcher = buildEnginePathLockHook(WIN_UD)
    expect(matcher.onFailure).toBe('block')
    expect(matcher.timeout).toBe(10)
    expect(matcher.matcher).toBeUndefined()
    const [hook] = matcher.hooks
    const signal = new AbortController().signal
    const deny = await hook(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo > $APPDATA/agentdeck/engine-config.json' } },
      't1',
      { signal }
    )
    expect(deny).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } })
    expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo ok' } }, 't2', { signal })).toEqual({})
    // command 입력을 가진 다른 셸 도구도 본다 (도구 이름으로 거르지 않는다)
    expect(
      await hook({ hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_input: { command: 'Remove-Item $env:APPDATA\\agentdeck\\engines -Recurse' } }, 't4', { signal })
    ).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: WIN_UD + '\\engine-config.json' } }, 't3', { signal })).toEqual({})
  })
})

describe('등록부 목록과 SDK 옵션 배선 (M07 G3)', () => {
  it('목록에 엔진 경로 노드 둘이 권한 콜백 노드 뒤에 붙는다', () => {
    expect(listControlNodes().map((n) => n.id)).toEqual([
      ...PERMISSION_NODES.map((n) => n.id),
      'engine-path-file-deny',
      'engine-path-bash-lock',
    ])
    const [file, bash] = ENGINE_PATH_NODES
    expect(file).toMatchObject({ point: 'permissionRules', results: ['deny'], protection: 'L2', locked: true, onFailure: 'block' })
    expect(bash).toMatchObject({ point: 'preToolUse', results: ['deny'], protection: 'L3', locked: true, onFailure: 'block', timeoutMs: 10000 })
    for (const n of ENGINE_PATH_NODES) expect(Object.isFrozen(n) && Object.isFrozen(n.results)).toBe(true)
    const listed = listControlNodes().slice(-2)
    expect(listed[0].results).not.toBe(file.results)
  })

  const base = (): Parameters<typeof buildClaudeSdkOptions>[0] => ({
    req: { messages: [{ role: 'user', content: 'x' }], mode: 'auto' } as AgentRunInput,
    abortController: new AbortController(),
    canUseTool: async (_n, input) => ({ behavior: 'allow', updatedInput: input }),
    skillOverrides: null,
    mcpDenied: null,
    onUserDialog: async () => ({ behavior: 'cancelled' }),
  })

  it('userData 경로를 받으면 거부 규칙과 Bash 잠금 훅을 넣고, 모드 설정은 그대로 둔다', () => {
    const opts = buildClaudeSdkOptions({ ...base(), userDataDir: WIN_UD })
    const settings = opts['settings'] as { permissions: { defaultMode: string; deny: string[] } }
    expect(settings.permissions.defaultMode).toBe('acceptEdits')
    expect(settings.permissions.deny).toEqual(enginePathDenyRules(WIN_UD))
    const hooks = opts['hooks'] as { PreToolUse: { onFailure: string }[] }
    expect(hooks.PreToolUse).toHaveLength(1)
    expect(hooks.PreToolUse[0].onFailure).toBe('block')
  })

  it('잠금은 실행마다 받은 경로로 만든다 — 임시 userData(e2e·실주행)도 그 경로가 거부된다', () => {
    const tmp = 'C:\\Users\\x\\AppData\\Local\\Temp\\run-1\\userdata'
    const opts = buildClaudeSdkOptions({ ...base(), userDataDir: tmp })
    expect((opts['settings'] as { permissions: { deny: string[] } }).permissions.deny[0]).toBe('Edit(//c/Users/x/AppData/Local/Temp/run-1/userdata/engines/**)')
  })

  it('userData 경로가 없으면 거부 규칙과 훅을 넣지 않는다 (지금 옵션 모양 그대로)', () => {
    const opts = buildClaudeSdkOptions(base())
    expect('hooks' in opts).toBe(false)
    expect((opts['settings'] as { permissions: Record<string, unknown> }).permissions).toEqual({ defaultMode: 'acceptEdits' })
  })
})

describe('실행 배선 (M07 G3)', () => {
  it('userData 경로를 얻지 못하면(Electron 밖) 잠금 없이 열고 main 로그에 남긴다', async () => {
    vi.resetModules()
    vi.doMock('@main/02_Common/userData', () => ({ getUserDataDir: () => { throw new Error('no app') } }))
    const seen: unknown[][] = []
    const orig = console.error
    console.error = (...a: unknown[]) => { seen.push(a) }
    try {
      const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
      const { makeCaptureQuery } = await import('../00_Helpers/fakeQuery')
      const { queryFn, captured } = makeCaptureQuery([{ type: 'result', subtype: 'success', result: '', session_id: 's', is_error: false }])
      const run = new ClaudeCodeBackend(queryFn).start({ messages: [{ role: 'user', content: 'x' }] })
      for await (const _ of run.events) { /* drain */ }
      expect(captured.options?.['hooks']).toBeUndefined()
      expect(seen.some((a) => String(a[0]).includes('엔진 경로 잠금'))).toBe(true)
    } finally {
      console.error = orig
      vi.doUnmock('@main/02_Common/userData')
    }
  })

  it('앱 실행은 userData 경로를 SDK 옵션에 넘긴다', async () => {
    vi.resetModules()
    vi.doMock('@main/02_Common/userData', () => ({ getUserDataDir: () => WIN_UD }))
    const { ClaudeCodeBackend } = await import('@main/04_Claude/ClaudeCodeBackend')
    const { makeCaptureQuery } = await import('../00_Helpers/fakeQuery')
    const { queryFn, captured } = makeCaptureQuery([{ type: 'result', subtype: 'success', result: '', session_id: 's', is_error: false }])
    const run = new ClaudeCodeBackend(queryFn).start({ messages: [{ role: 'user', content: 'x' }] })
    for await (const _ of run.events) { /* drain */ }
    vi.doUnmock('@main/02_Common/userData')
    const settings = captured.options?.['settings'] as { permissions: { deny?: string[] } }
    expect(settings.permissions.deny).toEqual(enginePathDenyRules(WIN_UD))
    const hooks = captured.options?.['hooks'] as { PreToolUse: { onFailure: string }[] }
    expect(hooks.PreToolUse.map((m) => m.onFailure)).toEqual(['block'])
  })
})

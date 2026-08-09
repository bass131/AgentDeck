import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

function mkResultSuccess() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage: {},
    errors: []
  }
}

type CapturedCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  opts: { signal: AbortSignal; toolUseID: string }
) => Promise<{ behavior: string; updatedInput?: unknown; updatedPermissions?: unknown; message?: string }>

interface Captured {
  canUseTool?: CapturedCanUseTool
  options?: Record<string, unknown>
  run?: import('../../../02_Project/00_Source/main/01_agents/AgentBackend').AgentRun
}

function makeCaptureQuery(
  messages: unknown[],
  cap: Captured,
  runWithCapture?: () => Promise<void>
): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    cap.options = opts
    cap.canUseTool = opts?.canUseTool as CapturedCanUseTool
    if (runWithCapture) {
      await runWithCapture()
    }
    for (const msg of messages) {
      const ab = opts?.abortController as AbortController | undefined
      if (ab?.signal.aborted) return
      yield msg
    }
  }
}

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

describe('Phase 24c — push-queue 리팩터', () => {
  it('펌프가 여러 이벤트를 push해도 순서대로 drain된다 (외부 계약 불변)', async () => {
    const messages = [
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'A' }] },
        parent_tool_use_id: null
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'B' }] },
        parent_tool_use_id: null
      },
      mkResultSuccess()
    ]
    const cap: Captured = {}
    const backend = new ClaudeCodeBackend(makeCaptureQuery(messages, cap))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })
    const events = await drain(run.events)

    const texts = events.filter(e => e.type === 'text').map(e => (e as { delta: string }).delta)
    expect(texts).toEqual(['A', 'B'])
    expect(events[events.length - 1].type).toBe('done')
  })
})

describe('Phase 24c — settings 핀 (canUseTool 발화 전제)', () => {
  it('sdkOptions에 settings.permissions.defaultMode + settingSources가 포함된다', async () => {
    const cap: Captured = {}
    const backend = new ClaudeCodeBackend(makeCaptureQuery([mkResultSuccess()], cap))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }], mode: 'normal' })
    await drain(run.events)

    const opts = cap.options as {
      settings?: { permissions?: { defaultMode?: string } }
      settingSources?: string[]
    }
    expect(opts.settings?.permissions?.defaultMode).toBe('default')
    expect(opts.settingSources).toEqual(['user', 'project', 'local'])
  })

  it('mode 미전달 시 defaultMode는 "default"로 핀', async () => {
    const cap: Captured = {}
    const backend = new ClaudeCodeBackend(makeCaptureQuery([mkResultSuccess()], cap))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })
    await drain(run.events)
    const opts = cap.options as { settings?: { permissions?: { defaultMode?: string } } }
    expect(opts.settings?.permissions?.defaultMode).toBe('default')
  })

  it('acceptEdits mode → defaultMode "acceptEdits"', async () => {
    const cap: Captured = {}
    const backend = new ClaudeCodeBackend(makeCaptureQuery([mkResultSuccess()], cap))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }], mode: 'acceptEdits' })
    await drain(run.events)
    const opts = cap.options as { settings?: { permissions?: { defaultMode?: string } } }
    expect(opts.settings?.permissions?.defaultMode).toBe('acceptEdits')
  })
})

describe('Phase 24c — canUseTool mode별 early-allow (발화 없음)', () => {
  async function captureCanUseTool(mode?: string): Promise<CapturedCanUseTool> {
    const cap: Captured = {}
    const backend = new ClaudeCodeBackend(makeCaptureQuery([mkResultSuccess()], cap))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }], mode })
    await drain(run.events)
    return cap.canUseTool!
  }

  it('mode=auto → 모든 도구 allow', async () => {
    const cut = await captureCanUseTool('auto')
    const signal = new AbortController().signal
    for (const tool of ['Bash', 'Write', 'Edit']) {
      const r = await cut(tool, { command: 'rm -rf /' }, { signal, toolUseID: 't' })
      expect(r.behavior).toBe('allow')
    }
  })

  it('mode=bypass → 모든 도구 allow', async () => {
    const cut = await captureCanUseTool('bypass')
    const signal = new AbortController().signal
    const r = await cut('Bash', { command: 'ls' }, { signal, toolUseID: 't' })
    expect(r.behavior).toBe('allow')
  })

  it('readonly 도구(Read/Glob/Grep) → mode=normal에서도 allow', async () => {
    const cut = await captureCanUseTool('normal')
    const signal = new AbortController().signal
    for (const tool of ['Read', 'Glob', 'Grep', 'WebFetch']) {
      const r = await cut(tool, {}, { signal, toolUseID: 't' })
      expect(r.behavior).toBe('allow')
    }
  })

  it('acceptEdits + non-bash non-mutating → allow (발화 없음)', async () => {
    const cut = await captureCanUseTool('acceptEdits')
    const signal = new AbortController().signal
    const r = await cut('SomeReadishTool', {}, { signal, toolUseID: 't' })
    expect(r.behavior).toBe('allow')
  })

  it('AskUserQuestion + 빈 input → questions 없음 → allow (24d: parseQuestions 빈 배열)', async () => {
    const cut = await captureCanUseTool('normal')
    const signal = new AbortController().signal
    const r = await cut('AskUserQuestion', {}, { signal, toolUseID: 't' })
    expect(r.behavior).toBe('allow')
  })
})

describe('Phase 24c — 권한 발화 및 respond', () => {
  async function runPermissionScenario(
    mode: string,
    behavior: 'allow' | 'allow_always' | 'deny'
  ): Promise<{ events: AgentEvent[]; cutResult: { behavior: string; updatedPermissions?: unknown; message?: string } }> {
    const cap: Captured = {}
    let cutResult!: { behavior: string; updatedPermissions?: unknown; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Bash', { command: 'rm file' }, { signal, toolUseID: 'tu-1' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('perm-1', { kind: 'permission', behavior })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'delete' }], mode })
    cap.run = run
    const events = await drain(run.events)
    return { events, cutResult }
  }

  it('Bash(normal) → permission_request emit + summary 정규화', async () => {
    const { events } = await runPermissionScenario('normal', 'allow')
    const reqs = events.filter(e => e.type === 'permission_request')
    expect(reqs).toHaveLength(1)
    const req = reqs[0] as { type: 'permission_request'; requestId: string; toolName: string; summary: string }
    expect(req.toolName).toBe('Bash')
    expect(req.requestId).toBe('perm-1')
    expect(req.summary).toContain('rm file')
    expect(Object.keys(req).sort()).toEqual(['requestId', 'summary', 'toolName', 'type'])
  })

  it('respond allow → canUseTool이 behavior:allow 반환', async () => {
    const { cutResult } = await runPermissionScenario('normal', 'allow')
    expect(cutResult.behavior).toBe('allow')
    expect(cutResult.updatedPermissions).toBeUndefined()
  })

  it('respond deny → canUseTool이 behavior:deny 반환', async () => {
    const { cutResult } = await runPermissionScenario('normal', 'deny')
    expect(cutResult.behavior).toBe('deny')
    expect(cutResult.message).toBeTruthy()
  })

  it('respond allow_always → behavior:allow + 세션 규칙(updatedPermissions) 첨부', async () => {
    const { cutResult } = await runPermissionScenario('normal', 'allow_always')
    expect(cutResult.behavior).toBe('allow')
    expect(Array.isArray(cutResult.updatedPermissions)).toBe(true)
    const rules = cutResult.updatedPermissions as Array<{
      type: string
      behavior: string
      destination: string
      rules: Array<{ toolName: string }>
    }>
    expect(rules[0].type).toBe('addRules')
    expect(rules[0].behavior).toBe('allow')
    expect(rules[0].destination).toBe('session')
    expect(rules[0].rules[0].toolName).toBe('Bash')
  })

  it('respond — 미존재 requestId는 no-op (예외 없음)', () => {
    const backend = new ClaudeCodeBackend(makeCaptureQuery([mkResultSuccess()], {}))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })
    expect(() => run.respond('does-not-exist', { kind: 'permission', behavior: 'allow' })).not.toThrow()
  })

  it('respond — 같은 requestId 두 번 호출해도 예외 없음 (멱등)', async () => {
    const cap: Captured = {}
    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Bash', { command: 'ls' }, { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('perm-1', { kind: 'permission', behavior: 'allow' })
      expect(() => cap.run!.respond('perm-1', { kind: 'permission', behavior: 'deny' })).not.toThrow()
      await p
    })
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }], mode: 'normal' })
    cap.run = run
    await drain(run.events)
  })
})

describe('Phase 24c — abort가 미해결 waiter를 deny resolve하고 큐를 close', () => {
  it('권한 대기 중 abort() → canUseTool이 deny로 resolve되고 events 종료 (hang 없음)', async () => {
    const cap: Captured = {}
    let cutResult: { behavior: string } | undefined

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = (cap.options?.abortController as AbortController).signal
      const p = cap.canUseTool!('Bash', { command: 'sleep 999' }, { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.abort()
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }], mode: 'normal' })
    cap.run = run

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('timeout: events did not close after abort')), 3000)
    )
    await Promise.race([drain(run.events), timeout])
    expect(cutResult?.behavior).toBe('deny')
  }, 5000)

  it('SDK signal abort(options.signal) → 해당 waiter도 deny resolve', async () => {
    const cap: Captured = {}
    let cutResult: { behavior: string } | undefined
    const externalAbort = new AbortController()

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const p = cap.canUseTool!('Bash', { command: 'x' }, { signal: externalAbort.signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      externalAbort.abort()
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }], mode: 'normal' })
    await drain(run.events)
    expect(cutResult?.behavior).toBe('deny')
  }, 5000)
})

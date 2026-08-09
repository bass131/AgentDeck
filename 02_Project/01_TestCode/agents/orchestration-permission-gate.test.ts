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
    cap.canUseTool = opts?.['canUseTool'] as CapturedCanUseTool
    if (runWithCapture) {
      await runWithCapture()
    }
    for (const msg of messages) {
      const ab = opts?.['abortController'] as AbortController | undefined
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

describe('Phase 37 — orchestration ON: Workflow canUseTool 게이트', () => {

  it('G1: orchestration=true 로 start → canUseTool("Workflow") 가 permission_request 발화, respond(allow) 후 behavior:allow 반환', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; updatedPermissions?: unknown; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Workflow', { script: 'do something complex' }, { signal, toolUseID: 'wf-1' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('perm-1', { kind: 'permission', behavior: 'allow' })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'run workflow' }],
      orchestration: true,
    })
    cap.run = run

    const events = await drain(run.events)

    const permReqs = events.filter(e => e.type === 'permission_request')
    expect(permReqs).toHaveLength(1)

    const req = permReqs[0] as {
      type: 'permission_request'
      requestId: string
      toolName: string
      summary: string
    }
    expect(req.toolName).toBe('Workflow')
    expect(req.requestId).toBe('perm-1')

    expect(cutResult.behavior).toBe('allow')
  }, 5000)

  it('G2: orchestration=true + mode:"auto" → canUseTool("Workflow") 는 permission_request 발화(auto 조기허용 우회)', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Workflow', { script: 'auto orchestration' }, { signal, toolUseID: 'wf-2' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('perm-1', { kind: 'permission', behavior: 'allow' })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'auto workflow' }],
      mode: 'auto',
      orchestration: true,
    })
    cap.run = run

    const events = await drain(run.events)

    const permReqs = events.filter(e => e.type === 'permission_request')
    expect(permReqs.length).toBeGreaterThanOrEqual(1)

    const wfReq = (permReqs as Array<{ type: string; toolName: string }>)
      .find(e => e.toolName === 'Workflow')
    expect(wfReq).toBeDefined()

    expect(cutResult.behavior).toBe('allow')
  }, 5000)

  it('G3: orchestration=true + mode:"auto" → canUseTool("Bash") 는 permission_request 없이 즉시 allow (대조군)', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      cutResult = await cap.canUseTool!('Bash', { command: 'echo hi' }, { signal, toolUseID: 'bash-1' })
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'bash in auto' }],
      mode: 'auto',
      orchestration: true,
    })
    cap.run = run

    const events = await drain(run.events)

    const bashPermReqs = (events as Array<{ type: string; toolName?: string }>)
      .filter(e => e.type === 'permission_request' && e.toolName === 'Bash')
    expect(bashPermReqs).toHaveLength(0)

    expect(cutResult.behavior).toBe('allow')
  }, 5000)
})

describe('Phase 37 — orchestration OFF: Workflow canUseTool 방어 deny', () => {

  it('G4: orchestration=false → canUseTool("Workflow") → permission_request 없이 behavior:"deny"', async () => {
    const cap: Captured = {}
    let cutResult: { behavior: string; message?: string } | undefined

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const denyTimeout = new Promise<{ behavior: string; message?: string }>((resolve) =>
        setTimeout(() => resolve({ behavior: '__timeout__' }), 200)
      )
      cutResult = await Promise.race([
        cap.canUseTool!('Workflow', { script: 'sneaky' }, { signal, toolUseID: 'wf-off' }),
        denyTimeout,
      ])
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'workflow off' }],
      orchestration: false,
    })
    cap.run = run

    const runDrainPromise = drain(run.events)
    const timeout = setTimeout(() => run.abort(), 1000)
    const events = await runDrainPromise
    clearTimeout(timeout)

    const permReqs = (events as Array<{ type: string; toolName?: string }>)
      .filter(e => e.type === 'permission_request' && e.toolName === 'Workflow')
    expect(permReqs).toHaveLength(0)

    expect(cutResult?.behavior).toBe('deny')
    expect(cutResult?.message).toBeTruthy()
  }, 5000)
})

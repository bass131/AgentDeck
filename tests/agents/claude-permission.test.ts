/**
 * claude-permission.test.ts — Phase 24c TDD (권한 양방향 흐름)
 *
 * ClaudeCodeBackend의 push-queue 리팩터 + canUseTool 권한 게이트 + respond/abort 정합 검증.
 * mock queryFn으로 실 네트워크 0. electron import 0.
 *
 * 검증 항목:
 *  1. push-queue 정렬 — 펌프가 push한 이벤트가 순서대로 drain된다.
 *  2. canUseTool deny/allow/allow_always — respond가 waiter를 깨운다.
 *  3. mode별 early-allow — auto/bypass/readonly/acceptEdits(non-bash) 자동 허용(발화 없음).
 *  4. abort 시 미해결 waiter deny + 큐 close — hang 없음.
 *  5. settings 핀이 sdkOptions에 포함된다(settings.permissions.defaultMode + settingSources).
 *  6. permission_request 이벤트가 정규화되어 events 스트림에 흐른다.
 *  7. respond — 미존재 requestId no-op, 멱등.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 ───────────────────────────────────────────────────────────────

/** SDK result 메시지 픽스처 (성공) */
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

/**
 * canUseTool을 캡처하고, query 옵션(canUseTool/options)을 외부로 노출하는 mock queryFn 빌더.
 * onCanUseTool 콜백으로 canUseTool 호출 시점을 제어할 수 있게 한다.
 */
type CapturedCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  opts: { signal: AbortSignal; toolUseID: string }
) => Promise<{ behavior: string; updatedInput?: unknown; updatedPermissions?: unknown; message?: string }>

interface Captured {
  canUseTool?: CapturedCanUseTool
  options?: Record<string, unknown>
  // 클로저(runWithCapture)가 respond/abort를 호출하려면 run 핸들이 필요한데, run은
  // start() 시점에야 생긴다. 테스트 본문이 start() 직후 cap.run에 채워 클로저가 읽는다.
  run?: import('../../src/main/agents/AgentBackend').AgentRun
}

/**
 * mock queryFn: messages를 yield하되, run 함수로 canUseTool을 호출하는 훅을 허용.
 * cap에 canUseTool/options를 채운 뒤, runWithCapture가 있으면 그걸 실행하고
 * 끝나면 messages를 yield한다.
 */
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

/** events를 모두 drain하여 배열로 수집 */
async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

// ── 1. push-queue 정렬 ────────────────────────────────────────────────────────

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

// ── 5. settings 핀 ────────────────────────────────────────────────────────────

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

// ── 3. mode별 early-allow ─────────────────────────────────────────────────────

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
    // acceptEdits 모드는 파일 편집을 자동승인 → Write/Edit는 발화 안 함.
    // 하지만 Bash는 발화함(아래 별도 테스트). non-mutating 비-readonly 도구는 allow.
    const cut = await captureCanUseTool('acceptEdits')
    const signal = new AbortController().signal
    // Write/Edit는 MUTATING이지만 acceptEdits에서 SDK가 이미 자동승인하는 경로 →
    // 우리 canUseTool은 MUTATING이라 발화 대상. 그래서 여기선 발화하지 않는 도구를 검증.
    // (실제 acceptEdits에서 Write/Edit는 canUseTool에 도달하기 전 SDK가 승인하므로
    //  발화 여부는 SDK 책임. 우리 게이트는 Bash/MUTATING만 발화시킨다.)
    const r = await cut('SomeReadishTool', {}, { signal, toolUseID: 't' })
    expect(r.behavior).toBe('allow')
  })

  it('AskUserQuestion → 지금은 allow (24d에서 질문카드로 교체)', async () => {
    const cut = await captureCanUseTool('normal')
    const signal = new AbortController().signal
    const r = await cut('AskUserQuestion', {}, { signal, toolUseID: 't' })
    expect(r.behavior).toBe('allow')
  })
})

// ── 2 + 6 + 7. canUseTool 발화 → permission_request → respond ─────────────────

describe('Phase 24c — 권한 발화 및 respond', () => {
  /**
   * Bash(부수효과)에 대해 canUseTool을 호출하면 permission_request가 emit되고
   * canUseTool은 응답이 올 때까지 await한다. respond로 깨운다.
   */
  async function runPermissionScenario(
    mode: string,
    behavior: 'allow' | 'allow_always' | 'deny'
  ): Promise<{ events: AgentEvent[]; cutResult: { behavior: string; updatedPermissions?: unknown; message?: string } }> {
    const cap: Captured = {}
    let cutResult!: { behavior: string; updatedPermissions?: unknown; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      // 펌프가 시작된 뒤(canUseTool 캡처됨) Bash 권한 요청을 발화.
      // canUseTool은 응답을 await하므로 promise를 잡아두고, 별도로 respond한다.
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Bash', { command: 'rm file' }, { signal, toolUseID: 'tu-1' })
      // permission_request가 큐에 들어가 events로 흐를 시간을 준다.
      // requestId는 'perm-1'이 첫 카운터.
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
    // raw stdout 누수 없음: permission_request는 정규화된 필드만
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
      // 두 번째 호출은 no-op이어야 함
      expect(() => cap.run!.respond('perm-1', { kind: 'permission', behavior: 'deny' })).not.toThrow()
      await p
    })
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }], mode: 'normal' })
    cap.run = run
    await drain(run.events)
  })
})

// ── 4. abort 시 미해결 waiter deny + 큐 close (hang 없음) ──────────────────────

describe('Phase 24c — abort가 미해결 waiter를 deny resolve하고 큐를 close', () => {
  it('권한 대기 중 abort() → canUseTool이 deny로 resolve되고 events 종료 (hang 없음)', async () => {
    const cap: Captured = {}
    let cutResult: { behavior: string } | undefined

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = (cap.options?.abortController as AbortController).signal
      const p = cap.canUseTool!('Bash', { command: 'sleep 999' }, { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      // 대기 중 abort
      cap.run!.abort()
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }], mode: 'normal' })
    cap.run = run

    // abort 후 events가 hang 없이 종료되어야 함
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
      // options.signal로 별도 신호를 넘긴다(SDK가 도구별로 주는 신호 미러)
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

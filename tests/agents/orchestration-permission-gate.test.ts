/**
 * orchestration-permission-gate.test.ts — Workflow 도구 canUseTool 게이트 단위 테스트 (Phase 37 TDD RED)
 *
 * 검증 범위:
 *   G1: orchestration=true → canUseTool('Workflow') → permission_request 발화 + respond(allow) 후 behavior:'allow'
 *   G2: orchestration=true + mode:'auto' → canUseTool('Workflow') 여전히 permission_request 발화(auto 조기허용 우회)
 *   G3: orchestration=true + mode:'auto' → canUseTool('Bash') 는 permission_request 없이 즉시 allow(대조군)
 *   G4: orchestration=false → canUseTool('Workflow') → permission_request 없이 behavior:'deny'
 *
 * 신뢰경계: 실 SDK 호출 없음. claude-permission.test.ts 의 비동기 조율 패턴 정확히 미러.
 *
 * 현재 RED 예상 이유:
 *  - AgentRunInput에 orchestration 필드 없음 (TypeScript 컴파일 에러)
 *  - ClaudeCodeBackend 가 Workflow 특별 게이트 로직 미구현
 *  - orchestration=false 시 canUseTool('Workflow') 가 deny 를 반환하는 로직 미존재
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── 픽스처 / 헬퍼 (claude-permission.test.ts 패턴 정밀 미러) ─────────────────────

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
  run?: import('../../src/main/agents/AgentBackend').AgentRun
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

// ── G1: orchestration=true → Workflow 권한 발화 + respond(allow) ─────────────────

describe('Phase 37 — orchestration ON: Workflow canUseTool 게이트', () => {

  it('G1: orchestration=true 로 start → canUseTool("Workflow") 가 permission_request 발화, respond(allow) 후 behavior:allow 반환', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; updatedPermissions?: unknown; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Workflow', { script: 'do something complex' }, { signal, toolUseID: 'wf-1' })
      // permission_request 가 큐에 적재될 시간 허용
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

    // permission_request 이벤트가 스트림에 존재해야 함
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

    // respond(allow) 후 canUseTool 이 allow 를 반환해야 함 (자동승인 아님 — 사용자 응답 대기)
    expect(cutResult.behavior).toBe('allow')
  }, 5000)

  it('G2: orchestration=true + mode:"auto" → canUseTool("Workflow") 는 permission_request 발화(auto 조기허용 우회)', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('Workflow', { script: 'auto orchestration' }, { signal, toolUseID: 'wf-2' })
      await new Promise(r => setTimeout(r, 10))
      // permission_request 가 발화됐을 것 — respond 로 깨운다
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

    // auto 모드여도 Workflow 는 permission_request 를 발화해야 함 (모드 우회 금지)
    const permReqs = events.filter(e => e.type === 'permission_request')
    expect(permReqs.length).toBeGreaterThanOrEqual(1)

    const wfReq = (permReqs as Array<{ type: string; toolName: string }>)
      .find(e => e.toolName === 'Workflow')
    expect(wfReq).toBeDefined()

    // canUseTool 결과: respond 가 깨웠으므로 allow
    expect(cutResult.behavior).toBe('allow')
  }, 5000)

  it('G3: orchestration=true + mode:"auto" → canUseTool("Bash") 는 permission_request 없이 즉시 allow (대조군)', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      // Bash 는 auto 모드에서 즉시 allow 여야 함 (permission_request 없이)
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

    // Bash 에 대해 permission_request 없음 (auto 모드 조기허용)
    const bashPermReqs = (events as Array<{ type: string; toolName?: string }>)
      .filter(e => e.type === 'permission_request' && e.toolName === 'Bash')
    expect(bashPermReqs).toHaveLength(0)

    // Bash canUseTool 은 즉시 allow 반환
    expect(cutResult.behavior).toBe('allow')
  }, 5000)
})

// ── G4: orchestration=false → Workflow canUseTool → deny (방어) ──────────────────

describe('Phase 37 — orchestration OFF: Workflow canUseTool 방어 deny', () => {

  it('G4: orchestration=false → canUseTool("Workflow") → permission_request 없이 behavior:"deny"', async () => {
    const cap: Captured = {}
    let cutResult: { behavior: string; message?: string } | undefined

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      // orchestration OFF 이면 Workflow 는 disallowedTools 에 들어가 실제로는 호출되지 않지만,
      // 방어적으로 canUseTool 을 직접 호출해도 즉시 deny 를 반환해야 함 (hang 없음).
      // 구현 전에는 permission 대기로 hang할 수 있으므로 타임아웃 레이스로 감지.
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

    // 타임아웃으로 hang 시 abort 로 정리
    const runDrainPromise = drain(run.events)
    const timeout = setTimeout(() => run.abort(), 1000)
    const events = await runDrainPromise
    clearTimeout(timeout)

    // permission_request 없음 (즉각 deny — 사용자 응답 불필요)
    const permReqs = (events as Array<{ type: string; toolName?: string }>)
      .filter(e => e.type === 'permission_request' && e.toolName === 'Workflow')
    expect(permReqs).toHaveLength(0)

    // behavior 는 deny 이어야 함 (__timeout__ 이면 구현이 hang → 실패)
    expect(cutResult?.behavior).toBe('deny')
    // deny 메시지는 truthy
    expect(cutResult?.message).toBeTruthy()
  }, 5000)
})

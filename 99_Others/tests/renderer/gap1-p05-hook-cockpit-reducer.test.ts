import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { AppState } from '../../../02_Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

const RUN = 'run-gap1-p05'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

type HookRun = {
  hookId: string
  hookName: string
  hookEvent: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  exitCode?: number
  stdout?: string
  stderr?: string
  output?: string
  time?: string
}

type P05State = AppState & { hookRuns?: HookRun[] }

type ThreadShape = {
  kind: string
  id: string
  content?: string
  level?: string
  preventContinuation?: boolean
  toolName?: string
  decisionReasonType?: string
  decisionReason?: string
}

describe('gap1-p05 reducer — hookRuns 초기 상태', () => {
  it('makeInitialState().hookRuns === [] (미수신 기본)', () => {
    const base = makeInitialState() as P05State
    expect(base.hookRuns).toEqual([])
  })
})

describe('gap1-p05 reducer — hook_lifecycle started/response 페어링 upsert', () => {
  it('started 수신 → hookRuns에 {status:running} 1건 추가', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-pre-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    ) as P05State
    expect(next.hookRuns).toEqual<(HookRun & { runId?: string })[]>([
      { hookId: 'h-pre-1', hookName: 'PreToolUse:Bash', hookEvent: 'PreToolUse', status: 'running', runId: RUN },
    ])
  })

  it('동일 hookId response(outcome:success, exit_code:0) → 같은 엔트리 status:success·exitCode:0 갱신(개수 불변)', () => {
    const base = makeInitialState()
    const afterStarted = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-pre-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const afterResponse = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-pre-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        exitCode: 0,
        outcome: 'success',
      })
    ) as P05State
    expect(afterResponse.hookRuns).toHaveLength(1)
    const entry = afterResponse.hookRuns?.[0]
    expect(entry?.status).toBe('success')
    expect(entry?.exitCode).toBe(0)
  })

  it('response outcome:error → 같은 엔트리 status:error 갱신', () => {
    const base = makeInitialState()
    const afterStarted = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-stop-1',
        hookName: 'Stop',
        hookEvent: 'Stop',
      })
    )
    const afterResponse = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-stop-1',
        hookName: 'Stop',
        hookEvent: 'Stop',
        exitCode: 2,
        outcome: 'error',
      })
    ) as P05State
    expect(afterResponse.hookRuns).toHaveLength(1)
    expect(afterResponse.hookRuns?.[0]?.status).toBe('error')
  })
})

describe('gap1-p05 reducer — informational → thread 인라인 item', () => {
  it('informational 수신 → thread에 {kind:informational, content, level} 1개 추가(seq++, id 접두 inf)', () => {
    const base = makeInitialState()
    const beforeLen = base.thread.length
    const next = applyAgentEvent(
      base,
      payload({
        type: 'informational',
        content: 'UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로',
        level: 'warning',
      })
    )
    expect(next.thread.length).toBe(beforeLen + 1)
    expect(next.seq).toBe(base.seq + 1)
    const item = next.thread.find((it) => (it as ThreadShape).kind === 'informational') as ThreadShape | undefined
    expect(item).toBeDefined()
    expect(item?.content).toBe('UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로')
    expect(item?.level).toBe('warning')
    expect(item?.id.startsWith('inf')).toBe(true)
  })

  it('informational preventContinuation:true → thread item에 그대로 실린다', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'informational',
        content: 'Stop 훅이 계속 진행을 거부했습니다',
        level: 'notice',
        preventContinuation: true,
      })
    )
    const item = next.thread.find((it) => (it as ThreadShape).kind === 'informational') as ThreadShape | undefined
    expect(item?.preventContinuation).toBe(true)
  })
})

describe('gap1-p05 reducer — permission_denied → thread 인라인 item', () => {
  it('permission_denied 수신 → thread에 {kind:permission-denied, toolName, decisionReasonType, decisionReason} 1개 추가(seq++, id 접두 pd)', () => {
    const base = makeInitialState()
    const beforeLen = base.thread.length
    const next = applyAgentEvent(
      base,
      payload({
        type: 'permission_denied',
        toolName: 'Bash',
        decisionReasonType: 'rule',
        decisionReason: 'deny 규칙에 의해 차단: Bash(rm:*)',
      })
    )
    expect(next.thread.length).toBe(beforeLen + 1)
    expect(next.seq).toBe(base.seq + 1)
    const item = next.thread.find((it) => (it as ThreadShape).kind === 'permission-denied') as ThreadShape | undefined
    expect(item).toBeDefined()
    expect(item?.toolName).toBe('Bash')
    expect(item?.decisionReasonType).toBe('rule')
    expect(item?.decisionReason).toBe('deny 규칙에 의해 차단: Bash(rm:*)')
    expect(item?.id.startsWith('pd')).toBe(true)
  })
})

describe('gap1-p05 reducer — hook_lifecycle cap 200 트리밍(오래된 것 드롭)', () => {
  it('서로 다른 hookId started 201건 순차 apply → hookRuns.length === 200(상한 유지)', () => {
    let st: AppState = makeInitialState()
    for (let i = 1; i <= 201; i++) {
      st = applyAgentEvent(
        st,
        payload({
          type: 'hook_lifecycle',
          phase: 'started',
          hookId: `h-${i}`,
          hookName: 'PreToolUse:Bash',
          hookEvent: 'PreToolUse',
        })
      )
    }
    const runs = (st as P05State).hookRuns
    expect(runs).toHaveLength(200)
  })

  it('201건째 초과 시 가장 오래된 엔트리(첫 hookId)부터 드롭 · 마지막 hookId는 잔존', () => {
    let st: AppState = makeInitialState()
    for (let i = 1; i <= 201; i++) {
      st = applyAgentEvent(
        st,
        payload({
          type: 'hook_lifecycle',
          phase: 'started',
          hookId: `h-${i}`,
          hookName: 'PreToolUse:Bash',
          hookEvent: 'PreToolUse',
        })
      )
    }
    const runs = (st as P05State).hookRuns ?? []
    expect(runs.find((r) => r.hookId === 'h-1')).toBeUndefined()
    expect(runs.find((r) => r.hookId === 'h-201')).toBeDefined()
    expect(runs[0]?.hookId).toBe('h-2')
    expect(runs[runs.length - 1]?.hookId).toBe('h-201')
  })
})

describe('gap1-p05 reducer — hook_lifecycle response 방어적 append(started 유실)', () => {
  it('매칭 started 없는 response(outcome:success, exit_code:0) → 1건 append · status:success(유실 아님)', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-orphan-ok',
        hookName: 'PostToolUse:Bash',
        hookEvent: 'PostToolUse',
        exitCode: 0,
        outcome: 'success',
      })
    ) as P05State
    expect(next.hookRuns).toHaveLength(1)
    const entry = next.hookRuns?.[0]
    expect(entry?.hookId).toBe('h-orphan-ok')
    expect(entry?.status).toBe('success')
    expect(entry?.exitCode).toBe(0)
  })

  it('매칭 started 없는 response(outcome:error) → append 엔트리 status:error로 세팅', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-orphan-err',
        hookName: 'Stop',
        hookEvent: 'Stop',
        exitCode: 2,
        outcome: 'error',
        stderr: '차단 사유',
      })
    ) as P05State
    expect(next.hookRuns).toHaveLength(1)
    const entry = next.hookRuns?.[0]
    expect(entry?.status).toBe('error')
    expect(entry?.stderr).toBe('차단 사유')
  })
})

describe('gap1-p05 reducer — hook_lifecycle progress 병합(status running 유지)', () => {
  it('started(running) 후 동일 hookId progress(stdout) → stdout 병합 · status는 running 유지', () => {
    const base = makeInitialState()
    const afterStarted = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-prog',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const afterProgress = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'progress',
        hookId: 'h-prog',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        stdout: 'chunk-1',
        output: 'partial-output',
      })
    ) as P05State
    expect(afterProgress.hookRuns).toHaveLength(1)
    const entry = afterProgress.hookRuns?.[0]
    expect(entry?.stdout).toBe('chunk-1')
    expect(entry?.output).toBe('partial-output')
    expect(entry?.status).toBe('running')
  })

  it('매칭 started 없는 progress → no-op(새 엔트리 생성 0 · started가 진실 원천)', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'progress',
        hookId: 'h-no-started',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        stdout: 'orphan-chunk',
      })
    ) as P05State
    expect(next.hookRuns).toEqual([])
  })
})

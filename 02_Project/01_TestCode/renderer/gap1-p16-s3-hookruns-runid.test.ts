import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'

const RUN = 'run-gap1-p16'

function payload(event: AgentEvent, runId: string = RUN): AgentEventPayload {
  return { runId, event }
}

type HookRunWithRun = { hookId: string; status: string; runId?: string }

describe('gap1-p16 계열③ — hook_lifecycle started runId 배선', () => {
  it('started(runId=RUN) → 생성된 HookRun에 runId===RUN 저장', () => {
    const next = applyAgentEvent(
      makeInitialState(),
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const entry = next.hookRuns?.[0] as HookRunWithRun | undefined
    expect(entry?.hookId).toBe('h-1')
    expect(entry?.runId).toBe(RUN)
  })
})

describe('gap1-p16 계열③ — started→response 페어링에서 runId 보존', () => {
  it('started(RUN) 후 동일 hookId response(RUN) → 페어링된 엔트리가 runId===RUN 유지(개수 1)', () => {
    const afterStarted = applyAgentEvent(
      makeInitialState(),
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-pair',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const afterResponse = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-pair',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        exitCode: 0,
        outcome: 'success',
      })
    )
    expect(afterResponse.hookRuns).toHaveLength(1)
    const entry = afterResponse.hookRuns?.[0] as HookRunWithRun | undefined
    expect(entry?.status).toBe('success')
    expect(entry?.runId).toBe(RUN)
  })
})

describe('gap1-p16 계열③ — response 방어적 append에도 runId 배선', () => {
  it('매칭 started 없는 response(RUN) → 방어 append 엔트리에도 runId===RUN', () => {
    const next = applyAgentEvent(
      makeInitialState(),
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-orphan',
        hookName: 'Stop',
        hookEvent: 'Stop',
        exitCode: 2,
        outcome: 'error',
      })
    )
    expect(next.hookRuns).toHaveLength(1)
    const entry = next.hookRuns?.[0] as HookRunWithRun | undefined
    expect(entry?.status).toBe('error')
    expect(entry?.runId).toBe(RUN)
  })
})

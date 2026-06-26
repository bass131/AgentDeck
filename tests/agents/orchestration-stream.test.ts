/**
 * orchestration-stream.test.ts — claude-stream Workflow→orchestration 정규화 단위 테스트 (TDD RED)
 *
 * 대상 모듈: src/main/agents/claude-stream.ts (mapClaudeStreamLine 기존 함수 — Workflow 분기 추가 필요)
 * 대상 타입: src/shared/agent-events.ts (AgentEventOrchestration union 멤버 추가 필요)
 *
 * 검증 범위:
 *   S1: Workflow tool_use → orchestration 이벤트 emit, tool_call 미포함(억제)
 *   S2: 거대 script → orchestration 이벤트의 script 길이 cap(≤4KB)
 *   S3: tool_result(정상 흐름) → 기존 tool_result 이벤트 (변경 0 — 회귀)
 *   S4: 일반 tool_use(Read 등) → 여전히 tool_call emit (억제 0 — 회귀)
 */

import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../src/main/agents/claude-stream'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 ─────────────────────────────────────────────────────────────────

/** Workflow tool_use를 담은 assistant 메시지 픽스처 */
function mkWorkflowAssistant(opts: {
  id: string
  script: string
}) {
  return {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: opts.id,
          name: 'Workflow',
          input: {
            script: opts.script,
          },
        },
      ],
    },
  }
}

/** 일반(비-Workflow) tool_use assistant 픽스처 */
function mkNormalToolAssistant(opts: {
  id: string
  name: string
  input: unknown
}) {
  return {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: opts.id,
          name: opts.name,
          input: opts.input,
        },
      ],
    },
  }
}

/** tool_result user 메시지 픽스처 */
function mkToolResultUser(opts: {
  toolUseId: string
  isError?: boolean
  content: unknown
}) {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: opts.toolUseId,
          is_error: opts.isError ?? false,
          content: opts.content,
        },
      ],
    },
  }
}

/** 정상 orchestration meta를 담은 스크립트 */
const NORMAL_WORKFLOW_SCRIPT = `export const meta = { name: 'x', phases: [{ title: 'A' }] }
// workflow body`

// ═══════════════════════════════════════════════════════════════════════════════
describe('mapClaudeStreamLine — S1 Workflow tool_use → orchestration 이벤트', () => {
  it('S1-a: Workflow tool_use → orchestration 이벤트 1개 포함', () => {
    const obj = mkWorkflowAssistant({ id: 'wf1', script: NORMAL_WORKFLOW_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    // orchestration 이벤트가 정확히 1개
    const orchEvents = events.filter(e => e.type === 'orchestration')
    expect(orchEvents).toHaveLength(1)
  })

  it('S1-b: orchestration 이벤트의 id, name, phases 매핑 확인', () => {
    const obj = mkWorkflowAssistant({ id: 'wf1', script: NORMAL_WORKFLOW_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    const orch = events.find(e => e.type === 'orchestration') as (AgentEvent & { type: 'orchestration' }) | undefined
    expect(orch).toBeDefined()
    expect(orch?.id).toBe('wf1')
    expect(orch?.name).toBe('x')
    expect(orch?.phases).toEqual(['A'])
  })

  it('S1-c: Workflow tool_use → tool_call 이벤트 미포함(억제)', () => {
    const obj = mkWorkflowAssistant({ id: 'wf1', script: NORMAL_WORKFLOW_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    // type='tool_call'이고 name='Workflow'인 이벤트가 없어야 함
    const workflowToolCalls = events.filter(
      e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'Workflow'
    )
    expect(workflowToolCalls).toHaveLength(0)
  })

  it('S1-d: orchestration 이벤트에 script 포함(풀스크린용)', () => {
    const obj = mkWorkflowAssistant({ id: 'wf1', script: NORMAL_WORKFLOW_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    const orch = events.find(e => e.type === 'orchestration') as (AgentEvent & { type: 'orchestration' }) | undefined
    expect(typeof orch?.script).toBe('string')
    expect((orch?.script as string).length).toBeGreaterThan(0)
  })

  it('S1-e: meta 파싱 실패 시에도 orchestration 이벤트 emit(name fallback, name !== \'Workflow\')', () => {
    const brokenScript = `export const meta = { name: 'broken'`
    const obj = mkWorkflowAssistant({ id: 'wf-broken', script: brokenScript })
    const events = mapClaudeStreamLine(obj)

    const orch = events.find(e => e.type === 'orchestration') as (AgentEvent & { type: 'orchestration' }) | undefined
    expect(orch).toBeDefined()
    // D-1: 어떤 fallback도 'Workflow' 리터럴 금지
    expect(orch?.name).not.toBe('Workflow')
  })

  it('S1-f: orchestration 이벤트 구조 — 반환 이벤트 수가 정확히 1개(text/thinking 없을 때)', () => {
    const obj = mkWorkflowAssistant({ id: 'wf1', script: NORMAL_WORKFLOW_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    // Workflow만 있는 content → orchestration 1개만
    expect(events).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('mapClaudeStreamLine — S2 script cap (≤4KB)', () => {
  it('S2-a: 거대 script input → orchestration 이벤트의 script 길이 ≤ 4KB', () => {
    const HUGE_SCRIPT = `export const meta = { name: 'big', phases: [{ title: 'A' }] }\n` + 'x'.repeat(8000)
    const obj = mkWorkflowAssistant({ id: 'wf-big', script: HUGE_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    const orch = events.find(e => e.type === 'orchestration') as (AgentEvent & { type: 'orchestration' }) | undefined
    expect(orch).toBeDefined()
    const scriptLen: number = (orch?.script as string | undefined)?.length ?? 0
    // cap: 4096 바이트(4KB) 이하
    expect(scriptLen).toBeLessThanOrEqual(4096)
  })

  it('S2-b: 정상 크기(4KB 이내) script는 그대로 운반', () => {
    const SMALL_SCRIPT = `export const meta = { name: 'small', phases: [{ title: 'A' }] }`
    const obj = mkWorkflowAssistant({ id: 'wf-small', script: SMALL_SCRIPT })
    const events = mapClaudeStreamLine(obj)

    const orch = events.find(e => e.type === 'orchestration') as (AgentEvent & { type: 'orchestration' }) | undefined
    expect(orch).toBeDefined()
    // 4KB 이내는 전체 포함
    const scriptLen: number = (orch?.script as string | undefined)?.length ?? 0
    expect(scriptLen).toBe(SMALL_SCRIPT.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('mapClaudeStreamLine — S3 tool_result 정상 흐름 (회귀 0)', () => {
  it('S3-a: Workflow tool_result ok=true → tool_result 이벤트 emit (기존 동작 불변)', () => {
    const obj = mkToolResultUser({
      toolUseId: 'wf1',
      isError: false,
      content: '결과',
    })
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'tool_result',
      id: 'wf1',
      ok: true,
    })
    // output 내용 확인
    const tr = events[0] as AgentEvent & { type: 'tool_result' }
    expect(tr.output).toBe('결과')
  })

  it('S3-b: Workflow tool_result ok=false → tool_result 이벤트 emit, ok=false', () => {
    const obj = mkToolResultUser({
      toolUseId: 'wf1',
      isError: true,
      content: '실패',
    })
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'tool_result',
      id: 'wf1',
      ok: false,
    })
  })

  it('S3-c: tool_result는 orchestration 이벤트가 아님(reducer가 id 매칭으로 처리)', () => {
    const obj = mkToolResultUser({ toolUseId: 'wf1', content: 'result' })
    const events = mapClaudeStreamLine(obj)

    // orchestration 이벤트 미포함
    expect(events.filter(e => e.type === 'orchestration')).toHaveLength(0)
    // tool_result만 emit
    expect(events.filter(e => e.type === 'tool_result')).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('mapClaudeStreamLine — S4 일반 tool_use 회귀 (억제 안 됨)', () => {
  it('S4-a: Read 도구 → tool_call emit (억제 0)', () => {
    const obj = mkNormalToolAssistant({ id: 'read-001', name: 'Read', input: { file_path: '/src/index.ts' } })
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'tool_call',
      id: 'read-001',
      name: 'Read',
    })
  })

  it('S4-b: Bash 도구 → tool_call emit (억제 0)', () => {
    const obj = mkNormalToolAssistant({ id: 'bash-001', name: 'Bash', input: { command: 'ls' } })
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('tool_call')
    expect((events[0] as AgentEvent & { type: 'tool_call' }).name).toBe('Bash')
  })

  it('S4-c: Write 도구 → tool_call emit (억제 0)', () => {
    const obj = mkNormalToolAssistant({ id: 'write-001', name: 'Write', input: { file_path: '/out.ts', content: 'hello' } })
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('tool_call')
  })

  it('S4-d: Task 도구 → subagent 이벤트(기존 동작 불변, tool_call/orchestration 미emit)', () => {
    const obj = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'task-001',
            name: 'Task',
            input: { subagent_type: 'explorer', description: 'Explore', prompt: 'List files' },
          },
        ],
      },
    }
    const events = mapClaudeStreamLine(obj)

    // Task → subagent (기존 동작)
    expect(events.filter(e => e.type === 'subagent')).toHaveLength(1)
    // tool_call, orchestration 미emit
    expect(events.filter(e => e.type === 'tool_call')).toHaveLength(0)
    expect(events.filter(e => e.type === 'orchestration')).toHaveLength(0)
  })
})

// ── F-C: system task_* → orchestration_progress 정규화 (프로브 ground truth) ──────

/** task_started system 메시지 픽스처 (프로브 실페이로드 기반) */
function mkTaskStarted(toolUseId: string) {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: 'w2mgjci1s',
    tool_use_id: toolUseId,
    description: 'Minimal one-agent probe workflow',
    task_type: 'local_workflow',
    workflow_name: 'probe',
    prompt: 'export const meta = {...}',
  }
}

/** task_progress system 메시지 픽스처 (workflow_progress 포함) */
function mkTaskProgress(toolUseId: string, agentState: 'start' | 'progress' | 'done') {
  return {
    type: 'system',
    subtype: 'task_progress',
    task_id: 'w2mgjci1s',
    tool_use_id: toolUseId,
    description: 'Probe: probe',
    usage: { total_tokens: 10538, tool_uses: 0, duration_ms: 3124 },
    last_tool_name: 'probe',
    summary: 'Minimal one-agent probe workflow',
    workflow_progress: [
      { type: 'workflow_phase', index: 1, title: 'Probe' },
      // 같은 에이전트의 이전 상태(dedup 대상 — 마지막 것만 유지)
      { type: 'workflow_agent', index: 1, label: 'probe', phaseTitle: 'Probe', model: 'claude-opus-4-8[1m]', state: 'start' },
      {
        type: 'workflow_agent', index: 1, label: 'probe', phaseTitle: 'Probe',
        agentId: 'a7501c5b778da8cb4', model: 'claude-opus-4-8[1m]', state: agentState,
        tokens: 10538, toolCalls: 0,
        ...(agentState === 'done' ? { resultPreview: 'WORKFLOW_RESULT_OK' } : {}),
      },
    ],
  }
}

/** task_updated system 메시지 픽스처 */
function mkTaskUpdated(status: string) {
  return {
    type: 'system',
    subtype: 'task_updated',
    task_id: 'w2mgjci1s',
    patch: { status, end_time: 1782404278050 },
  }
}

/** task_notification system 메시지 픽스처 */
function mkTaskNotification(toolUseId: string, status: string) {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: 'w2mgjci1s',
    tool_use_id: toolUseId,
    status,
    output_file: 'C:somepathw2mgjci1s.output',
    summary: 'Dynamic workflow "Minimal one-agent probe workflow" completed',
    usage: { total_tokens: 10538, tool_uses: 0, duration_ms: 3182 },
  }
}

describe('claude-stream — system task_* → orchestration_progress (F-C)', () => {
  it('T1: task_started → orchestration_progress(status:running, id=tool_use_id), tool_call/orchestration 미emit', () => {
    const events = mapClaudeStreamLine(mkTaskStarted('toolu_wf1'))
    const prog = events.filter(e => e.type === 'orchestration_progress')
    expect(prog).toHaveLength(1)
    const p = prog[0] as Extract<AgentEvent, { type: 'orchestration_progress' }>
    expect(p.id).toBe('toolu_wf1')
    expect(p.status).toBe('running')
    expect(events.filter(e => e.type === 'tool_call')).toHaveLength(0)
    expect(events.filter(e => e.type === 'orchestration')).toHaveLength(0)
  })

  it('T2: task_progress → phases·agents 정규화(엔진중립), dedup으로 에이전트 1개(최신 상태)', () => {
    const events = mapClaudeStreamLine(mkTaskProgress('toolu_wf1', 'progress'))
    const p = events.find(e => e.type === 'orchestration_progress') as Extract<AgentEvent, { type: 'orchestration_progress' }>
    expect(p).toBeDefined()
    expect(p.id).toBe('toolu_wf1')
    expect(p.status).toBe('running')
    expect(p.phases).toEqual(['Probe'])
    // 같은 label 'probe'가 2개(start, progress) → dedup으로 1개, 최신 상태 'running'
    expect(p.agents).toHaveLength(1)
    expect(p.agents![0].label).toBe('probe')
    expect(p.agents![0].phase).toBe('Probe')
    expect(p.agents![0].state).toBe('running')
    expect(p.agents![0].tokens).toBe(10538)
  })

  it('T3: task_progress 에이전트 state:done + resultPreview → state:done, resultPreview 보존', () => {
    const events = mapClaudeStreamLine(mkTaskProgress('toolu_wf1', 'done'))
    const p = events.find(e => e.type === 'orchestration_progress') as Extract<AgentEvent, { type: 'orchestration_progress' }>
    expect(p.agents![0].state).toBe('done')
    expect(p.agents![0].resultPreview).toBe('WORKFLOW_RESULT_OK')
  })

  it('T4: task_updated → [] (실페이로드에 tool_use_id 없음 → 상관 불가, task_notification이 완료 담당)', () => {
    // 프로브 확인: task_updated는 {task_id, patch}만 — tool_use_id 없어 카드 매칭 불가.
    const events = mapClaudeStreamLine(mkTaskUpdated('completed'))
    expect(events.filter(e => e.type === 'orchestration_progress')).toHaveLength(0)
  })

  it('T5: task_notification status:completed → status:completed + summary 보존', () => {
    const events = mapClaudeStreamLine(mkTaskNotification('toolu_wf1', 'completed'))
    const p = events.find(e => e.type === 'orchestration_progress') as Extract<AgentEvent, { type: 'orchestration_progress' }>
    expect(p.id).toBe('toolu_wf1')
    expect(p.status).toBe('completed')
    expect(p.summary).toContain('completed')
  })

  it('T6: system/init → [] (진행 이벤트 미emit, 회귀 0)', () => {
    const events = mapClaudeStreamLine({ type: 'system', subtype: 'init', session_id: 's1' })
    expect(events.filter(e => e.type === 'orchestration_progress')).toHaveLength(0)
  })

  it('T7: tool_use_id 없는 task_* → [] (상관 불가 graceful)', () => {
    const events = mapClaudeStreamLine({ type: 'system', subtype: 'task_progress', task_id: 'x', workflow_progress: [] })
    expect(events).toHaveLength(0)
  })

  it('T8: task_notification status:failed → status:failed (실패 전이)', () => {
    const events = mapClaudeStreamLine(mkTaskNotification('toolu_wf1', 'failed'))
    const p = events.find(e => e.type === 'orchestration_progress') as Extract<AgentEvent, { type: 'orchestration_progress' }>
    expect(p.status).toBe('failed')
  })
})

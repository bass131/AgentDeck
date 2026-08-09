import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AppState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'

function allThreadToolCards(state: AppState) {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools)
}

const runId = 'run-24b'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

describe('Phase 24b — store reducer: subagents', () => {
  it('makeInitialState: subagents=[]', () => {
    const s = makeInitialState()
    expect(s.subagents).toEqual([])
  })

  it('subagent 이벤트 → 신규 서브에이전트 추가', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: {
          id: 'sa-1',
          name: '탐색 에이전트',
          role: 'explorer',
          status: 'running',
          tools: [],
        },
      })
    )
    expect(s1.subagents).toHaveLength(1)
    expect(s1.subagents[0].id).toBe('sa-1')
    expect(s1.subagents[0].name).toBe('탐색 에이전트')
    expect(s1.subagents[0].status).toBe('running')
  })

  it('subagent 이벤트 → 여러 개 추가 (순서 유지)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'subagent', subagent: { id: 'sa-2', name: 'B', role: 'r', status: 'queued', tools: [] } })
    )
    expect(s2.subagents).toHaveLength(2)
    expect(s2.subagents[0].id).toBe('sa-1')
    expect(s2.subagents[1].id).toBe('sa-2')
  })

  it('subagent 이벤트 → 동일 id upsert(병합): status 갱신', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: '탐색', role: 'explorer', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: '탐색', role: 'explorer', status: 'done', tools: [] },
      })
    )
    expect(s2.subagents).toHaveLength(1)
    expect(s2.subagents[0].status).toBe('done')
  })

  it('subagent 이벤트 동일 id upsert: activity 필드 병합', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: '탐색', role: 'explorer', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'subagent',
        subagent: {
          id: 'sa-1',
          name: '탐색',
          role: 'explorer',
          status: 'done',
          activity: '탐색 완료',
          tools: [],
        },
      })
    )
    expect(s2.subagents[0].activity).toBe('탐색 완료')
  })

  it('subagent 이벤트 동일 id upsert: 기존 tools를 subagent 이벤트 tools로 교체하지 않음(tools 보존)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const sWithTool = {
      ...s1,
      subagents: [
        {
          ...s1.subagents[0],
          tools: [{ id: 't1', verb: 'read', target: 'foo.ts', status: 'running' as const }],
        },
      ],
    }
    const s2 = applyAgentEvent(
      sWithTool,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'done', tools: [] },
      })
    )
    expect(s2.subagents[0].tools).toHaveLength(1)
    expect(s2.subagents[0].tools[0].id).toBe('t1')
  })

  it('tool_call + parentToolId → 해당 subagent.tools에 추가', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'child-tc-1',
        name: 'Read',
        input: { file_path: 'src/main.ts' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools).toHaveLength(1)
    expect(s2.subagents[0].tools[0].id).toBe('child-tc-1')
    expect(s2.subagents[0].tools[0].verb).toBe('read')
    expect(s2.subagents[0].tools[0].target).toBe('src/main.ts')
    expect(s2.subagents[0].tools[0].status).toBe('running')
  })

  it('tool_call + parentToolId → 메인 thread toolgroup에 추가되지 않음', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'child-tc-1',
        name: 'Bash',
        input: { command: 'ls' },
        parentToolId: 'sa-1',
      })
    )
    expect(allThreadToolCards(s2)).toHaveLength(0)
  })

  it('tool_call + parentToolId: verb는 소문자 도구명', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'tc-glob',
        name: 'Glob',
        input: { pattern: '**/*.ts' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].verb).toBe('glob')
  })

  it('tool_call + parentToolId: target은 input에서 best-effort 추출(file_path)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'tc-1',
        name: 'write_file',
        input: { file_path: 'src/foo.ts', content: '...' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].target).toBe('src/foo.ts')
  })

  it('tool_call + parentToolId: target은 input에서 best-effort 추출(path)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'tc-2',
        name: 'read_file',
        input: { path: 'src/bar.ts' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].target).toBe('src/bar.ts')
  })

  it('tool_call + parentToolId: target은 input에서 best-effort 추출(command)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'tc-3',
        name: 'bash',
        input: { command: 'npm test' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].target).toBe('npm test')
  })

  it('tool_call + parentToolId: target은 input에서 best-effort 추출(pattern)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'tc-4',
        name: 'glob',
        input: { pattern: '**/*.tsx' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].target).toBe('**/*.tsx')
  })

  it('tool_call + parentToolId: 알 수 없는 input → target은 빈 문자열', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'tc-5',
        name: 'unknown_tool',
        input: { someOtherField: 'value' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].target).toBe('')
  })

  it('tool_call without parentToolId → thread toolgroup에 추가됨(Phase A-2)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'main-tc-1', name: 'bash', input: { command: 'ls' } })
    )
    const cards = allThreadToolCards(s1)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('main-tc-1')
  })

  it('tool_result id=subagent id → subagent done + activity', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_result',
        id: 'sa-1',
        ok: true,
        output: '탐색 작업 완료. 3개 파일 발견.',
      })
    )
    expect(s2.subagents[0].status).toBe('done')
    expect(s2.subagents[0].activity).toBeTruthy()
  })

  it('tool_result id=subagent id: output이 객체 → 문자열로 변환', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_result',
        id: 'sa-1',
        ok: true,
        output: { result: '완료', files: ['a.ts', 'b.ts'] },
      })
    )
    expect(s2.subagents[0].status).toBe('done')
    expect(s2.subagents[0].activity).toBeTruthy()
  })

  it('tool_result id=자식 tool id → 해당 자식 tool status=done', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'child-1',
        name: 'read_file',
        input: { file_path: 'foo.ts' },
        parentToolId: 'sa-1',
      })
    )
    expect(s2.subagents[0].tools[0].status).toBe('running')

    const s3 = applyAgentEvent(
      s2,
      payload({ type: 'tool_result', id: 'child-1', ok: true, output: 'file content' })
    )
    expect(s3.subagents[0].tools[0].status).toBe('done')
    expect(allThreadToolCards(s3)).toHaveLength(0)
  })

  it('tool_result id=자식 tool id: ok=false → status=done(처리됨)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'subagent', subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] } })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'tool_call', id: 'child-2', name: 'bash', input: { command: 'fail' }, parentToolId: 'sa-1' })
    )
    const s3 = applyAgentEvent(
      s2,
      payload({ type: 'tool_result', id: 'child-2', ok: false, output: 'error' })
    )
    expect(s3.subagents[0].tools[0].status).toBe('done')
  })

  it('tool_result id=메인 tool id → thread toolgroup 내 카드 갱신(Phase A-2)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'main-tc-1', name: 'bash', input: {} })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'tool_result', id: 'main-tc-1', ok: true, output: 'ok' })
    )
    const card = allThreadToolCards(s2).find((c) => c.id === 'main-tc-1')
    expect(card?.status).toBe('done')
  })

  it('done 이벤트 → subagents 보존(완료 후에도 카드 표시)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    expect(s2.subagents).toHaveLength(1)
    expect(s2.subagents[0].id).toBe('sa-1')
  })

  it('error 이벤트 → subagents 보존', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'subagent',
        subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      })
    )
    const s2 = applyAgentEvent(s1, payload({ type: 'error', message: '오류 발생' }))
    expect(s2.subagents).toHaveLength(1)
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (freeze — subagent)', () => {
    const s0 = Object.freeze(makeInitialState())
    const s1 = applyAgentEvent(s0 as ReturnType<typeof makeInitialState>, payload({
      type: 'subagent',
      subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
    }))
    expect(s1).not.toBe(s0)
    expect(s0.subagents).toHaveLength(0)
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (freeze — tool_call with parentToolId)', () => {
    const base = makeInitialState()
    const s0 = {
      ...base,
      subagents: [{ id: 'sa-1', name: 'A', role: 'r', status: 'running' as const, tools: [] }],
    }
    const frozen = Object.freeze(s0)
    Object.freeze(frozen.subagents)
    const s1 = applyAgentEvent(frozen as ReturnType<typeof makeInitialState>, payload({
      type: 'tool_call',
      id: 'child-tc',
      name: 'bash',
      input: { command: 'ls' },
      parentToolId: 'sa-1',
    }))
    expect(s1.subagents[0].tools).toHaveLength(1)
    expect(frozen.subagents[0].tools).toHaveLength(0)
  })
})

describe('Phase 24b — selectSubagents 셀렉터', () => {
  it('selectSubagents가 store subagents를 반환한다', async () => {
    const { useAppStore, selectSubagents } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const subagents = [
      { id: 'sa-1', name: 'A', role: 'r', status: 'running' as const, tools: [] },
    ]
    useAppStore.setState({ subagents } as Parameters<typeof useAppStore.setState>[0])
    const result = selectSubagents(useAppStore.getState())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('sa-1')
  })

  it('selectSubagents: 초기 빈 배열 반환', async () => {
    const { useAppStore, selectSubagents } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({ subagents: [] } as Parameters<typeof useAppStore.setState>[0])
    const result = selectSubagents(useAppStore.getState())
    expect(result).toEqual([])
  })
})

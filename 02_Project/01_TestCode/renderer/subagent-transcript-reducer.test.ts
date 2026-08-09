import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'

const runId = 'run-37-transcript'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

function stateWithSa1() {
  const s0 = makeInitialState()
  return applyAgentEvent(
    s0,
    payload({
      type: 'subagent',
      subagent: {
        id: 'toolu_sa1',
        name: 'explorer',
        role: 'x',
        status: 'running',
        tools: [],
      },
    })
  )
}

describe('TR1 — parentToolId text → transcript append + 메인 thread 불변(버그수정 핵심)', () => {
  it('parentToolId="toolu_sa1" text delta → subagents[toolu_sa1].transcript에 {kind:"text", text:"hello"} append', () => {
    const s1 = stateWithSa1()
    const threadLenBefore = s1.thread.length

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'text',
        delta: 'hello',
        parentToolId: 'toolu_sa1',
      })
    )

    expect(s2.thread.length).toBe(threadLenBefore)

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1).toBeDefined()

    const transcript = sa1!.transcript as Array<{ kind: string; text?: string }>
    expect(transcript).toBeDefined()
    expect(transcript).toHaveLength(1)
    expect(transcript[0].kind).toBe('text')
    expect(transcript[0].text).toBe('hello')
  })

  it('메인 thread에 assistant msg 버블이 추가되지 않음(버그수정 단정)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'text',
        delta: 'sub content',
        parentToolId: 'toolu_sa1',
      })
    )

    const assistantMsgs = s2.thread.filter(
      item => item.kind === 'msg' && item.role === 'assistant'
    )
    expect(assistantMsgs).toHaveLength(0)
  })

  it('openMsgId 불변 — 서브에이전트 text가 메인 openMsgId를 오염시키지 않음', () => {
    const s1 = stateWithSa1()
    const openMsgIdBefore = s1.openMsgId

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'text',
        delta: 'sub text',
        parentToolId: 'toolu_sa1',
      })
    )

    expect(s2.openMsgId).toBe(openMsgIdBefore)
  })
})

describe('TR2 — parentToolId thinking → transcript {kind:"thinking", text}', () => {
  it('parentToolId="toolu_sa1" thinking → subagents[toolu_sa1].transcript에 {kind:"thinking", text:...} append', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'thinking',
        text: '서브에이전트 사고 중',
        parentToolId: 'toolu_sa1',
      })
    )

    expect(s2.thinkingText).toBeNull()

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as Array<{ kind: string; text?: string }>
    expect(transcript).toHaveLength(1)
    expect(transcript[0].kind).toBe('thinking')
    expect(transcript[0].text).toBe('서브에이전트 사고 중')
  })

  it('parentToolId thinking → 메인 thinkingText 오염 없음', () => {
    const s0 = makeInitialState()
    const sWithThinking = applyAgentEvent(
      s0,
      payload({ type: 'thinking', text: '메인 에이전트 사고' })
    )
    expect(sWithThinking.thinkingText).toBe('메인 에이전트 사고')

    const s1 = applyAgentEvent(
      sWithThinking,
      payload({
        type: 'subagent',
        subagent: { id: 'toolu_sa1', name: 'explorer', role: 'x', status: 'running', tools: [] },
      })
    )

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'thinking',
        text: '서브에이전트 사고',
        parentToolId: 'toolu_sa1',
      })
    )

    expect(s2.thinkingText).toBe('메인 에이전트 사고')
  })
})

describe('TR3 — parentToolId 없는 text → 메인 thread assistant 버블(회귀)', () => {
  it('parentToolId 없는 text → thread에 assistant msg 추가(기존 동작 불변)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'text', delta: '메인 에이전트 응답', messageId: 'msg-main-001' })
    )

    const assistantMsgs = s2.thread.filter(
      item => item.kind === 'msg' && item.role === 'assistant'
    )
    expect(assistantMsgs).toHaveLength(1)
    expect((assistantMsgs[0] as { kind: string; text: string }).text).toBe('메인 에이전트 응답')
  })

  it('parentToolId 없는 text → subagent transcript 미관여', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'text', delta: '메인 응답', messageId: 'msg-main-002' })
    )

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as Array<unknown> | undefined
    const transcriptLen = transcript ? transcript.length : 0
    expect(transcriptLen).toBe(0)
  })
})

describe('TR4 — parentToolId tool_call → subagents.tools 추가(기존) + transcript {kind:"tool"} 추가(신규)', () => {
  it('parentToolId tool_call → subagents[toolu_sa1].tools에 추가(기존 M4-4 동작 유지)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'toolu_child_read_001',
        name: 'Read',
        input: { file_path: 'src/main.ts' },
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1!.tools).toHaveLength(1)
    expect(sa1!.tools[0].id).toBe('toolu_child_read_001')
  })

  it('parentToolId tool_call → transcript에 {kind:"tool", verb, target, status, id} append(통합 타임라인)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'toolu_child_read_001',
        name: 'Read',
        input: { file_path: 'src/main.ts' },
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as Array<{
      kind: string
      verb?: string
      target?: string
      status?: string
      id?: string
    }>
    expect(transcript).toBeDefined()
    expect(transcript).toHaveLength(1)
    const item = transcript[0]
    expect(item.kind).toBe('tool')
    expect(item.verb).toBe('read')
    expect(item.target).toBe('src/main.ts')
    expect(item.id).toBe('toolu_child_read_001')
  })

  it('parentToolId tool_call → 메인 thread toolgroup 미관여(기존 M4-4 동작 유지)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'toolu_child_bash_001',
        name: 'Bash',
        input: { command: 'ls' },
        parentToolId: 'toolu_sa1',
      })
    )

    const toolgroups = s2.thread.filter(item => item.kind === 'toolgroup')
    expect(toolgroups).toHaveLength(0)
  })
})

describe('TR5 — text→thinking→text 순 parentToolId 이벤트 → transcript 시간순 누적', () => {
  it('text→thinking→text 순으로 적용 → transcript = [{kind:text},{kind:thinking},{kind:text}]', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'text',
        delta: '첫 번째 텍스트',
        parentToolId: 'toolu_sa1',
      })
    )

    const s3 = applyAgentEvent(
      s2,
      payload({
        type: 'thinking',
        text: '사고 과정',
        parentToolId: 'toolu_sa1',
      })
    )

    const s4 = applyAgentEvent(
      s3,
      payload({
        type: 'text',
        delta: '두 번째 텍스트',
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1 = s4.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as Array<{ kind: string; text?: string }>
    expect(transcript).toHaveLength(3)
    expect(transcript[0].kind).toBe('text')
    expect(transcript[0].text).toBe('첫 번째 텍스트')
    expect(transcript[1].kind).toBe('thinking')
    expect(transcript[1].text).toBe('사고 과정')
    expect(transcript[2].kind).toBe('text')
    expect(transcript[2].text).toBe('두 번째 텍스트')
  })
})

describe('TR6 — transcript item 누수 0(raw SDK 필드 없음)', () => {
  it('transcript text item에 session_id/uuid/raw SDK 필드 없음', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'text',
        delta: '내용',
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as unknown as Array<Record<string, unknown>>
    expect(transcript).toHaveLength(1)

    const item = transcript[0]
    const allowedKeys = new Set(['kind', 'text', 'verb', 'target', 'status', 'id'])
    const actualKeys = Object.keys(item)

    for (const key of actualKeys) {
      expect(allowedKeys.has(key)).toBe(true)
    }

    expect(item).not.toHaveProperty('session_id')
    expect(item).not.toHaveProperty('uuid')
    expect(item).not.toHaveProperty('messageId')
    expect(item).not.toHaveProperty('parentToolId')
    expect(item).not.toHaveProperty('delta')
  })

  it('transcript tool item에 누수 필드 없음', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 'toolu_t1',
        name: 'Read',
        input: { file_path: 'x.ts' },
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1 = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    const transcript = sa1!.transcript as unknown as Array<Record<string, unknown>>
    expect(transcript).toHaveLength(1)

    const item = transcript[0]
    const allowedKeys = new Set(['kind', 'text', 'verb', 'target', 'status', 'id'])
    const actualKeys = Object.keys(item)

    for (const key of actualKeys) {
      expect(allowedKeys.has(key)).toBe(true)
    }

    expect(item).not.toHaveProperty('name')
    expect(item).not.toHaveProperty('input')
    expect(item).not.toHaveProperty('parentToolId')
  })
})

describe('TA — transcript 도구 running→done 전환(reviewer 권고1, RED 예상)', () => {
  it('tool_result(ok:true) 적용 후 transcript의 kind===tool && id===t1 항목 status가 done이어야 한다(현재 미구현 → RED)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 't1',
        name: 'Read',
        input: { file_path: 'src/index.ts' },
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1Mid = s2.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1Mid).toBeDefined()
    const transcriptMid = sa1Mid!.transcript as Array<{
      kind: string; id?: string; status?: string
    }>
    expect(transcriptMid).toHaveLength(1)
    expect(transcriptMid[0].kind).toBe('tool')
    expect(transcriptMid[0].id).toBe('t1')
    expect(transcriptMid[0].status).toBe('running')

    const s3 = applyAgentEvent(
      s2,
      payload({ type: 'tool_result', id: 't1', ok: true, output: 'file contents' })
    )

    const sa1After = s3.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1After).toBeDefined()

    const toolEntry = sa1After!.tools.find(t => t.id === 't1')
    expect(toolEntry).toBeDefined()
    expect(toolEntry!.status).toBe('done')

    const transcriptAfter = sa1After!.transcript as Array<{
      kind: string; id?: string; status?: string
    }>
    const transcriptTool = transcriptAfter.find(
      item => item.kind === 'tool' && item.id === 't1'
    )
    expect(transcriptTool).toBeDefined()
    expect(transcriptTool!.status).toBe('done')
  })

  it('tool_result(ok:false) 적용 후 transcript tool 항목 status가 더 이상 running이 아니어야 한다(현재 미구현 → RED)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'tool_call',
        id: 't2',
        name: 'Bash',
        input: { command: 'ls -la' },
        parentToolId: 'toolu_sa1',
      })
    )

    const s3 = applyAgentEvent(
      s2,
      payload({ type: 'tool_result', id: 't2', ok: false, output: 'permission denied' })
    )

    const sa1 = s3.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1).toBeDefined()

    const transcriptAfter = sa1!.transcript as Array<{
      kind: string; id?: string; status?: string
    }>
    const transcriptTool = transcriptAfter.find(
      item => item.kind === 'tool' && item.id === 't2'
    )
    expect(transcriptTool).toBeDefined()

    expect(transcriptTool!.status).not.toBe('running')
  })
})

describe('TB — subagent upsert 시 transcript 보존(reviewer 권고2, GREEN 특성화)', () => {
  it('transcript 항목 존재 후 동일 id의 subagent 이벤트 재적용 → transcript 항목 유실 없음(즉시 GREEN)', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'text', delta: '첫 탐색 시작', parentToolId: 'toolu_sa1' })
    )

    const s3 = applyAgentEvent(
      s2,
      payload({ type: 'thinking', text: '디렉토리 구조 파악 중', parentToolId: 'toolu_sa1' })
    )

    const s4 = applyAgentEvent(
      s3,
      payload({
        type: 'tool_call',
        id: 'tc_list_001',
        name: 'Bash',
        input: { command: 'ls src/' },
        parentToolId: 'toolu_sa1',
      })
    )

    const sa1Before = s4.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1Before).toBeDefined()
    const transcriptBefore = sa1Before!.transcript as unknown[]
    expect(transcriptBefore).toHaveLength(3)

    const s5 = applyAgentEvent(
      s4,
      payload({
        type: 'subagent',
        subagent: {
          id: 'toolu_sa1',
          name: 'explorer2',
          role: 'explorer',
          status: 'running',
          tools: [],
        },
      })
    )

    const sa1After = s5.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1After).toBeDefined()

    expect(sa1After!.name).toBe('explorer2')

    const transcriptAfter = sa1After!.transcript as unknown[]
    expect(transcriptAfter).toBeDefined()
    expect(transcriptAfter).toHaveLength(3)
  })

  it('subagent 이벤트에 transcript 키 없으면 기존 text 항목 내용도 보존됨', () => {
    const s1 = stateWithSa1()

    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'text', delta: '파일 A 분석 완료', parentToolId: 'toolu_sa1' })
    )
    const s3 = applyAgentEvent(
      s2,
      payload({ type: 'text', delta: '파일 B 분석 시작', parentToolId: 'toolu_sa1' })
    )

    const s4 = applyAgentEvent(
      s3,
      payload({
        type: 'subagent',
        subagent: {
          id: 'toolu_sa1',
          name: 'explorer',
          role: 'x',
          status: 'running',
          tools: [],
        },
      })
    )

    const sa1 = s4.subagents.find(sa => sa.id === 'toolu_sa1')
    expect(sa1).toBeDefined()

    const transcript = sa1!.transcript as Array<{ kind: string; text?: string }>
    expect(transcript).toBeDefined()
    expect(transcript).toHaveLength(2)
    expect(transcript[0].text).toBe('파일 A 분석 완료')
    expect(transcript[1].text).toBe('파일 B 분석 시작')
  })
})

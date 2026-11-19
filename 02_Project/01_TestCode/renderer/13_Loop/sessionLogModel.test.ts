import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../../../02_Project/00_Source/shared/agentEvents'
import type { LoopSessionEventPayload, LoopSessionLog, LoopSessionTag } from '../../../../02_Project/00_Source/shared/ipcContract'
import { applyPush, foldSession, fromSnapshot, mainPanelOf, rowLabel } from '@renderer/13_Loop/sessionLogModel'

const CWD = 'C:\\work\\practice'
const tag = (key: string, over: Partial<LoopSessionTag> = {}): LoopSessionTag => ({ key, kind: 'work', node: 'implement', goal: 'G2', sessionId: null, ...over })
const tool = (id: string): AgentEvent => ({ type: 'tool_call', id, name: 'Read', input: { file_path: 'src/a.ts' } })
const push = (key: string, seq: number, event: AgentEvent, over: Partial<LoopSessionTag> = {}): LoopSessionEventPayload => ({ cwd: CWD, session: tag(key, over), event, seq })

describe('스냅숏과 push 맞물리기 (M10 G4)', () => {
  it('스냅숏 앞에 온 push 가운데 next보다 작은 차례는 버리고, 나머지는 차례대로 잇는다', () => {
    const snap: LoopSessionLog = {
      cwd: CWD,
      sessions: [{ session: tag('a.1'), events: [tool('t0'), tool('t1')], next: 2, truncated: false, live: true }],
    }
    const s = fromSnapshot(snap, [push('a.1', 1, tool('t1')), push('a.1', 2, tool('t2')), push('a.1', 3, tool('t3'))])
    const rec = s.get('a.1')
    expect(rec?.events.map((e) => (e as { id: string }).id)).toEqual(['t0', 't1', 't2', 't3'])
    expect(rec?.next).toBe(4)
  })

  it('스냅숏 뒤의 push는 겹치면 버리고, 처음 보는 세션은 새로 연다(꼬리표는 마지막 것)', () => {
    let s = fromSnapshot({ cwd: CWD, sessions: [] }, [])
    s = applyPush(s, push('b.1', 0, { type: 'session', sessionId: 'S1' }))
    s = applyPush(s, push('b.1', 1, tool('t1'), { sessionId: 'S1' }))
    s = applyPush(s, push('b.1', 1, tool('t1'), { sessionId: 'S1' }))
    const rec = s.get('b.1')
    expect(rec?.events.map((e) => e.type)).toEqual(['session', 'tool_call'])
    expect(rec?.session.sessionId).toBe('S1')
    expect(rec?.live).toBe(true)
    expect([...s.keys()]).toEqual(['b.1'])
  })
})

describe('세션 하나 접기 — 보기 전용 (M10 G4)', () => {
  it('채팅과 같은 접기로 글과 도구 묶음을 만든다', () => {
    const events: AgentEvent[] = [
      { type: 'session', sessionId: 'S1' },
      { type: 'text', delta: 'goal 문서를 읽었어.', messageId: 'm1' },
      tool('t1'),
      { type: 'tool_result', id: 't1', ok: true, output: 'ok' },
    ]
    const v = foldSession(events, true)
    expect(v.thread.map((i) => i.kind)).toEqual(['msg', 'toolgroup'])
    const msg = v.thread[0]
    expect(msg.kind === 'msg' && msg.text).toBe('goal 문서를 읽었어.')
    expect(v.isRunning).toBe(false)
  })

  it('끝난 세션도 기록 전체(사고·글·도구)를 같은 모양으로 보인다', () => {
    const events: AgentEvent[] = [
      { type: 'thinking_delta', text: '표 함수부터', estimatedTokens: 12 },
      { type: 'text', delta: '테스트를 쓸게.', messageId: 'm1' },
      tool('t1'),
    ]
    const ended = foldSession(events, false)
    expect(ended.thread.map((i) => i.kind)).toEqual(['thinking', 'msg', 'toolgroup'])
    expect(ended.thread[0].kind === 'thinking' && ended.thread[0].text).toBe('표 함수부터')
  })

  it('떠 있지 않은 세션은 「작업 중」을 내리고, 권한·질문 사건이 있어도 사람 답을 기다리는 상태를 싣지 않는다', () => {
    const events: AgentEvent[] = [
      { type: 'text', delta: '고칠게', messageId: 'm1' },
      { type: 'permission_request', requestId: 'p1', toolName: 'Edit', summary: 'src/a.ts', input: {} } as AgentEvent,
      { type: 'question_request', requestId: 'q1', questions: [] } as AgentEvent,
    ]
    const ended = foldSession(events, false)
    expect(ended.isRunning).toBe(false)
    expect(ended.pendingPermission).toBeNull()
    expect(ended.pendingQuestion).toBeNull()
    expect(foldSession(events, true).pendingPermission).toBeNull()
  })
})

describe('메인 대화의 할 일·서브에이전트와 줄 이름 (M10 G4)', () => {
  it('메인 대화 세션의 마지막 할 일과 서브에이전트를 뽑는다. 기록이 없으면 비어 있다', () => {
    expect(mainPanelOf(undefined)).toEqual({ todos: [], subagents: [] })
    const events: AgentEvent[] = [
      { type: 'todos', todos: [{ id: '1', label: '결정 대장 쓰기', status: 'running' }] },
      { type: 'subagent', subagent: { id: 'sa1', name: 'Explore', role: '탐색', status: 'running', tools: [] } },
      { type: 'todos', todos: [{ id: '1', label: '결정 대장 쓰기', status: 'done' }, { id: '2', label: '스펙 초안', status: 'planned' }] },
    ]
    const p = mainPanelOf({ session: tag('main', { kind: 'main', node: null, goal: null }), events, next: 3, truncated: false, live: true })
    expect(p.todos.map((t) => `${t.label}:${t.status}`)).toEqual(['결정 대장 쓰기:done', '스펙 초안:planned'])
    expect(p.subagents.map((a) => a.name)).toEqual(['Explore'])
  })

  it('줄 이름은 goal·노드·종류다', () => {
    expect(rowLabel({ kind: 'work', node: 'implement', goal: 'G2' })).toBe('G2 implement · 작업')
    expect(rowLabel({ kind: 'review', node: 'review', goal: null })).toBe('review · 검수')
  })
})

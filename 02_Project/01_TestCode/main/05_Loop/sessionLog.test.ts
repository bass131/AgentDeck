import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopSessionTag } from '@shared/13_Loop/loop'
import { createSessionLog } from '@main/05_Loop/sessionLog'

const CWD = 'C:/work/practice'
const tag = (key: string, over: Partial<LoopSessionTag> = {}): LoopSessionTag => ({ key, kind: 'work', node: 'implement', goal: 'G1', sessionId: null, ...over })
const text = (delta: string, messageId?: string): AgentEvent => ({ type: 'text', delta, ...(messageId !== undefined ? { messageId } : {}) })
const tool = (id: string): AgentEvent => ({ type: 'tool_call', id, name: 'Read', input: { file_path: 'a.ts' } })

describe('노드 세션 기록 (M10 G4)', () => {
  it('꼬리표 key별로 처음부터 모이고, 세션 안 차례는 받은 사건마다 오르며 스냅숏의 next와 맞물린다', () => {
    const log = createSessionLog()
    expect(log.record(CWD, tag('a.1'), { type: 'session', sessionId: 's1' } as AgentEvent)).toEqual({ seq: 0, isNew: true })
    expect(log.record(CWD, tag('a.1', { sessionId: 's1' }), tool('t1'))).toEqual({ seq: 1, isNew: false })
    expect(log.record(CWD, tag('a.2', { kind: 'review', node: 'review' }), tool('t2'))).toEqual({ seq: 0, isNew: true })
    const snap = log.read(CWD)
    expect(snap.cwd).toBe(CWD)
    expect(snap.sessions.map((s) => s.session.key)).toEqual(['a.1', 'a.2'])
    const first = snap.sessions[0]
    expect(first.next).toBe(2)
    expect(first.events.map((e) => e.type)).toEqual(['session', 'tool_call'])
    // 꼬리표는 마지막으로 받은 것(SDK 세션 id가 실린 뒤)이다
    expect(first.session.sessionId).toBe('s1')
    expect(first.live).toBe(true)
    expect(first.truncated).toBe(false)
  })

  it('이어진 글자 조각(같은 messageId·parentToolId)과 사고 조각은 한 사건으로 이어 붙인다 — 차례는 조각마다 오른다', () => {
    const log = createSessionLog()
    log.record(CWD, tag('a.1'), text('안', 'm1'))
    log.record(CWD, tag('a.1'), text('녕', 'm1'))
    log.record(CWD, tag('a.1'), text('다른', 'm2'))
    log.record(CWD, tag('a.1'), { type: 'thinking_delta', text: '생' })
    log.record(CWD, tag('a.1'), { type: 'thinking_delta', text: '각', estimatedTokens: 7 })
    const { seq } = log.record(CWD, tag('a.1'), tool('t1'))
    expect(seq).toBe(5)
    const s = log.read(CWD).sessions[0]
    expect(s.next).toBe(6)
    expect(s.events).toEqual([
      { type: 'text', delta: '안녕', messageId: 'm1' },
      { type: 'text', delta: '다른', messageId: 'm2' },
      { type: 'thinking_delta', text: '생각', estimatedTokens: 7 },
      tool('t1'),
    ])
  })

  it('읽은 스냅숏은 그 뒤 기록으로 바뀌지 않는다(이어 붙이기가 앞서 준 사건을 고치지 않는다)', () => {
    const log = createSessionLog()
    log.record(CWD, tag('a.1'), text('앞', 'm1'))
    const before = log.read(CWD)
    log.record(CWD, tag('a.1'), text('뒤', 'm1'))
    expect(before.sessions[0].events).toEqual([{ type: 'text', delta: '앞', messageId: 'm1' }])
    expect(log.read(CWD).sessions[0].events).toEqual([{ type: 'text', delta: '앞뒤', messageId: 'm1' }])
  })

  it('세션 하나의 사건이 상한을 넘으면 앞을 버리고 truncated를 단다 — next는 그대로 받은 수다', () => {
    const log = createSessionLog({ maxEvents: 3 })
    for (let i = 0; i < 5; i++) log.record(CWD, tag('a.1'), tool(`t${i}`))
    const s = log.read(CWD).sessions[0]
    expect(s.events.map((e) => (e as { id: string }).id)).toEqual(['t2', 't3', 't4'])
    expect(s.truncated).toBe(true)
    expect(s.next).toBe(5)
  })

  it('끝내기는 떠 있는 작업·검수 세션만 끝낸다 — 메인 대화는 끝나지 않고 줄(rows)에도 들지 않는다', () => {
    const log = createSessionLog()
    log.record(CWD, tag('main', { kind: 'main', node: null, goal: null }), text('메인'))
    log.record(CWD, tag('a.1'), tool('t1'))
    log.record(CWD, tag('a.2', { kind: 'review', node: 'review' }), tool('t2'))
    expect(log.rows(CWD)).toEqual([
      { key: 'a.1', kind: 'work', node: 'implement', goal: 'G1', live: true },
      { key: 'a.2', kind: 'review', node: 'review', goal: 'G1', live: true },
    ])
    expect(log.endAll(CWD)).toBe(true)
    expect(log.endAll(CWD)).toBe(false)
    expect(log.rows(CWD).map((r) => r.live)).toEqual([false, false])
    const main = log.read(CWD).sessions.find((s) => s.session.kind === 'main')
    expect(main?.live).toBe(true)
  })

  it('비우기는 그 세션의 사건만 지우고 차례는 이어 간다 — 스냅숏 뒤 push가 next와 계속 맞물린다 (G4 검수 10)', () => {
    const log = createSessionLog()
    const main = tag('main', { kind: 'main', node: null, goal: null })
    log.record(CWD, main, { type: 'todos', todos: [{ id: '1', label: '옛 할 일', status: 'running' }] })
    log.record(CWD, main, text('메인'))
    log.record(CWD, tag('a.1'), tool('t1'))
    log.clear(CWD, 'main')
    log.clear('C:/nowhere', 'main')
    const cleared = log.read(CWD).sessions.find((s) => s.session.key === 'main')
    expect(cleared?.events).toEqual([])
    expect(cleared?.next).toBe(2)
    expect(cleared?.truncated).toBe(false)
    expect(log.read(CWD).sessions.find((s) => s.session.key === 'a.1')?.events).toHaveLength(1)
    expect(log.record(CWD, main, text('새 장'))).toEqual({ seq: 2, isNew: false })
    expect(log.read(CWD).sessions.find((s) => s.session.key === 'main')?.events).toEqual([text('새 장')])
  })

  it('세션 수가 상한을 넘으면 끝난 작업 세션부터 버린다 — 메인 대화와 떠 있는 세션은 남는다', () => {
    const log = createSessionLog({ maxSessions: 3 })
    log.record(CWD, tag('main', { kind: 'main', node: null, goal: null }), text('메인'))
    log.record(CWD, tag('a.1'), tool('t1'))
    log.endAll(CWD)
    log.record(CWD, tag('a.2'), tool('t2'))
    log.record(CWD, tag('a.3'), tool('t3'))
    expect(log.read(CWD).sessions.map((s) => s.session.key)).toEqual(['main', 'a.2', 'a.3'])
  })

  it('폴더 키는 경로 표기와 무관하고, 다른 폴더의 사건은 섞이지 않는다', () => {
    const log = createSessionLog()
    log.record('C:\\Work\\Practice\\', tag('a.1'), tool('t1'))
    log.record('C:/work/other', tag('b.1'), tool('t9'))
    const snap = log.read('c:/work/practice')
    if (process.platform === 'win32') expect(snap.sessions.map((s) => s.session.key)).toEqual(['a.1'])
    expect(log.read('C:/work/other').sessions.map((s) => s.session.key)).toEqual(['b.1'])
    expect(log.read('C:/nowhere').sessions).toEqual([])
  })
})

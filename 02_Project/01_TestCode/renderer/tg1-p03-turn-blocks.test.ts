import { describe, it, expect } from 'vitest'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'

const TURN_BLOCKS_MODULE: string = '../../../02_Project/00_Source/renderer/src/lib/turnBlocks'

export type TurnBlockKind = 'user' | 'agent' | 'standalone'

export interface TurnBlock {
  kind: TurnBlockKind
  items: ThreadItem[]
}

type TurnBlocksModule = {
  groupIntoTurnBlocks: (thread: ThreadItem[]) => TurnBlock[]
}

async function loadGroupIntoTurnBlocks(): Promise<TurnBlocksModule['groupIntoTurnBlocks']> {
  const mod = (await import(TURN_BLOCKS_MODULE)) as TurnBlocksModule
  return mod.groupIntoTurnBlocks
}

const userMsg = (id: string): ThreadItem => ({ kind: 'msg', id, role: 'user', text: '질문' })
const assistantMsg = (id: string, extra?: Partial<Extract<ThreadItem, { kind: 'msg' }>>): ThreadItem => ({
  kind: 'msg',
  id,
  role: 'assistant',
  text: '답변',
  ...extra,
})
const thinking = (id: string): ThreadItem => ({ kind: 'thinking', id, text: '사고 전문' })
const toolgroup = (id: string): ThreadItem => ({ kind: 'toolgroup', id, tools: [] })
const subagent = (id: string): ThreadItem => ({ kind: 'subagent', id })
const notice = (id: string): ThreadItem => ({ kind: 'notice', id, text: '알림' })
const compactBoundary = (id: string): ThreadItem => ({ kind: 'compact-boundary', id })
const informational = (id: string): ThreadItem => ({ kind: 'informational', id, content: '정보', level: 'info' })
const permissionDenied = (id: string): ThreadItem => ({ kind: 'permission-denied', id, toolName: 'Bash' })
const cmdresult = (id: string): ThreadItem => ({ kind: 'cmdresult', id, name: 'compact', title: '압축', running: false })
const orchestration = (id: string): ThreadItem => ({ kind: 'orchestration', id, name: 'wf', running: false })

function kindsOf(blocks: TurnBlock[]): TurnBlockKind[] {
  return blocks.map((b) => b.kind)
}

function itemKindsOf(block: TurnBlock): string[] {
  return block.items.map((i) => i.id)
}

describe('tg1-p03 턴 그룹핑 — 경계 케이스 ①', () => {
  it('빈 thread → 빈 배열', async () => {
    const group = await loadGroupIntoTurnBlocks()
    expect(group([])).toEqual([])
  })
})

describe('tg1-p03 턴 그룹핑 — 경계 케이스 ②', () => {
  it('[thinking, toolgroup, assistant] → agent 블록 1개(순서 보존)', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [thinking('t1'), toolgroup('tg1'), assistantMsg('a1')]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['agent'])
    expect(itemKindsOf(blocks[0])).toEqual(['t1', 'tg1', 'a1'])
  })

  it('subagent도 agent-side — [thinking, subagent, assistant] → agent 블록 1개', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [thinking('t1'), subagent('s1'), assistantMsg('a1')]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['agent'])
    expect(itemKindsOf(blocks[0])).toEqual(['t1', 's1', 'a1'])
  })
})

describe('tg1-p03 턴 그룹핑 — 경계 케이스 ③', () => {
  it('[user, thinking, assistant] → user 블록 + agent 블록(순서 보존, 2개)', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [userMsg('u1'), thinking('t1'), assistantMsg('a1')]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['user', 'agent'])
    expect(itemKindsOf(blocks[0])).toEqual(['u1'])
    expect(itemKindsOf(blocks[1])).toEqual(['t1', 'a1'])
  })

  it('agent 런 도중 user msg가 끼어도(비정상 데이터) 자기 블록으로 분리 — 앞뒤 agent 런은 각각 별도', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [assistantMsg('a1'), userMsg('u1'), assistantMsg('a2')]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['agent', 'user', 'agent'])
    expect(itemKindsOf(blocks[0])).toEqual(['a1'])
    expect(itemKindsOf(blocks[1])).toEqual(['u1'])
    expect(itemKindsOf(blocks[2])).toEqual(['a2'])
  })
})

describe('tg1-p03 턴 그룹핑 — 경계 케이스 ④', () => {
  it('[thinking, assistant, notice, assistant2] → agent·standalone·agent 3블록(연속 병합 없음)', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [thinking('t1'), assistantMsg('a1'), notice('n1'), assistantMsg('a2')]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['agent', 'standalone', 'agent'])
    expect(itemKindsOf(blocks[0])).toEqual(['t1', 'a1'])
    expect(itemKindsOf(blocks[1])).toEqual(['n1'])
    expect(itemKindsOf(blocks[2])).toEqual(['a2'])
  })

  it('standalone 6종 전부 독립 블록 판정(연속 standalone도 병합 없이 각자 블록)', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [
      notice('n1'),
      compactBoundary('cb1'),
      informational('inf1'),
      permissionDenied('pd1'),
      cmdresult('cr1'),
      orchestration('or1'),
    ]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(Array(6).fill('standalone'))
    blocks.forEach((b, i) => expect(itemKindsOf(b)).toEqual([thread[i].id]))
  })
})

describe('tg1-p03 턴 그룹핑 — 경계 케이스 ⑤', () => {
  it('interrupted:true assistant msg도 agent 블록에 합류(특별취급 0)', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [userMsg('u1'), assistantMsg('a1', { interrupted: true })]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['user', 'agent'])
    expect(itemKindsOf(blocks[1])).toEqual(['a1'])
  })
})

describe('tg1-p03 턴 그룹핑 — 경계 케이스 ⑥', () => {
  it("origin:'cron' assistant msg도 agent 블록에 합류(특별취급 0)", async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [userMsg('u1'), assistantMsg('a1', { origin: 'cron' })]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['user', 'agent'])
    expect(itemKindsOf(blocks[1])).toEqual(['a1'])
  })
})

describe('tg1-p03 턴 그룹핑 — 결정론', () => {
  it('동일 입력 → 동일 출력(동일 kind·순서), 여러 번 호출해도 안정', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [userMsg('u1'), thinking('t1'), toolgroup('tg1'), assistantMsg('a1')]
    const first = group(thread)
    const second = group(thread)
    expect(kindsOf(first)).toEqual(kindsOf(second))
    expect(first.map(itemKindsOf)).toEqual(second.map(itemKindsOf))
  })
})

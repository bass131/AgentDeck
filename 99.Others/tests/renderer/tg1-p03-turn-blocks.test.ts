/**
 * tg1-p03-turn-blocks.test.ts — TG1 P03 턴 그룹핑 순수 함수 (TDD RED-first)
 *
 * 목표(Phase 03, 01.Phases/18_TG1-thinking-gui/03-turn-block-unification.md): 단일 채팅에서
 * "한 턴 = 한 블록 = 아바타 1개"를 성립시키기 위해, thread(ThreadItem[])를 턴 블록 배열로
 * 그룹핑하는 순수 함수를 결정론으로 못박는다. 렌더(Conversation.tsx)는 이 함수의 결과만
 * useMemo로 소비한다(단방향 흐름 — 컴포넌트가 그룹핑 로직을 직접 갖지 않는다).
 *
 * ── 확정 계약(renderer가 이 시그니처로 구현) ──────────────────────────────────────
 *   파일:   02.Source/renderer/src/lib/turnBlocks.ts   (신규 — 현재 부재)
 *   export: groupIntoTurnBlocks(thread: ThreadItem[]): TurnBlock[]
 *           TurnBlock = { kind: 'user' | 'agent' | 'standalone', items: ThreadItem[] }
 *
 * ── 경계 규칙(브리프 원문) ──────────────────────────────────────────────────────
 *   - user: role:'user' msg 1개 — 항상 자기 자신만의 블록(kind='user').
 *   - agent: 연속하는 agent-side 아이템의 최대 런을 한 블록으로 묶는다. agent-side =
 *     thinking · toolgroup · msg(role:'assistant') · subagent.
 *   - standalone: notice · compact-boundary · informational · permission-denied ·
 *     cmdresult · orchestration — 아바타 없는 독립 행. 진행 중이던 agent 런을 끊고
 *     (다음 agent 아이템은 새 블록), 자신도 항상 독립 1아이템 블록.
 *   - 반환은 순서 보존 블록 배열. 순수 함수(fs/네트워크/타이머/랜덤 0, 결정론).
 *
 * ── 현재 RED 이유 ─────────────────────────────────────────────────────────────────
 *   turnBlocks.ts 자체가 아직 없다. 동적 import → 파일 부재 → reject → 개별 FAIL(RED).
 *   (변수 지정자 동적 import로 typecheck-green 유지 — gap1-p16 계열① / 계열② 동일 관례.)
 */
import { describe, it, expect } from 'vitest'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

const TURN_BLOCKS_MODULE: string = '../../../02.Source/renderer/src/lib/turnBlocks'

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

// ── 픽스처 헬퍼(고정) ─────────────────────────────────────────────────────────────
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

// ── ① 빈 thread ────────────────────────────────────────────────────────────────
describe('tg1-p03 턴 그룹핑 — 경계 케이스 ①', () => {
  it('빈 thread → 빈 배열', async () => {
    const group = await loadGroupIntoTurnBlocks()
    expect(group([])).toEqual([])
  })
})

// ── ② agent-side 최대 런 하나로 묶임(순서 보존) ─────────────────────────────────
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

// ── ③ user는 항상 자기 블록 ────────────────────────────────────────────────────
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

// ── ④ standalone이 agent 런을 끊음 + 자신도 독립 블록 ───────────────────────────
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

// ── ⑤ interrupted assistant msg — 특별처리 없이 agent-side 그대로 ───────────────
describe('tg1-p03 턴 그룹핑 — 경계 케이스 ⑤', () => {
  it('interrupted:true assistant msg도 agent 블록에 합류(특별취급 0)', async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [userMsg('u1'), assistantMsg('a1', { interrupted: true })]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['user', 'agent'])
    expect(itemKindsOf(blocks[1])).toEqual(['a1'])
  })
})

// ── ⑥ cron origin assistant도 agent-side ────────────────────────────────────────
describe('tg1-p03 턴 그룹핑 — 경계 케이스 ⑥', () => {
  it("origin:'cron' assistant msg도 agent 블록에 합류(특별취급 0)", async () => {
    const group = await loadGroupIntoTurnBlocks()
    const thread: ThreadItem[] = [userMsg('u1'), assistantMsg('a1', { origin: 'cron' })]
    const blocks = group(thread)
    expect(kindsOf(blocks)).toEqual(['user', 'agent'])
    expect(itemKindsOf(blocks[1])).toEqual(['a1'])
  })
})

// ── 결정론(순수 함수) ─────────────────────────────────────────────────────────────
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

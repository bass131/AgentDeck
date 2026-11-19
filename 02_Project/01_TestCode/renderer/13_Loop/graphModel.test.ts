// M10 G5 — 그래프 탭의 표시 판정(순수 함수). 지금 위치·끝남·실패 수는 LoopStatus(node·goals·failCount·phase·recentLines)에서만 온다.
// 같은 상태를 넣으면 같은 표시다. 노드 이름 `G2/implement`는 목표 G2의 반복 틀 안 implement, 슬래시 없는 이름은 마일스톤 수준 노드다.
import { describe, expect, it } from 'vitest'
import type { LoopGraph, LoopGraphNode, LoopStatus, LoopVerificationLine } from '../../../../02_Project/00_Source/shared/ipcContract'
import { edgePath, fitScale, graphBounds, loopBox, loopLabel, nodeMarks, placeOf } from '@renderer/13_Loop/graphModel'
import { MARKER_LABEL, VERDICT_LABEL } from '@renderer/13_Loop/loopModel'

const node = (id: string, scope: LoopGraphNode['scope'], x: number, y: number, over: Partial<LoopGraphNode> = {}): LoopGraphNode => ({
  id, title: id, kind: 'work', scope, role: 'worker', rule: null, commands: [], next: null, onFail: null, when: null, position: { x, y }, ...over,
})
const GRAPH: LoopGraph = {
  templateId: 't', title: 'T', failLimit: 3,
  nodes: [
    node('brainstorm', 'milestone', 40, 40), node('decompose', 'milestone', 200, 40),
    node('goal-branch', 'goal', 40, 202), node('implement', 'goal', 200, 202), node('checks', 'goal', 360, 202, { kind: 'rule', onFail: { goto: 'implement', limit: 3 } }),
    node('regression', 'milestone', 40, 364),
  ],
  edges: [
    { from: 'brainstorm', to: 'decompose', kind: 'next' }, { from: 'decompose', to: 'goal-branch', kind: 'next' },
    { from: 'goal-branch', to: 'implement', kind: 'next' }, { from: 'implement', to: 'checks', kind: 'next' },
    { from: 'checks', to: 'regression', kind: 'next' }, { from: 'checks', to: 'implement', kind: 'fail' }, { from: 'checks', to: 'goal-branch', kind: 'repeat' },
  ],
  goalLoop: { id: 'goals', title: 'goal마다', nodes: ['goal-branch', 'implement', 'checks'] },
}
const line = (marker: LoopVerificationLine['marker'], n: string, goal: string | null): LoopVerificationLine => ({ marker, at: '2026-11-20T00:00:00Z', node: n, goal, sentence: 's' })
const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: 'C:/w', root: 'C:/w', phase: 'running', milestoneId: 'M1', node: null, nodeTitle: null, reason: null, base: 'main', ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
  paused: false, mainBusy: false, mainWaiting: false, mainNode: false, recentLines: [], sessions: [], ...over,
})
const goals: LoopStatus['goals'] = [
  { id: 'G1', title: 'a', status: 'done', grade: 'weak', pr: 1 },
  { id: 'G2', title: 'b', status: 'active', grade: null, pr: null },
]

describe('검증 기록 마커의 화면 이름 (M10 G5)', () => {
  it('저장 값은 그대로 두고 화면에는 통과·실패·사람 입력으로 보인다', () => {
    expect(MARKER_LABEL).toEqual({ PASS: '통과', FAIL: '실패', 'USER-INPUT': '사람 입력' })
    expect(VERDICT_LABEL).toEqual({ pass: '통과', fail: '실패', stop: '멈춤' })
  })
})

describe('노드 이름 대응 (M10 G5)', () => {
  it('슬래시 앞은 목표, 뒤는 반복 틀 안 노드다. 슬래시가 없으면 마일스톤 수준이다', () => {
    expect(placeOf('G2/implement')).toEqual({ goal: 'G2', node: 'implement' })
    expect(placeOf('regression')).toEqual({ goal: null, node: 'regression' })
    expect(placeOf(null)).toBeNull()
  })
})

describe('지금 위치·끝남·실패 수 (M10 G5)', () => {
  it('반복 틀 안 지금 노드가 강조되고, 앞 노드(틀 앞 전부와 틀 안 앞 단계)는 끝났다', () => {
    const m = nodeMarks(GRAPH, st({ node: 'G2/checks', goals, failCount: 2 }))
    expect(Object.entries(m).filter(([, v]) => v.now).map(([k]) => k)).toEqual(['checks'])
    expect(Object.entries(m).filter(([, v]) => v.done).map(([k]) => k)).toEqual(['brainstorm', 'decompose', 'goal-branch', 'implement'])
    expect(m.checks.fails).toBe(2)
  })

  it('틀 뒤의 노드에 있으면 틀 안 노드도 끝났다. 마일스톤이 끝나면 모두 끝났다', () => {
    const after = nodeMarks(GRAPH, st({ node: 'regression', goals: goals.map((g) => ({ ...g, status: 'done' as const })) }))
    expect(Object.values(after).filter((v) => v.done)).toHaveLength(5)
    expect(after.regression.now).toBe(true)
    const done = nodeMarks(GRAPH, st({ phase: 'done', node: null }))
    expect(Object.values(done).every((v) => v.done && !v.now)).toBe(true)
  })

  it('지금 노드가 없으면(시작 전·닫힘) 강조도 끝남도 없다', () => {
    for (const s of [st({ phase: 'not-started' }), st({ phase: 'closed' })]) {
      expect(Object.values(nodeMarks(GRAPH, s)).some((v) => v.now || v.done)).toBe(false)
    }
  })

  it('카드의 실패 수는 그 범위의 마지막 사람 입력 뒤 그 노드 실패 줄 수다 — 다른 목표의 실패는 세지 않는다', () => {
    const recentLines = [
      line('FAIL', 'checks', 'G1'), line('FAIL', 'checks', 'G2'), line('USER-INPUT', 'checks', 'G2'), line('FAIL', 'checks', 'G2'),
      line('FAIL', 'brainstorm', null),
    ]
    const m = nodeMarks(GRAPH, st({ node: 'G2/implement', goals, recentLines, failCount: 0 }))
    expect(m.checks.fails).toBe(1)
    expect(m.brainstorm.fails).toBe(1)
    expect(m.implement.fails).toBe(0)
  })

  it('같은 상태를 넣으면 같은 표시다', () => {
    const s = st({ node: 'G2/implement', goals, recentLines: [line('FAIL', 'checks', 'G2')] })
    expect(nodeMarks(GRAPH, s)).toEqual(nodeMarks(GRAPH, structuredClone(s)))
  })

  it('반복 틀 묶음의 이름은 끝난 목표와 지금 목표를 보인다', () => {
    expect(loopLabel(st({ goals }))).toBe('목표 반복 — G1 ✓ · 지금 G2')
    expect(loopLabel(st())).toBe('목표 반복')
  })
})

describe('배치와 선 (M10 G5)', () => {
  it('묶음 상자는 틀 안 노드를 둘러싸고, 전체 크기는 모든 카드와 상자를 담는다', () => {
    const box = loopBox(GRAPH)
    expect(box).not.toBeNull()
    if (!box) return
    expect(box.x).toBeLessThan(40)
    expect(box.y).toBeLessThan(202)
    expect(box.x + box.w).toBeGreaterThan(360 + 120)
    const b = graphBounds(GRAPH)
    expect(b.w).toBeGreaterThanOrEqual(box.x + box.w)
    expect(b.h).toBeGreaterThan(364 + 52)
  })

  it('같은 줄의 다음 선은 곧은 선, 줄을 바꾸는 선은 꺾인 선, 되돌아가는 길은 곡선이다', () => {
    const at = (id: string) => GRAPH.nodes.find((n) => n.id === id) as LoopGraphNode
    expect(edgePath(at('brainstorm'), at('decompose'), 'next')).toBe('M160 66 L200 66')
    expect(edgePath(at('decompose'), at('goal-branch'), 'next')).toMatch(/^M320 66 H\d+ V\d+ H\d+ V228 H40$/)
    expect(edgePath(at('checks'), at('implement'), 'fail')).toMatch(/^M420 254 C/)
  })

  it('맞춤 배율은 보이는 칸에 그래프를 담는다 — 칸 크기를 모르면 1이다', () => {
    expect(fitScale({ w: 1000, h: 500 }, { w: 500, h: 500 })).toBeCloseTo(0.5)
    expect(fitScale({ w: 100, h: 100 }, { w: 2000, h: 2000 })).toBe(1)
    expect(fitScale({ w: 1000, h: 500 }, { w: 0, h: 0 })).toBe(1)
  })
})

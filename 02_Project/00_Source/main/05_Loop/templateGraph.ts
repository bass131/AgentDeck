// 템플릿을 화면용 그래프(shared/13_Loop/graph.ts)로 바꾼다. 보기 전용이고 템플릿 값을 고치지 않는다.
// 자동 배치: 목표 반복 틀 앞의 노드는 첫 줄, 틀 안 노드는 둘째 줄, 틀 뒤의 노드는 셋째 줄에 왼쪽부터 놓는다.
import { GRAPH_CARD, type GraphNodeKind, type LoopGraph, type LoopGraphEdge, type LoopGraphNode } from '@shared/13_Loop/graph'
import { FAIL_LIMIT } from './runState'
import type { StepNode, Template } from './template'

const ORIGIN = { x: 40, y: 40 }
const COL = GRAPH_CARD.width + 40
const ROW = GRAPH_CARD.height + 110

function kindOf(n: StepNode): GraphNodeKind {
  if (n.kind === 'work') return 'work'
  if (n.kind === 'action') return 'action'
  return n.judge
}

function nodeOf(n: StepNode, scope: LoopGraphNode['scope'], next: string | null, row: number, col: number, failLimit: number): LoopGraphNode {
  const rule = n.kind === 'gate' ? n.rule ?? null : null
  return {
    id: n.id,
    title: n.title,
    kind: kindOf(n),
    scope,
    role: n.kind === 'work' ? n.role : null,
    rule: rule?.type ?? null,
    commands: rule?.type === 'commands' ? [...rule.commands] : [],
    next,
    onFail: n.onFail ? { goto: n.onFail.goto, limit: n.kind === 'gate' && n.judge === 'human' ? null : failLimit } : null,
    when: n.when ? { grade: n.when.grade } : null,
    position: { x: ORIGIN.x + col * COL, y: ORIGIN.y + row * ROW },
  }
}

export function templateGraph(t: Template, failLimit: number = FAIL_LIMIT): LoopGraph {
  const flat: { step: StepNode; scope: LoopGraphNode['scope'] }[] = []
  let goalLoop: LoopGraph['goalLoop'] = null
  for (const n of t.nodes) {
    if (n.kind === 'goalLoop') {
      goalLoop = { id: n.id, title: n.title, nodes: n.steps.map((s) => s.id) }
      for (const s of n.steps) flat.push({ step: s, scope: 'goal' })
    } else flat.push({ step: n, scope: 'milestone' })
  }
  const loopStart = flat.findIndex((f) => f.scope === 'goal')
  const nodes: LoopGraphNode[] = []
  const cols = [0, 0, 0]
  flat.forEach((f, i) => {
    const row = goalLoop === null ? 0 : f.scope === 'goal' ? 1 : i < loopStart ? 0 : 2
    nodes.push(nodeOf(f.step, f.scope, flat[i + 1]?.step.id ?? null, row, cols[row]++, failLimit))
  })
  const edges: LoopGraphEdge[] = []
  for (const n of nodes) if (n.next !== null) edges.push({ from: n.id, to: n.next, kind: 'next' })
  for (const n of nodes) if (n.onFail !== null) edges.push({ from: n.id, to: n.onFail.goto, kind: 'fail' })
  if (goalLoop !== null && goalLoop.nodes.length > 0) {
    edges.push({ from: goalLoop.nodes[goalLoop.nodes.length - 1], to: goalLoop.nodes[0], kind: 'repeat' })
  }
  return { templateId: t.id, title: t.title, nodes, edges, goalLoop, failLimit }
}

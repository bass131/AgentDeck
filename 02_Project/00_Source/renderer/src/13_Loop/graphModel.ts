// M10 G5 그래프 탭의 순수 도우미 — 노드 이름 대응, 지금 위치·끝남·실패 수, 묶음 상자, 선의 꼴, 맞춤 배율.
// 표시는 main이 준 그래프와 LoopStatus 한 장에서만 온다. 같은 입력이면 같은 표시다.
import { GRAPH_CARD, type GraphNodeKind, type LoopGraph, type LoopGraphEdge, type LoopGraphNode, type LoopStatus } from '@shared/ipcContract'

export const KIND_LABEL: Record<GraphNodeKind, string> = {
  work: '작업', action: '실행기 동작', rule: '규칙 게이트', model: '모델 게이트', human: '사람 게이트',
}
export const KIND_SHORT: Record<GraphNodeKind, string> = { work: '작업', action: '실행기', rule: '규칙', model: '모델', human: '사람' }

const W = GRAPH_CARD.width
const H = GRAPH_CARD.height
const BOX_PAD = { x: 20, top: 30, bottom: 34 }
const EDGE_PAD = 40

export interface NodePlace { goal: string | null; node: string }
export interface NodeMark { now: boolean; done: boolean; fails: number }
export interface Box { x: number; y: number; w: number; h: number }

export function placeOf(label: string | null): NodePlace | null {
  if (label === null || label === '') return null
  const at = label.indexOf('/')
  return at < 0 ? { goal: null, node: label } : { goal: label.slice(0, at), node: label.slice(at + 1) }
}

function failsSince(s: LoopStatus, nodeId: string, goal: string | null): number {
  const scoped = s.recentLines.filter((l) => l.goal === goal)
  let from = 0
  scoped.forEach((l, i) => { if (l.marker === 'USER-INPUT') from = i + 1 })
  return scoped.slice(from).filter((l) => l.marker === 'FAIL' && l.node === nodeId).length
}

export function nodeMarks(graph: LoopGraph, s: LoopStatus): Record<string, NodeMark> {
  const place = placeOf(s.node)
  const here = place === null ? -1 : graph.nodes.findIndex((n) => n.id === place.node)
  const out: Record<string, NodeMark> = {}
  graph.nodes.forEach((n, i) => {
    const now = i === here && s.phase !== 'done'
    const done = s.phase === 'done' || (here >= 0 && i < here)
    const goal = n.scope === 'goal' ? place?.goal ?? null : null
    out[n.id] = { now, done, fails: now ? s.failCount : failsSince(s, n.id, goal) }
  })
  return out
}

export function loopLabel(s: LoopStatus): string {
  const parts = [
    ...s.goals.filter((g) => g.status === 'done').map((g) => `${g.id} ✓`),
    ...s.goals.filter((g) => g.status === 'active').map((g) => `지금 ${g.id}`),
  ]
  return parts.length > 0 ? `목표 반복 — ${parts.join(' · ')}` : '목표 반복'
}

export function loopBox(graph: LoopGraph): Box | null {
  const ids = new Set(graph.goalLoop?.nodes ?? [])
  const inLoop = graph.nodes.filter((n) => ids.has(n.id))
  if (inLoop.length === 0) return null
  const x0 = Math.min(...inLoop.map((n) => n.position.x)) - BOX_PAD.x
  const y0 = Math.min(...inLoop.map((n) => n.position.y)) - BOX_PAD.top
  const x1 = Math.max(...inLoop.map((n) => n.position.x + W)) + BOX_PAD.x
  const y1 = Math.max(...inLoop.map((n) => n.position.y + H)) + BOX_PAD.bottom
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function graphBounds(graph: LoopGraph): { w: number; h: number } {
  const box = loopBox(graph)
  const right = Math.max(0, ...graph.nodes.map((n) => n.position.x + W), box ? box.x + box.w : 0)
  const bottom = Math.max(0, ...graph.nodes.map((n) => n.position.y + H), box ? box.y + box.h : 0)
  return { w: right + EDGE_PAD, h: bottom + EDGE_PAD + 40 }
}

// 다음 선은 나가는 점(오른쪽 가운데)에서 들어오는 점(왼쪽 가운데)으로, 되돌아가는 길은 카드 아래로 도는 곡선이다
export function edgePath(from: LoopGraphNode, to: LoopGraphNode, kind: LoopGraphEdge['kind']): string {
  if (kind !== 'next') {
    const fx = from.position.x + W / 2
    const tx = to.position.x + W / 2
    const fy = from.position.y + H
    const ty = to.position.y + H
    const depth = (kind === 'repeat' ? 60 : 28) + Math.min(40, Math.abs(fx - tx) / 12)
    return `M${fx} ${fy} C${fx} ${fy + depth} ${tx} ${ty + depth} ${tx} ${ty}`
  }
  const ox = from.position.x + W
  const oy = from.position.y + H / 2
  const ix = to.position.x
  const iy = to.position.y + H / 2
  if (oy === iy && ix >= ox) return `M${ox} ${oy} L${ix} ${iy}`
  const mid = Math.round((from.position.y + H + to.position.y) / 2)
  return `M${ox} ${oy} H${ox + 16} V${mid} H${Math.max(0, ix - 16)} V${iy} H${ix}`
}

// 곡선 바닥 가운데 — 되돌아가는 길의 이름표 자리
export function edgeLabelAt(from: LoopGraphNode, to: LoopGraphNode, kind: LoopGraphEdge['kind']): { x: number; y: number } {
  const fx = from.position.x + W / 2
  const tx = to.position.x + W / 2
  const depth = (kind === 'repeat' ? 60 : 28) + Math.min(40, Math.abs(fx - tx) / 12)
  return { x: (fx + tx) / 2, y: Math.max(from.position.y, to.position.y) + H + depth * 0.75 }
}

export function fitScale(content: { w: number; h: number }, view: { w: number; h: number }): number {
  if (!(view.w > 0 && view.h > 0 && content.w > 0 && content.h > 0)) return 1
  return Math.min(1, view.w / content.w, view.h / content.h)
}

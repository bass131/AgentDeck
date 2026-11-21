import { GRAPH_CARD, type GraphNodeKind, type LoopGraph, type LoopGraphEdge, type LoopGraphNode, type LoopStatus } from '@shared/ipcContract'

export const KIND_LABEL: Record<GraphNodeKind, string> = {
  work: '작업', action: '실행기 동작', rule: '규칙 게이트', model: '모델 게이트', human: '사람 게이트',
}
export const KIND_SHORT: Record<GraphNodeKind, string> = { work: '작업', action: '실행기', rule: '규칙', model: '모델', human: '사람' }

const W = GRAPH_CARD.width
const H = GRAPH_CARD.height
const BOX_PAD = { x: 20, top: 30, bottom: 34 }
const EDGE_PAD = 40
// 되돌아가는 곡선의 깊이 — 겹치는 곡선은 길(lane)마다 한 칸씩 더 깊다. 글자 높이보다 길 간격(0.75배)이 커야 글자가 겹치지 않는다
const LANE_BASE = 28
const LANE_STEP = 24
const BOX_BELOW_CURVE = 10
export const EDGE_LABEL = { width: 140, height: 16 } as const

interface NodePlace {goal: string | null; node: string }
export interface NodeMark { now: boolean; done: boolean; skipped: boolean; fails: number }
interface Box {x: number; y: number; w: number; h: number }

export const edgeKey = (e: Pick<LoopGraphEdge, 'from' | 'to' | 'kind'>): string => `${e.kind}:${e.from}>${e.to}`
const depthOf = (lane: number): number => LANE_BASE + lane * LANE_STEP
// 곡선 바닥이 나가는 줄 아래로 내려가는 거리(두 조절점이 같은 깊이인 3차 곡선의 극값)
export const curveDrop = (lane: number): number => 0.75 * depthOf(lane)

interface BackSpan { key: string; edge: LoopGraphEdge; base: number; lo: number; hi: number }

function backSpans(graph: LoopGraph): BackSpan[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  return graph.edges.flatMap((edge) => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (edge.kind === 'next' || !from || !to) return []
    const fx = from.position.x + W / 2
    const tx = to.position.x + W / 2
    const mid = (fx + tx) / 2
    const lo = Math.min(fx, tx, mid - EDGE_LABEL.width / 2)
    const hi = Math.max(fx, tx, mid + EDGE_LABEL.width / 2)
    return [{ key: edgeKey(edge), edge, base: Math.max(from.position.y, to.position.y) + H, lo, hi }]
  })
}

// 같은 줄 아래에서 가로로 겹치는 되돌아가는 길(글자 폭 포함)은 다른 길에 둔다 — 짧은 길이 위, 긴 길이 아래다
export function backLanes(graph: LoopGraph): Map<string, number> {
  const spans = backSpans(graph).sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.key.localeCompare(b.key))
  const placed: (BackSpan & { lane: number })[] = []
  const out = new Map<string, number>()
  for (const s of spans) {
    let lane = 0
    while (placed.some((p) => p.base === s.base && p.lane === lane && s.lo < p.hi && p.lo < s.hi)) lane++
    placed.push({ ...s, lane })
    out.set(s.key, lane)
  }
  return out
}

function backBottom(graph: LoopGraph, keep: (e: LoopGraphEdge) => boolean): number {
  const lanes = backLanes(graph)
  return Math.max(0, ...backSpans(graph).filter((s) => keep(s.edge)).map((s) => {
    const label = s.edge.kind === 'fail' ? EDGE_LABEL.height : 0
    return s.base + curveDrop(lanes.get(s.key) ?? 0) + label + BOX_BELOW_CURVE
  }))
}

export function backLabel(from: LoopGraphNode, to: LoopGraphNode): string {
  if (from.kind === 'human') return `반려 → ${to.title}`
  const limit = from.onFail?.limit ?? null
  return limit === null ? `실패 → ${to.title}` : `실패 → ${to.title} (최대 ${limit})`
}

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
  // 지금 목표의 등급 — 등급이 정해진 뒤에만 그 등급에서 켜지지 않는 노드를 건너뜀으로 본다
  const grade = place?.goal ? s.goals.find((g) => g.id === place.goal)?.grade ?? null : null
  const out: Record<string, NodeMark> = {}
  graph.nodes.forEach((n, i) => {
    const now = i === here && s.phase !== 'done'
    const skipped = !now && n.scope === 'goal' && n.when !== null && grade !== null && n.when.grade !== grade
    const done = !skipped && (s.phase === 'done' || (here >= 0 && i < here))
    const goal = n.scope === 'goal' ? place?.goal ?? null : null
    out[n.id] = { now, done, skipped, fails: now ? s.failCount : failsSince(s, n.id, goal) }
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
  // 상자 아래는 틀 안에서 되돌아가는 곡선의 바닥과 그 글자보다 깊다
  const curves = backBottom(graph, (e) => ids.has(e.from) && ids.has(e.to))
  const y1 = Math.max(Math.max(...inLoop.map((n) => n.position.y + H)) + BOX_PAD.bottom, curves)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function graphBounds(graph: LoopGraph): { w: number; h: number } {
  const box = loopBox(graph)
  const right = Math.max(0, ...graph.nodes.map((n) => n.position.x + W), box ? box.x + box.w : 0)
  const bottom = Math.max(0, ...graph.nodes.map((n) => n.position.y + H), box ? box.y + box.h : 0, backBottom(graph, () => true))
  return { w: right + EDGE_PAD, h: bottom + EDGE_PAD + 40 }
}

// 다음 선은 나가는 점(오른쪽 가운데)에서 들어오는 점(왼쪽 가운데)으로, 되돌아가는 길은 카드 아래로 도는 곡선이다(깊이는 길마다 다르다)
export function edgePath(from: LoopGraphNode, to: LoopGraphNode, kind: LoopGraphEdge['kind'], lane = 0): string {
  if (kind !== 'next') {
    const fx = from.position.x + W / 2
    const tx = to.position.x + W / 2
    const fy = from.position.y + H
    const ty = to.position.y + H
    const depth = depthOf(lane)
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

// 곡선 바닥 가운데 — 되돌아가는 길의 이름표 자리(글자 위끝)
export function edgeLabelAt(from: LoopGraphNode, to: LoopGraphNode, _kind: LoopGraphEdge['kind'], lane = 0): { x: number; y: number } {
  const fx = from.position.x + W / 2
  const tx = to.position.x + W / 2
  return { x: (fx + tx) / 2, y: Math.max(from.position.y, to.position.y) + H + curveDrop(lane) }
}

export function fitScale(content: { w: number; h: number }, view: { w: number; h: number }): number {
  if (!(view.w > 0 && view.h > 0 && content.w > 0 && content.h > 0)) return 1
  return Math.min(1, view.w / content.w, view.h / content.h)
}

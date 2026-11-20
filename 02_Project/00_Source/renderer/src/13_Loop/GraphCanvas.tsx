// M10 G5 그래프 탭 캔버스(보기 전용) — 카드는 DOM, 선은 SVG다. 위치는 그래프의 position 칸을 그대로 쓴다.
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { GraphNodeKind, LoopGraph, LoopGraphNode, LoopStatus } from '@shared/ipcContract'
import {
  KIND_SHORT, backLabel, backLanes, edgeKey, edgeLabelAt, edgePath, fitScale, graphBounds, loopBox, loopLabel, nodeMarks, type NodeMark,
} from './graphModel'
import './Graph.css'

const STEP = 0.1
const MIN = 0.3
const MAX = 2
const NO_MARK: NodeMark = { now: false, done: false, skipped: false, fails: 0 }
const clamp = (v: number): number => Math.round(Math.min(MAX, Math.max(MIN, v)) * 100) / 100

export interface GraphCanvasProps {
  graph: LoopGraph
  status: LoopStatus | null
  selected: string | null
  onSelect: (id: string) => void
}

function Card({ n, mark, selected, onSelect }: { n: LoopGraphNode; mark: NodeMark; selected: boolean; onSelect: (id: string) => void }): JSX.Element {
  const sub = [
    KIND_SHORT[n.kind], n.role === 'main' ? '메인' : null, mark.skipped ? '건너뜀' : null, mark.fails > 0 ? `실패 ${mark.fails}` : null,
  ].filter((x) => x !== null).join(' · ')
  return (
    <button
      type="button"
      className="gc-card"
      data-node={n.id}
      data-kind={n.kind}
      data-now={mark.now ? 'true' : 'false'}
      data-done={mark.done ? 'true' : 'false'}
      data-skipped={mark.skipped ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      aria-label={`${n.title} 노드`}
      aria-pressed={selected}
      style={{ left: n.position.x, top: n.position.y }}
      onClick={() => onSelect(n.id)}
    >
      <b>{n.title}</b>
      <small>{sub}</small>
      {mark.done && <i className="gc-ok" aria-hidden="true">✓</i>}
    </button>
  )
}

export function GraphCanvas({ graph, status, selected, onSelect }: GraphCanvasProps): JSX.Element {
  const [scale, setScale] = useState(1)
  const viewRef = useRef<HTMLDivElement>(null)
  const bounds = useMemo(() => graphBounds(graph), [graph])
  const box = useMemo(() => loopBox(graph), [graph])
  const lanes = useMemo(() => backLanes(graph), [graph])
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  const marks = useMemo(() => (status ? nodeMarks(graph, status) : {}), [graph, status])
  const fit = (): void => {
    const v = viewRef.current
    setScale(clamp(fitScale(bounds, { w: v?.clientWidth ?? 0, h: v?.clientHeight ?? 0 })))
  }
  // 그래프가 바뀌면 한 번 맞춘다
  useEffect(fit, [bounds])

  const edges = graph.edges.flatMap((e) => {
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    return from && to ? [{ e, from, to, lane: lanes.get(edgeKey(e)) ?? 0 }] : []
  })

  return (
    <section className="graph-canvas" aria-label="그래프 캔버스">
      <div className="gc-tools">
        <button type="button" className="gc-tool" aria-label="축소" onClick={() => setScale((s) => clamp(s - STEP))}>－</button>
        <span className="gc-tool gc-zoom" role="status" aria-label="배율">{`${Math.round(scale * 100)}%`}</span>
        <button type="button" className="gc-tool" aria-label="확대" onClick={() => setScale((s) => clamp(s + STEP))}>＋</button>
        <button type="button" className="gc-tool" aria-label="맞춤" onClick={fit}>맞춤</button>
        <span className="gc-tool gc-ro">보기 전용 · 편집은 뒤 마일스톤</span>
      </div>
      <div className="gc-view" ref={viewRef}>
        <div className="gc-stage" style={{ width: bounds.w * scale, height: bounds.h * scale }}>
          <div className="gc-plane" style={{ width: bounds.w, height: bounds.h, transform: `scale(${scale})` }}>
            {box !== null && (
              <div className="gc-group" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                <span className="gc-group-label">{status ? loopLabel(status) : '목표 반복'}</span>
              </div>
            )}
            <svg className="gc-wires" width={bounds.w} height={bounds.h} aria-hidden="true">
              {edges.map(({ e, from, to, lane }) => (
                <path key={edgeKey(e)} data-edge={e.kind} className={`gc-wire gc-wire-${e.kind}`} d={edgePath(from, to, e.kind, lane)} />
              ))}
            </svg>
            {edges.filter(({ e }) => e.kind === 'fail').map(({ e, from, to, lane }) => {
              const at = edgeLabelAt(from, to, e.kind, lane)
              return (
                <span key={`l-${edgeKey(e)}`} className="gc-edge-label" data-kind={from.kind === 'human' ? 'reject' : 'fail'} style={{ left: at.x, top: at.y }}>
                  {backLabel(from, to)}
                </span>
              )
            })}
            {graph.nodes.map((n) => (
              <Card key={n.id} n={n} mark={marks[n.id] ?? NO_MARK} selected={selected === n.id} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
      <div className="gc-key" aria-label="범례">
        {(Object.keys(KIND_SHORT) as GraphNodeKind[]).map((k) => <span key={k}><i data-kind={k} />{KIND_SHORT[k]}</span>)}
        <span>── 다음 · ┄ 되돌아감</span>
      </div>
    </section>
  )
}

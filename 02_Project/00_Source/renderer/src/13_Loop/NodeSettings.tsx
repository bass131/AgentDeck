// 보기 전용이라 입력칸을 두지 않는다. 편집은 그래프 편집이 같은 그래프 칸을 고친다.
import type { JSX, ReactNode } from 'react'
import type { LoopGraph, LoopGraphNode, LoopStatus } from '@shared/ipcContract'
import { KIND_LABEL, placeOf } from './graphModel'
import { MARKER_LABEL } from './loopModel'
import { clockOf } from './mainChatModel'

interface NodeSettingsProps {
  graph: LoopGraph | null
  status: LoopStatus | null
  nodeId: string | null
  onOpenSession: (key: string) => void
  onOpenMain: () => void
}

const RULE_TEXT = { grade: '등급 판정 — 바뀐 줄 수와 보호 경로로 강·약을 정한다', ci: 'CI 필수 검사 결과를 본다' } as const

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="ns-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function commandsOf(n: LoopGraphNode): JSX.Element {
  if (n.commands.length > 0) return <>{n.commands.map((c) => <div key={c} className="ns-val loop-mono">{c}</div>)}</>
  if (n.rule === 'grade' || n.rule === 'ci') return <div className="ns-val">{RULE_TEXT[n.rule]}</div>
  return <div className="ns-val ns-none">없음</div>
}

export function NodeSettings({ graph, status, nodeId, onOpenSession, onOpenMain }: NodeSettingsProps): JSX.Element {
  const n = graph?.nodes.find((x) => x.id === nodeId) ?? null
  if (graph === null || n === null) {
    return (
      <section className="node-settings" aria-label="노드 설정">
        <div className="board-empty">노드를 누르면 여기 설정이 열려. 작업 노드는 「세션 열기」로 그 세션 탭을 연다.</div>
      </section>
    )
  }
  const titleOf = (id: string | null): string => (id === null ? '' : graph.nodes.find((x) => x.id === id)?.title ?? id)
  const first = graph.goalLoop?.nodes[0] ?? null
  const isLoopEnd = graph.goalLoop !== null && graph.goalLoop.nodes.at(-1) === n.id
  const here = placeOf(status?.node ?? null)
  const rows = (status?.sessions ?? []).filter((r) => r.node === n.id)
  const session = rows.filter((r) => r.goal === here?.goal).at(-1) ?? rows.at(-1) ?? null
  const lines = (status?.recentLines ?? []).filter((l) => l.node === n.id)
  const scope = n.scope === 'goal' && here?.goal ? `${here.goal} · ` : ''

  return (
    <section className="node-settings" aria-label="노드 설정">
      <div className="board-box">
        <h3 className="board-h"><span>노드 설정</span><small className="loop-mono">{`${scope}${n.id}`}</small></h3>
        <dl className="ns-fields">
          <Field label="이름"><div className="ns-val">{n.title}</div></Field>
          <Field label="종류">
            <div className="ns-val">{KIND_LABEL[n.kind]}</div>
            {n.role !== null && <div className="ns-sub">{n.role === 'main' ? '메인 대화가 맡는다' : '작업 세션이 맡는다'}</div>}
          </Field>
          <Field label="실행할 명령">{commandsOf(n)}</Field>
          <Field label="통과하면">
            <div className="ns-val">{n.next === null ? '마일스톤 끝' : titleOf(n.next)}</div>
            {isLoopEnd && first !== null && <div className="ns-sub">{`남은 목표가 있으면 ${titleOf(first)}로 돌아간다`}</div>}
          </Field>
          <Field label="실패하면">
            <div className="ns-val">
              {n.onFail === null
                ? '되돌아가는 길 없음'
                : n.onFail.limit === null
                  ? `${titleOf(n.onFail.goto)}(으)로 되돌림 · 사람의 반려는 실패로 세지 않는다`
                  : `${titleOf(n.onFail.goto)}(으)로 되돌림 · 최대 ${n.onFail.limit}번, 넘으면 사람을 부른다`}
            </div>
          </Field>
          {n.when !== null && <Field label="켜지는 조건"><div className="ns-val">{`${n.when.grade === 'strong' ? '강' : '약'} 등급 목표에서만`}</div></Field>}
        </dl>
        <div className="ns-lock" role="note">보기 전용 — 편집은 그래프 편집(뒤 마일스톤)</div>
        {n.role === 'main' ? (
          <button type="button" className="loop-btn" onClick={onOpenMain}>메인 대화 열기</button>
        ) : session !== null ? (
          <button type="button" className="loop-btn" onClick={() => onOpenSession(session.key)}>세션 열기</button>
        ) : null}
      </div>
      <div className="board-box">
        <h3 className="board-h"><span>이 노드의 실행</span><small>최근</small></h3>
        {lines.length > 0 ? (
          <ul className="board-lines" aria-label="이 노드의 최근 검증 기록">
            {lines.map((l, i) => (
              <li key={`${l.at}-${i}`} className="board-line" data-marker={l.marker}>
                <span className="board-line-mk">{MARKER_LABEL[l.marker]}</span>
                <span className="loop-mono">{clockOf(l.at)}</span>
                <span className="loop-mono">{l.goal ?? ''}</span>
                <span className="board-line-txt">{l.sentence}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="board-empty">이 노드의 최근 기록이 없어</div>
        )}
      </div>
    </section>
  )
}

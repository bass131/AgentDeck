import { useMemo, type JSX } from 'react'
import type { LoopSessionRecord, LoopSessionRow } from '@shared/ipcContract'
import { ThreadView } from '@renderer/05_Conversation/ThreadView'
import { foldSession, rowLabel } from './sessionLogModel'
import '@renderer/05_Conversation/Conversation.css'

interface NodeSessionViewProps {
  cwd: string | null
  sessionKey: string
  record: LoopSessionRecord | undefined
  // 끝남은 이 줄이 정본이다 — 기록의 꼬리표에는 끝 신호가 없다
  row: LoopSessionRow | undefined
  onBack: () => void
}

const NOOP = (): void => {}

export function labelOf(sessionKey: string, row: LoopSessionRow | undefined, record: LoopSessionRecord | undefined): string {
  if (row) return rowLabel(row)
  const t = record?.session
  if (t && t.kind !== 'main') return rowLabel({ kind: t.kind, node: t.node, goal: t.goal })
  return sessionKey
}

export function NodeSessionView({ cwd, sessionKey, record, row, onBack }: NodeSessionViewProps): JSX.Element {
  const live = row?.live ?? record?.live ?? false
  const events = record?.events
  const state = useMemo(() => foldSession(events ?? [], live), [events, live])
  const label = labelOf(sessionKey, row, record)
  return (
    <section className="node-session" aria-label={`노드 세션 ${label}`}>
      <div className="node-session-head">
        <span className={live ? 'board-pulse' : 'board-idle'} aria-hidden="true" />
        <b>{label}</b>
        <small>{live ? '도는 중' : '끝'}</small>
        {record?.truncated === true && <small className="node-session-cut">앞부분은 기록 상한으로 잘렸어</small>}
      </div>
      {record === undefined || record.events.length === 0 ? (
        <div className="node-session-empty">아직 이 세션의 기록이 없어요</div>
      ) : (
        <ThreadView state={state} onOpenSubagent={NOOP} className="thread node-thread" cwd={cwd} />
      )}
      <div className="node-session-ro" role="note">
        <span>노드 세션은 보기 전용이야. 말 걸기와 지시는 메인 대화에서 해.</span>
        <button type="button" className="loop-btn" onClick={onBack}>메인 대화로</button>
      </div>
    </section>
  )
}

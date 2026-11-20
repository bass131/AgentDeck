// M09 G4 루프 화면의 카드들 — 예외 한 줄, 질문·권한 카드, 스펙 승인 카드, 래치 풀기 카드, goal 목록.
// 카드는 IPC를 부르지 않는다. 사람의 답을 콜백으로 올리고, 부르기와 응답 처리는 LoopScreen 한 곳이 한다.
// 스펙 승인 카드는 받은 해시를 보이기만 한다 — 해시를 계산하거나 바꾸지 않는다.
import { useState, type JSX } from 'react'
import type { LoopApproval, LoopCard, LoopGoalView, LoopLatch, LoopStatus } from '@shared/ipcContract'
import { EVIDENCE_MAX, GOAL_STATUS_LABEL, GRADE_LABEL, exceptionLine, sha12 } from './loopModel'

// blocked(진행 불가)는 사람이 원인을 고친 뒤 다시 열어야 풀리는 꼴이라(자동 모드 허용 노드 같은 것) 「다시 열기」를 둔다(G4 검수 사소 7)
export function ExceptionBar({ status, busy, onResume, onReopen, error }: {
  status: LoopStatus
  busy: boolean
  onResume: () => void
  onReopen: () => void
  error: string | null
}): JSX.Element | null {
  const line = exceptionLine(status)
  const notice = status.notice ? (
    <div className="loop-notice" role="note">
      <span className="loop-exc-label">알림</span>
      <span className="loop-exc-reason">{status.notice}</span>
    </div>
  ) : null
  if (!line) return notice
  return (
    <>
      {notice}
      <div className="loop-exc" data-phase={status.phase}>
        <div className="loop-exc-line" role="status">
          <span className="loop-exc-label">{line.label}</span>
          {line.reason !== null && <span className="loop-exc-reason">{line.reason}</span>}
          {line.latchFile !== null && <span className="loop-exc-file">래치 파일 {line.latchFile}</span>}
        </div>
        {status.phase === 'halted' && (
          <div className="loop-actions">
            <button type="button" className="loop-btn pri" disabled={busy} onClick={onResume}>이어 가기</button>
          </div>
        )}
        {status.phase === 'blocked' && (
          <div className="loop-actions">
            <button type="button" className="loop-btn" disabled={busy} onClick={onReopen}>다시 열기</button>
          </div>
        )}
        {error !== null && <div className="loop-err">{error}</div>}
      </div>
    </>
  )
}

export function CardList({ cards, answered, busy, onAsk, onPermission, error }: {
  cards: LoopCard[]
  answered: ReadonlySet<string>
  busy: boolean
  onAsk: (card: LoopCard) => void
  onPermission: (card: LoopCard, behavior: 'allow' | 'deny') => void
  error: string | null
}): JSX.Element | null {
  if (cards.length === 0 && error === null) return null
  return (
    <section className="loop-sec" aria-label="세션 카드">
      <h3 className="loop-h">세션 카드</h3>
      {cards.map((c) => {
        const done = answered.has(c.requestId)
        return (
          <div key={c.requestId} className="loop-card" data-testid={`loop-card-${c.requestId}`}>
            <div className="loop-card-meta">
              <span className="loop-mono">{c.goal ? `${c.goal}/${c.node}` : c.node}</span>
              <span>{c.kind === 'question' ? `질문 ${c.questions.length}개` : '권한 요청'}</span>
            </div>
            {c.text.trim() !== '' && <div className="loop-card-text">{c.text}</div>}
            {c.kind === 'permission' && (
              <div className="loop-perm">
                <span className="loop-mono loop-perm-tool">{c.toolName}</span>
                <span className="loop-mono loop-perm-sum">{c.summary}</span>
              </div>
            )}
            <div className="loop-actions">
              {c.kind === 'question' ? (
                // 질문 창 열기는 IPC를 부르지 않는다 — 다른 호출이 도는 동안에도 연다(고른 답은 LoopScreen이 대기열에 둔다, G4 검수 사소 8)
                <button type="button" className="loop-btn pri" disabled={done} onClick={() => onAsk(c)}>답하기</button>
              ) : (
                <>
                  <button type="button" className="loop-btn pri" disabled={busy || done} onClick={() => onPermission(c, 'allow')}>허용</button>
                  <button type="button" className="loop-btn" disabled={busy || done} onClick={() => onPermission(c, 'deny')}>거부</button>
                </>
              )}
              {done && <span className="loop-muted">답을 보냈어요</span>}
            </div>
          </div>
        )
      })}
      {error !== null && <div className="loop-err">{error}</div>}
    </section>
  )
}

// M10 G3 — 승인 카드는 메인 대화 안에 뜬다(「스펙 승인 / 이어서 고치기」). 글자만 바꿀 수 있고 판정의 꼴(해시 묶기·사유 필수)은 그대로다
export function ApprovalCard({ approval, busy, onApprove, onReject, error, approveLabel = '승인', rejectLabel = '반려', reasonLabel = '반려 사유', reasonPlaceholder = '반려 사유를 적어요' }: {
  approval: LoopApproval
  busy: boolean
  onApprove: () => void
  onReject: (reason: string) => void
  error: string | null
  approveLabel?: string
  rejectLabel?: string
  reasonLabel?: string
  reasonPlaceholder?: string
}): JSX.Element {
  const [reason, setReason] = useState('')
  // 승인은 본 해시에 묶인다 — 해시가 없으면 끈다. 반려는 스펙 파일이 없을 때도 켠다(해시 없는 반려로 브레인스토밍에 돌아간다, G4 검수 I3)
  const bound = approval.spec !== null && approval.sha256 !== null
  return (
    <section className="loop-sec loop-approval" aria-label="스펙 승인">
      <h3 className="loop-h">{approval.title}</h3>
      <div className="loop-card-meta">
        <span className="loop-mono">{approval.node}</span>
        {approval.sha256 !== null ? (
          <span>sha256 <span className="loop-mono" title={approval.sha256}>{sha12(approval.sha256)}</span></span>
        ) : (
          <span className="loop-muted">스펙 파일이 없어 해시가 없어요</span>
        )}
      </div>
      <pre className="loop-pre loop-spec">{approval.spec ?? '(스펙 파일이 없어요)'}</pre>
      <div className="loop-actions">
        <button type="button" className="loop-btn pri" disabled={!bound || busy} onClick={onApprove}>{approveLabel}</button>
      </div>
      <div className="loop-reject">
        <textarea
          className="loop-input loop-textarea"
          aria-label={reasonLabel}
          placeholder={reasonPlaceholder}
          maxLength={EVIDENCE_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          type="button"
          className="loop-btn"
          disabled={busy || reason.trim() === ''}
          onClick={() => onReject(reason.trim())}
        >
          {rejectLabel}
        </button>
      </div>
      {error !== null && <div className="loop-err">{error}</div>}
    </section>
  )
}

export function LatchCard({ latch, busy, onRelease, error }: {
  latch: LoopLatch
  busy: boolean
  onRelease: () => void
  error: string | null
}): JSX.Element {
  return (
    <section className="loop-sec loop-latch" aria-label="래치 풀기" data-testid="loop-latch">
      <h3 className="loop-h">래치 풀기</h3>
      <div className="loop-card-text">{latch.reason}</div>
      {latch.file !== null && (
        <div className="loop-card-meta"><span>래치 파일</span><span className="loop-mono">{latch.file}</span></div>
      )}
      {latch.changed.length > 0 && (
        <>
          <div className="loop-sub">바뀐 설정·파일(값과 출처 포함)</div>
          <ul className="loop-changed">
            {latch.changed.map((k) => <li key={k} className="loop-mono">{k}</li>)}
          </ul>
        </>
      )}
      {latch.state !== null && (
        <>
          <div className="loop-sub">지금 상태 파일</div>
          <pre className="loop-pre">{latch.state}</pre>
        </>
      )}
      {latch.restore !== null && (
        <>
          <div className="loop-sub">풀면 되돌릴 상태</div>
          <pre className="loop-pre">{latch.restore}</pre>
        </>
      )}
      <div className="loop-actions">
        <button type="button" className="loop-btn pri" disabled={busy} onClick={onRelease}>확인하고 풀기</button>
      </div>
      {error !== null && <div className="loop-err">{error}</div>}
    </section>
  )
}

export function GoalList({ goals }: { goals: LoopGoalView[] }): JSX.Element | null {
  if (goals.length === 0) return null
  return (
    <section className="loop-sec" aria-label="목표 목록">
      <h3 className="loop-h">목표</h3>
      <ul className="loop-goals">
        {goals.map((g) => (
          <li key={g.id} className="loop-goal" data-status={g.status}>
            <span className="loop-mono loop-goal-id">{g.id}</span>
            <span className="loop-goal-title">{g.title}</span>
            <span className="loop-goal-st">{GOAL_STATUS_LABEL[g.status]}</span>
            {g.grade !== null && <span className="loop-goal-grade">{GRADE_LABEL[g.grade]}</span>}
            {g.pr !== null && <span className="loop-mono">#{g.pr}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

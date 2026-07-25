/**
 * CmdResultCard.tsx — 슬래시 커맨드 진행카드 컴포넌트 (M6 Phase 34).
 *
 * 원본 AgentCodeGUI cmdresult 카드 UI 미러.
 * running=true: 스피너 표시. running=false, failed=false: 완료.
 * running=false, failed=true: 실패 카드.
 *
 * UI_GUIDE 준수:
 *   - glass morphism/그라데이션/네온 금지.
 *   - 색상 CSS 변수 토큰만 사용 (인라인 색상 0).
 *   - 상태 전달에만 색상 사용.
 *
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0.
 * 순수 표시 컴포넌트(부수효과 0).
 */
import { memo, type JSX } from 'react'
import { IconSpark, IconAlert, IconCheck } from '../common/icons'
import './CmdResultCard.css'

export interface CmdResultCardProps {
  id: string
  name: string
  title: string
  sub?: string | null
  running: boolean
  failed?: boolean
  time?: string
}

/**
 * CmdResultCard — 슬래시 커맨드 진행/완료/실패 카드.
 *
 * 단방향: thread의 cmdresult ThreadItem → 이 컴포넌트.
 * 인라인 색상 0. CSS 변수 토큰만.
 */
export const CmdResultCard = memo(function CmdResultCard({
  title,
  sub,
  running,
  failed,
  time,
}: CmdResultCardProps): JSX.Element {
  const cardCls = [
    'cmd-result-card',
    running ? 'cmd-result-card--running' : '',
    failed ? 'cmd-result-card--failed' : '',
    !running && !failed ? 'cmd-result-card--done' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardCls} data-failed={failed ? 'true' : undefined}>
      <span className="cmd-result-ic" aria-hidden="true">
        {running ? (
          <IconSpark size={16} stroke={1.8} />
        ) : failed ? (
          <IconAlert size={16} />
        ) : (
          <IconCheck size={16} />
        )}
      </span>
      <div className="cmd-result-body">
        <div className="cmd-result-title">{title}</div>
        {sub && <div className="cmd-result-sub">{sub}</div>}
      </div>
      <div className="cmd-result-meta">
        {running && (
          <span className="dots" role="progressbar" aria-label="진행 중" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
        {time && <span className="cmd-result-time">{time}</span>}
      </div>
    </div>
  )
})

export default CmdResultCard

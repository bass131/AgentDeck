import { useState, memo, type JSX } from 'react'
import { FullscreenOverlay } from '../common/FullscreenOverlay'
import { IconCheck, IconAlert } from '../common/icons'
import type { OrchestrationAgentProgress } from '../../../../shared/agentEvents'
import './OrchestrationCard.css'

export interface OrchestrationCardProps {
  id: string
  name: string
  description?: string
  phases?: string[]
  running: boolean
  failed?: boolean
  result?: string
  script?: string
  time?: string
  livePhases?: string[]
  agents?: OrchestrationAgentProgress[]
  liveSummary?: string
}

function ProgressCircle(): JSX.Element {
  return (
    <span
      className="orch-spinner"
      role="progressbar"
      aria-label="진행 중"
      aria-busy="true"
    />
  )
}

export const OrchestrationCard = memo(function OrchestrationCard({
  name,
  description,
  phases,
  running,
  failed,
  result,
  script,
  time,
  livePhases,
  agents,
  liveSummary,
}: OrchestrationCardProps): JSX.Element {
  const [open, setOpen] = useState(false)

  const displayName = name || ''

  const agentTotal = agents?.length ?? 0
  const agentDone = agents?.filter((a) => a.state === 'done').length ?? 0
  const liveLine = agentTotal > 0 ? `작업 ${agentDone}/${agentTotal}` : ''

  const cardCls = [
    'orch-card',
    running ? 'orch-card--running' : '',
    failed ? 'orch-card--failed' : '',
    !running && !failed ? 'orch-card--done' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <button
        type="button"
        className={cardCls}
        onClick={() => setOpen(true)}
        aria-busy={running ? 'true' : undefined}
        title="클릭하여 상세 보기"
      >
        <span className="orch-ic" aria-hidden="true">
          {running ? (
            <ProgressCircle />
          ) : failed ? (
            <IconAlert size={16} />
          ) : (
            <IconCheck size={16} />
          )}
        </span>

        <div className="orch-body">
          <div className="orch-title">
            {running ? (
              <>
                {'UltraCode 실행 중'}
                {displayName && <span className="orch-name">{displayName}</span>}
              </>
            ) : failed ? (
              <>
                {'실패'}
                {displayName && <span className="orch-name">{displayName}</span>}
              </>
            ) : (
              <>
                {'완료'}
                {displayName && <span className="orch-name">{displayName}</span>}
              </>
            )}
          </div>
          {liveLine && <div className="orch-live-line">{liveLine}</div>}
        </div>

        <div className="orch-meta">
          {time && <span className="orch-time">{time}</span>}
        </div>
      </button>

      {open && (
        <FullscreenOverlay
          onClose={() => setOpen(false)}
          title={displayName || 'UltraCode'}
        >
          <OrchestrationDetail
            name={displayName}
            description={description}
            phases={phases}
            script={script}
            result={result}
            running={running}
            failed={failed}
            livePhases={livePhases}
            agents={agents}
            liveSummary={liveSummary}
          />
        </FullscreenOverlay>
      )}
    </>
  )
})

interface OrchestrationDetailProps {
  name: string
  description?: string
  phases?: string[]
  script?: string
  result?: string
  running: boolean
  failed?: boolean
  livePhases?: string[]
  agents?: OrchestrationAgentProgress[]
  liveSummary?: string
}

function agentStateLabel(state: OrchestrationAgentProgress['state']): string {
  return state === 'done' ? '완료' : state === 'queued' ? '대기' : '실행 중'
}

function OrchestrationDetail({
  name,
  description,
  phases,
  script,
  result,
  running,
  failed,
  livePhases,
  agents,
  liveSummary,
}: OrchestrationDetailProps): JSX.Element {
  const hasLive = (agents?.length ?? 0) > 0 || (livePhases?.length ?? 0) > 0
  return (
    <div className="orch-detail">
      {name && (
        <div className="orch-d-section">
          <div className="orch-d-label">이름</div>
          <div className="orch-d-value orch-d-name">{name}</div>
        </div>
      )}

      {description && (
        <div className="orch-d-section">
          <div className="orch-d-label">설명</div>
          <div className="orch-d-value">{description}</div>
        </div>
      )}

      {phases && phases.length > 0 && (
        <div className="orch-d-section">
          <div className="orch-d-label">단계</div>
          <ol className="orch-d-phases">
            {phases.map((phase, i) => (
              <li key={i} className="orch-d-phase">
                {phase}
              </li>
            ))}
          </ol>
        </div>
      )}

      {script && (
        <div className="orch-d-section">
          <details className="orch-d-script">
            <summary className="orch-d-label">스크립트 (원문)</summary>
            <pre className="orch-d-code">{script}</pre>
          </details>
        </div>
      )}

      {result && (
        <div className="orch-d-section">
          <div className="orch-d-label">
            {failed ? '오류 출력' : '결과'}
          </div>
          <div className={`orch-d-value orch-d-result${failed ? ' orch-d-result--failed' : ''}`}>
            {result}
          </div>
        </div>
      )}

      {hasLive && (
        <div className="orch-d-section">
          <div className="orch-d-label">진행 상황</div>
          {livePhases && livePhases.length > 0 && (
            <ol className="orch-d-phases orch-d-livephases">
              {livePhases.map((phase, i) => (
                <li key={i} className="orch-d-phase">{phase}</li>
              ))}
            </ol>
          )}
          {agents && agents.length > 0 && (
            <ul className="orch-agents">
              {agents.map((a, i) => (
                <li key={i} className={`orch-agent orch-agent--${a.state}`}>
                  <span className="orch-agent-state" aria-hidden="true">
                    {a.state === 'done' ? <IconCheck size={13} /> : a.state === 'queued' ? '○' : '●'}
                  </span>
                  <span className="orch-agent-label">{a.label}</span>
                  {a.phase && <span className="orch-agent-phase">{a.phase}</span>}
                  <span className="orch-agent-status">{agentStateLabel(a.state)}</span>
                  {typeof a.tokens === 'number' && a.tokens > 0 && (
                    <span className="orch-agent-tokens">{a.tokens.toLocaleString()} tok</span>
                  )}
                  {a.resultPreview && <span className="orch-agent-preview">{a.resultPreview}</span>}
                </li>
              ))}
            </ul>
          )}
          {liveSummary && <div className="orch-d-notice">{liveSummary}</div>}
        </div>
      )}

      {running && !hasLive && (
        <div className="orch-d-section">
          <div className="orch-d-notice">실행 중 — 완료 후 결과가 표시됩니다.</div>
        </div>
      )}

      {!hasLive && (
        <div className="orch-d-hint">
          라이브 내부 진행은 표시되지 않습니다 (작업이 진행 정보를 보고하지 않음)
        </div>
      )}
    </div>
  )
}

export default OrchestrationCard

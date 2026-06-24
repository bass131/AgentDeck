/**
 * OrchestrationCard.tsx — 멀티에이전트 오케스트레이션 블랙박스 카드 (Phase 37 #4b).
 *
 * 엔진중립 — 'Workflow' 리터럴 0 (ADR-003 CRITICAL).
 * 표시명: "UltraCode" (UI 브랜드, 엔진 용어 아님).
 *
 * - running=true: Progress Circle(스피너) + "UltraCode 실행 중" + name(있으면).
 * - running=false, failed=false: 완료 아이콘 + "완료".
 * - running=false, failed=true: 실패 아이콘 + "실패".
 * - 클릭 → FullscreenOverlay 열기(로컬 state).
 * - 풀스크린: name·description·phases 번호목록·script(details 접기)·result.
 *   "라이브 내부 진행은 표시되지 않습니다(엔진 한계)" 안내.
 * - 보라 톤(var(--ultracode) / var(--ultracode-soft)) 일관(인라인 색상 0).
 *
 * UI_GUIDE 준수: glass morphism/그라데이션/네온 금지. 색상 CSS 변수 토큰만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0.
 */
import { useState, memo, type JSX } from 'react'
import { FullscreenOverlay } from './FullscreenOverlay'
import { IconCheck, IconAlert } from './icons'
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
}

/**
 * ProgressCircle — 보라 톤 스피너 (CSS animation 기반).
 * aria-busy/role="progressbar"로 접근성 부여.
 */
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

/**
 * OrchestrationCard — 오케스트레이션 진행/완료/실패 블랙박스 카드.
 *
 * 단방향: thread의 orchestration ThreadItem → 이 컴포넌트.
 * 클릭 → 로컬 open 상태 토글 → FullscreenOverlay(풀스크린) 열기.
 */
export const OrchestrationCard = memo(function OrchestrationCard({
  name,
  description,
  phases,
  running,
  failed,
  result,
  script,
  time,
}: OrchestrationCardProps): JSX.Element {
  const [open, setOpen] = useState(false)

  // 표시 이름: 비어 있으면 'UltraCode'만
  const displayName = name || ''

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
        {/* 상태 아이콘 */}
        <span className="orch-ic" aria-hidden="true">
          {running ? (
            <ProgressCircle />
          ) : failed ? (
            <IconAlert size={16} />
          ) : (
            <IconCheck size={16} />
          )}
        </span>

        {/* 본문 */}
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
        </div>

        {/* 메타 */}
        <div className="orch-meta">
          {time && <span className="orch-time">{time}</span>}
        </div>
      </button>

      {/* 풀스크린 상세 */}
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
          />
        </FullscreenOverlay>
      )}
    </>
  )
})

// ── 풀스크린 내부 상세 컴포넌트 ──────────────────────────────────────────────────

interface OrchestrationDetailProps {
  name: string
  description?: string
  phases?: string[]
  script?: string
  result?: string
  running: boolean
  failed?: boolean
}

function OrchestrationDetail({
  name,
  description,
  phases,
  script,
  result,
  running,
  failed,
}: OrchestrationDetailProps): JSX.Element {
  return (
    <div className="orch-detail">
      {/* 이름 */}
      {name && (
        <div className="orch-d-section">
          <div className="orch-d-label">이름</div>
          <div className="orch-d-value orch-d-name">{name}</div>
        </div>
      )}

      {/* 설명 */}
      {description && (
        <div className="orch-d-section">
          <div className="orch-d-label">설명</div>
          <div className="orch-d-value">{description}</div>
        </div>
      )}

      {/* 단계 목록 */}
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

      {/* 스크립트 (접기) */}
      {script && (
        <div className="orch-d-section">
          <details className="orch-d-script">
            <summary className="orch-d-label">스크립트 (원문)</summary>
            <pre className="orch-d-code">{script}</pre>
          </details>
        </div>
      )}

      {/* 결과 */}
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

      {/* 진행 중 상태 안내 */}
      {running && (
        <div className="orch-d-section">
          <div className="orch-d-notice">실행 중 — 완료 후 결과가 표시됩니다.</div>
        </div>
      )}

      {/* 라이브 진행 불가 안내 (항상 표시) */}
      <div className="orch-d-hint">
        라이브 내부 진행은 표시되지 않습니다 (엔진 한계)
      </div>
    </div>
  )
}

export default OrchestrationCard

/**
 * EngineGate.tsx — 엔진 설치/업데이트 게이트 카드 (F12-03).
 *
 * 원본 AgentCodeGUI EngineGate.tsx 1:1 시각 이식 + 적응.
 *
 * 적응 (디자인-우선, 새 IPC 0):
 *   - props { open, phase, onClose }로 제어 (원본은 내부 state + window.api)
 *   - 라이프사이클 실동작 = M5. 이 컴포넌트는 시각(로컬)만.
 *   - window.api 호출 0. window.api.engine.* 호출 없음.
 *
 * open=false → null.
 * phase: 'prompt' | 'installing' | 'done' | 'error'
 *
 * CRITICAL: 인라인 색상 0 — CSS 변수 토큰. window.api 0.
 */
import { type JSX } from 'react'
import { IconCheck, IconAlert, IconBolt } from './icons'
import './EngineGate.css'

export type EngineGatePhase = 'prompt' | 'installing' | 'done' | 'error'

export interface EngineGateProps {
  open: boolean
  phase: EngineGatePhase
  onClose: () => void
  /** 설치 대상 버전 (표시용) */
  targetVersion?: string
  /** 로그 라인 (표시용) */
  log?: string[]
  /** 오류 메시지 */
  error?: string
}

export function EngineGate({
  open,
  phase,
  onClose,
  targetVersion = '1.0.0',
  log = [],
  error,
}: EngineGateProps): JSX.Element | null {
  if (!open) return null

  // prompt 단계: set-dialog 스타일 확인 카드
  if (phase === 'prompt') {
    return (
      <div className="set-dialog-overlay" onMouseDown={onClose}>
        <div className="set-dialog eg-dialog" onMouseDown={(e) => e.stopPropagation()}>
          <div className="sd-ic warn">
            <IconBolt size={22} />
          </div>
          <div className="sd-title">Claude 엔진 설치</div>
          <div className="sd-msg">
            Claude Code 엔진이 아직 설치되지 않았습니다. 최신 버전({targetVersion})을 설치하면 바로 사용할 수 있어요.
          </div>
          <div className="sd-btns">
            <button type="button" className="sd-cancel" onClick={onClose}>
              나중에
            </button>
            <button type="button" className="sd-go">
              설치
            </button>
          </div>
        </div>
      </div>
    )
  }

  // installing / done / error → install-card
  const statusCls =
    phase === 'installing' ? 'running' : phase === 'done' ? 'done' : 'error'

  const icTitle =
    phase === 'installing' ? '엔진 설치 중' : phase === 'done' ? '설치 완료' : '설치 실패'

  const statusText =
    phase === 'installing'
      ? '설치하는 중…'
      : phase === 'done'
        ? '설치가 완료되었습니다'
        : '설치에 실패했습니다'

  return (
    <div
      className="set-dialog-overlay"
      onMouseDown={() => {
        if (phase !== 'installing') onClose()
      }}
    >
      <div className="install-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ic-head">
          <span className={'ic-hic ' + statusCls}>
            {phase === 'installing' ? (
              <span className="set-spin" />
            ) : phase === 'done' ? (
              <IconCheck size={16} />
            ) : (
              <IconAlert size={16} />
            )}
          </span>
          <span className="ic-title">{icTitle}</span>
          <span className="ic-ver">{targetVersion}</span>
        </div>
        <div className="ic-log scroll">
          {log.map((l, i) => (
            <div className="ic-ln" key={i}>
              {l}
            </div>
          ))}
          {phase === 'error' && error && <div className="ic-ln err">{error}</div>}
        </div>
        <div className="ic-foot">
          <span className={'ic-status ' + statusCls}>{statusText}</span>
          {phase === 'error' && (
            <button type="button" className="sd-cancel" onClick={onClose}>
              다시 시도
            </button>
          )}
          <button
            type="button"
            className="sd-go"
            onClick={onClose}
            disabled={phase === 'installing'}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

export default EngineGate

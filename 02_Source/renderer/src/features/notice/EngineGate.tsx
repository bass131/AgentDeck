import { type JSX } from 'react'
import { IconBolt, IconInfo } from '../../components/common/icons'
import './EngineGate.css'

export interface EngineGateProps {
  open: boolean
  available: boolean
  authed: boolean
  version?: string | null
  onRetry: () => void
  onSkip: () => void
}

export function EngineGate({
  open,
  available,
  authed: _authed,
  version,
  onRetry,
  onSkip,
}: EngineGateProps): JSX.Element | null {
  if (!open) return null

  const isUnavailable = !available

  return (
    <div className="set-dialog-overlay">
      <div className="install-card eg-auth-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ic-head">
          <span className="ic-hic warn">
            {isUnavailable ? <IconBolt size={16} /> : <IconInfo size={16} />}
          </span>
          <span className="ic-title">
            {isUnavailable ? 'SDK 초기화 실패' : 'Claude Code 인증이 필요합니다'}
          </span>
          {version && <span className="ic-ver">{version}</span>}
        </div>

        <div className="ic-log eg-auth-body">
          {isUnavailable ? (
            <>
              <div className="ic-ln">
                SDK를 초기화할 수 없습니다.
              </div>
              <div className="ic-ln">
                @anthropic-ai/claude-agent-sdk 모듈을 확인하거나 앱을 재시작하세요.
              </div>
            </>
          ) : (
            <>
              <div className="ic-ln">
                Claude API에 접근하려면 인증이 필요합니다. 아래 중 하나를 설정하세요.
              </div>
              <div className="ic-ln eg-auth-step">
                <span className="eg-step-label">방법 1 — OAuth 로그인</span>
              </div>
              <div className="ic-ln eg-auth-cmd">
                {'claude'}
              </div>
              <div className="ic-ln">
                터미널에서 위 명령을 실행하여 브라우저 OAuth 로그인을 완료하세요.
              </div>
              <div className="ic-ln eg-auth-step">
                <span className="eg-step-label">방법 2 — API 키 환경변수</span>
              </div>
              <div className="ic-ln eg-auth-cmd">
                {'ANTHROPIC_API_KEY=sk-ant-...'}
              </div>
              <div className="ic-ln">
                환경변수를 설정하고 앱을 재시작하세요.
              </div>
              <div className="ic-ln eg-auth-note">
                인증 없이 계속 진행할 수 있으나, 에이전트 실행 시 실패할 수 있습니다.
              </div>
            </>
          )}
        </div>

        <div className="ic-foot">
          <span className="ic-status running eg-auth-status">
            {isUnavailable ? 'SDK 비가용' : '미인증'}
          </span>
          <button
            type="button"
            className="sd-cancel"
            onClick={onRetry}
          >
            재확인
          </button>
          <button
            type="button"
            className="sd-go"
            onClick={onSkip}
          >
            계속 진행
          </button>
        </div>
      </div>
    </div>
  )
}

export default EngineGate

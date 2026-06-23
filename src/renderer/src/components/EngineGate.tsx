/**
 * EngineGate.tsx — 엔진 인증 게이트 카드 (P3 적응).
 *
 * 원본 AgentCodeGUI EngineGate(CLI 설치 게이트)를 우리 모델로 적응:
 *   원본: claude CLI 설치 여부 탐지 → 설치 안내.
 *   우리: SDK 항상 가용, OAuth/API키 인증 여부 탐지 → 인증 안내.
 *
 * 적응 포인트:
 *   - props: { open, available, authed, version?, onRetry, onSkip }
 *     * onRetry: 재확인(getEngineState 재호출 → authed 시 Shell 진입) — AppGate 담당.
 *     * onSkip: 계속 진행(인증 없이 Shell 진입 — 실행 시 실패할 수 있음 안내).
 *   - available=false: SDK 자체 미초기화 안내(드문 케이스).
 *   - available=true, authed=false: OAuth 또는 API키 인증 안내(주 케이스).
 *   - 정보성 + 우회 허용 (원본의 강제 차단보다 유연한 우리 스타일).
 *   - 기존 install-card 셸 구조 재사용 — eg-auth-dialog 클래스 추가.
 *
 * 원본 EngineGatePhase(prompt/installing/done/error) → 우리는 단일 상태(인증 안내).
 * AppGate가 재확인 로직을 제어하므로 이 컴포넌트는 표시 전용.
 *
 * CRITICAL: 인라인 색상 0 — CSS 변수 토큰. window.api 0.
 */
import { type JSX } from 'react'
import { IconBolt, IconInfo } from './icons'
import './EngineGate.css'

export interface EngineGateProps {
  /** 게이트 표시 여부 */
  open: boolean
  /** SDK 가용 여부 (false = SDK 자체 미초기화) */
  available: boolean
  /** 인증 존재 여부 (false = OAuth/API키 미설정) */
  authed: boolean
  /** SDK 버전 (표시용, 없으면 생략) */
  version?: string | null
  /** 재확인 버튼 콜백 — AppGate가 getEngineState 재호출 후 분기 */
  onRetry: () => void
  /** 계속 진행 버튼 콜백 — 인증 없이 Shell 진입 (graceful 우회) */
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

  // available=false: SDK 자체 미초기화 (드문 케이스)
  const isUnavailable = !available

  return (
    <div className="set-dialog-overlay">
      <div className="install-card eg-auth-dialog" onMouseDown={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="ic-head">
          <span className="ic-hic warn">
            {isUnavailable ? <IconBolt size={16} /> : <IconInfo size={16} />}
          </span>
          <span className="ic-title">
            {isUnavailable ? 'SDK 초기화 실패' : 'Claude Code 인증이 필요합니다'}
          </span>
          {version && <span className="ic-ver">{version}</span>}
        </div>

        {/* 안내 본문 */}
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

        {/* 푸터 액션 */}
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

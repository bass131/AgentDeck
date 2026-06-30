/**
 * AppUpdateGate.tsx — 앱 자동 업데이트 게이트 카드 (F12-03).
 *
 * 원본 AgentCodeGUI AppUpdateGate.tsx 1:1 시각 이식 + 적응.
 *
 * 적응 (디자인-우선, 새 IPC 0):
 *   - props { open, phase, onClose }로 제어 (원본은 내부 state + window.api)
 *   - 라이프사이클 실동작 = M5. 이 컴포넌트는 시각(로컬)만.
 *   - window.api 호출 0.
 *
 * install-card 관용구 재사용 (EngineGate와 동일 패턴).
 * open=false → null.
 * phase: 'available' | 'downloading' | 'downloaded' | 'error'
 *
 * CRITICAL: 인라인 색상 0 — CSS 변수 토큰. window.api 0.
 */
import { type JSX } from 'react'
import { IconCheck, IconAlert } from '../common/icons'
import './AppUpdateGate.css'

export type AppUpdatePhase = 'available' | 'downloading' | 'downloaded' | 'error'

export interface AppUpdateGateProps {
  open: boolean
  phase: AppUpdatePhase
  onClose: () => void
  /** 앱 버전 (표시용) */
  version?: string
  /** 다운로드 퍼센트 */
  percent?: number
  /** 로그 라인 */
  log?: string[]
  /** 오류 메시지 */
  error?: string
}

export function AppUpdateGate({
  open,
  phase,
  onClose,
  version,
  percent = 0,
  log = [],
  error,
}: AppUpdateGateProps): JSX.Element | null {
  if (!open) return null

  const statusCls =
    phase === 'downloaded' ? 'done' : phase === 'error' ? 'error' : 'running'

  const title =
    phase === 'downloaded'
      ? '업데이트 준비 완료'
      : phase === 'error'
        ? '업데이트 오류'
        : '업데이트 다운로드 중'

  const statusText =
    phase === 'downloaded'
      ? '재시작하면 새 버전이 설치됩니다'
      : phase === 'error'
        ? '업데이트에 실패했습니다'
        : `내려받는 중… ${percent}%`

  return (
    <div
      className="set-dialog-overlay"
      onMouseDown={onClose}
    >
      <div className="install-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ic-head">
          <span className={'ic-hic ' + statusCls}>
            {phase === 'downloaded' ? (
              <IconCheck size={16} />
            ) : phase === 'error' ? (
              <IconAlert size={16} />
            ) : (
              <span className="set-spin" />
            )}
          </span>
          <span className="ic-title">{title}</span>
          {version && <span className="ic-ver">v{version}</span>}
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
          {phase === 'downloaded' ? (
            <>
              <button type="button" className="sd-cancel" onClick={onClose}>
                나중에
              </button>
              <button type="button" className="sd-go">
                재시작하여 설치
              </button>
            </>
          ) : (
            <button type="button" className="sd-go" onClick={onClose}>
              {phase === 'error' ? '확인' : '숨기기'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppUpdateGate

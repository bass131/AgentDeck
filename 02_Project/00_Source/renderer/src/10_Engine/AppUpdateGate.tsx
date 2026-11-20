import { type JSX } from 'react'
import { IconCheck, IconAlert } from '@renderer/02_Common/icons'
import { useModalLayer } from '@renderer/02_Common/modalStack'
import './AppUpdateGate.css'

export type AppUpdatePhase = 'available' | 'downloading' | 'downloaded' | 'error'

export interface AppUpdateGateProps {
  open: boolean
  phase: AppUpdatePhase
  onClose: () => void
  version?: string
  percent?: number
  log?: string[]
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
  // 받는 중에 닫히면 안 되는 창이라 Esc 처리는 두지 않는다 — 층에만 올라 아래 모달과 Shell이 Esc를 받지 않게 한다
  useModalLayer(open)
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

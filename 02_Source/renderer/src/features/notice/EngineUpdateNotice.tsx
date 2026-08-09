import { type JSX, useEffect, useRef, useState } from 'react'
import './EngineGate.css'
import { IconAlert, IconBolt, IconCheck } from '../../components/common/icons'
import type { EngineInstallProgress } from '../../../../shared/ipcContract'

type Phase = 'prompt' | 'installing' | 'done' | 'error'

export interface EngineUpdateNoticeProps {
  open: boolean
  current: string | null
  latest: string | null
  onClose: () => void
}

export function EngineUpdateNotice({
  open,
  current,
  latest,
  onClose,
}: EngineUpdateNoticeProps): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('prompt')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!open) {
      setPhase('prompt')
      setLog([])
      setError(null)
    }
  }, [open])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  useEffect(() => {
    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [])

  if (!open) return null

  const currentLabel = current ?? '알 수 없음'
  const latestLabel = latest ?? '알 수 없음'
  const targetVersion = latest ?? ''

  const doInstall = (): void => {
    unsubRef.current?.()
    unsubRef.current = null

    setError(null)
    setLog(['설치를 준비하는 중…'])
    setPhase('installing')

    const off = window.api.onEngineInstallProgress((p: EngineInstallProgress) => {
      if (p.line) {
        setLog((prev) => [...prev, p.line as string])
      }
      if (p.done) {
        off()
        unsubRef.current = null
        if (p.ok) {
          void window.api.setActiveEngine(targetVersion).then(() => {
            setPhase('done')
          })
        } else {
          setError(p.error ?? '알 수 없는 오류로 설치에 실패했습니다.')
          setPhase('error')
        }
      }
    })
    unsubRef.current = off

    window.api.installEngine(targetVersion).then((r) => {
      if (!r.ok) {
        off()
        unsubRef.current = null
        setError(r.error ?? '알 수 없는 오류로 설치에 실패했습니다.')
        setPhase('error')
      }
    }).catch((e: unknown) => {
      off()
      unsubRef.current = null
      setError(String((e as Error)?.message ?? e))
      setPhase('error')
    })
  }

  if (phase === 'prompt') {
    return (
      <div
        className="set-dialog-overlay"
        onMouseDown={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eun-title"
      >
        <div
          className="set-dialog"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="sd-ic warn" aria-hidden="true">
            <IconBolt size={22} />
          </div>

          <p id="eun-title" className="sd-title">새 엔진 버전</p>

          <p className="sd-msg">
            현재 <b>{currentLabel}</b> 버전을 사용 중입니다.{' '}
            최신 버전 <b>{latestLabel}</b>(으)로 업데이트할까요?
          </p>

          <div className="sd-btns">
            <button type="button" className="sd-cancel" onClick={onClose}>
              나중에
            </button>
            <button type="button" className="sd-go" onClick={doInstall}>
              업데이트
            </button>
          </div>
        </div>
      </div>
    )
  }

  const statusCls = phase === 'installing' ? 'running' : phase === 'done' ? 'done' : 'error'

  const headTitle =
    phase === 'installing' ? '엔진 설치 중' :
    phase === 'done' ? '설치 완료' : '설치 실패'

  const statusText =
    phase === 'installing' ? '설치하는 중…' :
    phase === 'done' ? '다음 실행부터 새 엔진이 적용됩니다' : '설치에 실패했습니다'

  return (
    <div
      className="set-dialog-overlay"
      onMouseDown={() => {
        if (phase !== 'installing') onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="eun-ic-title"
    >
      <div
        className="install-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ic-head">
          <span className={`ic-hic ${statusCls}`} aria-hidden="true">
            {phase === 'installing' ? (
              <span className="set-spin" />
            ) : phase === 'done' ? (
              <IconCheck size={16} />
            ) : (
              <IconAlert size={16} />
            )}
          </span>
          <span id="eun-ic-title" className="ic-title">{headTitle}</span>
          <span className="ic-ver">{targetVersion}</span>
        </div>

        <div className="ic-log scroll" ref={logRef}>
          {log.map((line, idx) => (
            <div className="ic-ln" key={idx}>{line}</div>
          ))}
          {phase === 'error' && error && (
            <div className="ic-ln err">{error}</div>
          )}
        </div>

        <div className="ic-foot">
          <span className={`ic-status ${statusCls}`}>{statusText}</span>
          {phase === 'error' && (
            <button type="button" className="sd-cancel" onClick={doInstall}>
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

/**
 * EngineUpdateNotice.tsx — 엔진(SDK) 새 버전 알림 + 설치 phase 흐름 (폴리싱 #2b).
 *
 * phase: 'prompt' | 'installing' | 'done' | 'error'
 *
 * prompt  — set-dialog 재사용: "나중에" / "업데이트" 2버튼.
 * installing — install-card: 스피너 + ic-log 라인 스트림 + 자동스크롤.
 * done    — install-card: IconCheck + "다음 실행부터 새 엔진이 적용됩니다" + "확인".
 * error   — install-card: IconAlert + .ic-ln.err 에러 + "다시 시도" / "확인".
 *
 * 원본 AgentCodeGUI EngineGate.tsx (update kind, L95~172) 1:1 미러.
 *
 * CSS: install-card 관용구(EngineGate.css) + set-dialog 관용구(Sidebar.css) 재사용.
 *       신규 CSS 없음.
 *
 * CRITICAL: renderer untrusted — fs/Node 직접 호출 0.
 * CRITICAL: 인라인 색상 0 — CSS 변수 토큰만.
 * CRITICAL: window.api 화이트리스트만 — installEngine / setActiveEngine / onEngineInstallProgress.
 * CRITICAL: 구독 해제 — done/error 도달 시 off() 호출, 언마운트 시 useEffect cleanup.
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import './EngineGate.css'
import { IconAlert, IconBolt, IconCheck } from '../common/icons'
import type { EngineInstallProgress } from '../../../../shared/ipc-contract'

// ── 내부 phase 타입 ──────────────────────────────────────────────────────────
type Phase = 'prompt' | 'installing' | 'done' | 'error'

// ── Props ─────────────────────────────────────────────────────────────────────
export interface EngineUpdateNoticeProps {
  /** true이면 오버레이+다이얼로그 표시. false이면 null 반환. */
  open: boolean
  /** 현재 사용 중인 엔진 버전 (null이면 '알 수 없음' fallback). */
  current: string | null
  /** npm registry 최신 버전 (null이면 '알 수 없음' fallback). */
  latest: string | null
  /**
   * 닫기 콜백.
   *   - prompt: "나중에" 클릭 → Shell이 seen 도장.
   *   - done/error: "확인" 클릭.
   * installing 중에는 호출 안 됨(오버레이 차단).
   */
  onClose: () => void
}

/**
 * 엔진(SDK) 새 버전 알림 + 설치 phase 흐름 다이얼로그.
 *
 * 단방향 데이터 흐름:
 *   IPC 이벤트(onEngineInstallProgress) → 로컬 state → 렌더.
 *   installEngine/setActiveEngine 결과 → phase 전이.
 */
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
  // 구독 해제 함수 ref — useEffect cleanup 경유
  const unsubRef = useRef<(() => void) | null>(null)

  // open이 닫힐 때 phase 리셋 (재오픈 시 prompt부터)
  useEffect(() => {
    if (!open) {
      setPhase('prompt')
      setLog([])
      setError(null)
    }
  }, [open])

  // 로그 자동 스크롤 (원본 logRef 미러)
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  // 언마운트 시 구독 해제
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

  // ── 설치 실행 ──────────────────────────────────────────────────────────────
  const doInstall = (): void => {
    // 이전 구독 해제
    unsubRef.current?.()
    unsubRef.current = null

    setError(null)
    setLog(['설치를 준비하는 중…'])
    setPhase('installing')

    // 진행 이벤트 구독 (onAgentEvent 패턴 동일)
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

    // 설치 요청 — reject/catch → error 단계
    window.api.installEngine(targetVersion).then((r) => {
      // done 이벤트가 먼저 처리되지 않은 경우 결과로 폴백
      if (r.ok) {
        // 정상: done 이벤트에서 처리됨 — 중복 전이 방지 위해 phase 확인
        // (done 이벤트가 먼저 왔다면 이미 setPhase('done') 완료)
      } else {
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

  // ── prompt 단계 ────────────────────────────────────────────────────────────
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
          {/* 경고 아이콘 (원본 update kind .sd-ic.warn 동일) */}
          <div className="sd-ic warn" aria-hidden="true">
            <IconBolt size={22} />
          </div>

          {/* 제목 */}
          <p id="eun-title" className="sd-title">새 엔진 버전</p>

          {/* 본문 메시지 */}
          <p className="sd-msg">
            현재 <b>{currentLabel}</b> 버전을 사용 중입니다.{' '}
            최신 버전 <b>{latestLabel}</b>(으)로 업데이트할까요?
          </p>

          {/* 버튼 영역 — 2버튼: 나중에 / 업데이트 */}
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

  // ── installing / done / error — install-card ───────────────────────────────
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
        // installing 중에는 오버레이 클릭 차단 (원본 미러)
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
        {/* ── 헤더 ── */}
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

        {/* ── 로그 영역 ── */}
        <div className="ic-log scroll" ref={logRef}>
          {log.map((line, idx) => (
            <div className="ic-ln" key={idx}>{line}</div>
          ))}
          {phase === 'error' && error && (
            <div className="ic-ln err">{error}</div>
          )}
        </div>

        {/* ── 푸터 ── */}
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

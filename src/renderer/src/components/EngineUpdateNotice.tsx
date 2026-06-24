/**
 * EngineUpdateNotice.tsx — 엔진(SDK) 새 버전 정보성 알림 다이얼로그 (폴리싱 #2a).
 *
 * 원본 AgentCodeGUI EngineGate.tsx `kind==='update'` 프롬프트 시각 1:1 미러.
 * (a) 단계: 정보성 알림만 — in-app 설치 없음. 단일 "확인" 버튼(dismiss).
 *
 * 기존 .set-dialog 관용구 재사용 (Sidebar.css L406~):
 *   .set-dialog-overlay / .set-dialog / .sd-ic.warn / .sd-title / .sd-msg / .sd-btns / .sd-go
 * 신규 CSS 없음.
 *
 * CRITICAL: 인라인 색상 0 — CSS 변수 토큰만.
 * CRITICAL: window.api 직접 호출 0 — 표시 전용. 트리거는 Shell이 제어.
 * CRITICAL: renderer untrusted — fs/Node 호출 0.
 */
import type { JSX } from 'react'
import { IconBolt } from './icons'

export interface EngineUpdateNoticeProps {
  /** true이면 오버레이+다이얼로그 표시. false이면 null 반환. */
  open: boolean
  /** 현재 사용 중인 엔진 버전 (null이면 '알 수 없음' fallback). */
  current: string | null
  /** npm registry 최신 버전 (null이면 '알 수 없음' fallback). */
  latest: string | null
  /** 닫기 콜백 — "확인" 버튼 클릭 또는 오버레이 클릭 시 호출. */
  onClose: () => void
}

/**
 * 엔진(SDK) 새 버전 정보 알림 다이얼로그.
 *
 * open=false → null.
 * open=true → .set-dialog-overlay > .set-dialog(.sd-ic.warn, .sd-title, .sd-msg, .sd-btns>.sd-go).
 */
export function EngineUpdateNotice({
  open,
  current,
  latest,
  onClose,
}: EngineUpdateNoticeProps): JSX.Element | null {
  if (!open) return null

  const currentLabel = current ?? '알 수 없음'
  const latestLabel = latest ?? '알 수 없음'

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
          최신 버전 <b>{latestLabel}</b>이(가) 출시되었습니다.
        </p>

        {/* 버튼 영역 — (a) 단계: 설치 미구현 → 단일 "확인" 버튼 */}
        <div className="sd-btns">
          <button type="button" className="sd-go" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

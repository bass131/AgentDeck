/**
 * ZoomControl.tsx — 상태바 우측 고정 소형 줌 컨트롤 (FB2 P05).
 *
 * VSCode 스타일 −/%/+ 3버튼 클러스터. 상태바(.statusbar)는 single/multi 워크스페이스
 * 모드 무관하게 Shell 수명 내내 항상 렌더되므로(Shell.tsx footer, 조건부 아님) "우하단
 * 고정"이 자동 보장된다 — 별도 fixed 오버레이를 새로 만들지 않는다.
 *
 * 클릭은 전부 P03 클램프 setter(lib/useGlobalZoom.ts stepZoomFactor/resetZoomFactor →
 * window.api.setZoomFactor) 경유 — 원시 webFrame 호출 0, 클램프 로직 중복 0.
 *
 * per-region ZoomBadge(Conversation.css, Ctrl+휠 직후 중앙에 잠깐 뜨는 flash pill,
 * lib/zoom.tsx)와는 위치·트리거·수명이 완전히 다르다 — 혼동 방지를 위해 클래스명도
 * zoom-ctl(이 컴포넌트) vs zoom-badge(ZoomBadge)로 분리했다.
 *
 * %표시는 useZoomFactorPct()(FB1 P04, DPR-change 감지 재사용, 부작용 없음) — 키보드
 * 단축키·버튼 등 어떤 경로로 factor가 바뀌어도 자동 동기화(단방향: webFrame factor →
 * 표시. 이 컴포넌트가 직접 factor를 들고 있지 않는다).
 *
 * CRITICAL: renderer untrusted — window.api(getZoomFactor/setZoomFactor)만 간접 호출
 * (lib/useGlobalZoom.ts 경유). 인라인 색상 0 — 기존 pill/버튼 토큰(surface-2/surface-3/
 * line/text-3, AgentPanel.css .ag-pill·Sidebar.css .col-rail-btn과 동일 어휘) 재사용,
 * 신규 색 0.
 */
import type { JSX } from 'react'
import { ZOOM_FACTOR_RANGE, ZOOM_FACTOR_STEP } from '../../../../shared/ipc-contract'
import { useZoomFactorPct, stepZoomFactor, resetZoomFactor } from '../../lib/useGlobalZoom'
import './ZoomControl.css'

const MIN_PCT = ZOOM_FACTOR_RANGE.MIN * 100 // 50
const MAX_PCT = ZOOM_FACTOR_RANGE.MAX * 100 // 200

export function ZoomControl(): JSX.Element {
  const pct = useZoomFactorPct()
  const atMin = pct <= MIN_PCT
  const atMax = pct >= MAX_PCT
  // reviewer 🟡-2: 이미 100%면 리셋이 no-op이므로 −/+ 경계 disabled와 동일한 일관성으로
  // 비활성화한다(클릭해도 아무 변화 없는 버튼을 활성 상태로 두지 않는다).
  const atReset = pct === 100

  return (
    <div className="zoom-ctl" role="group" aria-label="화면 확대/축소">
      <button
        type="button"
        className="zoom-ctl-btn"
        aria-label="축소"
        disabled={atMin}
        onClick={() => stepZoomFactor(-ZOOM_FACTOR_STEP)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5 L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="zoom-ctl-pct"
        // reviewer 🟡-1: 시각 텍스트({pct}%)는 라이브 값인데 aria-label이 "(100%)"로
        // 고정돼 있으면 스크린리더 사용자에게는 항상 100%로 안내되는 불일치가 생긴다 —
        // 라이브 pct를 그대로 반영.
        aria-label={`화면 100%로 초기화 (현재 ${pct}%)`}
        disabled={atReset}
        onClick={resetZoomFactor}
      >
        {pct}%
      </button>
      <button
        type="button"
        className="zoom-ctl-btn"
        aria-label="확대"
        disabled={atMax}
        onClick={() => stepZoomFactor(ZOOM_FACTOR_STEP)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 1 L5 9 M1 5 L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default ZoomControl

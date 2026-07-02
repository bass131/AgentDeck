/**
 * LoopStatusBanner — 통합 루프 인디케이터 (LR2-03, LR3-03 단순화).
 *
 * 종전 LoopIndicator(앱 타이머 배너, 컴포저 위) + LoopRunningIndicator(SDK 크론 pill,
 * 우상단)를 하나로 통합했던 컴포넌트. LR3-03(앱 타이머 /loop 폐기 — 영호 확정
 * "토큰 맥싱")에서 app 변형이 사라지고 sdk 변형만 남는다. 표시 결정은
 * resolveLoopStatus(lib/loopStatus.ts)의 union을 그대로 소비.
 *
 * 변형(variant):
 *   - sdk: "loop 진행중 - {summary}[ 외 N]" + 회전 아이콘 + 정지(세션 abort) 버튼.
 *
 * 셀렉터 계약(회귀 방지): 루트 `.loop-indicator` · sdk 변형 `.loop-sdk` ·
 * sdk 정지 `.loop-sdk-stop`은 e2e가 의존 — 유지.
 *
 * UI_GUIDE 준수: glass/네온/그라데이션 금지, CSS 변수 토큰만. 컴포저 위 배너 단일 위치.
 * 회전은 기능적(진행 표시) — prefers-reduced-motion: reduce에서 정지(접근성).
 * CRITICAL(신뢰경계): 표시 전용 — window.api/fs/Node 0. 상태·타이머는 부모가 관리.
 */
import type { JSX } from 'react'
import { IconRefresh, IconClose } from '../common/icons'
import type { LoopStatus } from '../../lib/loopStatus'
import './LoopStatusBanner.css'

export interface LoopStatusBannerProps {
  /** resolveLoopStatus 판정 결과 — none이면 미렌더. */
  status: LoopStatus
  /**
   * SDK 크론 정지(선택). 크론은 세션 스코프라 세션 abort로 반복 호출이 멈춘다 —
   * 호출부가 세션 abort를 연결한다. 미전달 시 정지 버튼 미표시(기존 계약 유지).
   */
  onStopSdk?: () => void
}

export function LoopStatusBanner({
  status,
  onStopSdk,
}: LoopStatusBannerProps): JSX.Element | null {
  if (status.kind === 'none') return null

  // ── sdk 변형: SDK 크론 루프 (기존 LoopRunningIndicator 거동 이관) ──────────
  const { loops } = status
  const first = loops[0]
  const extra = loops.length - 1
  const summaryText = extra > 0 ? `${first.summary} 외 ${extra}` : first.summary

  return (
    <div className="loop-indicator loop-sdk" role="status" aria-label={`루프 ${loops.length}개 진행중`}>
      <span className="loop-ic spin" aria-hidden>
        <IconRefresh size={14} />
      </span>
      <span className="loop-label">loop 진행중</span>
      <span className="loop-prompt" title={summaryText}>
        {summaryText}
      </span>
      {/* 정지 — 세션 abort로 크론 종료(LLM 반복 호출 중단). onStopSdk 있을 때만. */}
      {onStopSdk && (
        <button
          type="button"
          className="loop-btn loop-sdk-stop"
          aria-label="루프 정지"
          title="루프 정지 — 세션을 종료해 반복 호출을 멈춥니다"
          onClick={onStopSdk}
        >
          <IconClose size={13} />
          <span>정지</span>
        </button>
      )}
    </div>
  )
}

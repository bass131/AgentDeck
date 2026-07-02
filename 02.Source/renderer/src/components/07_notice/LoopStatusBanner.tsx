/**
 * LoopStatusBanner — 통합 루프 인디케이터 (LR2-03, LR3-03 단순화, LR3-06 goal 편입).
 *
 * 종전 LoopIndicator(앱 타이머 배너, 컴포저 위) + LoopRunningIndicator(SDK 크론 pill,
 * 우상단)를 하나로 통합했던 컴포넌트. LR3-03(앱 타이머 /loop 폐기 — 영호 확정
 * "토큰 맥싱")에서 app 변형이 사라지고 sdk 변형만 남았다. LR3-06에서 goal(`/goal`
 * 자기지속 반복) 변형을 추가 — 표시 결정은 여전히 resolveLoopStatus(lib/loopStatus.ts)
 * 한 곳의 union만 그대로 소비(단일 표시 불변식 — 이 컴포넌트는 우선순위를 재판정하지 않는다).
 *
 * 변형(variant):
 *   - sdk:  "loop 진행중 - {summary}[ 외 N]" + 회전 아이콘 + 정지(세션 abort) 버튼.
 *   - goal: "goal 진행중" + 회전 아이콘 + "N턴" 뱃지. 정지 버튼 없음(컴포저 자체
 *           중단 버튼이 isRunning 내내 이미 노출되므로 중복 불필요 — goal은 항상
 *           단일 run 안에서 진행되기 때문).
 *   - stopped: "루프 정지됨" 확인(LR3-06 정지 신뢰 피드백 — 영호 육안 피드백 2026-07-03).
 *           abort의 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 정지 후 80s간
 *           옛 runId 이벤트 증가 0)이나 배너가 즉시 사라지기만 해 신뢰 불가 →
 *           "세션과 함께 정리됨"을 명시 확인. 회전 없음(진행 아님) + ✕ 닫기.
 *
 * 셀렉터 계약(회귀 방지): 루트 `.loop-indicator` · sdk 변형 `.loop-sdk` ·
 * sdk 정지 `.loop-sdk-stop`은 e2e가 의존 — 유지. goal 변형은 `.loop-goal` 계열 신규.
 * stopped 변형 `.loop-stopped` · 닫기 `.loop-dismiss` 신규(LR3-06).
 *
 * UI_GUIDE 준수: glass/네온/그라데이션 금지, CSS 변수 토큰만. 컴포저 위 배너 단일 위치.
 * 회전은 기능적(진행 표시) — prefers-reduced-motion: reduce에서 정지(접근성).
 * CRITICAL(신뢰경계): 표시 전용 — window.api/fs/Node 0. 상태·타이머는 부모가 관리.
 */
import type { JSX } from 'react'
import { IconClose } from '../common/icons'
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
  /**
   * 정지 확인(stopped) 배너 ✕ 닫기(선택, LR3-06 정지 신뢰 피드백).
   * 미전달 시 닫기 버튼 미표시(onStopSdk와 동형의 옵셔널 계약).
   */
  onDismissStopped?: () => void
}

export function LoopStatusBanner({
  status,
  onStopSdk,
  onDismissStopped,
}: LoopStatusBannerProps): JSX.Element | null {
  if (status.kind === 'none') return null

  // ── stopped 변형: 정지 확인 — 회전 없음(진행이 아니라 완료된 사실의 통지).
  if (status.kind === 'stopped') {
    return (
      <div className="loop-indicator loop-stopped" role="status" aria-label="루프 정지됨">
        <span className="loop-ic" aria-hidden>
          <IconClose size={14} />
        </span>
        {/* 문구 주의(영호 재검증 2026-07-03): "정리되었어요"는 금지 — 크론 *기록*은 세션
            트랜스크립트에 남아 resume 후 CronList가 목록에 보고한다(스케줄 재개는 없음,
            lr3-p06-stop-cleanup resume probe 실측: 90s 틱 0). "실행 중지"만이 정확한 사실. */}
        <span className="loop-label">루프 정지됨</span>
        <span className="loop-prompt">반복 실행이 멈췄어요 — 더 이상 자동 호출되지 않아요</span>
        {onDismissStopped && (
          <button
            type="button"
            className="loop-btn loop-dismiss"
            aria-label="알림 닫기"
            title="확인 배너 닫기"
            onClick={onDismissStopped}
          >
            <IconClose size={13} />
          </button>
        )}
      </div>
    )
  }

  // ── goal 변형: `/goal` 자기지속 반복(LR3-06) — 회전 아이콘 + N턴 뱃지만.
  //     진행 기록은 cmdresult 카드가 별도로 유지 — 배너는 "지금 도는 중" 신호 전용.
  if (status.kind === 'goal') {
    const { turns } = status
    return (
      <div className="loop-indicator loop-goal" role="status" aria-label={`목표 진행중 · ${turns}턴`}>
        <span className="loop-spinner" aria-hidden />
        <span className="loop-label">goal 진행중</span>
        <span className="loop-goal-turns">{turns}턴</span>
      </div>
    )
  }

  // ── sdk 변형: SDK 크론 루프 (기존 LoopRunningIndicator 거동 이관) ──────────
  const { loops } = status
  const first = loops[0]
  const extra = loops.length - 1
  const summaryText = extra > 0 ? `${first.summary} 외 ${extra}` : first.summary

  return (
    <div className="loop-indicator loop-sdk" role="status" aria-label={`루프 ${loops.length}개 진행중`}>
      <span className="loop-spinner" aria-hidden />
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

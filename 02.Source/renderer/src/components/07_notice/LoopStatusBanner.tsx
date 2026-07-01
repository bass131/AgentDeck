/**
 * LoopStatusBanner — 통합 루프 인디케이터 (LR2-03).
 *
 * 종전 LoopIndicator(앱 타이머 배너, 컴포저 위) + LoopRunningIndicator(SDK 크론 pill,
 * 우상단)를 하나로 통합. 표시 결정은 resolveLoopStatus(lib/loopStatus.ts)의 union을
 * 그대로 소비 — 이 컴포넌트 하나만 마운트되므로 동시 표시가 구조적으로 불가능하다.
 *
 * 변형(variant):
 *   - app running: 반복 아이콘 + 프롬프트 + "N틱 · 간격" + 정지 버튼(+ 동시 크론 힌트).
 *   - app stopped: 상한 도달 알림(틱/시간) + 닫기 버튼.
 *   - sdk: "loop 진행중 - {summary}[ 외 N]" + 회전 아이콘 + 정지(세션 abort) 버튼.
 *
 * 셀렉터 계약(회귀 방지): 루트 `.loop-indicator` · 앱 정지 `.loop-stop`은
 * loop-live.e2e.ts가 의존 — 유지.
 *
 * UI_GUIDE 준수: glass/네온/그라데이션 금지, CSS 변수 토큰만. 컴포저 위 배너 단일 위치.
 * 회전은 기능적(진행 표시) — prefers-reduced-motion: reduce에서 정지(접근성).
 * CRITICAL(신뢰경계): 표시 전용 — window.api/fs/Node 0. 상태·타이머는 부모가 관리.
 */
import type { JSX } from 'react'
import { IconRefresh, IconClose, IconAlert } from '../common/icons'
import { formatLoopInterval, type ActiveLoop } from '../../lib/loopCommand'
import type { LoopStatus } from '../../lib/loopStatus'
import './LoopStatusBanner.css'

export interface LoopStatusBannerProps {
  /** resolveLoopStatus 판정 결과 — none이면 미렌더. */
  status: LoopStatus
  /** 앱 타이머 루프 정지(running) — 사용자가 루프 중단. */
  onStopApp: () => void
  /** 앱 타이머 루프 알림 닫기(stopped) — 상한 도달 인디케이터 제거. */
  onDismissApp: () => void
  /**
   * SDK 크론 정지(선택). 크론은 세션 스코프라 세션 abort로 반복 호출이 멈춘다 —
   * 호출부가 세션 abort를 연결한다. 미전달 시 정지 버튼 미표시(기존 계약 유지).
   */
  onStopSdk?: () => void
}

function stopMessage(reason: ActiveLoop['stopReason'], tickCount: number): string {
  if (reason === 'max-ticks') return `최대 반복 횟수(${tickCount}틱) 상한 도달 — 루프 정지됨`
  if (reason === 'max-duration') return '최대 실행 시간(30분) 상한 도달 — 루프 정지됨'
  return '루프 정지됨'
}

export function LoopStatusBanner({
  status,
  onStopApp,
  onDismissApp,
  onStopSdk,
}: LoopStatusBannerProps): JSX.Element | null {
  if (status.kind === 'none') return null

  // ── app 변형: 앱 타이머 루프 (기존 LoopIndicator 거동 이관) ────────────────
  if (status.kind === 'app') {
    const { loop, extraSdkLoops } = status

    if (loop.status === 'stopped') {
      return (
        <div className="loop-indicator stopped" role="status">
          <span className="loop-ic" aria-hidden>
            <IconAlert size={14} />
          </span>
          <span className="loop-text">{stopMessage(loop.stopReason, loop.tickCount)}</span>
          <button type="button" className="loop-btn" aria-label="루프 알림 닫기" onClick={onDismissApp}>
            <IconClose size={13} />
          </button>
        </div>
      )
    }

    return (
      <div className="loop-indicator" role="status">
        <span className="loop-ic spin" aria-hidden>
          <IconRefresh size={14} />
        </span>
        <span className="loop-label">반복 중</span>
        <span className="loop-prompt" title={loop.prompt}>
          {loop.prompt}
        </span>
        <span className="loop-meta">
          {loop.tickCount}틱 · {formatLoopInterval(loop.intervalMs)} 간격
          {/* 동시 활성 SDK 크론 힌트 — 단일 표면 유지하며 정보 은닉 방지 */}
          {extraSdkLoops > 0 && ` · 크론 ${extraSdkLoops}`}
        </span>
        <button type="button" className="loop-btn loop-stop" aria-label="루프 정지" onClick={onStopApp}>
          <IconClose size={13} />
          <span>정지</span>
        </button>
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

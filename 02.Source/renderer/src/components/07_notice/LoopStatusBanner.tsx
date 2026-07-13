/**
 * LoopStatusBanner — 통합 루프 인디케이터 (LR2-03, LR3-03 단순화, LR3-06 goal 편입,
 * FB2 P08 카드형 3단 정보위계).
 *
 * 종전 LoopIndicator(앱 타이머 배너, 컴포저 위) + LoopRunningIndicator(SDK 크론 pill,
 * 우상단)를 하나로 통합했던 컴포넌트. LR3-03(앱 타이머 /loop 폐기 — 영호 확정
 * "토큰 맥싱")에서 app 변형이 사라지고 sdk 변형만 남았다. LR3-06에서 goal(`/goal`
 * 자기지속 반복) 변형을 추가 — 표시 결정은 여전히 resolveLoopStatus(lib/loopStatus.ts)
 * 한 곳의 union만 그대로 소비(단일 표시 불변식 — 이 컴포넌트는 우선순위를 재판정하지 않는다).
 *
 * FB2 P08(영호 피드백 — `01.Phases/FB1-ui-feedback/ScreenShot/Goal과 loop GUI배너를...png`):
 * "컴포저 위에 상시 카드로, 상태→작업 주제→현재 작업내용 3단 순서"를 요청. 배경(현행 조사):
 * goal의 3단 정보(상태="목표를 향해 자율 반복 중…"/주제=목표 텍스트/진행률)는 이미
 * `cmdresult` 카드(CmdResultCard, thread 인라인)에 존재했으나 대화가 흐르면 스크롤에
 * 묻혀 사라진다 — 유일한 "상시" 표시는 이 배너인데 정작 goal 변형은 "goal 진행중 · N턴"
 * 한 줄뿐이었다(정보 손실). 이 Phase가 그 간극을 좁힌다:
 *   1행(상태, `.loop-head`) — 아이콘 + 라벨(+배지/버튼).
 *   2행(작업 주제, `.loop-topic`) — goal: pendingCommand.detail(목표 텍스트, cmdresult
 *      카드 sub와 동일 소스) · sdk: LoopInfo.summary(원래도 표시하던 값, 재배치만).
 *   3행(현재 작업내용, `.loop-current`) — currentActivity prop(부모가 thinkingText를
 *      그대로 전달). null이면 행 자체를 렌더하지 않는다(값 없는 정보를 지어내지 않음 —
 *      thinkingText는 텍스트 스트리밍이 시작되는 순간 reducer가 null로 되돌리는 살아있는
 *      신호라, 자연히 깜빡이듯 나타났다 사라진다 — 트레이드오프: 최근 스냅샷을 유지해
 *      계속 채우는 대안도 있으나 "지금 이 순간"이라는 신선도 의미가 흐려져 채택하지
 *      않았다). resolveLoopStatus의 인자로 넣지 않고 별도 prop인 이유: thinkingText는
 *      "어느 loop 변형이냐"와 무관한 전역 활동 신호라 순수 판정 함수(변형 우선순위만
 *      결정)의 책임 밖에 둔다(관심사 분리 — 판정 로직과 라이브 텍스트 결합 방지).
 *   상태 라벨 문자열은 CMD_CARDS(lib/cmdCards.ts)에서 그대로 가져와 cmdresult 카드와
 *   1행 문구가 항상 동일하게 유지된다(단일 진실원 — 두 표시가 따로 놀지 않음).
 *
 * 변형(variant):
 *   - sdk:  1행 "loop 진행중" + 회전 아이콘 + 정지(세션 abort) 버튼. 2행 summary[외 N].
 *   - goal: 1행 "목표를 향해 자율 반복 중…" + 회전 아이콘 + "N턴" 뱃지. 정지 버튼 없음
 *           (컴포저 자체 중단 버튼이 isRunning 내내 이미 노출되므로 중복 불필요 — goal은
 *           항상 단일 run 안에서 진행되기 때문). 2행 목표 텍스트(없으면 미표시).
 *   - stopped: "루프 정지됨" 확인(LR3-06 정지 신뢰 피드백 — 영호 육안 피드백 2026-07-03).
 *           abort의 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 정지 후 80s간
 *           옛 runId 이벤트 증가 0)이나 배너가 즉시 사라지기만 해 신뢰 불가 →
 *           "세션과 함께 정리됨"을 명시 확인. 회전 없음(진행 아님) + ✕ 닫기. 3단 위계
 *           무관(과거 사실 통지라 "지금 하는 일"이 없음) — 2행만(안내 문구).
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
import { IconClose, IconAlert } from '../common/icons'
import type { LoopStatus } from '../../lib/loopStatus'
import { CMD_CARDS } from '../../lib/cmdCards'
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
  /**
   * BL1 P03: stale(신호 없음) 배너 ✕ 수동 해제(선택). autonomyActive는 건드리지 않는다
   * (표시만 숨김 — 자동 강제 해제 금지). 미전달 시 닫기 버튼 미표시(onDismissStopped와
   * 동형의 옵셔널 계약).
   */
  onDismissStale?: () => void
  /**
   * FB2 P08: 3단 정보위계의 "현재 작업내용"(3번째 층위). 부모가 store의 thinkingText를
   * 그대로 흘려보낸다(신규 IPC/상태 0 — 이미 있는 데이터 재사용). sdk/goal 진행 중에만
   * 의미가 있어 stopped/none 변형은 이 prop을 참조하지 않는다. null/미전달 → 3행 미표시.
   */
  currentActivity?: string | null
}

export function LoopStatusBanner({
  status,
  onStopSdk,
  onDismissStopped,
  onDismissStale,
  currentActivity,
}: LoopStatusBannerProps): JSX.Element | null {
  if (status.kind === 'none') return null

  // ── stopped 변형: 정지 확인 — 회전 없음(진행이 아니라 완료된 사실의 통지).
  if (status.kind === 'stopped') {
    return (
      <div className="loop-indicator loop-stopped" role="status" aria-label="루프 정지됨">
        <div className="loop-head">
          <span className="loop-ic" aria-hidden>
            <IconClose size={14} />
          </span>
          {/* 문구 주의(영호 재검증 2026-07-03): "정리되었어요"는 금지 — 크론 *기록*은 세션
              트랜스크립트에 남아 resume 후 CronList가 목록에 보고한다(스케줄 재개는 없음,
              lr3-p06-stop-cleanup resume probe 실측: 90s 틱 0). "실행 중지"만이 정확한 사실. */}
          <span className="loop-label">루프 정지됨</span>
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
        <div className="loop-topic">반복 실행이 멈췄어요 — 더 이상 자동 호출되지 않아요</div>
      </div>
    )
  }

  // ── goal-stale 변형(BL1 P03): 마지막 활동 신호로부터 임계 시간이 지남 — ended 신호
  // 유실 폴백. 회전 없음(진행을 확신할 수 없음 — stopped와 같은 원칙). detail(작업 주제)은
  // stale 전환 직전 맥락으로 유지 표시(정보 손실 방지). autonomyActive 자체는 이 컴포넌트가
  // 되돌리지 않는다 — 닫기는 표시만 숨긴다(자동 강제 해제 금지, ADR-024 표시-only 원칙).
  if (status.kind === 'goal-stale') {
    const { detail } = status
    return (
      <div className="loop-indicator loop-goal-stale" role="status" aria-label="목표 진행 신호 없음">
        <div className="loop-head">
          <span className="loop-ic" aria-hidden>
            <IconAlert size={14} />
          </span>
          <span className="loop-label">목표 자율 반복 — 신호 없음</span>
          {onDismissStale && (
            <button
              type="button"
              className="loop-btn loop-dismiss"
              aria-label="알림 닫기"
              title="확인 배너 닫기"
              onClick={onDismissStale}
            >
              <IconClose size={13} />
            </button>
          )}
        </div>
        <div className="loop-topic">일정 시간 진행 신호가 없어요 — 백그라운드에서 계속되고 있을 수 있어요</div>
        {detail && <div className="loop-current">{detail}</div>}
      </div>
    )
  }

  // ── goal 변형: `/goal` 자기지속 반복(LR3-06, FB2 P08 3단 위계) ──────────────
  // 1행 상태 라벨은 CMD_CARDS(cmdresult 카드와 동일 소스, 단일 진실원) — 두 표시가
  // 서로 다른 문구로 어긋나지 않는다. 2행 주제는 detail(목표 텍스트) 있을 때만.
  if (status.kind === 'goal') {
    const { turns, detail } = status
    return (
      <div className="loop-indicator loop-goal" role="status" aria-label={`목표 진행중 · ${turns}턴`}>
        <div className="loop-head">
          <span className="loop-spinner" aria-hidden />
          <span className="loop-label">{CMD_CARDS.goal.running}</span>
          <span className="loop-goal-turns">{turns}턴</span>
        </div>
        {detail && <div className="loop-topic">{detail}</div>}
        {currentActivity && <div className="loop-current">{currentActivity}</div>}
      </div>
    )
  }

  // ── sdk 변형: SDK 크론 루프 (기존 LoopRunningIndicator 거동 이관, FB2 P08 3단 위계) ──
  const { loops } = status
  const first = loops[0]
  const extra = loops.length - 1
  const summaryText = extra > 0 ? `${first.summary} 외 ${extra}` : first.summary

  return (
    <div className="loop-indicator loop-sdk" role="status" aria-label={`루프 ${loops.length}개 진행중`}>
      <div className="loop-head">
        <span className="loop-spinner" aria-hidden />
        <span className="loop-label">loop 진행중</span>
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
      <div className="loop-topic" title={summaryText}>
        {summaryText}
      </div>
      {currentActivity && <div className="loop-current">{currentActivity}</div>}
    </div>
  )
}

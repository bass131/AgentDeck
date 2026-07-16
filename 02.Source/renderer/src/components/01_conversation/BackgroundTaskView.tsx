/**
 * BackgroundTaskView.tsx — 백그라운드 태스크 라이브 tail 뷰 + 정지 버튼 (GAP1 P09).
 *
 * store가 카드에 부착한 BgTaskState(reducer/tool.ts handleBgTask)만 렌더한다 —
 * tail 누적·상한(MAX_BG_TAIL_CHARS=100_000자, 앞부분 절단)은 store가 보장하고
 * 이 뷰는 단순 렌더 + 자동 하단 스크롤만 담당(장시간 로그 성능 분담).
 *
 * - tail 로그 뷰 [data-testid="bg-tail-view"]: 모노스페이스·스크롤. 상태 무관 상시
 *   렌더(종료 후에도 로그 보존 표시). 새 조각 도착 시 자동 하단 스크롤(effect —
 *   단방향 흐름: 상태 변경 → 리렌더 → effect 스크롤).
 * - 정지 버튼 [data-testid="bg-stop-btn"]: 실행 중(status가 TERMINAL 집합
 *   'completed'|'failed'|'stopped'|'killed'가 *아닐* 때)에만 렌더. 클릭 →
 *   window.api.agentTaskStop({runId, taskId}) IPC. 정지 *결과*는 응답이 아니라
 *   기존 bg_task kind='notification'(status 'stopped') 이벤트로 흘러 store가 갱신
 *   → 버튼이 자연히 사라진다(단방향 — 뷰가 상태를 직접 바꾸지 않음).
 *
 * CRITICAL: renderer untrusted — 태스크 정지는 window.api(IPC) 경유만(CORE-01).
 * 인라인 색상 0 — CSS 변수 토큰(BackgroundTaskView.css). 이모지 0.
 */
import { memo, useEffect, useRef, type JSX } from 'react'
import type { BgTaskState } from '../../store/reducer'
import './BackgroundTaskView.css'

/** 종료 상태 집합 — 정지 버튼 비표시 판정(테스트 계약 gap1-p09와 동일 표면). */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped', 'killed'])

/** status 토큰 → 표시 라벨(알 수 없는 값은 원문 그대로 — 계약이 string 개방). */
const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  running: '실행 중',
  paused: '일시정지',
  completed: '완료',
  failed: '실패',
  stopped: '정지됨',
  killed: '강제 종료',
}

export interface BackgroundTaskViewProps {
  /** store가 부착한 백그라운드 태스크 상태 (reducer BgTaskState). */
  bgTask: BgTaskState
  /** 정지 IPC(agentTaskStop) 대상 runId — 미전달 시 정지 요청은 no-op(방어). */
  runId?: string
}

function BackgroundTaskViewInner({ bgTask, runId }: BackgroundTaskViewProps): JSX.Element {
  const tailRef = useRef<HTMLPreElement>(null)
  const running = !TERMINAL_STATUSES.has(bgTask.status)

  // 새 조각 도착(tail 변경) 시 자동 하단 스크롤 — 라이브 tail을 따라간다.
  useEffect(() => {
    const el = tailRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bgTask.tail])

  const stop = (): void => {
    if (!runId) return
    // 결과는 bg_task notification 이벤트로 회수(store 경유) — 응답값 미사용.
    void window.api.agentTaskStop({ runId, taskId: bgTask.taskId }).catch(() => {})
  }

  return (
    <div className={'bgt-block' + (running ? '' : ' ended')}>
      <div className="bgt-head">
        <span className={'bgt-dot' + (running ? ' live' : '')} aria-hidden="true" />
        <span className="bgt-desc">{bgTask.description ?? '백그라운드 작업'}</span>
        <span className="bgt-status">{STATUS_LABEL[bgTask.status] ?? bgTask.status}</span>
        <span className="bgt-sp" />
        {running && (
          <button
            type="button"
            className="bgt-stop"
            data-testid="bg-stop-btn"
            onClick={stop}
            aria-label="백그라운드 작업 정지"
          >
            정지
          </button>
        )}
      </div>
      {bgTask.truncated && (
        <div className="bgt-trunc">이전 로그 일부가 잘렸습니다 (최신 로그만 유지)</div>
      )}
      <pre ref={tailRef} className="bgt-tail" data-testid="bg-tail-view">
        {bgTask.tail}
      </pre>
    </div>
  )
}

export const BackgroundTaskView = memo(BackgroundTaskViewInner)
export default BackgroundTaskView

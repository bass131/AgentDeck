/**
 * HookTimeline.tsx — 훅 생명주기 타임라인 (GAP1 P05, S-03 훅 콕핏 (a)).
 *
 * 9종 훅(SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop 등)이 언제 시작/완료/
 * 실패했는지를 접힘 요약 + 펼침 상세로 보여준다. 소스는 store.hookRuns(reducer/cockpit.ts
 * handleHookLifecycle)로 부모(Conversation.tsx·PanelView.tsx)가 셀렉터로 구독해 prop으로
 * 내려준다 — 단방향 흐름 준수(이 컴포넌트는 store를 직접 구독하지 않는다, 순수 prop 렌더).
 *
 * 소음 억제(브리프 명시): pin-injector 매 입력 발화처럼 hook_lifecycle은 세션 내내 자주
 * 발생한다 — 항상 펼쳐두면 대화 스트림보다 시끄러워진다. 그래서 기본은 접힘(요약 배지 한
 * 줄만 상시 노출) + 사용자가 명시적으로 펼쳐야 개별 훅 실행을 본다. hookRuns가 비어 있으면
 * (아직 훅 이벤트 없음) 컴포넌트 자체가 null — 배너 슬롯에 빈 껍데기를 남기지 않는다.
 *
 * 배치: LoopStatusBanner와 같은 "컴포저 위 배너 슬롯"(07_notice/) — 단일챗(Conversation.tsx)
 * ·멀티패널(PanelView.tsx) 양쪽에 동일 위치로 마운트.
 *
 * data-testid 계약(gap1-p05-hook-cockpit-render.test.tsx 고정 — 임의 변경 금지):
 *   컨테이너 'hook-timeline' · 요약(상시) 'hook-timeline-summary' · 토글 'hook-timeline-toggle'
 *   · 상세(펼침 시만) 'hook-timeline-detail'.
 *
 * CRITICAL: 표시 전용 — window.api/fs/Node 0. 이모지 0(벡터 아이콘). 인라인 색상 0(토큰만).
 */
import { useState, type JSX } from 'react'
import { IconTerminal, IconChevDown, IconAlert, IconCheck } from '../common/icons'
import './HookTimeline.css'

/** hookRuns 엔트리 — reducer/types.ts HookRun과 동형(순환 import 회피를 위해 여기서 재선언). */
export interface HookRunView {
  hookId: string
  hookName: string
  hookEvent: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  exitCode?: number
  stdout?: string
  stderr?: string
  output?: string
  time?: string
}

export interface HookTimelineProps {
  hookRuns: HookRunView[]
}

const STATUS_LABEL: Record<HookRunView['status'], string> = {
  running: '실행 중',
  success: '완료',
  error: '오류',
  cancelled: '취소',
}

export function HookTimeline({ hookRuns }: HookTimelineProps): JSX.Element | null {
  const [open, setOpen] = useState(false)

  // 소음 억제: 훅 이벤트가 아직 없으면 배너 슬롯 자체를 비움(LoopStatusBanner "none→null"
  // 패턴 준용).
  if (hookRuns.length === 0) return null

  const runningCount = hookRuns.filter((r) => r.status === 'running').length
  const errorCount = hookRuns.filter((r) => r.status === 'error').length

  return (
    <div className="hook-timeline" data-testid="hook-timeline">
      <button
        type="button"
        className="hook-timeline-summary"
        data-testid="hook-timeline-summary"
        aria-expanded={open}
        aria-label={`훅 타임라인 ${hookRuns.length}건${open ? ' 접기' : ' 펼치기'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hook-timeline-ic" aria-hidden="true">
          <IconTerminal size={13} />
        </span>
        <span className="hook-timeline-label">훅 {hookRuns.length}건</span>
        {runningCount > 0 && (
          <span className="hook-timeline-count hook-timeline-count-running">실행중 {runningCount}</span>
        )}
        {errorCount > 0 && (
          <span className="hook-timeline-count hook-timeline-count-error">오류 {errorCount}</span>
        )}
        <span
          className={`hook-timeline-toggle${open ? ' open' : ''}`}
          data-testid="hook-timeline-toggle"
          aria-hidden="true"
        >
          <IconChevDown size={12} />
        </span>
      </button>

      {open && (
        <div className="hook-timeline-detail" data-testid="hook-timeline-detail">
          {hookRuns.map((run) => (
            <div key={run.hookId} className={`hook-timeline-row hook-timeline-row-${run.status}`}>
              <span className="hook-timeline-row-ic" aria-hidden="true">
                {run.status === 'running' ? (
                  <span className="hook-timeline-spin" aria-label="실행중" />
                ) : run.status === 'error' ? (
                  <IconAlert size={12} />
                ) : (
                  <IconCheck size={12} />
                )}
              </span>
              <span className="hook-timeline-name">{run.hookName}</span>
              <span className="hook-timeline-event">{run.hookEvent}</span>
              <span className="hook-timeline-status">{STATUS_LABEL[run.status]}</span>
              {run.exitCode !== undefined && (
                <span className="hook-timeline-exit">exit {run.exitCode}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default HookTimeline

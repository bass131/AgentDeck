/**
 * reducer/lifecycle.ts — 실행 수명주기 이벤트 핸들러 (P12 분해).
 *
 * done · error · session · loops · todos. applyAgentEvent 디스패처가 호출.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0.
 */
import type { AgentEvent } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'
import { CMD_CARDS } from '../../lib/cmdCards'

type DoneEvent = Extract<AgentEvent, { type: 'done' }>
type ErrorEvent = Extract<AgentEvent, { type: 'error' }>
type SessionEvent = Extract<AgentEvent, { type: 'session' }>
type LoopsEvent = Extract<AgentEvent, { type: 'loops' }>
type TodosEvent = Extract<AgentEvent, { type: 'todos' }>
type AutonomyStatusEvent = Extract<AgentEvent, { type: 'autonomy_status' }>

/** todos 이벤트 → todos 스냅샷 덮어쓰기. */
export function handleTodos(state: AppState, event: TodosEvent): AppState {
  return {
    ...state,
    todos: event.todos,
  }
}

/**
 * session 이벤트 → 엔진 세션 ID 저장 (Phase 1 맥락 복구).
 * 다음 agentRun이 resumeSessionId로 되돌려 보냄. 단일·멀티 공통.
 */
export function handleSession(state: AppState, event: SessionEvent): AppState {
  return { ...state, sessionId: event.sessionId }
}

/**
 * loops 이벤트 → 활성 루프 전체 스냅샷(덮어쓰기) — "loop 진행중" 표시 데이터원.
 * 빈 배열=표시 제거. 단일·멀티 공통. 휘발(영속 X).
 * 비어있지 않으면 정지 확인 배너(loopsStoppedNotice)를 자동 해제 — 새 루프 시작이
 * 확인 표시를 대체한다(LR3-06 정지 신뢰 피드백).
 */
export function handleLoops(state: AppState, event: LoopsEvent): AppState {
  return {
    ...state,
    activeLoops: event.loops,
    loopsStoppedNotice: event.loops.length > 0 ? false : state.loopsStoppedNotice,
  }
}

/**
 * autonomy_status 이벤트 → 자율(cron-origin) 실상태 게이트(LR4 P05).
 *
 * status==='active' → autonomyActive:true(자율 연속 턴 확인 — 유예 중 continuation 흡수).
 * status==='ended'  → autonomyActive:false(자율반복 실제 종료 — grace-expired/cap-reached
 *   무관 무조건 false). 방어: 선행 active 없이 온 ended(plain 세션 idle-close grace-expired
 *   포함)도 무조건 false로 떨어뜨리지만, 이미 makeInitialState 기본값이 false이므로
 *   자연 no-op — 배너 게이트(resolveLoopStatus)가 autonomyActive를 요구해 부수효과 0
 *   (thread/loopsStoppedNotice/errorMessage 등 다른 필드는 건드리지 않는다).
 */
export function handleAutonomyStatus(state: AppState, event: AutonomyStatusEvent): AppState {
  const active = event.status === 'active'
  return {
    ...state,
    autonomyActive: active,
    // goal 표시 수명 일원화(BL1 후속): ended(종료 신호)만 지속 goal 컨텍스트를 소멸시킨다.
    // active는 "이미 살아있는 컨텍스트의 생존 확인"일 뿐 goalRun에 영향을 주지 않는다
    // (goalRun은 begin-command가 만든다 — 이 핸들러가 새로 만들지 않음).
    ...(active ? {} : { goalRun: null }),
  }
}

/**
 * done 이벤트 → 실행 종료 처리. orchestration 백스톱 + cron-turn origin 마킹 + pendingCommand 카드 갱신.
 *
 * F-C done 백스톱: 아직 running인 orchestration 카드를 완료 처리.
 * 정상 경로는 orchestration_progress(task_notification)가 완료시키나, 누락 시 안전망
 * (run이 끝났는데 카드가 영원히 "실행 중"으로 남지 않게).
 *
 * M6(Phase 34): done — pendingCommand 있으면 카드 in-place 갱신 (원본 L395-432 축소).
 */
export function handleDone(state: AppState, event: DoneEvent): AppState {
  const closeOrch = (items: ThreadItem[]): ThreadItem[] =>
    items.map((item) =>
      item.kind === 'orchestration' && item.running ? { ...item, running: false } : item
    )

  // 5b cron-turn 배지: done.origin='cron'이면 thread의 마지막 assistant msg에 origin:'cron' 마킹.
  // 마킹 대상: kind==='msg' && role==='assistant' 중 가장 뒤(lastIndex). 없으면 no-op.
  // 휘발 — snapshotForPersist에서 origin 필드 제외(msg kind만 영속, origin은 배지 표시용).
  const markCronOrigin = (items: ThreadItem[]): ThreadItem[] => {
    if (event.origin !== 'cron') return items
    // 마지막 assistant msg 인덱스 탐색 (역방향)
    let lastAssistantIdx = -1
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (it.kind === 'msg' && it.role === 'assistant') {
        lastAssistantIdx = i
        break
      }
    }
    if (lastAssistantIdx === -1) return items // assistant msg 없음 → no-op
    return items.map((it, idx) => {
      if (idx !== lastAssistantIdx) return it
      return { ...it, origin: 'cron' as const }
    })
  }

  const base = {
    ...state,
    isRunning: false,
    lastUsage: event.usage,
    lastContextWindow: event.contextWindow,
    thinkingText: null,
    // TG1 P02: 턴 종료(done)도 thinkingText와 동일 지점 — 사고 경과 시작점도 리셋.
    thinkingStartedAt: null,
    pendingPermission: null,
    pendingQuestion: null,
    // Phase A-2: done 시 양쪽 닫기
    openMsgId: null,
    openGroupId: null,
    pendingCommand: null,
    // GAP1 P04: 턴 종료 안전망 — status:null(compact)/다음 재시도 신호 없이 턴이 끝나도
    // 다음 턴에 "재시도/압축 중" 배너가 잘못 이어붙지 않게 한다(신호 유실 방지, apiRetry는
    // handleText에서도 clear — 여기는 텍스트 없이 done만 온 방어적 케이스까지 포함).
    apiRetry: null,
    compacting: null,
    // GAP1 P04b(reviewer 🟡③ 봉합): session_state는 턴(run) 스코프 신호 — done으로 실행이
    // 끝났는데 마지막 'running'/'requires_action' 스냅샷이 다음 턴까지 stale하게 남지
    // 않도록 apiRetry/compacting과 동일한 안전망으로 clear한다.
    sdkSessionState: null,
    // 5b: closeOrch 적용 후 cron-turn origin 마킹(순서 중요: orchestration 닫기 → origin 마킹)
    thread: markCronOrigin(closeOrch(state.thread)),
  }

  const pc = state.pendingCommand
  if (pc) {
    const cfg = CMD_CARDS[pc.name]
    if (cfg) {
      // LR2-03 goal: 완료 title에 최종 턴수 병기 + sub(목표 텍스트)는 카드 값 유지.
      const goalTurns = pc.name === 'goal' ? (pc.turns ?? 0) : 0
      const doneTitle = goalTurns > 0 ? `${cfg.title} · ${goalTurns}턴` : cfg.title
      return {
        ...base,
        thread: markCronOrigin(closeOrch(state.thread)).map((item) => {
          if (item.kind !== 'cmdresult' || item.id !== pc.cardId) return item
          // compact: beforeMsgs 기반 동적 sub. goal: begin의 목표 텍스트(item.sub) 유지.
          // 그 외: cfg.sub 그대로.
          const sub = pc.name === 'compact'
            ? (pc.beforeMsgs > 0
                ? `이전 ${pc.beforeMsgs}개 메시지를 핵심 요약으로 압축했습니다.`
                : '대화를 핵심 요약으로 압축했습니다.')
            : pc.name === 'goal'
              ? item.sub ?? null
              : cfg.sub
          return {
            ...item,
            running: false,
            title: doneTitle,
            sub,
            // time: begin time 유지 (done에서 갱신 0 — 순수성)
          }
        }),
      }
    }
  }

  return base
}

/**
 * error 이벤트 → 실행 실패 처리. orchestration 실패 백스톱 + pendingCommand 카드 failed 처리.
 *
 * F-C error 백스톱: 아직 running인 orchestration 카드를 실패로 종료
 * (run이 error로 끝났는데 카드가 영원히 "실행 중"으로 남지 않게 — done 백스톱과 대칭).
 *
 * M6(Phase 34): error — pendingCommand 있으면 카드 failed 처리 (원본 L399-408 미러).
 */
export function handleError(state: AppState, event: ErrorEvent): AppState {
  const closeOrchFailed = (items: ThreadItem[]): ThreadItem[] =>
    items.map((item) =>
      item.kind === 'orchestration' && item.running
        ? { ...item, running: false, failed: true as const }
        : item
    )

  const errBase = {
    ...state,
    isRunning: false,
    errorMessage: event.message,
    thinkingText: null,
    // TG1 P02: 턴 종료(error)도 thinkingText와 동일 지점 — 사고 경과 시작점도 리셋.
    thinkingStartedAt: null,
    pendingPermission: null,
    pendingQuestion: null,
    // Phase A-2: error 시 양쪽 닫기
    openMsgId: null,
    openGroupId: null,
    pendingCommand: null,
    // LR4 P05 터미널 리셋: run이 error로 죽으면 자율반복도 죽은 것 — 배너 off(폴백,
    // 신호 유실/타이머 없는 dead-run 봉합. handleDone은 반대로 불변 — REPL 턴 경계에서
    // autonomous 지속을 끊으면 안 되므로 done만 예외).
    autonomyActive: false,
    // goal 표시 수명 일원화(BL1 후속): error는 종료 신호 3종(ended/error/abort) 중 하나 —
    // 지속 goal 컨텍스트도 함께 소멸(handleDone과 달리 여기선 예외 없음).
    goalRun: null,
    // GAP1 P04: run이 error로 죽으면 재시도/압축 진행 표시도 함께 죽은 것 — handleDone과
    // 동일한 안전망(신호 유실 방지).
    apiRetry: null,
    compacting: null,
    // GAP1 P04b(reviewer 🟡③ 봉합): handleDone과 동일 — error로 턴이 죽으면 session_state
    // 스냅샷도 함께 죽은 것이라 clear(다음 턴에 stale 'running' 잔상 방지).
    sdkSessionState: null,
    thread: closeOrchFailed(state.thread),
  }

  const pc = state.pendingCommand
  if (pc) {
    return {
      ...errBase,
      thread: closeOrchFailed(state.thread).map((item) =>
        item.kind === 'cmdresult' && item.id === pc.cardId
          ? {
              ...item,
              running: false,
              failed: true as const,
              title: '명령을 완료하지 못했어요',
              sub: event.message || null,
            }
          : item
      ),
    }
  }

  return errBase
}

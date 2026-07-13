/**
 * reducer.ts — AgentEvent → AppState 순수 리듀서 (조립 루트, P12 분해).
 *
 * CRITICAL: window.api/Node/fs 직접 호출 없음 — 완전 순수 함수.
 * 단방향 흐름: IPC 이벤트 → applyAgentEvent → store → 컴포넌트.
 *
 * Phase A-2: thread 단일 스트림 인터리브 모델(단일 진실원).
 * AppState = thread:ThreadItem[] + openGroupId/openMsgId/seq(인터리브 포인터).
 * text→assistant msg 누적(openGroupId 닫기), tool_call→toolgroup(openMsgId 닫기),
 * tool_result→thread 내 카드 in-place. 구 streamingText/toolCards 평면 필드는 제거됨.
 *
 * P12 분해: 이벤트 그룹별 핸들러를 reducer/*.ts로 추출하고 applyAgentEvent는 얇은 디스패처로 유지.
 * 외부 import 경로(`./reducer`) 불변 — 타입·함수를 이 조립 루트에서 re-export.
 */
import type { AgentEventPayload } from '../../../shared/ipc-contract'
import type { AppState, BeginCommandAction } from './reducer/types'
import type { ThreadItem } from './threadTypes'
import { CMD_CARDS } from '../lib/cmdCards'

import { handleText, handleThinking, handleThinkingClear, handleThinkingDelta } from './reducer/text'
import { handleToolCall, handleToolResult } from './reducer/tool'
import { handleOrchestration, handleOrchestrationProgress } from './reducer/orchestration'
import { handleDone, handleError, handleSession, handleLoops, handleTodos, handleAutonomyStatus } from './reducer/lifecycle'
import { handlePermissionRequest, handleQuestionRequest } from './reducer/permission'
import { handleFileChanged, handleModelFallback, handleSubagent, handleOrchestrationDenied } from './reducer/notice'
import { handleApiRetry, handleCompact, handleSessionState } from './reducer/reliability'
import { handleHookLifecycle, handleInformational, handlePermissionDenied } from './reducer/cockpit'
import { isActivityEvent } from './staleWatchdog'

// ── re-export (import 경로 호환 — 외부는 여전히 `./reducer`에서 import) ──────────
export type { ThreadItem } from './threadTypes'
export type {
  AppState,
  FileDiffEntry,
  PendingPermission,
  PendingQuestion,
  ToolCard,
  ToolCardStatus,
  BeginCommandAction,
  HookRun,
} from './reducer/types'

// ── 초기 상태 팩토리 ───────────────────────────────────────────────────────────

export function makeInitialState(): AppState {
  return {
    currentRunId: null,
    // Phase A-2: thread 모델
    thread: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    changedFiles: new Set<string>(),
    fileDiffs: {},
    isRunning: false,
    lastUsage: undefined,
    lastContextWindow: undefined,
    sessionId: undefined,
    activeLoops: [],
    loopsStoppedNotice: false,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
    subagents: [],
    pendingPermission: null,
    pendingQuestion: null,
    // LR4 P05: 자율(cron-origin) 실상태 게이트 — 기본 off(휘발, activeLoops와 동일 관례).
    autonomyActive: false,
    // BL1 P03: stale-watchdog 필드 — 활동 신호 아직 없음(휘발, autonomyActive와 동일 관례).
    lastActivityAt: null,
    bannerStale: false,
    staleDismissed: false,
    // goal 표시 수명 일원화(BL1 후속): 지속 goal 컨텍스트 — 아직 begin 안 됨(휘발).
    goalRun: null,
    // GAP1 P04(턴 신뢰성 신호): 세 신규 필드 — 이벤트 미수신 기본값(null).
    apiRetry: null,
    compacting: null,
    sdkSessionState: null,
    // GAP1 P05(훅 콕핏): 훅 타임라인 — 이벤트 미수신 기본값(빈 배열).
    hookRuns: [],
  }
}

// ── 로컬 액션 (M6: begin-command) ─────────────────────────────────────────────

/**
 * applyBeginCommand — begin-command 로컬 액션을 AppState에 적용.
 *
 * 원본 session.ts begin 액션(cmd 분기) L162-195 축소 미러.
 * - thread에 cmdresult {running:true, title:CMD_CARDS[name].running} push.
 * - pendingCommand 기록: {name, cardId, beforeMsgs}.
 * - openMsgId=null, openGroupId=null (인터리브 포인터 정합).
 * - seq 불변 (cardId는 호출자 제공).
 *
 * CRITICAL: 순수 함수 — window.api / Node / nowTime() 직접 호출 0.
 */
export function applyBeginCommand(state: AppState, action: BeginCommandAction): AppState {
  const cfg = CMD_CARDS[action.name]
  if (!cfg) return state // 알 수 없는 커맨드 — no-op

  const cmdresultItem: Extract<ThreadItem, { kind: 'cmdresult' }> = {
    kind: 'cmdresult',
    id: action.cardId,
    name: action.name,
    title: cfg.running,
    // LR2-03: detail(커맨드 인자 — goal의 목표 텍스트) 전달 시 초기 sub로.
    // 미전달 → 기존 거동(null) 그대로.
    sub: action.detail ?? null,
    running: true,
    time: action.time,
  }

  // beforeMsgs: 현 thread의 msg kind 항목 수 (THINKING_ID 제외 불필요 — msg kind만)
  const beforeMsgs = state.thread.filter((m) => m.kind === 'msg').length

  return {
    ...state,
    thread: [...state.thread, cmdresultItem],
    // turns: goal 턴 카운트 시드(LR2-03) — text 핸들러가 새 assistant msg마다 증가.
    // detail(FB2 P08): cmdresultItem.sub와 동일한 값 — LoopStatusBanner 3단 위계의
    // "작업 주제" 소스(thread 역참조 없이 pendingCommand 하나로 바로 소비).
    pendingCommand: { name: action.name, cardId: action.cardId, beforeMsgs, turns: 0, detail: action.detail ?? null },
    // 인터리브 정합: begin이 포인터 null (다음 text 새 버블)
    openMsgId: null,
    openGroupId: null,
    // goal 표시 수명 일원화(BL1 후속): name==='goal'일 때만 지속 컨텍스트 점등(낙관적,
    // 커맨드 입력 시점). 다른 커맨드(compact 등)는 기존 goalRun을 건드리지 않는다
    // (진행 중 goal이 있는데 다른 커맨드가 훼손하면 안 됨 — 실무상 동시발생은 희귀하나
    // 방어적으로 spread만 상속).
    ...(action.name === 'goal'
      ? { goalRun: { detail: action.detail ?? null, turns: 0, startedAt: action.nowMs ?? 0 } }
      : {}),
  }
}

// ── 순수 리듀서 (얇은 디스패처) ──────────────────────────────────────────────────

/**
 * applyAgentEvent — AgentEventPayload를 받아 새로운 AppState를 반환한다.
 *
 * 원본 state를 변경하지 않는 순수 함수(Set은 복사 후 반환).
 * window.api / Node / fs 호출 없음 → Vitest node 환경에서 바로 테스트 가능.
 *
 * Phase A-2: thread 인터리브 로직.
 * - text 이벤트: messageId → thread에 assistant msg append/누적. openGroupId=null. openMsgId=id.
 * - tool_call 이벤트: thread에 toolgroup append/기존 그룹에 추가. openMsgId=null.
 * - tool_result 이벤트: thread toolgroup 내 카드 갱신. subagent 매칭은 우선 처리.
 * - done 이벤트: openMsgId=null, openGroupId=null. pendingCommand 있으면 카드 in-place 갱신.
 * - error 이벤트: pendingCommand 있으면 카드 failed 처리.
 *
 * M6(Phase 34): begin-command는 applyBeginCommand 별도 export 경유.
 * applyAgentEvent 자체에 begin-command 타입 미지원(AgentEventPayload 전용).
 * done/error 시 pendingCommand in-place 처리 추가.
 *
 * W7(Phase 36): time 인자 추가 — 구독 레이어(appStore/panelSession)가 nowTime()을 실어
 * 전달. reducer는 받은 time만 사용(직접 nowTime() 호출 0 — 순수성 유지).
 * text 이벤트 → 신규 assistant msg에 time 부여(기존 msg append 시 불변).
 * tool_call 이벤트 → 신규 toolgroup 생성 시 time 부여.
 * model-fallback 이벤트 → notice 생성 시 time 부여.
 * orchestration_denied 이벤트 → notice 생성 시 time 부여 (UC1 P10).
 *
 * P12 분해: 각 case는 reducer/*.ts의 핸들러로 위임(거동 동일). begin-command 분기는 유지.
 *
 * BL1 P03(stale-watchdog): nowMs(4번째 인자, epoch ms) — 구독 레이어가
 * Date.now()를 stamp해 넘긴다(reducer는 여전히 직접 호출 0, 순수성 유지 — W7 time 인자와
 * 동일 관례). event.type이 store/staleWatchdog.ts의 isActivityEvent 목록에 해당하면 스위치
 * 처리 결과 위에 lastActivityAt=nowMs·bannerStale=false·staleDismissed=false를 한 번 더
 * 얹는다(새 활동 신호 도착 시 자동 복귀). nowMs 미전달(구 호출부·테스트 하위호환)이면
 * 완전 no-op — 회귀 0.
 */
export function applyAgentEvent(state: AppState, payload: AgentEventPayload | BeginCommandAction, time?: string, nowMs?: number): AppState {
  // M6: begin-command 로컬 액션 분기 (테스트 헬퍼 호환)
  if ((payload as BeginCommandAction).type === 'begin-command') {
    return applyBeginCommand(state, payload as BeginCommandAction)
  }

  const agentPayload = payload as AgentEventPayload
  const { event } = agentPayload

  const next = ((): AppState => {
    switch (event.type) {
    case 'text':
      return handleText(state, event, time)
    case 'thinking':
      return handleThinking(state, event)
    case 'thinking_delta':
      return handleThinkingDelta(state, event)
    case 'thinking_clear':
      return handleThinkingClear(state)
    case 'todos':
      return handleTodos(state, event)
    case 'subagent':
      return handleSubagent(state, event)
    case 'tool_call':
      return handleToolCall(state, event, time)
    case 'orchestration':
      return handleOrchestration(state, event, time)
    case 'orchestration_progress':
      return handleOrchestrationProgress(state, event)
    case 'orchestration_denied':
      return handleOrchestrationDenied(state, event, time)
    case 'tool_result':
      return handleToolResult(state, event)
    case 'file_changed':
      return handleFileChanged(state, event)
    case 'model-fallback':
      return handleModelFallback(state, event, time)
    case 'permission_request':
      return handlePermissionRequest(state, event, agentPayload.runId)
    case 'question_request':
      return handleQuestionRequest(state, event, agentPayload.runId)
    case 'done':
      return handleDone(state, event)
    case 'error':
      return handleError(state, event)
    case 'session':
      return handleSession(state, event)
    case 'loops':
      return handleLoops(state, event)
    case 'autonomy_status':
      return handleAutonomyStatus(state, event)
    case 'api_retry':
      return handleApiRetry(state, event)
    case 'compact':
      return handleCompact(state, event, time)
    case 'session_state':
      return handleSessionState(state, event)
    case 'hook_lifecycle':
      return handleHookLifecycle(state, event, time)
    case 'informational':
      return handleInformational(state, event, time)
    case 'permission_denied':
      return handlePermissionDenied(state, event, time)
    default:
      return state
    }
  })()

  // BL1 P03: 활동 신호 스탬프 — isActivityEvent 목록에 해당 + nowMs 전달 시에만 적용
  // (nowMs 미전달=구 호출부 하위호환, no-op). 새 활동 신호가 오면 bannerStale/staleDismissed도
  // 함께 자동 해제한다(복귀) — done만 오면 autonomyActive는 handleDone이 이미 불변으로
  // 유지하므로 여기서 별도 처리 불필요.
  if (nowMs !== undefined && isActivityEvent(event.type)) {
    return { ...next, lastActivityAt: nowMs, bannerStale: false, staleDismissed: false }
  }
  return next
}

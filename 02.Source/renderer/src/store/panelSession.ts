/**
 * panelSession.ts — 패널 1개의 독립 live run을 관리하는 스토어 + React 훅.
 *
 * 목적(M4-3 23d): 멀티 워크스페이스(23e)에서 패널마다 usePanelSession()을 호출,
 * 각 패널이 자신의 runId로 필터링된 독립 대화 상태를 보유한다.
 *
 * 단방향 흐름: window.api.onAgentEvent → panelApply(자기 runId 필터) → useReducer → 컴포넌트.
 *
 * CRITICAL: window.api 호출은 훅 안에서만 — 컴포넌트는 훅 경유.
 * CRITICAL: renderer untrusted — fs/Node/require 직접 호출 0.
 * CRITICAL: 전역 appStore와 독립 — StoreState 필드 누수 0.
 */
import { useReducer, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import type {
  AgentEventPayload,
  AgentRunRequest,
  ConversationMessage,
  PanelThreadSnapshot,
  PermissionResponse,
  PersistedMsg,
} from '../../../shared/ipc-contract'
import { applyAgentEvent, applyBeginCommand, makeInitialState } from './reducer'
import type { AppState } from './reducer'
import type { ThreadItem } from './threadTypes'
import { closeAbortedCommandCard, closeAbortedOrchestrationCards } from './reducer/helpers'
import { handleError } from './reducer/lifecycle'
import { commandOf } from '../lib/cmdCards'
import type { AttachedImage } from '../store/appStore'
import { buildEnginePrompt } from '../lib/composerNotes'
import { createLoopDisplayRegistry } from './loopDisplayRegistry'

// ── 타입 ────────────────────────────────────────────────────────────────────────

/**
 * PanelSessionState — 패널 1개의 완전한 상태.
 *
 * AppState(thread/isRunning/lastUsage/lastContextWindow/errorMessage 등)를
 * 패널-로컬로 보유한다. 전역 appStore와 완전히 독립.
 * Phase A-2: 렌더·history 모두 thread(ThreadItem[]) 단일 소스 — 별도 messages 없음.
 */
export interface PanelSessionState extends AppState {
  /** 현재 실행 중인 run의 ID (null = 미실행) */
  currentRunId: string | null
}

/** send() 옵션 */
export interface SendOptions {
  /** 피커 선택값 (model/effort/mode) */
  picker?: { model: string; effort: string; mode: string }
  /** 에이전트 CWD 설정용 워크스페이스 루트 절대 경로 */
  workspaceRoot?: string
  /**
   * 패널별 커스텀 시스템 프롬프트 (Phase 30 M2).
   * 원본 AgentCodeGUI `sysPrompt` 미러 — 매 run마다 backend에 전달.
   * CRITICAL(신뢰경계): string 운반만. SDK 형상은 backend 내부에서 처리.
   */
  sysPrompt?: string
  /**
   * 오케스트레이션 모드 토글 (Phase 37 #4a).
   * 엔진중립 boolean — backend가 실제 SDK 옵션·플래그로 매핑.
   * CRITICAL(신뢰경계): renderer는 boolean 전달만. 엔진 고유 용어 미포함.
   */
  orchestration?: boolean
  /**
   * 첨부 이미지 목록 (패널 이미지 첨부).
   * AttachedImage: {path: 엔진 경로, dataUrl: 표시용}.
   * - 엔진 history 마지막 메시지: buildEnginePrompt(text, {images:paths})로 경로 임베드.
   * - 표시(user 버블): dataUrls.
   * CRITICAL: 순수 데이터 운반만. 엔진 고유 용어 0.
   */
  images?: AttachedImage[]
  /**
   * 턴 간 맥락 복구용 세션 ID (Phase 1, REPL_TRANSITION).
   * 패널이 직전 턴의 session 이벤트로 저장한 sessionId. send()가 stateRef에서 주입.
   * CRITICAL(ADR-003): 불투명 토큰만 운반 — resume 매핑은 backend 내부.
   */
  resumeSessionId?: string
  /**
   * 지속세션(REPL, ADR-024) 옵트인 — replMode ON 시 true로 전달 (Phase 5a).
   * true → backend가 held-open 세션을 유지. false/미전달 → 단발 query.
   * CRITICAL(신뢰경계): renderer untrusted boolean. main이 `=== true` 정규화.
   */
  persistent?: boolean
  /**
   * 지속세션 식별 키 — 대화 라우팅 키 (Phase 5a).
   * sessionKey = conversationId(있으면) 또는 store가 생성·보관하는 안정 키.
   * 엔진 session_id(resumeSessionId)와 구분: sessionKey는 우리 대화 식별자.
   * CRITICAL(신뢰경계): renderer untrusted string. 미전달 시 단발 degrade.
   */
  sessionKey?: string
}

// ── buildAgentRunArgs 순수 함수 ───────────────────────────────────────────────

/**
 * buildAgentRunArgs — send() 인자에서 AgentRunRequest 구성 (Phase 30 M2).
 *
 * 순수 함수 — window.api / Node / fs 호출 없음. Vitest node 환경에서 바로 테스트 가능.
 *
 * CRITICAL(ADR-003): systemPrompt는 string만 전달 — SDK 형상은 backend 내부에서 처리.
 * opts.sysPrompt → agentRun({systemPrompt: opts.sysPrompt}). 미지정이면 undefined.
 *
 * @param history 대화 히스토리 (ConversationMessage[])
 * @param opts    send() 옵션 (선택)
 * @returns       AgentRunRequest 필드 (messages 포함)
 */
export function buildAgentRunArgs(
  history: ConversationMessage[],
  opts?: SendOptions
): AgentRunRequest {
  return {
    messages: history,
    workspaceRoot: opts?.workspaceRoot,
    model: opts?.picker?.model,
    effort: opts?.picker?.effort,
    mode: opts?.picker?.mode,
    systemPrompt: opts?.sysPrompt,
    orchestration: opts?.orchestration,
    // Phase 1 맥락 복구: 패널별 저장 sessionId를 resume용으로 운반(send()가 주입).
    resumeSessionId: opts?.resumeSessionId,
    // Phase 5a 지속세션: replMode ON 시 persistent/sessionKey 포함.
    // 미전달 시 undefined → AgentRunRequest 계약상 미포함(단발 회귀 0).
    ...(opts?.persistent ? { persistent: true } : {}),
    ...(opts?.sessionKey !== undefined ? { sessionKey: opts.sessionKey } : {}),
  }
}

// ── 시간 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * nowTime — 현재 시각을 한국어 형식으로 반환.
 * 원본 session.ts L70-72 미러.
 * CRITICAL: reducer에서 직접 호출 0 — 컴포넌트/훅에서만 사용(순수성 보장).
 */
function nowTime(): string {
  return new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
}

// ── ID 카운터 ─────────────────────────────────────────────────────────────────

/**
 * 모듈 전역 단조 증가 ID 카운터.
 * 6패널 공유 — 모든 패널의 msg id가 이 카운터에서 발급된다.
 *
 * B5(id 충돌 방지·CRITICAL): 복원 시 makePanelInitialState(snapshot)이
 * 메시지 id를 이 카운터에서 재발급하고, 카운터를 snapshot.seq 이상으로 시드한다.
 * → 복원 id < 모든 미래 nextId() 발급분 불변식 보장.
 */
let _idCounter = 0

/**
 * nextId — 모듈전역 단조 증가 id 발급.
 * 반환 형식: `pmsg-{N}` (N은 1부터 단조 증가).
 */
export function nextId(): string {
  _idCounter += 1
  return `pmsg-${_idCounter}`
}

/**
 * seedCounter — _idCounter를 minValue 이상으로 올린다.
 * 복원 시 snapshot.seq 기반으로 미래 id 충돌을 차단하기 위해 호출한다.
 * B5: 복원 후 nextId() 발급분이 반드시 복원 메시지 id 번호보다 크도록 보장.
 */
function seedCounter(minValue: number): void {
  if (_idCounter < minValue) {
    _idCounter = minValue
  }
}

// ── 초기 상태 팩토리 ───────────────────────────────────────────────────────────

/**
 * makePanelInitialState — PanelSessionState 초기값 팩토리.
 *
 * @param snapshot  복원할 PanelThreadSnapshot (선택).
 *                  없으면 빈 초기상태(하위호환·회귀 0 — 기존 무인자 호출처 무영향).
 *
 * snapshot 있는 경우(복원 경로):
 *   - snapshot.messages → kind:'msg' ThreadItem[]로 재구성.
 *   - 각 메시지 id를 nextId()로 재발급(B5: 원본 id는 버려 충돌 차단).
 *   - seedCounter(snapshot.seq + messages.length)로 카운터 시드 → 복원 id < 미래 id.
 *   - currentRunId: null (휘발 필드 미복원).
 *
 * CRITICAL(교차 불변식): reducer makeInitialState/applyAgentEvent/ThreadItem/panelApply
 * 무변경 — snapshot 시드는 이 함수에서만, reducer 자체는 건드리지 않는다.
 */
export function makePanelInitialState(snapshot?: PanelThreadSnapshot): PanelSessionState {
  if (!snapshot || snapshot.messages.length === 0) {
    // 빈 초기상태 — 하위호환(기존 무인자 호출처 무영향)
    return {
      ...makeInitialState(),
      currentRunId: null,
    }
  }

  // B5: snapshot.seq로 카운터 시드 (복원 msg 재발급 전에 먼저 올려둠)
  // snapshot.seq + messages.length 이상으로 → 재발급 id들이 이 범위 안에 들어가고,
  // 이후 nextId() 발급분은 이보다 큼
  seedCounter(snapshot.seq + snapshot.messages.length)

  // B5: 각 메시지 id를 nextId()로 재발급 — 원본 snapshot id 충돌 차단
  // 복원 메시지는 완료 상태라 정확한 id 값 무의미; 미래 충돌만 차단하면 됨
  const restoredThread: ThreadItem[] = snapshot.messages.map((msg: PersistedMsg): ThreadItem => ({
    kind: 'msg',
    id: nextId(),
    role: msg.role,
    text: msg.text,
    ...(msg.error !== undefined ? { error: msg.error } : {}),
    ...(msg.images !== undefined ? { images: msg.images } : {}),
  }))

  // seq를 snapshot.seq로 시드 (reducer의 인터리브 포인터 연속성 보장)
  const base = makeInitialState()
  return {
    ...base,
    thread: restoredThread,
    seq: snapshot.seq,
    lastUsage: snapshot.lastUsage,
    lastContextWindow: snapshot.lastContextWindow,
    // Phase 1.5(멀티): 패널 세션 ID 복원 → 재시작 후에도 send가 resumeSessionId로 맥락 resume.
    sessionId: snapshot.sessionId,
    currentRunId: null,
  }
}

// ── 직렬화 헬퍼 ──────────────────────────────────────────────────────────────

/**
 * snapshotForPersist — PanelSessionState → PanelThreadSnapshot 직렬화.
 *
 * S3 규칙: msg kind만 포함(toolgroup/thinking/notice 제외).
 * 패널은 msg 버블만 렌더하므로 비-msg 항목은 영속 불필요(비대 방지).
 *
 * 휘발 필드(currentRunId/isRunning/openMsgId/openGroupId/errorMessage 등) 미포함.
 * JSON 직렬화 안전 — Set/함수/undefined 제외된 필드만.
 *
 * CRITICAL(교차 불변식): 이 함수는 state를 읽기만 함 — reducer/thread 무변경.
 */
export function snapshotForPersist(state: PanelSessionState): PanelThreadSnapshot {
  const messages: PersistedMsg[] = state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((msg): PersistedMsg => {
      const persisted: PersistedMsg = {
        id: msg.id,
        role: msg.role,
        text: msg.text,
      }
      if (msg.error !== undefined) persisted.error = msg.error
      if (msg.images !== undefined) persisted.images = msg.images
      return persisted
    })

  const snapshot: PanelThreadSnapshot = {
    messages,
    seq: state.seq,
  }
  if (state.lastUsage !== undefined) snapshot.lastUsage = state.lastUsage
  if (state.lastContextWindow !== undefined) snapshot.lastContextWindow = state.lastContextWindow
  // Phase 1.5(멀티): 세션 ID 영속 → 재시작 후 makePanelInitialState가 복원 → resume 맥락 이음.
  // 불투명 세션 토큰(시크릿 아님 — 단일챗 ConversationRecord.sessionId와 동일 정책).
  if (state.sessionId !== undefined && state.sessionId.length > 0) snapshot.sessionId = state.sessionId

  return snapshot
}

// ── 순수 리듀서 ───────────────────────────────────────────────────────────────

/**
 * panelApply — AgentEventPayload를 PanelSessionState에 적용하는 순수 리듀서.
 *
 * 핵심 불변식:
 *   - payload.runId !== state.currentRunId → 타 패널 이벤트, state 그대로 반환(동일 참조).
 *   - payload.runId === state.currentRunId → applyAgentEvent 적용.
 *
 * Phase A-2: text 이벤트가 도착 즉시 thread의 assistant msg로 들어가므로(applyAgentEvent)
 * done 시 별도 "확정 이동"이 불필요 — 구 streamingText→messages dance 제거.
 *
 * CRITICAL: window.api / Node / fs 호출 없음 — 완전 순수 함수.
 * Vitest node 환경에서 바로 테스트 가능.
 */
export function panelApply(state: PanelSessionState, payload: AgentEventPayload, time?: string): PanelSessionState {
  // runId 필터 — 자기 패널 이벤트만 처리
  if (state.currentRunId === null || payload.runId !== state.currentRunId) {
    return state // 동일 참조 반환 (타 패널 무시)
  }

  // AppState 부분 갱신 (applyAgentEvent 위임) + 패널 로컬 currentRunId 유지
  // W7: time 인자 전달 — applyAgentEvent는 받은 time만 사용(순수성 유지)
  const nextAppState = applyAgentEvent(state as AppState, payload, time)
  return {
    ...nextAppState,
    currentRunId: state.currentRunId,
  }
}

// ── 액션 타입 ─────────────────────────────────────────────────────────────────

type PanelAction =
  | { type: 'SET_RUN_ID'; runId: string }
  | {
      type: 'ADD_USER_MESSAGE'
      content: string
      /**
       * 메시지 생성 시각 (W7).
       * 구독/send 레이어에서 nowTime()으로 stamp → reducer는 받은 time만 사용(순수성).
       */
      time?: string
      /**
       * 표시용 첨부 이미지 dataUrl 목록 (패널 이미지 첨부).
       * user 버블 .msg-images 렌더에 사용. 엔진에는 경로(buildEnginePrompt)가 들어감.
       */
      images?: string[]
    }
  | { type: 'APPLY_EVENT'; payload: AgentEventPayload; time?: string }
  /**
   * RESTORE — 비동기 복원 경로: multiSessionLoad() 결과로 snapshot을 받아 상태를 완전 교체.
   *
   * CRITICAL: shared reducer.ts(applyAgentEvent/makeInitialState/ThreadItem) 무변경.
   * panelReducer는 panelSession 로컬 래퍼이므로 RESTORE 추가는 교차 불변식 위반 0.
   *
   * makePanelInitialState(snapshot) 위임:
   *   - snapshot.messages → msg ThreadItem[] 재구성 (id 재발급 B5).
   *   - seedCounter로 미래 id 충돌 차단.
   *   - currentRunId: null (휘발 필드 미복원).
   */
  | { type: 'RESTORE'; snapshot: PanelThreadSnapshot }
  /**
   * ADD_COMMAND_CARD — 멀티패널 슬래시 커맨드 begin (M6 Phase 34).
   *
   * 단일채팅(appStore)은 dispatchSend → begin-command dispatch. 멀티패널은 send()에서
   * commandOf(text) 감지 → ADD_COMMAND_CARD dispatch(B2 비대칭 방지).
   *
   * applyBeginCommand(reducer.ts) 위임: thread에 cmdresult 카드 push + pendingCommand 기록.
   * time: 호출 시점 nowTime() — 패널 send()가 전달(reducer 순수성 유지).
   */
  | { type: 'ADD_COMMAND_CARD'; name: string; cardId: string; time: string; detail?: string | null }
  /**
   * CLEAR_LOOPS — abort(세션 종료) 시 로컬 상태 정리 (LR2-03 → FB2 육안 게이트 P0 확장).
   *
   * abort=세션 종료=크론 사멸이나, main abort는 done 마킹 후 이벤트를 끊어
   * (agent-runs.ts:206-224) 'loops' 이외의 이벤트(done/error 포함)가 전부 드롭된다
   * (라이브 실측) — main 내부 상태는 정리되므로 표시만 로컬 동기화. 이름은 LR2-03
   * 시절(activeLoops만) 그대로 두되(호출부 3곳 회귀 방지), FB2 P0(영호 육안 2026-07-04
   * "loop/goal 정지 버튼 클릭 시 thinking GUI 무한 표시 + 인터럽트 버튼 무반응")에서
   * done/error가 영원히 안 오는 문제(isRunning/thinkingText/currentRunId/pendingCommand가
   * handleDone/handleError를 못 만나 고착)까지 함께 처리하도록 범위를 넓혔다 —
   * 단일채팅 abortRun(slices/runtime.ts)과 동형.
   */
  | { type: 'CLEAR_LOOPS' }
  /**
   * DISMISS_LOOPS_STOPPED — 정지 확인 배너 ✕ 닫기 (LR3-06 정지 신뢰 피드백).
   * 단일채팅 dismissLoopsStopped와 동형.
   */
  | { type: 'DISMISS_LOOPS_STOPPED' }
  /**
   * CLEAR_PENDING_PERMISSION — 권한 요청 카드(PermissionCard, BF3 Phase 06/ADR-030) 응답
   * 후 패널 로컬 슬롯 정리. CLEAR_LOOPS와 동일한 "패널 로컬 정리 액션" 패턴 준용 —
   * pendingPermission은 공유 reducer(applyAgentEvent → reducer/permission.ts)가 이벤트
   * 수신 시 이미 채워주므로(단일챗과 동일 경로), 응답 후 비우는 이 액션만 패널 로컬로
   * 추가하면 된다(단일챗 respondPermission의 set({pendingPermission:null})과 동형).
   */
  | { type: 'CLEAR_PENDING_PERMISSION' }
  /**
   * RUN_FAILED — reviewer 🟡 처방 봉합: agentRun IPC 호출 자체가 reject하면(IPC/백엔드
   * 도달 전 실패) SET_RUN_ID가 결코 발화하지 않아 currentRunId=null 고착 + ADD_USER_MESSAGE/
   * ADD_COMMAND_CARD가 낙관적으로 세운 isRunning=true가 영구 true로 남는다(WorkingIndicator
   * 무한 표시, abort의 `if (!currentRunId) return` 조기반환으로 정지도 no-op).
   * handleError(reducer/lifecycle.ts)를 그대로 재사용 — 정상 error 이벤트와 동일한 정리
   * (isRunning/thinkingText/pendingCommand 해제 + errorMessage, 진행 카드 있었으면 실패
   * 카드 처리)를 적용한다. 단일챗 sendMessage(slices/runtime.ts) catch 블록과 동형.
   */
  | { type: 'RUN_FAILED'; message: string }

// ── useReducer 리듀서 ─────────────────────────────────────────────────────────

function panelReducer(state: PanelSessionState, action: PanelAction): PanelSessionState {
  switch (action.type) {
    case 'SET_RUN_ID':
      // LR3-06: 새 run 시작이 정지 확인 배너를 자연 해제(가장 최근 사실이 우선).
      return { ...state, currentRunId: action.runId, loopsStoppedNotice: false }

    case 'ADD_USER_MESSAGE': {
      // Phase A-2: user msg를 thread에 push(단일 소스)
      // W7: action.time 있으면 msg에 부여 — panelReducer는 받은 time만 사용(nowTime() 직접 호출 0)
      // 패널 이미지 첨부: action.images(dataUrls)가 있으면 msg에 부여(표시용)
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: nextId(),
        role: 'user',
        text: action.content,
        ...(action.time !== undefined ? { time: action.time } : {}),
        ...(action.images && action.images.length > 0 ? { images: action.images } : {}),
      }
      return {
        ...state,
        thread: [...state.thread, userThreadItem],
        // FB2(영호 육안 피드백 2026-07-04 ④): 단일챗 sendMessage(slices/runtime.ts)와
        // 동형의 낙관적 isRunning — 백엔드 첫 이벤트(text/thinking/tool_call) 도착 전에도
        // 즉시 true로 만들어 PanelView의 WorkingIndicator가 "응답 대기" 구간을 놓치지 않게 한다.
        isRunning: true,
      }
    }

    case 'ADD_COMMAND_CARD': {
      // M6(Phase 34): 멀티패널 슬래시 커맨드 begin (B2 비대칭 방지)
      // applyBeginCommand(reducer.ts) 위임 — threadTypes/reduce 교차 불변식 유지.
      const nextAppState = applyBeginCommand(state as AppState, {
        type: 'begin-command',
        name: action.name,
        cardId: action.cardId,
        time: action.time,
        // LR2-03: goal 목표 텍스트 — 단일채팅(runtime.ts) 경로와 동형
        ...(action.detail ? { detail: action.detail } : {}),
      })
      return {
        ...nextAppState,
        currentRunId: state.currentRunId,
        // FB2 ④: ADD_USER_MESSAGE와 동일한 낙관적 isRunning(단일챗 runtime.ts의 begin-command
        // 호출부도 같은 set() 안에서 isRunning:true를 함께 넣는다 — 동형).
        isRunning: true,
      }
    }

    case 'CLEAR_LOOPS': {
      // LR2-03: abort 시 SDK 크론 표시 정리 — 단일채팅 abortRun(activeLoops:[])과 동형.
      // LR3-06: 루프를 끊은 abort에만 정지 확인 배너 점화(단일채팅 abortRun과 동형).
      // FB2 P0(영호 육안 2026-07-04): abort 후 main이 done/error를 영원히 보내지 않아
      // (agent-runs.ts:206-224 — 'loops' 이외 전부 드롭) handleDone/handleError를 못 만나던
      // isRunning/thinkingText/currentRunId/pendingCommand까지 함께 로컬 정리한다(단일채팅
      // abortRun과 동형 — closeAbortedCommandCard로 진행 중이던 슬래시 카드도 "중단됨" 처리).
      // reviewer 🟡 봉합: running orchestration(서브에이전트 블랙박스, Phase 37 #4b) 카드도
      // 동일 버그 클래스라 closeAbortedOrchestrationCards로 함께 닫는다(handleDone의 closeOrch
      // 동형 — 단일채팅 abortRun과 동형).
      // goal은 loop과 동형의 self-re-arm이라 정지 확인 배너 대상에도 편입.
      const goalStopping = state.pendingCommand?.name === 'goal'
      return {
        ...state,
        activeLoops: [],
        loopsStoppedNotice: (state.activeLoops.length > 0 || goalStopping) ? true : state.loopsStoppedNotice,
        isRunning: false,
        currentRunId: null,
        thinkingText: null,
        pendingPermission: null,
        pendingQuestion: null,
        openMsgId: null,
        openGroupId: null,
        pendingCommand: null,
        thread: closeAbortedOrchestrationCards(
          closeAbortedCommandCard(state.thread, state.pendingCommand?.cardId)
        ),
      }
    }

    case 'DISMISS_LOOPS_STOPPED':
      return { ...state, loopsStoppedNotice: false }

    case 'CLEAR_PENDING_PERMISSION':
      return { ...state, pendingPermission: null }

    case 'RUN_FAILED': {
      // handleError(공유 reducer/lifecycle.ts) 재사용 — panelApply와 동일한 위임 관례
      // (nextAppState 계산 후 currentRunId만 패널 로컬로 유지).
      const nextAppState = handleError(state as AppState, { type: 'error', message: action.message })
      return {
        ...nextAppState,
        currentRunId: state.currentRunId,
      }
    }

    case 'APPLY_EVENT':
      return panelApply(state, action.payload, action.time)

    case 'RESTORE':
      // 비동기 복원: 전체 상태를 snapshot 기반 초기값으로 교체.
      // makePanelInitialState(snapshot) 재사용 — 팩토리 단일 진실 소스 보존.
      return makePanelInitialState(action.snapshot)

    default:
      return state
  }
}

/**
 * panelReducerFn — 테스트용 panelReducer 공개 export.
 *
 * M6 TDD: ADD_COMMAND_CARD 액션 단위 테스트에서 panelReducer를 직접 호출하기 위해 노출.
 * 훅 외부에서 순수 함수로 검증 가능(window.api 불필요).
 *
 * CRITICAL: 운영 코드는 usePanelSession() 훅만 사용 — 이 함수는 테스트 전용.
 */
export { panelReducer as panelReducerFn }

// ── 훅 ────────────────────────────────────────────────────────────────────────

export interface PanelSessionHookResult {
  /** 현재 패널 세션 상태 */
  state: PanelSessionState
  /**
   * 메시지 전송 → user 메시지 append + agentRun IPC → 반환 runId를 currentRunId로 설정.
   * CRITICAL: window.api 경유만 — fs/Node 직접 0.
   */
  send: (text: string, opts?: SendOptions) => Promise<void>
  /**
   * 실행 중단 → currentRunId 있으면 agentAbort IPC 호출.
   * CRITICAL: window.api 경유만.
   */
  abort: () => Promise<void>
  /**
   * restore — 비동기 복원: multiSessionLoad() 결과 snapshot으로 thread를 교체.
   *
   * 사용처: MultiWorkspace mount 효과 — multiSessionLoad()가 resolve된 후
   * 각 패널 세션에 restore(panel.snapshot)을 호출한다. (B3 race gate: restoredRef 이후)
   *
   * CRITICAL: RESTORE 액션 dispatch → panelReducer case 'RESTORE' → makePanelInitialState(snapshot).
   * shared reducer.ts 건드리지 않음 — 패널 로컬 리듀서 래퍼에서만 처리.
   *
   * @param snapshot PanelThreadSnapshot — messages가 빈 배열이면 빈 thread로 리셋.
   */
  restore: (snapshot: PanelThreadSnapshot) => void
  /**
   * 정지 확인 배너(loopsStoppedNotice) ✕ 닫기 (LR3-06 정지 신뢰 피드백).
   * 단일채팅 dismissLoopsStopped와 동형.
   */
  dismissLoopsStopped: () => void
  /**
   * respondPermission — 권한 요청 카드(PermissionCard, BF3 Phase 06/ADR-030) 사용자 선택
   * → window.api.permissionRespond IPC 호출 + 패널 로컬 슬롯 정리.
   *
   * state.pendingPermission이 있으면 자기 runId/requestId와 함께 behavior 전송 —
   * 패널이 여럿 동시 대기 중이어도 각 패널은 자신의 pendingPermission만 참조하므로
   * 오배선(잘못된 패널로 응답) 여지가 없다. 단일챗 respondPermission(slices/runtime.ts)과
   * 동일 정책: 성공/실패 무관 즉시 슬롯 정리(방어적) + pendingPermission 없으면 no-op.
   * CRITICAL: window.api.permissionRespond(화이트리스트)만 호출.
   */
  respondPermission: (behavior: PermissionResponse['behavior']) => Promise<void>
}

/**
 * usePanelSession — 패널 1개의 독립 live run을 관리하는 React 훅.
 *
 * 단방향 흐름:
 *   mount → onAgentEvent 구독(1회)
 *   send() → ADD_USER_MESSAGE + agentRun IPC → SET_RUN_ID
 *   이벤트 수신 → APPLY_EVENT → panelApply (자기 runId 필터)
 *   unmount → unsubscribe
 *
 * 전역 appStore와 독립 — 이 훅의 state는 패널-로컬.
 * 컴포넌트는 이 훅만 경유하고, window.api를 직접 호출하지 않는다.
 */
export function usePanelSession(): PanelSessionHookResult {
  const [state, dispatch] = useReducer(panelReducer, undefined, makePanelInitialState)

  // currentRunId는 dispatch를 통해서만 갱신되지만, 이벤트 핸들러에서
  // 최신값 참조가 필요하므로 ref로 동기화한다.
  const stateRef = useRef(state)
  stateRef.current = state

  // mount 시 onAgentEvent 구독 → unmount 시 해제
  // W7: 이벤트 수신 시 nowTime() stamp → APPLY_EVENT.time으로 전달
  //     panelReducer/applyAgentEvent는 받은 time만 사용(순수성 유지)
  useEffect(() => {
    const unsubscribe = window.api.onAgentEvent((payload) => {
      const t = nowTime()
      dispatch({ type: 'APPLY_EVENT', payload: payload as AgentEventPayload, time: t })
    })
    return unsubscribe
  }, [])

  const send = useCallback(async (text: string, opts?: SendOptions): Promise<void> => {
    // 이미지 준비: 경로(엔진용) + dataUrls(표시용)
    const imgs = opts?.images ?? []
    const displayImages = imgs.map((i) => i.dataUrl)
    const imagePaths = imgs.map((i) => i.path)

    // M6(Phase 34): 카드 커맨드 감지 → user 버블 대신 진행카드 push (B2 비대칭 방지)
    const cmdName = commandOf(text)
    if (cmdName) {
      // cardId = "pcmd-{_idCounter+1}" 형식 (pmsg-N과 충돌 0)
      _idCounter += 1
      const cardId = `pcmd-${_idCounter}`
      // LR2-03: goal 카드는 목표 텍스트(커맨드 인자)를 sub로 — goal 한정(타 카드 회귀 0)
      const cmdDetail = cmdName === 'goal'
        ? (text.trim().replace(/^\/goal\b\s*/i, '') || null)
        : null
      dispatch({
        type: 'ADD_COMMAND_CARD',
        name: cmdName,
        cardId,
        time: nowTime(),
        ...(cmdDetail ? { detail: cmdDetail } : {}),
      })
      // 백엔드에는 슬래시 커맨드 그대로 전송(카드는 UI만)
    } else {
      // 1. 일반 메시지: user 메시지를 thread에 추가
      // W7: nowTime() stamp — 구독/send 레이어에서 부여, reducer는 받은 time만 사용
      // 패널 이미지 첨부: displayImages(dataUrls)가 있으면 user 버블에 전달
      dispatch({
        type: 'ADD_USER_MESSAGE',
        content: text,
        time: nowTime(),
        ...(displayImages.length > 0 ? { images: displayImages } : {}),
      })
    }

    // 2. history 구성 (Phase A-2: thread의 msg 항목에서 파생 + 방금 추가할 user 메시지)
    //    stateRef.current는 dispatch 직후 즉시 갱신되지 않으므로 수동으로 포함.
    //    M6: cmdresult 카드는 history에 포함 0 (msg kind만 필터).
    //    카드 커맨드: user 버블 없이 text만 엔진에 전달 (ADD_USER_MESSAGE 대신 카드 push).
    //
    //    이미지: 마지막 user 메시지 content만 buildEnginePrompt로 경로 임베드.
    //    - 커맨드(commandOf truthy)면 임베드 안 함.
    //    - 이전 메시지들은 저장 text 유지 (과거 history 변조 0).
    const isCommand = !!cmdName
    const contentForEngine =
      !isCommand && imagePaths.length > 0
        ? buildEnginePrompt(text, { mentions: [], images: imagePaths })
        : text

    const history: ConversationMessage[] = [
      ...stateRef.current.thread
        .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
        .map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: contentForEngine },
    ]

    // 3. agentRun IPC 호출 (CRITICAL: window.api 경유)
    // Phase 30 M2: buildAgentRunArgs로 인자 구성 — systemPrompt(sysPrompt) 포함.
    // images 필드는 AgentRunRequest에 없음(명시적 필드 구성 유지 — 경로는 content에 임베드됨).
    // Phase 1 맥락 복구: 패널별 저장 sessionId를 resume용으로 주입(opts에 미지정 시).
    //
    // reviewer 🟡 처방 봉합: agentRun reject 시 RUN_FAILED로 낙관적 isRunning 롤백
    // (단일챗 sendMessage catch 블록과 동형 — 새 시각 문법 0, 기존 ma-p-error 배너 재사용).
    let res: Awaited<ReturnType<typeof window.api.agentRun>>
    try {
      res = await window.api.agentRun(
        buildAgentRunArgs(history, { ...opts, resumeSessionId: opts?.resumeSessionId ?? stateRef.current.sessionId }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      dispatch({ type: 'RUN_FAILED', message })
      return
    }

    // 4. 반환 runId를 currentRunId로 설정
    dispatch({ type: 'SET_RUN_ID', runId: res.runId })
  }, [])

  const abort = useCallback(async (): Promise<void> => {
    const { currentRunId } = stateRef.current
    if (!currentRunId) return
    // LR2-03: SDK 크론 표시 로컬 정리 — loops:[] 이벤트가 abort 후 드롭되는 main 경로 보완
    dispatch({ type: 'CLEAR_LOOPS' })
    // CRITICAL: window.api 경유만
    await window.api.agentAbort({ runId: currentRunId })
  }, [])

  /**
   * restore — RESTORE 액션을 dispatch해 비동기 복원 snapshot을 적용한다.
   *
   * MultiWorkspace mount 효과에서 multiSessionLoad() resolve 후 호출:
   *   sessions[slot].restore(panel.snapshot)
   *
   * B3 race gate는 MultiWorkspace의 restoredRef에서 관리 — 이 함수는 순수 dispatch 래퍼.
   * useCallback 의존성 빈 배열: dispatch는 안정 참조 (React useReducer 보장).
   */
  const restore = useCallback((snapshot: PanelThreadSnapshot): void => {
    dispatch({ type: 'RESTORE', snapshot })
  }, [])

  // LR3-06 정지 신뢰 피드백 — stopped 확인 배너 ✕ 닫기 (usePanelSlot과 동형)
  const dismissLoopsStopped = useCallback((): void => {
    dispatch({ type: 'DISMISS_LOOPS_STOPPED' })
  }, [])

  // BF3 Phase 06(ADR-030): 권한 요청 카드 응답 — 단일챗 respondPermission(slices/runtime.ts)
  // 과 동일 정책(즉시 슬롯 정리 + IPC 성공/실패 무관 방어적 catch).
  const respondPermission = useCallback(async (behavior: PermissionResponse['behavior']): Promise<void> => {
    const { pendingPermission } = stateRef.current
    if (!pendingPermission) return // no-op: 대기 중 요청 없음

    // 카드 즉시 닫음 — IPC 성공/실패 무관(방어적 정책, 단일챗과 동일)
    dispatch({ type: 'CLEAR_PENDING_PERMISSION' })

    try {
      // CRITICAL: window.api.permissionRespond(화이트리스트)만 호출
      await window.api.permissionRespond({
        runId: pendingPermission.runId,
        requestId: pendingPermission.requestId,
        behavior,
      })
    } catch {
      // IPC 실패는 무시 — 카드는 이미 닫혔음(방어적)
    }
  }, [])

  return { state, send, abort, restore, dismissLoopsStopped, respondPermission }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 앱 수명 패널 세션 매니저 (Phase 07, LR3-multipanel-continuity) ────────────────
// ═══════════════════════════════════════════════════════════════════════════════
//
// 배경(01.Phases/switch-continuity/_diagnosis.md §멀티패널): usePanelSession()의 상태
// (useReducer)와 구독(onAgentEvent)이 컴포넌트 수명에 묶여 있어, MultiWorkspace가
// 언마운트되면(모드 전환·멀티세션 전환 — Shell.tsx key={activeMultiSessionId}) 진행 중
// run의 이벤트가 영구 증발하고(구독 해제) 아무도 안 듣는 run이 main에서 계속 돈다(고스트).
//
// 해법(단일채팅 bgRuns 패턴의 멀티판 — appStore/slices/sessions.ts 미러): 상태 소유권과
// 이벤트 구독을 컴포넌트 밖 모듈 스코프로 승격한다. (멀티세션ID, 슬롯) 키가 같으면
// 컴포넌트가 몇 번을 언마운트→재마운트해도 상태와 진행 중 이벤트 적용이 끊기지 않는다.
//
// CRITICAL(교차 불변식): key 미지정 usePanelSession()은 이 매니저를 전혀 거치지 않는다
// (위 로컬 useReducer 경로 그대로) — 기존 호출부·테스트 회귀 0 보장. 매니저는
// usePanelSlot(sessionKey, slot)을 통해서만 활성화된다(MultiWorkspace 전용, Phase 07).
//
// P3c 교훈(스냅샷만 읽기, 활성 flat 상태 공유 금지 — 교차오염 방지)은 설계상 자동으로
// 지켜진다: 매니저는 appStore를 전혀 모르고, 각 (세션,슬롯) 키는 완전히 독립된
// PanelSessionState 사본이다 — 다른 키를 읽거나 쓰는 경로가 아예 없다.

/** panelManagerStates — (세션,슬롯) 키 → 상태 진실원. key가 남아있는 한 앱 수명 내내 산다. */
const panelManagerStates = new Map<string, PanelSessionState>()
/** panelManagerListeners — useSyncExternalStore 구독자(리렌더 트리거). 화면 이탈 시 리스너만 비움(상태는 보존). */
const panelManagerListeners = new Map<string, Set<() => void>>()
/** runIdToPanelKey — 이벤트가 어느 (세션,슬롯) 소유인지 라우팅(SET_RUN_ID 시 등록). */
const runIdToPanelKey = new Map<string, string>()

/**
 * panelLoopDisplayRegistry — 패널 loops/goal 배너 표시 트리오의 앱수명 레지스트리 (BF3 P07,
 * 배너 연속성 경계 ⓑⓒ). panelManagerStates(PANEL_MANAGER_CAP=32)는 축출 가능 캐시이고,
 * PanelThreadSnapshot(디스크)은 loops를 담지 않는다(불변조건) — 그 사이에서 표시 트리오만
 * 별도 스코프에 두어 슬롯 축출·디스크 재로드(RESTORE) 양쪽에서 살아남게 한다.
 * 단일챗 sessionLoopDisplayRegistry(slices/loopDisplay.ts)와 키 스킴이 달라(패널은
 * "sessionId::slot") 독립 인스턴스로 생성 — 충돌 원천 차단.
 */
const panelLoopDisplayRegistry = createLoopDisplayRegistry()

/**
 * 앱 수명 상주 상태 누수 방어(단일챗 BG_RUNS_CAP 패턴 미러) — 방문한 (세션,슬롯) 총량 상한.
 * 실행 중(currentRunId!==null)인 슬롯은 evict 대상에서 제외한다(진행 중 run을 잃지 않음).
 */
const PANEL_MANAGER_CAP = 32

/** makePanelSlotKey — (멀티세션ID, 슬롯) → 매니저 키. MultiWorkspace/multiSession 슬라이스가 공유. */
export function makePanelSlotKey(sessionId: string, slot: number): string {
  return `${sessionId}::${slot}`
}

/** panelSlotKeyPrefix — 세션 ID의 모든 슬롯 키에 공통되는 접두사(세션 전체 폐기 시 사용). */
export function panelSlotKeyPrefix(sessionId: string): string {
  return `${sessionId}::`
}

function capPanelManagerStates(): void {
  if (panelManagerStates.size <= PANEL_MANAGER_CAP) return
  for (const [k, s] of panelManagerStates) {
    if (panelManagerStates.size <= PANEL_MANAGER_CAP) break
    // 보존 = 실행 중(isRunning) 또는 마운트 중(리스너 존재) 슬롯만 — reviewer 🟡:
    // currentRunId!==null 가드는 "완료 포함 한 번이라도 실행"을 전부 보존해 CAP이 무력했고,
    // 마운트 중 슬롯 축출은 리스너 소실로 리렌더가 끊기는 엣지가 있었다.
    // 축출된 완료 슬롯의 복귀는 디스크 복원(useMultiPersist)이 커버한다.
    if (s.isRunning || (panelManagerListeners.get(k)?.size ?? 0) > 0) continue
    panelManagerStates.delete(k)
    panelManagerListeners.delete(k)
    for (const [rid, kk] of runIdToPanelKey) {
      if (kk === k) runIdToPanelKey.delete(rid) // dangling 라우팅 일소 — 늦은 이벤트의 좀비 재생 차단
    }
  }
}

function getPanelManagerState(key: string): PanelSessionState {
  let s = panelManagerStates.get(key)
  if (!s) {
    s = makePanelInitialState()
    // BF3 P07(경계 ⓑ): key가 과거 CAP 축출로 사라졌더라도(또는 최초 마운트라도) 레지스트리에
    // 이 key 자신의 마지막 표시 트리오가 남아있으면 되살린다 — thread/currentRunId 등 나머지는
    // 여전히 빈 초기값(그 부분은 디스크 복원=RESTORE가 커버, Phase 07 범위 밖).
    const saved = panelLoopDisplayRegistry.read(key)
    if (saved) {
      s = {
        ...s,
        activeLoops: saved.activeLoops,
        loopsStoppedNotice: saved.loopsStoppedNotice,
        pendingCommand: saved.pendingCommand ?? null,
      }
    }
    panelManagerStates.set(key, s)
    capPanelManagerStates()
  }
  return s
}

function notifyPanelManagerListeners(key: string): void {
  const ls = panelManagerListeners.get(key)
  if (!ls) return
  for (const l of ls) l()
}

function dispatchToPanelManager(key: string, action: PanelAction): void {
  const cur = getPanelManagerState(key)
  let next = panelReducer(cur, action)
  // BF3 P07(경계 ⓒ): RESTORE는 makePanelInitialState(snapshot)로 상태를 통째로 교체한다 —
  // PanelThreadSnapshot(디스크)이 loops를 담지 않으므로(불변조건) next의 표시 트리오는 항상
  // 빈 값이다. cur가 방금 getPanelManagerState에서 레지스트리로 되살린 값을 갖고 있었더라도
  // RESTORE는 cur를 참고하지 않는 구조(makePanelInitialState(snapshot)가 base부터 새로 만듦)라
  // 그대로 두면 사라진다 — 레지스트리를 다시 덮어써 살린다(이 key 자신의 값만, 오염 아님).
  if (action.type === 'RESTORE') {
    const saved = panelLoopDisplayRegistry.read(key)
    if (saved) {
      next = {
        ...next,
        activeLoops: saved.activeLoops,
        loopsStoppedNotice: saved.loopsStoppedNotice,
        pendingCommand: saved.pendingCommand ?? null,
      }
    }
  }
  if (action.type === 'SET_RUN_ID') {
    // 직전 run의 라우팅을 교체-정리(reviewer 🟡: run당 엔트리가 영구 잔존하는 slow leak 차단).
    // done 시점 삭제는 persistent 세션의 후속 턴(같은 runId)을 고아로 만들 수 있어 부적합 —
    // "새 run이 슬롯을 차지하는 순간"이 안전한 정리 시점이다.
    if (cur.currentRunId && cur.currentRunId !== action.runId) {
      runIdToPanelKey.delete(cur.currentRunId)
    }
    runIdToPanelKey.set(action.runId, key)
  }
  if (next === cur) return
  panelManagerStates.set(key, next)
  // BF3 P07: 모든 디스패치 이후 표시 트리오를 레지스트리에 write-through — CAP 축출로
  // panelManagerStates 엔트리 자체가 사라져도 이 최신값은 별도 스코프라 살아남는다(빈
  // 값이면 자기 가지치기, loopDisplayRegistry.ts 참조).
  panelLoopDisplayRegistry.sync(key, {
    activeLoops: next.activeLoops,
    loopsStoppedNotice: next.loopsStoppedNotice,
    pendingCommand: next.pendingCommand,
  })
  notifyPanelManagerListeners(key)
}

let panelManagerUnsubscribe: (() => void) | null = null

/**
 * ensurePanelManagerSubscribed — 전역 onAgentEvent 구독을 앱 수명 동안 1회만 등록(지연·멱등).
 * 컴포넌트 unmount와 무관 — 한 번 등록되면 다시 해제되지 않는다(단일챗 subscribeAgentEvents가
 * 대화별로 나뉘지 않고 스토어 하나에 항상 살아있는 것과 동형).
 */
function ensurePanelManagerSubscribed(): void {
  if (panelManagerUnsubscribe) return
  panelManagerUnsubscribe = window.api.onAgentEvent((payload) => {
    const agentPayload = payload as AgentEventPayload
    const key = runIdToPanelKey.get(agentPayload.runId)
    if (!key) return // 어디에도 매칭 안 되는 run — 드롭(단일챗 subscribeAgentEvents 경로3과 동형)
    dispatchToPanelManager(key, { type: 'APPLY_EVENT', payload: agentPayload, time: nowTime() })
  })
}

/**
 * disposePanelManagerSession — 특정 key의 매니저 상태를 영구 폐기(고스트 정리).
 *
 * 진행 중이면 agentAbort 호출 후 라우팅·상태를 삭제한다. 단순 화면 이탈(unmount)에는
 * 호출하지 않는다 — 그건 "보존"이 목적(Phase 07 핵심, 위 매니저 설계 참조).
 * 호출 지점: 멀티세션 영구 삭제(slices/multiSession.ts deleteMultiSession) 등
 * "다시 돌아올 수 없는" 폐기 시점.
 */
export function disposePanelManagerSession(key: string): void {
  const s = panelManagerStates.get(key)
  if (s?.currentRunId) {
    void window.api.agentAbort({ runId: s.currentRunId }).catch(() => {})
  }
  // 이 key를 가리키는 라우팅 전부 일소(currentRunId 1건만이 아니라 — reviewer 🟡 승계)
  for (const [rid, kk] of runIdToPanelKey) {
    if (kk === key) runIdToPanelKey.delete(rid)
  }
  panelManagerStates.delete(key)
  panelManagerListeners.delete(key)
  // BF3 P07: 정리 대칭 — 영구 폐기되는 key는 표시 트리오 레지스트리도 함께 지운다(다시
  // 돌아올 수 없으므로 고아 엔트리로 남지 않게).
  panelLoopDisplayRegistry.clear(key)
}

/** disposePanelManagerSessionsByPrefix — prefix로 시작하는 모든 슬롯 키를 일괄 폐기(세션 삭제 시 6슬롯). */
export function disposePanelManagerSessionsByPrefix(prefix: string): void {
  for (const key of Array.from(panelManagerStates.keys())) {
    if (key.startsWith(prefix)) disposePanelManagerSession(key)
  }
  // BF3 P07: panelManagerStates에 이미 없는(=CAP 축출됐지만 레지스트리엔 남아있는) key도
  // prefix로 훑어 정리 — disposePanelManagerSession은 panelManagerStates 키 목록에서만
  // 순회하므로 그 목록에 없는 레지스트리 잔존 키는 여기서 별도로 훑어야 한다.
  panelLoopDisplayRegistry.clearByPrefix(prefix)
}

/**
 * __resetPanelSessionManagerForTests — 테스트 전용 리셋.
 *
 * CRITICAL: 프로덕션 코드에서 호출 금지. 한 vitest 파일 내 여러 it()가 동적 import 캐시로
 * 같은 모듈 인스턴스를 공유하므로, 이전 테스트의 매니저 상태·구독이 다음 테스트로 새는 것을
 * beforeEach에서 방지하기 위한 테스트 하네스 훅이다(파일 간에는 vitest가 모듈을 격리한다).
 */
export function __resetPanelSessionManagerForTests(): void {
  panelManagerStates.clear()
  panelManagerListeners.clear()
  runIdToPanelKey.clear()
  // BF3 P07: 레지스트리도 함께 리셋 — 안 하면 이전 테스트의 배너 표시 트리오가 다음
  // 테스트의 같은 key로 새는 교차오염(같은 모듈 인스턴스 공유, __resetPanelSessionManagerForTests
  // 기존 주석 참조).
  panelLoopDisplayRegistry.__resetForTests()
  if (panelManagerUnsubscribe) {
    panelManagerUnsubscribe()
  }
  panelManagerUnsubscribe = null
}

/**
 * __getPanelManagerSizesForTests — 테스트 전용 크기 관측(누수 회귀 가드 — reviewer 🟡).
 * loopDisplay: BF3 P07 레지스트리 크기(잔존 회귀 가드).
 * CRITICAL: 프로덕션 코드에서 호출 금지.
 */
export function __getPanelManagerSizesForTests(): { states: number; listeners: number; runIds: number; loopDisplay: number } {
  return {
    states: panelManagerStates.size,
    listeners: panelManagerListeners.size,
    runIds: runIdToPanelKey.size,
    loopDisplay: panelLoopDisplayRegistry.__sizeForTests(),
  }
}

// ── performManagedSend / performManagedAbort — usePanelSlot 전용 send/abort 본체 ──
//
// usePanelSession()의 send/abort와 동일한 비즈니스 로직이나, 대상이 컴포넌트 로컬
// useReducer(dispatch/stateRef)가 아니라 매니저(dispatchToPanelManager/getPanelManagerState)다.
// dispatch 직전에 상태를 1회만 스냅샷해 history를 구성한다 — 매니저는 동기 갱신이라, dispatch
// "이후"에 다시 읽으면 방금 추가한 user 메시지가 history에 중복 포함되는 차이가 생기기 때문
// (로컬 모드는 useReducer 비동기 배치라 dispatch 직후에도 stateRef가 아직 갱신 전이라 문제 없음).

async function performManagedSend(key: string, text: string, opts?: SendOptions): Promise<void> {
  const preDispatchState = getPanelManagerState(key)

  const imgs = opts?.images ?? []
  const displayImages = imgs.map((i) => i.dataUrl)
  const imagePaths = imgs.map((i) => i.path)

  const cmdName = commandOf(text)
  if (cmdName) {
    _idCounter += 1
    const cardId = `pcmd-${_idCounter}`
    const cmdDetail = cmdName === 'goal'
      ? (text.trim().replace(/^\/goal\b\s*/i, '') || null)
      : null
    dispatchToPanelManager(key, {
      type: 'ADD_COMMAND_CARD',
      name: cmdName,
      cardId,
      time: nowTime(),
      ...(cmdDetail ? { detail: cmdDetail } : {}),
    })
  } else {
    dispatchToPanelManager(key, {
      type: 'ADD_USER_MESSAGE',
      content: text,
      time: nowTime(),
      ...(displayImages.length > 0 ? { images: displayImages } : {}),
    })
  }

  const isCommand = !!cmdName
  const contentForEngine =
    !isCommand && imagePaths.length > 0
      ? buildEnginePrompt(text, { mentions: [], images: imagePaths })
      : text

  const history: ConversationMessage[] = [
    ...preDispatchState.thread
      .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
      .map((m) => ({ role: m.role, content: m.text })),
    { role: 'user' as const, content: contentForEngine },
  ]

  // reviewer 🟡 처방 봉합: agentRun reject 시 RUN_FAILED로 낙관적 isRunning 롤백
  // (usePanelSession send()·단일챗 sendMessage와 동형 — 새 시각 문법 0).
  let res: Awaited<ReturnType<typeof window.api.agentRun>>
  try {
    res = await window.api.agentRun(
      buildAgentRunArgs(history, { ...opts, resumeSessionId: opts?.resumeSessionId ?? preDispatchState.sessionId }),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dispatchToPanelManager(key, { type: 'RUN_FAILED', message })
    return
  }

  dispatchToPanelManager(key, { type: 'SET_RUN_ID', runId: res.runId })
}

async function performManagedAbort(key: string): Promise<void> {
  const { currentRunId } = getPanelManagerState(key)
  if (!currentRunId) return
  dispatchToPanelManager(key, { type: 'CLEAR_LOOPS' })
  await window.api.agentAbort({ runId: currentRunId })
}

/**
 * performManagedRespondPermission — usePanelSlot(매니저 승격 경로) 전용 권한 응답 본체.
 *
 * usePanelSession()의 respondPermission과 동일한 비즈니스 로직이나, 대상이 컴포넌트 로컬
 * useReducer가 아니라 매니저(dispatchToPanelManager/getPanelManagerState)다. key로 자기
 * 패널의 pendingPermission만 읽으므로(다른 슬롯 key는 별도 상태) 멀티패널 오배선 여지가
 * 구조적으로 없다 — 이 함수가 참조하는 runId/requestId는 항상 이 key(패널) 자신의 것.
 */
async function performManagedRespondPermission(key: string, behavior: PermissionResponse['behavior']): Promise<void> {
  const { pendingPermission } = getPanelManagerState(key)
  if (!pendingPermission) return // no-op: 대기 중 요청 없음

  dispatchToPanelManager(key, { type: 'CLEAR_PENDING_PERMISSION' })

  try {
    await window.api.permissionRespond({
      runId: pendingPermission.runId,
      requestId: pendingPermission.requestId,
      behavior,
    })
  } catch {
    // IPC 실패는 무시 — 카드는 이미 닫혔음(방어적, usePanelSession과 동일 정책)
  }
}

/**
 * usePanelSlot — 앱 수명 승격된 패널 세션 훅 (Phase 07, LR3-multipanel-continuity).
 *
 * usePanelSession()과 동일한 반환 형태(PanelSessionHookResult)를 제공하지만, 상태·구독
 * 소유권이 컴포넌트가 아니라 모듈 스코프 매니저에 있다 — sessionKey+slot이 같으면
 * 컴포넌트가 언마운트→재마운트돼도(모드 전환·멀티세션 재마운트) 상태와 진행 중 run
 * 이벤트 적용이 끊기지 않는다.
 *
 * MultiWorkspace 전용 — sessionKey는 activeMultiSessionId(멀티세션 ID), slot은 0~5.
 * CRITICAL: renderer untrusted — window.api 경유만.
 */
export function usePanelSlot(sessionKey: string, slot: number): PanelSessionHookResult {
  const key = makePanelSlotKey(sessionKey, slot)

  const subscribe = useCallback((onStoreChange: () => void): (() => void) => {
    ensurePanelManagerSubscribed()
    let set = panelManagerListeners.get(key)
    if (!set) {
      set = new Set()
      panelManagerListeners.set(key, set)
    }
    set.add(onStoreChange)
    return () => {
      const s = panelManagerListeners.get(key)
      if (!s) return
      s.delete(onStoreChange)
      // 리스너 Set만 정리 — panelManagerStates는 보존한다(화면 이탈=보존, Phase 07 핵심).
      if (s.size === 0) panelManagerListeners.delete(key)
    }
  }, [key])

  const getSnapshot = useCallback(() => getPanelManagerState(key), [key])

  const state = useSyncExternalStore(subscribe, getSnapshot)

  const send = useCallback(async (text: string, opts?: SendOptions): Promise<void> => {
    await performManagedSend(key, text, opts)
  }, [key])

  const abort = useCallback(async (): Promise<void> => {
    await performManagedAbort(key)
  }, [key])

  const restore = useCallback((snapshot: PanelThreadSnapshot): void => {
    dispatchToPanelManager(key, { type: 'RESTORE', snapshot })
  }, [key])

  const dismissLoopsStopped = useCallback((): void => {
    dispatchToPanelManager(key, { type: 'DISMISS_LOOPS_STOPPED' })
  }, [key])

  // BF3 Phase 06(ADR-030): 권한 요청 카드 응답 — key(자기 패널)의 pendingPermission만
  // 참조하므로 오배선(다른 패널 runId/requestId 혼입) 여지가 구조적으로 없다.
  const respondPermission = useCallback(async (behavior: PermissionResponse['behavior']): Promise<void> => {
    await performManagedRespondPermission(key, behavior)
  }, [key])

  return { state, send, abort, restore, dismissLoopsStopped, respondPermission }
}

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
import { useReducer, useEffect, useCallback, useRef } from 'react'
import type {
  AgentEventPayload,
  AgentRunRequest,
  ConversationMessage,
  PanelThreadSnapshot,
  PersistedMsg,
} from '../../../shared/ipc-contract'
import { applyAgentEvent, applyBeginCommand, makeInitialState } from './reducer'
import type { AppState } from './reducer'
import type { ThreadItem } from './threadTypes'
import { commandOf } from '../lib/cmdCards'

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
  | { type: 'ADD_COMMAND_CARD'; name: string; cardId: string; time: string }

// ── useReducer 리듀서 ─────────────────────────────────────────────────────────

function panelReducer(state: PanelSessionState, action: PanelAction): PanelSessionState {
  switch (action.type) {
    case 'SET_RUN_ID':
      return { ...state, currentRunId: action.runId }

    case 'ADD_USER_MESSAGE': {
      // Phase A-2: user msg를 thread에 push(단일 소스)
      // W7: action.time 있으면 msg에 부여 — panelReducer는 받은 time만 사용(nowTime() 직접 호출 0)
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: nextId(),
        role: 'user',
        text: action.content,
        ...(action.time !== undefined ? { time: action.time } : {}),
      }
      return {
        ...state,
        thread: [...state.thread, userThreadItem],
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
      })
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
    // M6(Phase 34): 카드 커맨드 감지 → user 버블 대신 진행카드 push (B2 비대칭 방지)
    const cmdName = commandOf(text)
    if (cmdName) {
      // cardId = "pcmd-{_idCounter+1}" 형식 (pmsg-N과 충돌 0)
      _idCounter += 1
      const cardId = `pcmd-${_idCounter}`
      dispatch({ type: 'ADD_COMMAND_CARD', name: cmdName, cardId, time: nowTime() })
      // 백엔드에는 슬래시 커맨드 그대로 전송(카드는 UI만)
    } else {
      // 1. 일반 메시지: user 메시지를 thread에 추가
      // W7: nowTime() stamp — 구독/send 레이어에서 부여, reducer는 받은 time만 사용
      dispatch({ type: 'ADD_USER_MESSAGE', content: text, time: nowTime() })
    }

    // 2. history 구성 (Phase A-2: thread의 msg 항목에서 파생 + 방금 추가할 user 메시지)
    //    stateRef.current는 dispatch 직후 즉시 갱신되지 않으므로 수동으로 포함.
    //    M6: cmdresult 카드는 history에 포함 0 (msg kind만 필터).
    //    카드 커맨드: user 버블 없이 text만 엔진에 전달 (ADD_USER_MESSAGE 대신 카드 push).
    const history: ConversationMessage[] = [
      ...stateRef.current.thread
        .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
        .map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: text },
    ]

    // 3. agentRun IPC 호출 (CRITICAL: window.api 경유)
    // Phase 30 M2: buildAgentRunArgs로 인자 구성 — systemPrompt(sysPrompt) 포함.
    const res = await window.api.agentRun(buildAgentRunArgs(history, opts))

    // 4. 반환 runId를 currentRunId로 설정
    dispatch({ type: 'SET_RUN_ID', runId: res.runId })
  }, [])

  const abort = useCallback(async (): Promise<void> => {
    const { currentRunId } = stateRef.current
    if (!currentRunId) return
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

  return { state, send, abort, restore }
}

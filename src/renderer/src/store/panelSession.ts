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
import type { AgentEventPayload, ConversationMessage } from '../../../shared/ipc-contract'
import { applyAgentEvent, makeInitialState } from './reducer'
import type { AppState } from './reducer'
import type { ThreadItem } from './threadTypes'

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
}

// ── 초기 상태 팩토리 ───────────────────────────────────────────────────────────

/**
 * makePanelInitialState — PanelSessionState 초기값 팩토리.
 *
 * AppState 초기값(makeInitialState) + 패널 로컬 추가 필드.
 */
export function makePanelInitialState(): PanelSessionState {
  return {
    ...makeInitialState(),
    currentRunId: null,
  }
}

// ── ID 카운터 ─────────────────────────────────────────────────────────────────

let _idCounter = 0
function nextId(): string {
  _idCounter += 1
  return `pmsg-${_idCounter}`
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
export function panelApply(state: PanelSessionState, payload: AgentEventPayload): PanelSessionState {
  // runId 필터 — 자기 패널 이벤트만 처리
  if (state.currentRunId === null || payload.runId !== state.currentRunId) {
    return state // 동일 참조 반환 (타 패널 무시)
  }

  // AppState 부분 갱신 (applyAgentEvent 위임) + 패널 로컬 currentRunId 유지
  const nextAppState = applyAgentEvent(state as AppState, payload)
  return {
    ...nextAppState,
    currentRunId: state.currentRunId,
  }
}

// ── 액션 타입 ─────────────────────────────────────────────────────────────────

type PanelAction =
  | { type: 'SET_RUN_ID'; runId: string }
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'APPLY_EVENT'; payload: AgentEventPayload }

// ── useReducer 리듀서 ─────────────────────────────────────────────────────────

function panelReducer(state: PanelSessionState, action: PanelAction): PanelSessionState {
  switch (action.type) {
    case 'SET_RUN_ID':
      return { ...state, currentRunId: action.runId }

    case 'ADD_USER_MESSAGE': {
      // Phase A-2: user msg를 thread에 push(단일 소스)
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: nextId(),
        role: 'user',
        text: action.content,
      }
      return {
        ...state,
        thread: [...state.thread, userThreadItem],
      }
    }

    case 'APPLY_EVENT':
      return panelApply(state, action.payload)

    default:
      return state
  }
}

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
  useEffect(() => {
    const unsubscribe = window.api.onAgentEvent((payload) => {
      dispatch({ type: 'APPLY_EVENT', payload: payload as AgentEventPayload })
    })
    return unsubscribe
  }, [])

  const send = useCallback(async (text: string, opts?: SendOptions): Promise<void> => {
    // 1. user 메시지를 thread에 추가
    dispatch({ type: 'ADD_USER_MESSAGE', content: text })

    // 2. history 구성 (Phase A-2: thread의 msg 항목에서 파생 + 방금 추가할 user 메시지)
    //    stateRef.current는 dispatch 직후 즉시 갱신되지 않으므로 수동으로 포함
    const history: ConversationMessage[] = [
      ...stateRef.current.thread
        .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
        .map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: text },
    ]

    // 3. agentRun IPC 호출 (CRITICAL: window.api 경유)
    const res = await window.api.agentRun({
      messages: history,
      workspaceRoot: opts?.workspaceRoot,
      model: opts?.picker?.model,
      effort: opts?.picker?.effort,
      mode: opts?.picker?.mode,
    })

    // 4. 반환 runId를 currentRunId로 설정
    dispatch({ type: 'SET_RUN_ID', runId: res.runId })
  }, [])

  const abort = useCallback(async (): Promise<void> => {
    const { currentRunId } = stateRef.current
    if (!currentRunId) return
    // CRITICAL: window.api 경유만
    await window.api.agentAbort({ runId: currentRunId })
  }, [])

  return { state, send, abort }
}

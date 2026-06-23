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

// ── 타입 ────────────────────────────────────────────────────────────────────────

/** 패널 내 확정 메시지 항목 */
export interface PanelMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/**
 * PanelSessionState — 패널 1개의 완전한 상태.
 *
 * AppState(streamingText/toolCards/isRunning/lastUsage/lastContextWindow/errorMessage 등)를
 * 패널-로컬로 보유한다. 전역 appStore와 완전히 독립.
 */
export interface PanelSessionState extends AppState {
  /** 확정된 대화 메시지 목록 (user + 완성된 assistant) */
  messages: PanelMessage[]
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
    messages: [],
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
 *   - done 이벤트 + streamingText > 0 → streamingText를 messages에 assistant로 확정 + 리셋.
 *
 * CRITICAL: window.api / Node / fs 호출 없음 — 완전 순수 함수.
 * Vitest node 환경에서 바로 테스트 가능.
 */
export function panelApply(state: PanelSessionState, payload: AgentEventPayload): PanelSessionState {
  // runId 필터 — 자기 패널 이벤트만 처리
  if (state.currentRunId === null || payload.runId !== state.currentRunId) {
    return state // 동일 참조 반환 (타 패널 무시)
  }

  // AppState 부분 갱신 (applyAgentEvent 위임)
  const nextAppState = applyAgentEvent(state as AppState, payload)

  // done 이벤트: 스트리밍 텍스트 확정 messages에 append + streamingText 리셋
  if (payload.event.type === 'done') {
    const textToCommit = state.streamingText
    if (textToCommit.length > 0) {
      const assistantMsg: PanelMessage = {
        id: nextId(),
        role: 'assistant',
        content: textToCommit,
      }
      return {
        ...nextAppState,
        messages: [...state.messages, assistantMsg],
        streamingText: '',
        currentRunId: state.currentRunId,
      }
    }
    // streamingText 비어 있어도 isRunning=false 등 AppState 갱신은 적용
    return {
      ...nextAppState,
      messages: state.messages,
      streamingText: '',
      currentRunId: state.currentRunId,
    }
  }

  // 나머지 이벤트: AppState 갱신 + 패널 로컬 필드 유지
  return {
    ...nextAppState,
    messages: state.messages,
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
      const userMsg: PanelMessage = {
        id: nextId(),
        role: 'user',
        content: action.content,
      }
      return { ...state, messages: [...state.messages, userMsg] }
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
    // 1. user 메시지를 로컬 messages에 추가
    dispatch({ type: 'ADD_USER_MESSAGE', content: text })

    // 2. history 구성 (현재 messages + 방금 추가할 user 메시지)
    //    stateRef.current는 dispatch 직후 즉시 갱신되지 않으므로 수동으로 포함
    const history: ConversationMessage[] = [
      ...stateRef.current.messages.map((m) => ({ role: m.role, content: m.content })),
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

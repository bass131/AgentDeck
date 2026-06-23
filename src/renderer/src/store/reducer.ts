/**
 * reducer.ts — AgentEvent → AppState 순수 리듀서.
 *
 * CRITICAL: window.api/Node/fs 직접 호출 없음 — 완전 순수 함수.
 * 단방향 흐름: IPC 이벤트 → applyAgentEvent → store → 컴포넌트.
 */
import type { AgentEventPayload } from '../../../shared/ipc-contract'
import type { TokenUsage, TodoItem } from '../../../shared/agent-events'

// ── 도구 카드 상태 ─────────────────────────────────────────────────────────────

export type ToolCardStatus = 'running' | 'done' | 'error'

export interface ToolCard {
  /** tool_call id (tool_result 매칭용) */
  id: string
  /** 도구 이름 (예: 'bash') */
  name: string
  /** 도구 입력 인자 */
  input: unknown
  /** 실행 상태 */
  status: ToolCardStatus
  /** 실행 결과 (tool_result 수신 후 채워짐) */
  result?: unknown
}

// ── AppState ───────────────────────────────────────────────────────────────────

export interface AppState {
  /** 현재 실행 중인 runId (null이면 미실행) */
  currentRunId: string | null
  /** 스트리밍 텍스트 누적 버퍼 */
  streamingText: string
  /** 도구 호출 카드 목록 (순서 유지) */
  toolCards: ToolCard[]
  /** AI가 변경한 파일 경로 set */
  changedFiles: Set<string>
  /** 에이전트 실행 중 여부 */
  isRunning: boolean
  /** 마지막 토큰 사용량 (done 이벤트 수신 시 업데이트) */
  lastUsage?: TokenUsage
  /**
   * SDK가 보고한 실 컨텍스트 윈도우 크기(토큰). Phase 21c.
   * done 이벤트의 contextWindow 필드 유래. 미전달 시 undefined.
   * 게이지 계산에서 MODEL_CONTEXT_WINDOW 룩업보다 우선 적용.
   */
  lastContextWindow?: number
  /** 에러 메시지 (error 이벤트 수신 시 설정) */
  errorMessage?: string
  /**
   * 에이전트 사고 과정(extended thinking) 텍스트 (Phase 24a).
   * thinking 이벤트로 갱신, thinking_clear·text·done·error 이벤트에서 null.
   * null이면 인디케이터 비표시.
   */
  thinkingText: string | null
  /**
   * 에이전트 작업목록(TodoWrite) 전체 스냅샷 (Phase 24a).
   * todos 이벤트로 덮어씀. done/error 후에도 보존(완료 후 목록 표시).
   * 새 대화/run 시작 시 makeInitialState()로 리셋.
   */
  todos: TodoItem[]
}

// ── 초기 상태 팩토리 ───────────────────────────────────────────────────────────

export function makeInitialState(): AppState {
  return {
    currentRunId: null,
    streamingText: '',
    toolCards: [],
    changedFiles: new Set<string>(),
    isRunning: false,
    lastUsage: undefined,
    lastContextWindow: undefined,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
  }
}

// ── 순수 리듀서 ───────────────────────────────────────────────────────────────

/**
 * applyAgentEvent — AgentEventPayload를 받아 새로운 AppState를 반환한다.
 *
 * 원본 state를 변경하지 않는 순수 함수(Set은 복사 후 반환).
 * window.api / Node / fs 호출 없음 → Vitest node 환경에서 바로 테스트 가능.
 */
export function applyAgentEvent(state: AppState, payload: AgentEventPayload): AppState {
  const { event } = payload

  switch (event.type) {
    case 'text':
      return {
        ...state,
        streamingText: state.streamingText + event.delta,
        // text 스트림 시작 시 thinking 인디케이터 정리(크로스-메시지 보강)
        thinkingText: null,
        isRunning: true,
      }

    case 'thinking':
      return {
        ...state,
        thinkingText: event.text,
        isRunning: true,
      }

    case 'thinking_clear':
      return {
        ...state,
        thinkingText: null,
      }

    case 'todos':
      return {
        ...state,
        todos: event.todos,
      }

    case 'tool_call': {
      const newCard: ToolCard = {
        id: event.id,
        name: event.name,
        input: event.input,
        status: 'running',
      }
      return {
        ...state,
        toolCards: [...state.toolCards, newCard],
        isRunning: true,
      }
    }

    case 'tool_result': {
      const updatedCards = state.toolCards.map((card) => {
        if (card.id !== event.id) return card
        return {
          ...card,
          status: (event.ok ? 'done' : 'error') as ToolCardStatus,
          result: event.output,
        }
      })
      return {
        ...state,
        toolCards: updatedCards,
      }
    }

    case 'file_changed': {
      const nextFiles = new Set(state.changedFiles)
      nextFiles.add(event.path)
      return {
        ...state,
        changedFiles: nextFiles,
      }
    }

    case 'done':
      return {
        ...state,
        isRunning: false,
        lastUsage: event.usage,
        lastContextWindow: event.contextWindow,
        // thinking 정리 — todos는 보존(완료 후에도 목록 표시)
        thinkingText: null,
      }

    case 'error':
      return {
        ...state,
        isRunning: false,
        errorMessage: event.message,
        // thinking 정리
        thinkingText: null,
      }

    default:
      // exhaustive check — event is `never` here if all cases handled
      return state
  }
}

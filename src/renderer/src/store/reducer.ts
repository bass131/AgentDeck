/**
 * reducer.ts — AgentEvent → AppState 순수 리듀서.
 *
 * CRITICAL: window.api/Node/fs 직접 호출 없음 — 완전 순수 함수.
 * 단방향 흐름: IPC 이벤트 → applyAgentEvent → store → 컴포넌트.
 */
import type { AgentEventPayload } from '../../../shared/ipc-contract'
import type { TokenUsage, TodoItem, SubAgentInfo, SubAgentTool } from '../../../shared/agent-events'

// ── 권한 요청 보류 상태 ─────────────────────────────────────────────────────────

/**
 * 사용자 응답 대기 중인 권한 요청 스냅샷.
 * AgentEventPermissionRequest 페이로드 + envelope의 runId.
 */
export interface PendingPermission {
  /** 이벤트 envelope의 runId — 응답 invoke에 사용 */
  runId: string
  /** 동일 runId 내 요청 유일 식별자 */
  requestId: string
  /** 권한 요청 대상 도구 이름 */
  toolName: string
  /** 사용자에게 보여줄 동작 요약 */
  summary: string
}

// ── 질문 요청 보류 상태 (Phase 24d) ────────────────────────────────────────────

/**
 * 사용자 응답 대기 중인 질문 요청 스냅샷.
 * AgentEventQuestionRequest 페이로드 + envelope의 runId.
 */
export interface PendingQuestion {
  /** 이벤트 envelope의 runId — 응답 invoke에 사용 */
  runId: string
  /** 동일 runId 내 요청 유일 식별자 */
  requestId: string
  /** 동시에 제시하는 질문 목록 (순서 유지) */
  questions: import('../../../shared/agent-events').AgentQuestion[]
}

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
  /**
   * 서브에이전트 목록 (Phase 24b).
   * subagent 이벤트로 id 키 upsert/병합. done/error 후에도 보존.
   * 새 대화/run 시작 시 makeInitialState()로 리셋.
   */
  subagents: SubAgentInfo[]
  /**
   * 사용자 응답 대기 중인 권한 요청 (Phase 24c).
   * permission_request 이벤트 수신 시 세팅(runId+requestId+toolName+summary).
   * done/error 이벤트 또는 respondPermission 액션 후 null로 초기화.
   * null이면 PermissionModal 미표시.
   */
  pendingPermission: PendingPermission | null
  /**
   * 사용자 응답 대기 중인 질문 요청 (Phase 24d).
   * question_request 이벤트 수신 시 세팅(runId+requestId+questions).
   * done/error 이벤트 또는 respondQuestion 액션 후 null로 초기화.
   * null이면 QuestionModal 미표시.
   */
  pendingQuestion: PendingQuestion | null
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
    subagents: [],
    pendingPermission: null,
    pendingQuestion: null,
  }
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

/**
 * tool_call input 객체에서 도구 대상을 best-effort로 1줄 추출한다.
 * file_path > path > command > pattern 순으로 확인.
 * 미발견 시 빈 문자열.
 */
function extractTarget(input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  const candidate = obj['file_path'] ?? obj['path'] ?? obj['command'] ?? obj['pattern']
  if (candidate === undefined || candidate === null) return ''
  return String(candidate)
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

    case 'subagent': {
      // id 키로 upsert/병합: 존재하면 필드 병합, 없으면 추가.
      // tools는 subagent 이벤트에서 교체하지 않음(런타임 중 tool_call로 누적한 tools 보존).
      const incoming = event.subagent
      const existing = state.subagents.find((sa) => sa.id === incoming.id)
      if (existing) {
        // 병합: tools는 기존 유지(incoming.tools는 무시), 나머지 필드 덮어씀
        const merged: SubAgentInfo = {
          ...existing,
          ...incoming,
          tools: existing.tools, // tools 보존
        }
        return {
          ...state,
          subagents: state.subagents.map((sa) => (sa.id === incoming.id ? merged : sa)),
        }
      }
      // 신규 추가
      return {
        ...state,
        subagents: [...state.subagents, incoming],
      }
    }

    case 'tool_call': {
      // parentToolId가 있으면 해당 subagent.tools에 추가(메인 toolCards 미추가).
      if (event.parentToolId) {
        const saId = event.parentToolId
        const childTool: SubAgentTool = {
          id: event.id,
          verb: event.name.toLowerCase(),
          target: extractTarget(event.input),
          status: 'running',
        }
        const updatedSubagents = state.subagents.map((sa) => {
          if (sa.id !== saId) return sa
          return { ...sa, tools: [...sa.tools, childTool] }
        })
        return {
          ...state,
          subagents: updatedSubagents,
          isRunning: true,
        }
      }
      // parentToolId 없음 → 기존 메인 toolCards 처리
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
      const resultId = event.id

      // ① subagent id 매칭: Task 완료 → subagent done + activity
      const matchedSubagent = state.subagents.find((sa) => sa.id === resultId)
      if (matchedSubagent) {
        const activity =
          typeof event.output === 'string'
            ? event.output
            : JSON.stringify(event.output)
        const updatedSubagents = state.subagents.map((sa) =>
          sa.id === resultId ? { ...sa, status: 'done' as const, activity } : sa
        )
        return {
          ...state,
          subagents: updatedSubagents,
        }
      }

      // ② 자식 tool id 매칭: 해당 subagent의 자식 tool status='done'
      let childMatched = false
      const updatedSubagentsForChild = state.subagents.map((sa) => {
        const hasChild = sa.tools.some((t) => t.id === resultId)
        if (!hasChild) return sa
        childMatched = true
        return {
          ...sa,
          tools: sa.tools.map((t) =>
            t.id === resultId ? { ...t, status: 'done' as const } : t
          ),
        }
      })
      if (childMatched) {
        return {
          ...state,
          subagents: updatedSubagentsForChild,
        }
      }

      // ③ 기존 메인 toolCards 매칭
      const updatedCards = state.toolCards.map((card) => {
        if (card.id !== resultId) return card
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

    case 'permission_request':
      // envelope의 runId를 payload.runId에서 캡처(event 내부에는 runId 없음).
      return {
        ...state,
        pendingPermission: {
          runId: payload.runId,
          requestId: event.requestId,
          toolName: event.toolName,
          summary: event.summary,
        },
      }

    case 'question_request':
      // envelope의 runId를 payload.runId에서 캡처(event 내부에는 runId 없음).
      return {
        ...state,
        pendingQuestion: {
          runId: payload.runId,
          requestId: event.requestId,
          questions: event.questions,
        },
      }

    case 'done':
      return {
        ...state,
        isRunning: false,
        lastUsage: event.usage,
        lastContextWindow: event.contextWindow,
        // thinking 정리 — todos는 보존(완료 후에도 목록 표시)
        thinkingText: null,
        // permission 정리 — run 완료 시 모달 닫음
        pendingPermission: null,
        // question 정리 — run 완료 시 모달 닫음
        pendingQuestion: null,
      }

    case 'error':
      return {
        ...state,
        isRunning: false,
        errorMessage: event.message,
        // thinking 정리
        thinkingText: null,
        // permission 정리 — 오류 시 모달 닫음
        pendingPermission: null,
        // question 정리 — 오류 시 모달 닫음
        pendingQuestion: null,
      }

    default:
      // exhaustive check — event is `never` here if all cases handled
      return state
  }
}

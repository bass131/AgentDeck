/**
 * reducer.ts — AgentEvent → AppState 순수 리듀서.
 *
 * CRITICAL: window.api/Node/fs 직접 호출 없음 — 완전 순수 함수.
 * 단방향 흐름: IPC 이벤트 → applyAgentEvent → store → 컴포넌트.
 *
 * Phase A-2: thread 단일 스트림 인터리브 모델(단일 진실원).
 * AppState = thread:ThreadItem[] + openGroupId/openMsgId/seq(인터리브 포인터).
 * text→assistant msg 누적(openGroupId 닫기), tool_call→toolgroup(openMsgId 닫기),
 * tool_result→thread 내 카드 in-place. 구 streamingText/toolCards 평면 필드는 제거됨.
 */
import type { AgentEventPayload } from '../../../shared/ipc-contract'
import type { TokenUsage, TodoItem, SubAgentInfo, SubAgentTool, DiffLine } from '../../../shared/agent-events'
import type { ThreadItem } from './threadTypes'

// re-export for import 경로 호환
export type { ThreadItem } from './threadTypes'

// ── FileDiff 엔트리 ───────────────────────────────────────────────────────────

/**
 * 파일 하나의 diff 요약 + 라인 목록.
 * file_changed 이벤트의 add/del/diff 필드에서 채워짐.
 * Phase B 단순화: 같은 path는 최신 diff로 교체(누적 아님).
 */
export interface FileDiffEntry {
  /** 추가된 라인 수 */
  add: number
  /** 삭제된 라인 수 */
  del: number
  /** 라인별 diff 목록 (DiffViewer에 전달) */
  lines: DiffLine[]
}

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

  // ── Phase A-2: thread 단일 스트림 인터리브 ──────────────────────────────────
  /**
   * 시간순 단일 스트림 thread.
   * user msg → assistant 텍스트 버블 → 도구그룹 → assistant 텍스트 버블 순 인터리브.
   * 원본 AgentCodeGUI session.ts 'messages' 역할(ThreadItem union 기반).
   */
  thread: ThreadItem[]
  /**
   * 현재 열려 있는 toolgroup id.
   * tool_call 이벤트에서 새 그룹 생성 또는 기존 그룹 append 판단에 사용.
   * text 이벤트에서 null(그룹 닫기) → 다음 tool_call이 새 그룹 시작.
   * done/error에서도 null.
   */
  openGroupId: string | null
  /**
   * 현재 열려 있는 assistant msg id.
   * text 이벤트에서 동일 id msg에 append.
   * tool_call 이벤트에서 null(텍스트 버블 닫기) → 다음 text가 새 버블 시작.
   * done/error에서도 null.
   */
  openMsgId: string | null
  /**
   * 단조 증가 시퀀스 카운터. 합성 id 생성에 사용.
   * makeInitialState: 0.
   */
  seq: number

  /** AI가 변경한 파일 경로 set */
  changedFiles: Set<string>
  /**
   * 파일별 diff 요약 + 라인 목록 (Phase B).
   * 키 = toolId(도구 tool_use id). path는 워크스페이스 상대 POSIX라
   * 절대경로 도구 입력과 키가 어긋남 → toolId로 카드별 정확 매칭.
   * toolId 없으면 path 폴백.
   */
  fileDiffs: Record<string, FileDiffEntry>
  /** 에이전트 실행 중 여부 */
  isRunning: boolean
  /** 마지막 토큰 사용량 (done 이벤트 수신 시 업데이트) */
  lastUsage?: TokenUsage
  /**
   * SDK가 보고한 실 컨텍스트 윈도우 크기(토큰). Phase 21c.
   */
  lastContextWindow?: number
  /** 에러 메시지 (error 이벤트 수신 시 설정) */
  errorMessage?: string
  /**
   * 에이전트 사고 과정(extended thinking) 텍스트 (Phase 24a).
   */
  thinkingText: string | null
  /**
   * 에이전트 작업목록(TodoWrite) 전체 스냅샷 (Phase 24a).
   */
  todos: TodoItem[]
  /**
   * 서브에이전트 목록 (Phase 24b).
   */
  subagents: SubAgentInfo[]
  /**
   * 사용자 응답 대기 중인 권한 요청 (Phase 24c).
   */
  pendingPermission: PendingPermission | null
  /**
   * 사용자 응답 대기 중인 질문 요청 (Phase 24d).
   */
  pendingQuestion: PendingQuestion | null
}

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
 *
 * Phase A-2: thread 인터리브 로직.
 * - text 이벤트: messageId → thread에 assistant msg append/누적. openGroupId=null. openMsgId=id.
 * - tool_call 이벤트: thread에 toolgroup append/기존 그룹에 추가. openMsgId=null.
 * - tool_result 이벤트: thread toolgroup 내 카드 갱신. subagent 매칭은 우선 처리.
 * - done 이벤트: openMsgId=null, openGroupId=null.
 */
export function applyAgentEvent(state: AppState, payload: AgentEventPayload): AppState {
  const { event } = payload

  switch (event.type) {
    case 'text': {
      // messageId 결정: 이벤트 messageId → openMsgId 폴백 → 합성
      const msgId: string = event.messageId ?? state.openMsgId ?? `m${state.seq + 1}`
      const isNewId = !event.messageId && !state.openMsgId

      // thread에서 id 일치 msg 찾기
      const existsInThread = state.thread.some(
        (item) => item.kind === 'msg' && item.id === msgId
      )

      let nextThread: ThreadItem[]
      let nextSeq = state.seq

      if (existsInThread) {
        // 기존 msg에 append
        nextThread = state.thread.map((item) => {
          if (item.kind === 'msg' && item.id === msgId) {
            return { ...item, text: item.text + event.delta }
          }
          return item
        })
      } else {
        // 새 msg push
        if (isNewId) nextSeq = state.seq + 1
        nextThread = [
          ...state.thread,
          {
            kind: 'msg' as const,
            role: 'assistant' as const,
            id: msgId,
            text: event.delta,
          },
        ]
      }

      return {
        ...state,
        thread: nextThread,
        seq: nextSeq,
        // openGroupId=null: 도구 그룹 닫기 → 다음 tool_call이 새 그룹 시작
        openGroupId: null,
        // openMsgId=id: 다음 text 이벤트가 이 msg에 누적
        openMsgId: msgId,
        thinkingText: null,
        isRunning: true,
      }
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
      const incoming = event.subagent
      const existing = state.subagents.find((sa) => sa.id === incoming.id)
      if (existing) {
        const merged: SubAgentInfo = {
          ...existing,
          ...incoming,
          tools: existing.tools,
        }
        return {
          ...state,
          subagents: state.subagents.map((sa) => (sa.id === incoming.id ? merged : sa)),
        }
      }
      return {
        ...state,
        subagents: [...state.subagents, incoming],
      }
    }

    case 'tool_call': {
      // parentToolId가 있으면 해당 subagent.tools에 추가(thread 미관여).
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

      // parentToolId 없음 → thread에 toolgroup 처리
      const newCard: ToolCard = {
        id: event.id,
        name: event.name,
        input: event.input,
        status: 'running',
      }

      // openGroupId가 있고 thread에 해당 toolgroup이 존재하면 tools에 append
      const hasOpen = state.openGroupId !== null &&
        state.thread.some((item) => item.kind === 'toolgroup' && item.id === state.openGroupId)

      let nextThread: ThreadItem[]
      let nextOpenGroupId: string | null
      let nextSeq = state.seq

      if (hasOpen) {
        // 기존 toolgroup에 append
        nextOpenGroupId = state.openGroupId
        nextThread = state.thread.map((item) => {
          if (item.kind === 'toolgroup' && item.id === state.openGroupId) {
            return { ...item, tools: [...item.tools, newCard] }
          }
          return item
        })
      } else {
        // 새 toolgroup 생성
        nextSeq = state.seq + 1
        nextOpenGroupId = `tg${nextSeq}`
        nextThread = [
          ...state.thread,
          {
            kind: 'toolgroup' as const,
            id: nextOpenGroupId,
            tools: [newCard],
          },
        ]
      }

      return {
        ...state,
        thread: nextThread,
        seq: nextSeq,
        openGroupId: nextOpenGroupId,
        // openMsgId=null: 텍스트 버블 닫기 → 다음 text가 새 버블 시작
        openMsgId: null,
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

      // ③ thread toolgroup에서 id 매칭 → in-place 갱신
      const nextThread = state.thread.map((item) => {
        if (item.kind !== 'toolgroup') return item
        const hasCard = item.tools.some((t) => t.id === resultId)
        if (!hasCard) return item
        return {
          ...item,
          tools: item.tools.map((card) => {
            if (card.id !== resultId) return card
            return {
              ...card,
              status: (event.ok ? 'done' : 'error') as ToolCardStatus,
              result: event.output,
            }
          }),
        }
      })

      return {
        ...state,
        thread: nextThread,
      }
    }

    case 'file_changed': {
      const nextFiles = new Set(state.changedFiles)
      nextFiles.add(event.path)

      const diffKey = event.toolId ?? event.path
      if (event.diff && event.diff.length > 0) {
        const nextDiffs: Record<string, FileDiffEntry> = {
          ...state.fileDiffs,
          [diffKey]: {
            add: event.add ?? 0,
            del: event.del ?? 0,
            lines: event.diff,
          },
        }
        return {
          ...state,
          changedFiles: nextFiles,
          fileDiffs: nextDiffs,
        }
      }

      return {
        ...state,
        changedFiles: nextFiles,
      }
    }

    case 'model-fallback': {
      // Phase 32: 폴백 경고 배너 처리 (원본 session.ts L340-351 미러).
      //
      // retract: retractMessageId 있으면(null/undefined 아닌 non-empty string) thread에서
      //   kind==='msg' && id===retractMessageId인 항목 제거.
      //   거부된 부분 버블을 지워 재시도 답변이 새 버블로 시작되도록.
      //   openMsgId===retractMessageId면 openMsgId=null(열린 버블 닫기).
      //   kind!='msg'인 항목(toolgroup 등)은 retract 대상 아님(정확 매칭 필수).
      //
      // notice push: {kind:'notice', id:'fb'+(seq+1), text:event.text} append.
      //   seq++. id 접두사 'fb'로 msg('m')/toolgroup('tg')와 충돌 0.
      //
      // CRITICAL(순수함수): window.api/Node/fs 호출 없음.
      const retractId = event.retractMessageId
      const shouldRetract = typeof retractId === 'string' && retractId.length > 0

      const withoutRetracted: typeof state.thread = shouldRetract
        ? state.thread.filter(
            (item) => !(item.kind === 'msg' && item.id === retractId)
          )
        : state.thread

      const nextSeq = state.seq + 1
      const noticeId = `fb${nextSeq}`
      const nextThread: typeof state.thread = [
        ...withoutRetracted,
        { kind: 'notice', id: noticeId, text: event.text },
      ]

      // openMsgId 정리: retract 대상이 열린 버블이면 닫는다.
      const nextOpenMsgId =
        shouldRetract && state.openMsgId === retractId ? null : state.openMsgId

      return {
        ...state,
        thread: nextThread,
        seq: nextSeq,
        openMsgId: nextOpenMsgId,
      }
    }

    case 'permission_request':
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
        thinkingText: null,
        pendingPermission: null,
        pendingQuestion: null,
        // Phase A-2: done 시 양쪽 닫기
        openMsgId: null,
        openGroupId: null,
      }

    case 'error':
      return {
        ...state,
        isRunning: false,
        errorMessage: event.message,
        thinkingText: null,
        pendingPermission: null,
        pendingQuestion: null,
        // Phase A-2: error 시 양쪽 닫기
        openMsgId: null,
        openGroupId: null,
      }

    default:
      return state
  }
}

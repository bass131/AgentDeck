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
import { CMD_CARDS } from '../lib/cmdCards'

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
  /**
   * 엔진 세션 ID — 턴 간 맥락 복구용 (Phase 1, REPL_TRANSITION).
   * session 이벤트(system/init의 session_id)에서 설정. 다음 agentRun에 resumeSessionId로 전달.
   * 휘발(영속 X — snapshotForPersist 미포함). clearConversation/makeInitialState에서 리셋.
   */
  sessionId?: string
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

  /**
   * 진행 중인 슬래시 커맨드 카드 추적 (M6 Phase 34).
   * begin-command 시 설정, done/error 시 클리어.
   * CRITICAL: makeInitialState에 미포함(undefined) — 영속/복원 제외.
   * beforeMsgs: begin 시점의 msg kind 항목 수(compact sub 동적 생성용).
   */
  pendingCommand?: { name: string; cardId: string; beforeMsgs: number } | null
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
    sessionId: undefined,
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

/**
 * 서브에이전트 tool_result content → 정제 텍스트 (F-E).
 *
 * Task 서브에이전트 최종 결과는 `[{type:'text',text:'…'}, {type:'text',text:'agentId:… <usage>…'}]`
 * 형태로 온다(라이브 프로브 확인). text 블록만 추출·join하고 agentId/usage 메타 블록은 제거해
 * 상세/카드에 raw JSON이 덤프되지 않게 한다. 추출 불가(객체 등)면 JSON.stringify 폴백(truthy 보존).
 *
 * CRITICAL(신뢰경계): 모델 출력 텍스트만 — 별도 fs/네트워크 접근 0.
 */
function isMetaBlockText(t: string): boolean {
  const s = t.trim()
  return s.startsWith('agentId:') || s.includes('<usage>') || s.includes('use SendMessage with to:')
}
function extractSubagentText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const texts = output
      .map((b) =>
        b !== null && typeof b === 'object' &&
        (b as Record<string, unknown>)['type'] === 'text' &&
        typeof (b as Record<string, unknown>)['text'] === 'string'
          ? ((b as Record<string, unknown>)['text'] as string)
          : ''
      )
      .filter((t) => t.length > 0 && !isMetaBlockText(t))
    if (texts.length > 0) return texts.join('\n\n')
    return JSON.stringify(output) // text 블록 없음 → 폴백
  }
  if (output !== null && typeof output === 'object') {
    const t = (output as Record<string, unknown>)['text']
    if (typeof t === 'string' && t.length > 0) return t
  }
  return JSON.stringify(output) // 객체/기타 → 폴백(truthy 보존)
}

// ── 로컬 액션 (M6: begin-command) ─────────────────────────────────────────────

/**
 * BeginCommandAction — 슬래시 커맨드 begin 로컬 액션 타입 (M6).
 *
 * time은 액션 생성 시점에 주입(nowTime() 호출은 컴포넌트/훅에서) — reducer 순수성 유지.
 * begin-command → thread에 cmdresult running 카드 push + pendingCommand 기록.
 *
 * CRITICAL:
 *   - nowTime() 직접 호출 0 (time은 액션 경유).
 *   - openMsgId=null, openGroupId=null (인터리브 포인터 정합).
 *   - seq 불변 (합성 id 카운터 불변 — cardId는 호출자가 제공).
 */
export interface BeginCommandAction {
  type: 'begin-command'
  name: string
  cardId: string
  time: string
}

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
    sub: null,
    running: true,
    time: action.time,
  }

  // beforeMsgs: 현 thread의 msg kind 항목 수 (THINKING_ID 제외 불필요 — msg kind만)
  const beforeMsgs = state.thread.filter((m) => m.kind === 'msg').length

  return {
    ...state,
    thread: [...state.thread, cmdresultItem],
    pendingCommand: { name: action.name, cardId: action.cardId, beforeMsgs },
    // 인터리브 정합: begin이 포인터 null (다음 text 새 버블)
    openMsgId: null,
    openGroupId: null,
  }
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
 */
export function applyAgentEvent(state: AppState, payload: AgentEventPayload | BeginCommandAction, time?: string): AppState {
  // M6: begin-command 로컬 액션 분기 (테스트 헬퍼 호환)
  if ((payload as BeginCommandAction).type === 'begin-command') {
    return applyBeginCommand(state, payload as BeginCommandAction)
  }

  const { event } = payload as AgentEventPayload

  switch (event.type) {
    case 'text': {
      // B2(§9-R): parentToolId 있으면 서브에이전트 transcript로 라우팅 — 메인 thread 미관여(버그수정 핵심).
      // thread/openMsgId/openGroupId/seq/펌프카운터 불변.
      if (event.parentToolId) {
        const saId = event.parentToolId
        const transcriptItem: import('../../../shared/agent-events').SubAgentTranscriptItem = {
          kind: 'text',
          text: event.delta,
        }
        const updatedSubagents = state.subagents.map((sa) => {
          if (sa.id !== saId) return sa
          const prev = sa.transcript ?? []
          return { ...sa, transcript: [...prev, transcriptItem] }
        })
        return {
          ...state,
          subagents: updatedSubagents,
          isRunning: true,
        }
      }

      // parentToolId 없음 → 기존 동작: 메인 thread assistant msg 누적
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
        // 기존 msg에 append — time은 최초 생성 시만 부여(append 시 불변)
        nextThread = state.thread.map((item) => {
          if (item.kind === 'msg' && item.id === msgId) {
            return { ...item, text: item.text + event.delta }
          }
          return item
        })
      } else {
        // 새 msg push — W7: time 인자 있으면 msg에 부여
        if (isNewId) nextSeq = state.seq + 1
        nextThread = [
          ...state.thread,
          {
            kind: 'msg' as const,
            role: 'assistant' as const,
            id: msgId,
            text: event.delta,
            ...(time !== undefined ? { time } : {}),
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

    case 'thinking': {
      // B2(§9-R): parentToolId 있으면 서브에이전트 transcript로 라우팅 — 메인 thinkingText 미관여.
      // thread/openMsgId/openGroupId/seq/펌프카운터 불변.
      if (event.parentToolId) {
        const saId = event.parentToolId
        const transcriptItem: import('../../../shared/agent-events').SubAgentTranscriptItem = {
          kind: 'thinking',
          text: event.text,
        }
        const updatedSubagents = state.subagents.map((sa) => {
          if (sa.id !== saId) return sa
          const prev = sa.transcript ?? []
          return { ...sa, transcript: [...prev, transcriptItem] }
        })
        return {
          ...state,
          subagents: updatedSubagents,
          isRunning: true,
        }
      }

      // parentToolId 없음 → 기존 동작: 메인 thinkingText 갱신
      return {
        ...state,
        thinkingText: event.text,
        isRunning: true,
      }
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
      // F-G: 신규 서브에이전트 → state.subagents 추가 + thread에 인라인 위치 마커 push.
      // 마커는 위치(id)만 — 데이터는 state.subagents 단일출처(렌더가 id로 조회). 단일·멀티 공통.
      // cmdresult/orchestration begin 미러: 인터리브 포인터 닫기(다음 text는 새 버블).
      const saMarker: ThreadItem = { kind: 'subagent', id: incoming.id }
      return {
        ...state,
        subagents: [...state.subagents, incoming],
        thread: [...state.thread, saMarker],
        openMsgId: null,
        openGroupId: null,
      }
    }

    case 'tool_call': {
      // parentToolId가 있으면 해당 subagent.tools에 추가(thread 미관여) + transcript에 도구항목 append(통합 타임라인).
      if (event.parentToolId) {
        const saId = event.parentToolId
        const verb = event.name.toLowerCase()
        const target = extractTarget(event.input)
        const childTool: SubAgentTool = {
          id: event.id,
          verb,
          target,
          status: 'running',
        }
        const transcriptItem: import('../../../shared/agent-events').SubAgentTranscriptItem = {
          kind: 'tool',
          verb,
          target,
          status: 'running',
          id: event.id,
        }
        const updatedSubagents = state.subagents.map((sa) => {
          if (sa.id !== saId) return sa
          const prev = sa.transcript ?? []
          return { ...sa, tools: [...sa.tools, childTool], transcript: [...prev, transcriptItem] }
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
        // 새 toolgroup 생성 — W7: time 인자 있으면 toolgroup에 부여
        nextSeq = state.seq + 1
        nextOpenGroupId = `tg${nextSeq}`
        nextThread = [
          ...state.thread,
          {
            kind: 'toolgroup' as const,
            id: nextOpenGroupId,
            tools: [newCard],
            ...(time !== undefined ? { time } : {}),
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

    case 'orchestration': {
      // Phase 37 #4b: 오케스트레이션 카드 push (cmdresult begin 미러).
      // B-1: push 시 openMsgId=null, openGroupId=null (인터리브 포인터 정합).
      // CRITICAL(ADR-003): 엔진중립 — 'Workflow' 리터럴 0.
      const orchItem: Extract<ThreadItem, { kind: 'orchestration' }> = {
        kind: 'orchestration',
        id: event.id,
        name: event.name,
        running: true,
        ...(event.description !== undefined ? { description: event.description } : {}),
        ...(event.phases !== undefined ? { phases: event.phases } : {}),
        ...(event.script !== undefined ? { script: event.script } : {}),
        ...(time !== undefined ? { time } : {}),
      }
      return {
        ...state,
        thread: [...state.thread, orchItem],
        // B-1: 인터리브 포인터 닫기 (cmdresult begin reducer.ts:259-261 미러)
        openMsgId: null,
        openGroupId: null,
        isRunning: true,
      }
    }

    case 'orchestration_progress': {
      // F-C: orchestration 카드 라이브 갱신 (id 매칭, in-place). 포인터 불변.
      // 제공된 필드만 병합 — phases/agents가 없는 후속 progress는 이전 값 유지(task_progress가
      // 단계는 첫 메시지에만, 완료(notification)는 진행배열 없이 옴 → 누적 유지가 옳다).
      // status: running→진행, completed→완료, failed→실패. 카드 없으면 무시(graceful).
      const pid = event.id
      const hasCard = state.thread.some((item) => item.kind === 'orchestration' && item.id === pid)
      if (!hasCard) return state
      const done = event.status === 'completed'
      const failed = event.status === 'failed'
      const nextThread = state.thread.map((item) => {
        if (item.kind === 'orchestration' && item.id === pid) {
          return {
            ...item,
            running: !(done || failed),
            ...(failed ? { failed: true } : {}),
            liveStatus: event.status,
            ...(event.summary !== undefined ? { liveSummary: event.summary } : {}),
            ...(event.phases !== undefined ? { livePhases: event.phases } : {}),
            ...(event.agents !== undefined ? { agents: event.agents } : {}),
          }
        }
        return item
      })
      return { ...state, thread: nextThread }
    }

    case 'tool_result': {
      const resultId = event.id

      // ① orchestration id 매칭 (P-2: toolgroup 분기 앞, subagent 앞에 배치).
      // thread에서 kind:'orchestration' && id 일치 카드 찾으면 in-place 갱신 후 즉시 return.
      // 포인터(openMsgId/openGroupId) 불변 — thread in-place map만.
      const hasOrch = state.thread.some((item) => item.kind === 'orchestration' && item.id === resultId)
      if (hasOrch) {
        // output 문자열화: string이면 그대로, 객체면 text 필드 추출 또는 JSON.stringify (길이 cap 4096)
        const rawOutput = event.output
        let resultStr: string
        if (typeof rawOutput === 'string') {
          resultStr = rawOutput
        } else if (rawOutput !== null && typeof rawOutput === 'object' && 'text' in (rawOutput as object)) {
          resultStr = String((rawOutput as { text: unknown }).text)
        } else {
          resultStr = JSON.stringify(rawOutput)
        }
        if (resultStr.length > 4096) resultStr = resultStr.slice(0, 4096)

        const nextThread = state.thread.map((item) => {
          if (item.kind === 'orchestration' && item.id === resultId) {
            return {
              ...item,
              running: false,
              failed: !event.ok,
              result: resultStr,
            }
          }
          return item
        })
        return {
          ...state,
          thread: nextThread,
          // 포인터 불변 (toolgroup in-place 갱신과 동형)
        }
      }

      // ② subagent id 매칭: Task 완료 → subagent done + activity(정제)
      const matchedSubagent = state.subagents.find((sa) => sa.id === resultId)
      if (matchedSubagent) {
        // F-E: tool_result content를 정제(text 추출·메타 제거) — raw JSON 덤프 방지.
        const activity = extractSubagentText(event.output)
        const updatedSubagents = state.subagents.map((sa) =>
          sa.id === resultId ? { ...sa, status: 'done' as const, activity } : sa
        )
        return {
          ...state,
          subagents: updatedSubagents,
        }
      }

      // ② 자식 tool id 매칭: 해당 subagent의 자식 tool status='done' + transcript 동반 갱신
      // reviewer 권고1: transcript의 kind==='tool' && id===resultId 항목도 status='done'으로
      // (tools[]와 동일 정책 — ok 무관 done, immutable 갱신, thread/seq 불변)
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
          ...(sa.transcript ? {
            transcript: sa.transcript.map((it) =>
              it.kind === 'tool' && it.id === resultId ? { ...it, status: 'done' as const } : it
            ),
          } : {}),
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
      // W7: time 인자 있으면 notice에 부여
      const nextThread: typeof state.thread = [
        ...withoutRetracted,
        {
          kind: 'notice',
          id: noticeId,
          text: event.text,
          ...(time !== undefined ? { time } : {}),
        },
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

    case 'permission_request': {
      const agentPayload = payload as AgentEventPayload
      return {
        ...state,
        pendingPermission: {
          runId: agentPayload.runId,
          requestId: event.requestId,
          toolName: event.toolName,
          summary: event.summary,
        },
      }
    }

    case 'question_request': {
      const agentPayload = payload as AgentEventPayload
      return {
        ...state,
        pendingQuestion: {
          runId: agentPayload.runId,
          requestId: event.requestId,
          questions: event.questions,
        },
      }
    }

    case 'done': {
      // F-C done 백스톱: 아직 running인 orchestration 카드를 완료 처리.
      // 정상 경로는 orchestration_progress(task_notification)가 완료시키나, 누락 시 안전망
      // (run이 끝났는데 카드가 영원히 "실행 중"으로 남지 않게).
      const closeOrch = (items: ThreadItem[]): ThreadItem[] =>
        items.map((item) =>
          item.kind === 'orchestration' && item.running ? { ...item, running: false } : item
        )

      // M6(Phase 34): done — pendingCommand 있으면 카드 in-place 갱신 (원본 L395-432 축소)
      const base = {
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
        pendingCommand: null,
        thread: closeOrch(state.thread),
      }

      const pc = state.pendingCommand
      if (pc) {
        const cfg = CMD_CARDS[pc.name]
        if (cfg) {
          // compact: beforeMsgs 기반 동적 sub. 그 외: cfg.sub 그대로.
          const sub = pc.name === 'compact'
            ? (pc.beforeMsgs > 0
                ? `이전 ${pc.beforeMsgs}개 메시지를 핵심 요약으로 압축했습니다.`
                : '대화를 핵심 요약으로 압축했습니다.')
            : cfg.sub
          return {
            ...base,
            thread: closeOrch(state.thread).map((item) =>
              item.kind === 'cmdresult' && item.id === pc.cardId
                ? {
                    ...item,
                    running: false,
                    title: cfg.title,
                    sub,
                    // time: begin time 유지 (done에서 갱신 0 — 순수성)
                  }
                : item
            ),
          }
        }
      }

      return base
    }

    case 'error': {
      // F-C error 백스톱: 아직 running인 orchestration 카드를 실패로 종료
      // (run이 error로 끝났는데 카드가 영원히 "실행 중"으로 남지 않게 — done 백스톱과 대칭).
      const closeOrchFailed = (items: ThreadItem[]): ThreadItem[] =>
        items.map((item) =>
          item.kind === 'orchestration' && item.running
            ? { ...item, running: false, failed: true as const }
            : item
        )

      // M6(Phase 34): error — pendingCommand 있으면 카드 failed 처리 (원본 L399-408 미러)
      const errBase = {
        ...state,
        isRunning: false,
        errorMessage: event.message,
        thinkingText: null,
        pendingPermission: null,
        pendingQuestion: null,
        // Phase A-2: error 시 양쪽 닫기
        openMsgId: null,
        openGroupId: null,
        pendingCommand: null,
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

    case 'session': {
      // Phase 1 맥락 복구: 엔진 세션 ID 저장 → 다음 agentRun이 resumeSessionId로 되돌려 보냄.
      // 단일(appStore)·멀티(panelSession 모두 applyAgentEvent 경유) 공통 처리.
      return { ...state, sessionId: event.sessionId }
    }

    default:
      return state
  }
}

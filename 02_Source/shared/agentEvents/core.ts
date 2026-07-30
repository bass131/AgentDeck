/**
 * agentEvents/core.ts — 코어 스트리밍 이벤트
 *
 * 이 파일은 **에이전트 1턴의 기본 흐름**(텍스트·도구·파일변경·사고·완료·오류)을 소유한다.
 * 소비처의 import 경로는 배럴 `02_Source/shared/agentEvents.ts`가 보존한다.
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

import type { DiffLine } from '../diffTypes'
// DiffLine 소비처(renderer 등)가 agentEvents에서 직접 import할 수 있도록 re-export.
export type { DiffLine }

// ── 토큰 사용량 ──────────────────────────────────────────────────────────────

/** 엔진이 보고하는 토큰 소비 정보 (done 이벤트에 포함, optional). */
export interface TokenUsage {
  /** 입력(프롬프트) 토큰 수 */
  inputTokens: number
  /** 출력(생성) 토큰 수 */
  outputTokens: number
  /** 캐시 생성 토큰(지원 엔진만, optional) */
  cacheCreationTokens?: number
  /** 캐시 읽기 토큰(지원 엔진만, optional) */
  cacheReadTokens?: number
}

// ── 스트리밍 본문 ────────────────────────────────────────────────────────────

/** 에이전트가 텍스트 조각을 스트리밍 출력 */
export interface AgentEventText {
  type: 'text'
  /** 스트리밍 텍스트 증분 */
  delta: string
  /**
   * 텍스트 블록 경계 식별자 (Phase A — 턴별 인터리브).
   *
   * 같은 messageId의 연속 text는 한 assistant 메시지 버블로 누적,
   * 다른 messageId(또는 사이에 tool_call 발생 → 새 블록)는 새 버블로 분리된다.
   * 이게 text→toolgroup→text 시간순 인터리브의 분리 키.
   *
   * 부여 주체: backend 펌프(ClaudeAgentRun) — `mapClaudeStreamLine`은 순수 유지하고
   * 펌프가 후처리로 채운다.
   * optional인 이유: 펌프가 항상 채우지만, 미부여 시 renderer가 단일 버블로 degrade
   * (회귀 아님). EchoBackend 등 단순 백엔드는 생략 가능.
   *
   * 우리는 includePartialMessages=false라 delta는 토큰 증분이 아니라 완전 블록 →
   * messageId는 "누적 키"보다 "블록 경계 분리 키" 역할이 핵심.
   */
  messageId?: string
  /**
   * 서브에이전트 소속 text면 부모 도구 id. reducer가 transcript로 라우팅.
   * tool_call의 parentToolId 미러.
   *
   * 미지정이면 최상위(오케스트레이터) 메시지로 취급.
   */
  parentToolId?: string
}

/** 에이전트가 도구(tool)를 호출 */
export interface AgentEventToolCall {
  type: 'tool_call'
  /** 도구 호출 고유 ID (tool_result와 매칭) */
  id: string
  /** 도구 이름 (예: 'bash', 'read_file') */
  name: string
  /**
   * 도구 입력 인자.
   * 엔진마다 스키마가 다르므로 unknown — 소비자는 name으로 narrowing.
   */
  input: unknown
  /**
   * 부모 도구 ID (서브에이전트 카드 귀속용).
   * 지정 시 해당 SubAgentInfo 카드 아래에 표시.
   * 미지정이면 최상위 도구 목록에 배치.
   */
  parentToolId?: string
  /**
   * 백그라운드 실행 도구 호출 여부 (P09 additive).
   *
   * 어댑터가 도구 입력의 백그라운드 플래그를 읽어 세팅한다 — 엔진 고유 필드명
   * (예: Claude Bash 도구의 run_in_background)은 어댑터 내부에만 격리(ADR-003),
   * 이 계약은 엔진 중립 boolean만 운반한다. renderer 배경 셸 배지의 신뢰 원천:
   * 소비자는 input(unknown)을 직접 파싱하지 말고 이 필드만 본다.
   * 미지정 = 포그라운드(기존 동작, 회귀 0).
   */
  background?: boolean
}

/** 도구 실행 결과 */
export interface AgentEventToolResult {
  type: 'tool_result'
  /** 대응하는 tool_call id */
  id: string
  /** 성공 여부 */
  ok: boolean
  /**
   * 도구 실행 결과.
   * 도구별 형태가 다르므로 unknown — 소비자는 ok + id로 narrowing.
   */
  output: unknown
}

/** 에이전트가 파일을 변경 (파일 watch와 교차 검증용) */
export interface AgentEventFileChanged {
  type: 'file_changed'
  /** 변경된 파일의 워크스페이스 상대 경로 (또는 절대 경로) */
  path: string
  /** 변경 종류 */
  change: 'add' | 'modify' | 'delete'
  /**
   * 이 변경을 일으킨 도구의 tool_use id (= renderer ToolCard id).
   * 카드별 diff 연결용 — path는 정규화돼 도구 입력 경로와 키가 어긋날 수 있어 toolId로 매칭.
   * backend가 도구 변경에서 emit한 경우 포함.
   */
  toolId?: string
  /**
   * 변경 라인 수 요약 (표시용 "+add −del").
   * backend가 계산한 경우에만 포함 — 미계산 시 생략.
   */
  add?: number
  /**
   * 삭제 라인 수 요약.
   * backend가 계산한 경우에만 포함 — 미계산 시 생략.
   */
  del?: number
  /**
   * edit/write 전후 whole-file diff 라인 (뷰어 마킹용).
   * backend가 계산한 경우에만 포함.
   * 미계산·바이너리·대형 파일(backend 가드)인 경우 생략.
   */
  diff?: DiffLine[]
}

/** 에이전트 사고 과정(extended thinking) 1줄 요약 — 단방향(에이전트→UI). */
export interface AgentEventThinking {
  type: 'thinking'
  /** 사고 과정 1줄 요약 텍스트 */
  text: string
  /**
   * 서브에이전트 소속 thinking이면 부모 도구 id. reducer가 transcript로 라우팅.
   * tool_call의 parentToolId 미러.
   *
   * 미지정이면 최상위(오케스트레이터) 사고로 취급.
   */
  parentToolId?: string
}

/** thinking 표시 종료 — 에이전트가 본문 텍스트 출력을 시작할 때. */
export interface AgentEventThinkingClear {
  type: 'thinking_clear'
}

// ── 턴 종료 ──────────────────────────────────────────────────────────────────

/** 에이전트 실행 완료 (지속세션에서는 **turn 경계** — 세션은 살아있을 수 있음) */
export interface AgentEventDone {
  type: 'done'
  /** 토큰 사용량 (지원 엔진만 포함) */
  usage?: TokenUsage
  /**
   * 실 컨텍스트 창 크기(토큰). Agent SDK result의 modelUsage.contextWindow 유래.
   * 미전달 시 소비자는 MODEL_CONTEXT_WINDOW 상수로 fallback (하위호환).
   * SDK 전환(ADR-016, Phase 21)에서 추가 — backend-contract 깃발.
   */
  contextWindow?: number
  /**
   * turn 발원 — 'user'(사용자 입력으로 시작된 턴) · 'cron'(지속세션에서 입력 없이
   * 자율 발동된 cron-turn). 지속세션(REPL, ADR-024) 옵트인에서만 부여된다.
   *
   * 단발/비-persistent 경로는 미부여(undefined) → 기존 done과 하위호환(회귀 0).
   * 부여 주체: 백엔드 펌프(어댑터 내부, 호스트측 직렬화 큐 + pending-send 카운터로 판정 —
   *   origin-probe 실측: SDK는 origin 신호 미제공, 턴은 직렬). renderer는 cron-turn을
   *   새 assistant 턴으로 렌더하되 currentRunId 필터에 버려지지 않게 (5)에서 라우팅.
   * ADR-003: 'cron'은 우리 앱 개념(엔진 리터럴 아님) — 중립.
   */
  origin?: 'user' | 'cron'
}

/** 에이전트 실행 중 오류 */
export interface AgentEventError {
  type: 'error'
  /** 사람이 읽을 수 있는 오류 메시지 */
  message: string
}

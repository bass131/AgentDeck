/**
 * eventNormalizer.ts — 상태 기반 이벤트 정규화 레이어 (Phase 11 책임 분리)
 *
 * ClaudeCodeBackend.ts에서 분리된 런-레벨 상태 기반 이벤트 처리 클래스.
 * claude-stream.ts(mapClaudeStreamLine, 무상태·순수)가 생성한 AgentEvent에
 * run-level 상태를 반영해 최종 AgentEvent를 생성한다.
 *
 * 이 레이어가 관리하는 상태:
 *  - Task* 누적 (TaskCreate/TaskUpdate/TaskList → todos push)
 *  - File change pending-map (Write/Edit/MultiEdit/NotebookEdit → file_changed)
 *  - Orchestration id 집합 (Workflow tool_result suppress)
 *  - Cron 루프 추적 (CronCreate/CronDelete → loops push)
 *  - messageId 블록 경계 (_launchTag, _blockSeq, _curTextId)
 *  - 스트리밍/full 텍스트 dedup (_streamedThisMsg)
 *  - model-fallback dedup (_pendingFallbackNotices)
 *
 * 격리 원칙(ADR-003):
 *  - 엔진 고유 도구명(Task계열/Cron계열/파일변경 도구)은 이 파일 내부에만.
 *  - emit 이벤트는 공통 AgentEvent — 엔진 누수 0.
 *  - fs 읽기(readFileSync/existsSync)는 main 프로세스(이 파일)에서만 — 신뢰경계.
 *
 * 순수성 보존:
 *  - mapClaudeStreamLine은 무상태 유지 — 이 레이어만 상태를 가진다.
 *  - process()는 side-effect 없이 이벤트 배열을 반환한다
 *    (push는 호출자가 담당 — 테스트·목-주입 용이).
 *
 * 교육 메모(SRP):
 *  - claude-stream.ts: 무상태 매핑(엔진 스키마 → AgentEvent 1:1 변환)
 *  - eventNormalizer.ts: 상태 기반 보강(추적·suppress·messageId)
 *  - ClaudeCodeBackend.ts: 생명주기 오케스트레이터(펌프·abort·push-queue·SDK 옵션)
 *  세 가지 변하는 이유가 다르므로 세 파일로 분리한다.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, isAbsolute, relative, sep } from 'node:path'
import { mapClaudeStreamLine } from './claude-stream'
import { sanitizeDescription } from './descriptionUtils'
import { computeDiff } from '../02_fs/diff'
import type { AgentEvent, AgentEventDone, LoopInfo } from '../../shared/agent-events'
import type { DiffLine } from '../../shared/diff-types'

// ── diff 크기 가드 ──────────────────────────────────────────────────────────────

/**
 * diff 계산 대상 파일 최대 크기 (바이트).
 * 이 크기를 초과하면 diff 생략(path/change만 emit) — LCS 성능 보호.
 * 512KB = 524288 바이트.
 */
const MAX_DIFF_BYTES = 524288

// ── 모듈레벨 런 태그 시퀀스 ─────────────────────────────────────────────────────
//
// ClaudeCodeBackend.ts에서 이전. 런 간 messageId 충돌 방지.
// 런마다 1씩 증가 → per-run 고유 태그(r1, r2, …).

let _runTagSeq = 0

/**
 * 다음 런 태그 문자열을 생성한다.
 * ClaudeCodeBackend.ts에서 ClaudeAgentRun 생성 시 호출.
 * 형식: 'r' + 단조 증가 정수 (예: 'r1', 'r2', …).
 */
export function nextRunTag(): string {
  return 'r' + (++_runTagSeq)
}

// ── 반환 타입 ──────────────────────────────────────────────────────────────────

/**
 * process() 반환값.
 *
 * events: 펌프가 push-queue에 적재해야 할 이벤트 목록(순서 보장).
 *   done 이외 모든 이벤트(text, tool_call, session, todos, loops, file_changed 등).
 * done: result 이벤트에서 파생된 done 이벤트. 호출자(펌프)의 보류/즉시push 정책에 따라 처리.
 *   null이면 이 메시지에서 done 없음.
 */
export interface NormResult {
  events: AgentEvent[]
  done: AgentEventDone | null
}

// ── model-fallback 헬퍼 (ClaudeCodeBackend.ts에서 이전, onUserDialog에서도 사용) ────

/**
 * 모델 ID → 표시 이름 변환.
 * 'claude-fable-5' → 'Fable 5', 'claude-opus-4-8' → 'Opus 4.8'.
 * 빈 문자열 또는 패턴 불일치 시 '다른 모델' 폴백.
 * (원본 engine.ts L807-812 미러)
 */
export function modelDisplay(id: unknown): string {
  const s = typeof id === 'string' ? id : ''
  const m = /claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?\b/i.exec(s)
  if (!m) return s || '다른 모델'
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

/**
 * stop_details.category 코드 → 한국어 라벨.
 * 모르는 값은 코드 그대로(open string).
 * (원본 engine.ts L814-816 미러)
 */
export const REFUSAL_CATEGORY_LABEL: Record<string, string> = {
  cyber: '사이버 보안',
  bio: '생물학',
}

/**
 * 폴백 경고 배너 텍스트 생성.
 * from/to/category → 한국어 문구.
 * (원본 engine.ts L818-823 미러)
 */
export function fallbackNotice(from: unknown, to: unknown, category: unknown): string {
  const f = modelDisplay(from)
  const t = modelDisplay(to)
  const c = typeof category === 'string' && category
    ? ` (감지 분류: ${REFUSAL_CATEGORY_LABEL[category] ?? category})`
    : ''
  return `${f}의 안전 정책이 이 요청에 대한 응답을 거부해 ${t} 모델로 자동 전환했어요${c}. 이후 대화도 ${t} 모델로 진행됩니다.`
}

// ── RunEventNormalizer ─────────────────────────────────────────────────────────

/**
 * 런당 상태 기반 이벤트 정규화 클래스.
 *
 * SDK 원시 메시지 1개를 받아 push-queue에 적재할 AgentEvent 배열과
 * 보류(F-B)할 done 이벤트를 반환한다.
 *
 * 이 클래스는 ClaudeAgentRun 인스턴스당 1개 생성된다.
 * 단발(_runPump)·지속세션(_runPersistentPump) 양쪽 펌프가 공용 사용한다.
 */
export class RunEventNormalizer {

  // ── Task* stateful 누적 (F1 fix, 원본 engine.ts L176-180, L603-628 미러) ─────
  private _taskMap = new Map<string, { id: string; label: string; status: 'planned' | 'running' | 'done' }>()
  private _taskSeq = 0
  /**
   * Task* tool_use id 집합.
   * 해당 id의 tool_result를 suppress(고아 결과 방지).
   */
  private _taskToolIds = new Set<string>()

  // ── Orchestration(Workflow) id 집합 (F-C) ────────────────────────────────────
  /**
   * Workflow tool_use id 집합.
   * "launched in background" tool_result를 suppress(카드 오완료 방지).
   */
  private _orchestrationToolIds = new Set<string>()

  // ── File change pending-map (F2 fix, 원본 engine.ts L643-711 미러) ────────────
  private _pendingFileChanges = new Map<string, {
    path: string; change: 'add' | 'modify'; baseline: string; absPath: string
  }>()

  // ── Cron 루프 추적 (5c — REPL 지속세션 loops 이벤트) ──────────────────────────
  private _activeLoops = new Map<string, LoopInfo>()
  private _cronPending = new Map<string, { summary: string; cron: string }>()

  // ── messageId 블록 경계 (Phase A-1, 원본 engine.ts nextBlockId 미러) ─────────
  private readonly _launchTag: string
  private _blockSeq = 0
  /**
   * 현재 열린 텍스트 블록 id.
   * null이면 다음 text 이벤트에서 _nextBlockId()로 새 id 발급.
   * 리셋 조건: 실 tool_call(Task* 제외), SDK assistant 메시지 경계, content_block_start.
   */
  private _curTextId: string | null = null

  // ── 스트리밍 dedup (Phase 33 M5, 원본 engine.ts L488 streamedThisMsg 미러) ─────
  /**
   * 현재 run에서 stream_event 텍스트 델타가 수신됐는가.
   * true이면 이후 오는 full 텍스트 블록을 suppress(중복 버블 방지).
   */
  private _streamedThisMsg = false

  // ── model-fallback dedup (Phase 32, 원본 engine.ts L272 pendingFallbackNotices) ─
  /**
   * onUserDialog 경로가 이미 emit한 폴백 배너 수.
   * system 경로(model_refusal_fallback)가 중복 emit하면 감소만 하고 생략(dedup).
   */
  private _pendingFallbackNotices = 0

  // ── workspaceRoot (file-change 경로 정규화용) ─────────────────────────────────
  private readonly _workspaceRoot: string | undefined

  constructor(launchTag: string, workspaceRoot?: string) {
    this._launchTag = launchTag
    this._workspaceRoot = workspaceRoot
  }

  // ── model-fallback 접근자 (ClaudeCodeBackend onUserDialog 콜백용) ──────────────

  /** onUserDialog에서 retractMessageId로 사용할 현재 텍스트 블록 id. */
  get curTextId(): string | null { return this._curTextId }

  /** onUserDialog 콜백: 재시도 답변을 새 버블로 시작하기 위해 curTextId를 리셋한다. */
  resetCurTextId(): void { this._curTextId = null }

  /** onUserDialog 콜백: pendingFallbackNotices 증가(dialog 경로 선점). */
  incrementPendingFallback(): void { this._pendingFallbackNotices++ }

  // ── 스트리밍 리셋 (B2 초기화 — 단발·지속세션 펌프 공용) ─────────────────────────

  /**
   * 펌프 루프 진입 전 + finally에서 호출하는 스트리밍 플래그 리셋(B2 3중 초기화 중 2·3번째).
   * abort 후 재run 또는 edge-case에서 stale true가 첫 full suppress 오발 방지.
   */
  resetStreaming(): void { this._streamedThisMsg = false }

  // ── 핵심 처리 메서드 ──────────────────────────────────────────────────────────

  /**
   * SDK 원시 메시지 1개를 처리해 push할 이벤트 배열과 done을 반환한다.
   *
   * 반환된 events를 순서대로 push-queue에 적재하면 된다.
   * done은 보류(F-B)/즉시push 등 호출자(펌프) 정책에 따라 처리한다.
   *
   * 처리 흐름(기존 _processSdkMessage와 동일 순서):
   *   1. system/model_refusal_fallback 전처리(Phase 32)
   *   2. content_block_start 전처리(Phase 33 M5 B1)
   *   3. mapClaudeStreamLine → AgentEvent 정규화
   *   4. done 보류, session 즉시 추가, Task* 누적, orchestration suppress,
   *      file-change pending, cron 추적, 서브에이전트 early-skip, messageId 부여, 일반 추가
   *   5. assistant 메시지 경계 리셋(S3)
   *
   * @param msg SDK에서 받은 raw 메시지(unknown)
   * @returns { events: AgentEvent[], done: AgentEventDone | null }
   */
  process(msg: unknown): NormResult {
    const events: AgentEvent[] = []
    let foundDone: AgentEventDone | null = null

    // ── 1. system/model_refusal_fallback 전처리 (Phase 32) ────────────────────
    // claude-stream.ts의 case 'system'이 system msg를 []로 삼킨다.
    // model_refusal_fallback은 다이얼로그 없이 직접 오는 폴백 신호.
    // mapClaudeStreamLine 호출 전에 가로챈다(원본 engine.ts L398-412 미러).
    // 신뢰경계: original_model/fallback_model/api_refusal_category string만 추출.
    if (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'system' &&
      (msg as Record<string, unknown>)['subtype'] === 'model_refusal_fallback'
    ) {
      const raw = msg as Record<string, unknown>
      if (this._pendingFallbackNotices > 0) {
        // dialog 경로가 이미 emit했음 → 카운터 감소만(dedup). 원본 L399-401 미러.
        this._pendingFallbackNotices--
      } else {
        // dialog 없이 직접 전환 → 여기서 emit. 원본 L402-410 미러.
        // system 경로: retractMessageId=null (turn 끝 stream id가 재시도 답변 것일 수 있어 retract 금지).
        events.push({
          type: 'model-fallback',
          fromModel: typeof raw['original_model'] === 'string' ? raw['original_model'] : '',
          toModel: typeof raw['fallback_model'] === 'string' ? raw['fallback_model'] : '',
          text: fallbackNotice(raw['original_model'], raw['fallback_model'], raw['api_refusal_category']),
          retractMessageId: null,
        })
      }
      return { events, done: null }
    }

    // ── 2. stream_event content_block_start 전처리 (Phase 33 M5 B1·CRITICAL) ──
    // stream_event이고 event.type==='content_block_start'이면 _curTextId=null.
    // 새 콘텐츠 블록 = 새 버블: 한 assistant 턴 내 text→tool→text 멀티블록에서
    // 둘째 text가 첫 버블에 병합되는 회귀 차단(원본 engine.ts 블록 경계 관리 미러).
    const isStreamEvent = (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'stream_event'
    )
    if (isStreamEvent) {
      const rawMsg = msg as Record<string, unknown>
      const ev = rawMsg['event']
      if (
        ev !== null && typeof ev === 'object' &&
        (ev as Record<string, unknown>)['type'] === 'content_block_start'
      ) {
        this._curTextId = null
      }
    }

    // ── 3+4. mapClaudeStreamLine → 이벤트 처리 ──────────────────────────────
    for (const event of mapClaudeStreamLine(msg)) {

      // ── done 보류(반환) ────────────────────────────────────────────────────
      // done은 events에 포함하지 않고 반환 — 호출자가 처리 방침 결정.
      // is_error result는 [error, done]을 내는데 error는 통과·추가, done만 반환.
      if (event.type === 'done') {
        foundDone = event
        continue
      }

      // ── Phase 1: session 이벤트 즉시 추가 ────────────────────────────────
      if (event.type === 'session') {
        events.push(event)
        continue
      }

      // ── Task* 누적 처리 (F1 fix) ─────────────────────────────────────────
      // TaskCreate/TaskUpdate/TaskList tool_call → taskMap 갱신 + todos 추가.
      // 해당 tool_call 자체는 events에 추가 안 함(도구 로그 제외).
      // 해당 id의 tool_result도 suppress(고아 결과 방지).
      // Phase A-1 주의: Task* 가로채기 후 continue — _curTextId 리셋 안 함(정상).
      if (event.type === 'tool_call' && RunEventNormalizer._TASK_TOOLS.has(event.name)) {
        this._handleTaskToolCall(event.id, event.name, event.input, events)
        continue
      }
      if (event.type === 'tool_result' && this._taskToolIds.has(event.id)) {
        continue  // suppress — 고아 결과 방지
      }

      // ── F-C: orchestration 카드 id 등록 + launched tool_result suppress ──
      // orchestration 이벤트(Workflow tool_use 정규화)의 id를 등록 → 그 id의 tool_result
      // ("Workflow launched in background…" 안내)를 suppress해 카드 오완료 방지.
      // 카드 라이브 진행/완료는 orchestration_progress(task_*) 이벤트가 담당.
      if (event.type === 'orchestration') {
        this._orchestrationToolIds.add(event.id)
        // orchestration 카드 생성 이벤트 자체는 아래로 흘려 추가
      }
      if (event.type === 'tool_result' && this._orchestrationToolIds.has(event.id)) {
        continue  // suppress
      }

      // ── File change pending-map 처리 (F2 fix) ────────────────────────────
      // tool_call(Write/Edit/MultiEdit/NotebookEdit) → pending 기록(events 미추가)
      // tool_result(성공) → file_changed 추가 + pending 제거
      // tool_result(실패) → pending 제거만(emit 없음 — 유령 마커 방지)
      if (event.type === 'tool_call') {
        this._recordFilePending(event.id, event.name, event.input)
      } else if (event.type === 'tool_result') {
        this._resolveFilePending(event.id, event.ok, events)
      }

      // ── Cron 루프 추적 (5c — REPL 지속세션 loops 이벤트) ─────────────────
      // CronCreate/CronUpdate tool_call → _cronPending 등록.
      // CronDelete tool_call → _activeLoops 제거 + loops 추가.
      // CronCreate/CronUpdate tool_result → result 파싱 → _activeLoops 갱신 + loops 추가.
      // ADR-003: 'CronCreate'/'CronDelete' 리터럴은 이 블록에만.
      if (event.type === 'tool_call' && RunEventNormalizer._CRON_CREATE_TOOLS.has(event.name)) {
        this._recordCronPending(event.id, event.input)
        // tool_call 자체는 suppress 없이 아래로 흘림(도구 카드 표시)
      } else if (event.type === 'tool_call' && event.name === 'CronDelete') {
        this._handleCronDelete(event.input, events)
        // tool_call 자체는 아래로 흘림
      } else if (event.type === 'tool_result' && this._cronPending.has(event.id)) {
        this._resolveCronPending(event.id, event.output, events)
        // tool_result도 아래로 흘림
      }

      // ── Phase 37 #3: 서브에이전트 text/thinking early-skip ───────────────
      // parentToolId 있는 text/thinking은 메인 stream 상태에 관여하지 않음.
      // reducer가 parentToolId로 transcript 라우팅 → 메인 블록경계(_curTextId/
      // _streamedThisMsg/messageId)를 건드리지 않고 즉시 추가(P-iso-2 연속성 보장).
      if (
        (event.type === 'text' || event.type === 'thinking') &&
        (event as { parentToolId?: string }).parentToolId
      ) {
        events.push(event)
        continue
      }

      // ── Phase 33 M5 + Phase A-1: messageId 블록 경계 부여 + 델타/full 분기 ─
      // isStreamEvent(델타) vs else(full 텍스트 블록) 분기.
      // 원본 engine.ts L419-426(stream_event text delta) + L463-471(full text) 미러.
      if (event.type === 'text') {
        if (isStreamEvent) {
          // 델타: 블록 id 발급 + _streamedThisMsg=true + 추가
          if (this._curTextId === null) {
            this._curTextId = this._nextBlockId()
          }
          event.messageId = this._curTextId
          this._streamedThisMsg = true
        } else {
          // full 텍스트 블록: 이미 스트리밍됐으면 suppress(중복 방지)
          if (this._streamedThisMsg) {
            continue
          }
          // Phase A 폴백: 델타 미도착 → full을 정상 emit
          if (this._curTextId === null) {
            this._curTextId = this._nextBlockId()
          }
          event.messageId = this._curTextId
        }
      } else if (event.type === 'thinking') {
        // full thinking + 이미 스트리밍됨 → suppress(늦은 thinking 표시 방지)
        // (원본 engine.ts L459 `if (!streamedThisMsg)` 미러)
        if (!isStreamEvent && this._streamedThisMsg) {
          continue
        }
      } else if (event.type === 'tool_call') {
        // 실 도구(Task* 제외) → 다음 text 블록은 새 블록(인터리브 경계)
        this._curTextId = null
      }

      events.push(event)
    }

    // ── 5. SDK 메시지 경계 리셋 (assistant full msg 限定 — S3 정밀화·CRITICAL) ──
    // assistant(full) msg에서만 리셋. stream_event/user/result/system 무리셋.
    // 이유: 델타(stream_event)와 다른 비-assistant msg 사이에서 _curTextId를
    //       리셋하면 델타 분절(같은 버블이 조각남). 블록 경계는 content_block_start(B1)과
    //       tool_call이 담당. 이 분기는 assistant full msg의 턴 경계만 담당.
    //
    // Phase 37 #3 가드: 서브에이전트 full assistant 메시지(parent_tool_use_id 있음)는
    // 메인 stream 블록 경계를 끊으면 안 됨(P-iso-2). parent_tool_use_id 있으면 리셋 skip.
    //
    // 원본 engine.ts L486-488: curTextId=null; streamedThisMsg=false (assistant 처리 후) 미러.
    if (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'assistant'
    ) {
      const rawParentId = (msg as Record<string, unknown>)['parent_tool_use_id']
      const isSubAgentMsg = typeof rawParentId === 'string' && rawParentId.length > 0
      if (!isSubAgentMsg) {
        this._curTextId = null
        this._streamedThisMsg = false
      }
    }

    return { events, done: foundDone }
  }

  // ── abort/finally 클린업 ──────────────────────────────────────────────────────

  /**
   * abort() 시 호출: 상태를 정리하고 push할 정리 이벤트 배열을 반환한다.
   *
   * 반환된 events: activeLoops OR cronPending이 있었으면 [{type:'loops', loops:[]}] 포함.
   * 호출자(abort())가 반환된 events를 _push()로 push-queue에 적재한 뒤 _close()를 호출한다.
   *
   * (원본 engine.ts abort() 내부 loops 정리 로직 미러)
   */
  abortCleanup(): AgentEvent[] {
    const cleanupEvents: AgentEvent[] = []

    this._pendingFallbackNotices = 0
    this._pendingFileChanges.clear()
    this._taskMap.clear()
    this._taskToolIds.clear()
    this._orchestrationToolIds.clear()

    if (this._activeLoops.size > 0 || this._cronPending.size > 0) {
      this._activeLoops.clear()
      this._cronPending.clear()
      cleanupEvents.push({ type: 'loops', loops: [] })
    } else {
      this._activeLoops.clear()
      this._cronPending.clear()
    }

    return cleanupEvents
  }

  /**
   * 단발 펌프(_runPump) finally 시 호출: 상태만 클리어(이벤트 미반환).
   *
   * 단발 경로는 세션이 끝나므로 loops 클린업 push 없음.
   * (원본 _runPump.finally 로직 미러)
   */
  singlePumpCleanup(): void {
    this._pendingFallbackNotices = 0
    this._streamedThisMsg = false
    this._pendingFileChanges.clear()
    this._taskMap.clear()
    this._taskToolIds.clear()
    this._orchestrationToolIds.clear()
    this._activeLoops.clear()
    this._cronPending.clear()
  }

  /**
   * 지속세션 펌프(_runPersistentPump) finally 시 호출: 정리 이벤트 반환 + 상태 클리어.
   *
   * 반환된 events: activeLoops가 있었으면 [{type:'loops', loops:[]}] 포함.
   * 세션 자연종료/사망에서도 GUI 표시기가 제거되도록 close 전 push 필요.
   * (원본 _runPersistentPump.finally 로직 미러)
   */
  persistentPumpCleanup(): AgentEvent[] {
    const cleanupEvents: AgentEvent[] = []

    this._pendingFallbackNotices = 0
    this._streamedThisMsg = false
    this._pendingFileChanges.clear()
    this._taskMap.clear()
    this._taskToolIds.clear()
    this._orchestrationToolIds.clear()

    if (this._activeLoops.size > 0) {
      cleanupEvents.push({ type: 'loops', loops: [] })
    }
    this._activeLoops.clear()
    this._cronPending.clear()

    return cleanupEvents
  }

  // ── 내부 헬퍼 메서드 ──────────────────────────────────────────────────────────

  private _nextBlockId(): string {
    return 'a' + this._launchTag + '-' + (++this._blockSeq)
  }

  // ── Task* 처리 (F1 fix, 원본 engine.ts L603-628 미러) ──────────────────────────

  /**
   * TASK_TOOLS: TaskCreate/TaskUpdate/TaskList.
   * 이 도구들은 할 일 패널로 라우팅되며 도구 로그에서 제외된다.
   * 'Task'/'Agent'(서브에이전트 스폰)은 이 Set에 없음 → subagent 이벤트(claude-stream 경로).
   * (원본 engine.ts L117 TASK_TOOLS 미러)
   */
  private static readonly _TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList'])

  /**
   * Task* tool_call 가로채기 — taskMap 갱신 + todos 추가.
   *
   * TaskCreate: input.subject || input.description → ++_taskSeq id 발급 → taskMap.set.
   *   subject 빈 문자열이면 추가 안 함(원본 L609 `if (subject)` 미러).
   * TaskUpdate: input.taskId(방어적: taskId/task_id/id 모두 시도) → taskMap 조회.
   *   status='deleted' → taskMap.delete.
   *   그 외 → status 갱신 + input.subject 있으면 label 갱신.
   * TaskList: 변경 없이 현재 taskMap re-emit.
   * 매 변경 끝에 todos 이벤트 events에 추가.
   * id를 _taskToolIds에 등록 → 이후 tool_result suppress.
   */
  private _handleTaskToolCall(id: string, name: string, input: unknown, events: AgentEvent[]): void {
    this._taskToolIds.add(id)

    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    if (name === 'TaskCreate') {
      const subject = String(inp['subject'] ?? inp['description'] ?? '').trim()
      if (subject) {
        const tid = String(++this._taskSeq)
        this._taskMap.set(tid, { id: tid, label: subject, status: 'planned' })
      }
    } else if (name === 'TaskUpdate') {
      const tid = String(inp['taskId'] ?? inp['task_id'] ?? inp['id'] ?? '').trim()
      const status = String(inp['status'] ?? '').trim()
      const task = this._taskMap.get(tid)
      if (task) {
        if (status === 'deleted') {
          this._taskMap.delete(tid)
        } else {
          if (status) task.status = this._mapTaskStatus(status)
          if (inp['subject']) task.label = String(inp['subject'])
        }
      }
    }
    // TaskList: 변경 없이 현재 taskMap re-emit

    const todos = [...this._taskMap.values()].map(t => ({ ...t }))
    events.push({ type: 'todos', todos })
  }

  /**
   * Task* status 문자열 → TodoItem status 매핑.
   * (claude-stream.ts todoStatus 함수와 동일 로직)
   */
  private _mapTaskStatus(s: string): 'done' | 'running' | 'planned' {
    if (s === 'completed' || s === 'done') return 'done'
    if (s === 'in_progress' || s === 'running') return 'running'
    return 'planned'
  }

  // ── Cron 루프 추적 (5c) ───────────────────────────────────────────────────────

  /**
   * Cron 생성 도구명 집합.
   * 미래 CronUpdate 확장을 위한 Set.
   * ADR-003: 'CronCreate' 리터럴은 어댑터 내부에만.
   */
  private static readonly _CRON_CREATE_TOOLS = new Set(['CronCreate', 'CronUpdate'])

  /**
   * CronCreate tool_use 시점: _cronPending에 {summary, cron} 등록.
   * summary: input.prompt를 sanitizeDescription으로 sanitize.
   */
  private _recordCronPending(id: string, input: unknown): void {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}
    const rawPrompt = typeof inp['prompt'] === 'string' ? inp['prompt'] : ''
    const summary = sanitizeDescription(rawPrompt)
    const cron = typeof inp['cron'] === 'string' ? inp['cron'] : ''
    this._cronPending.set(id, { summary, cron })
  }

  /**
   * CronCreate tool_result 시점: result content を파싱해 _activeLoops 추가 + loops 추가.
   *
   * 파싱 대상 (프로브 실측 content 형식):
   *   "Scheduled recurring job cc2476aa (Every minute). Session-only ..."
   *   - cronId: `job ([0-9a-f]+)` → "cc2476aa"
   *   - interval: 첫 번째 괄호 `\(([^)]+)\)` → "Every minute"
   *
   * content는 AgentEventToolResult.output(= SDK tool_result content 원문, string).
   * 파싱 실패 케이스 → graceful 무시(crash 0, 루프 미추가).
   */
  private _resolveCronPending(id: string, output: unknown, events: AgentEvent[]): void {
    const pending = this._cronPending.get(id)
    this._cronPending.delete(id)
    if (!pending) return

    const content = typeof output === 'string' ? output : ''
    if (!content) return

    const idMatch = /\bjob\s+([0-9a-f]+)\b/i.exec(content)
    if (!idMatch) return
    const cronId = idMatch[1]

    const intervalMatch = /\(([^)]+)\)/.exec(content)
    const interval = intervalMatch
      ? intervalMatch[1].replace(/[\r\n]+/g, ' ').trim().slice(0, 64)
      : undefined

    this._activeLoops.set(cronId, {
      id: cronId,
      summary: pending.summary,
      ...(interval ? { interval } : {})
    })

    events.push({ type: 'loops', loops: [...this._activeLoops.values()] })
  }

  /**
   * CronDelete tool_use 시점: input에서 cronId 추출(best-effort) → _activeLoops 제거 + loops 추가.
   * 추출 실패 또는 미존재 id → 무시(변화 없음).
   */
  private _handleCronDelete(input: unknown, events: AgentEvent[]): void {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawId =
      typeof inp['id'] === 'string' ? inp['id'] :
      typeof inp['cronId'] === 'string' ? inp['cronId'] :
      typeof inp['jobId'] === 'string' ? inp['jobId'] :
      ''

    if (!rawId) return
    if (!this._activeLoops.has(rawId)) return

    this._activeLoops.delete(rawId)
    events.push({ type: 'loops', loops: [...this._activeLoops.values()] })
  }

  // ── File change pending-map (F2 fix, 원본 engine.ts L643-711 미러) ─────────────

  /**
   * FILE_CHANGE_TOOLS: Write/Edit/MultiEdit/NotebookEdit.
   */
  private static readonly _FILE_CHANGE_TOOLS = new Set([
    'Write', 'Edit', 'MultiEdit', 'NotebookEdit'
  ])

  /**
   * tool_use 시점: 파일변경 도구이면 pending-map에 {path, change, baseline, absPath} 기록.
   *
   * path 추출 우선순위: file_path → path → notebook_path.
   * change 판정: Write+파일미존재→'add', 그 외→'modify'.
   * baseline 읽기: tool_call 시점 현재 내용 저장(diff 계산용).
   * 경로 정규화: 워크스페이스 상대 POSIX 경로.
   */
  private _recordFilePending(id: string, name: string, input: unknown): void {
    if (!RunEventNormalizer._FILE_CHANGE_TOOLS.has(name)) return

    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawPath =
      typeof inp['file_path'] === 'string' ? inp['file_path'] :
      typeof inp['path'] === 'string' ? inp['path'] :
      typeof inp['notebook_path'] === 'string' ? inp['notebook_path'] :
      ''

    if (!rawPath) return

    const root = this._workspaceRoot
    const abs = isAbsolute(rawPath) ? rawPath : join(root ?? process.cwd(), rawPath)

    let change: 'add' | 'modify' = 'modify'
    let baseline = ''

    try {
      if (existsSync(abs)) {
        if (name === 'Write') change = 'modify'
        baseline = readFileSync(abs, 'utf8')
      } else {
        if (name === 'Write') change = 'add'
      }
    } catch {
      // existsSync/readFileSync 실패 → 'modify' 폴백, baseline = ''
    }

    let emitPath: string
    if (!root) {
      emitPath = rawPath
    } else {
      const rel = relative(root, abs)
      if (rel.startsWith('..')) {
        emitPath = rawPath
      } else {
        emitPath = rel.split(sep).join('/')
      }
    }

    this._pendingFileChanges.set(id, { path: emitPath, change, baseline, absPath: abs })
  }

  /**
   * tool_result 시점: pending에 있는 id이면:
   *   ok=true(성공) → after 읽기 → computeDiff → file_changed 추가 + pending 제거
   *   ok=false(실패) → pending 제거만(emit 없음 — 유령 마커 방지)
   *
   * diff 계산: 대형 파일(>512KB)·바이너리(null byte) → diff 생략.
   * (원본 engine.ts L708-711 미러)
   */
  private _resolveFilePending(id: string, ok: boolean, events: AgentEvent[]): void {
    const pending = this._pendingFileChanges.get(id)
    if (!pending) return
    this._pendingFileChanges.delete(id)

    if (!ok) return

    let diffLines: DiffLine[] | undefined
    let addCount: number | undefined
    let delCount: number | undefined

    try {
      const afterBuf = readFileSync(pending.absPath)

      if (afterBuf.length <= MAX_DIFF_BYTES) {
        const sample = afterBuf.slice(0, 8192)
        let isBinary = false
        for (let i = 0; i < sample.length; i++) {
          if (sample[i] === 0) { isBinary = true; break }
        }

        if (!isBinary) {
          const afterContent = afterBuf.toString('utf-8')
          diffLines = computeDiff(pending.baseline, afterContent)
          addCount = diffLines.filter(l => l.kind === 'add').length
          delCount = diffLines.filter(l => l.kind === 'remove').length
        }
      }
    } catch {
      // readFileSync 실패 → diff 생략(graceful)
    }

    events.push({
      type: 'file_changed',
      path: pending.path,
      change: pending.change,
      toolId: id,
      ...(diffLines !== undefined ? { diff: diffLines, add: addCount, del: delCount } : {})
    })
  }
}

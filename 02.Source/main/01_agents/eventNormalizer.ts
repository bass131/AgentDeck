/**
 * eventNormalizer.ts — 상태 기반 이벤트 정규화 레이어 (Phase 11 책임 분리)
 *
 * ClaudeCodeBackend.ts에서 분리된 런-레벨 상태 기반 이벤트 처리 클래스.
 * claude-stream.ts(mapClaudeStreamLine, 무상태·순수)가 생성한 AgentEvent에
 * run-level 상태를 반영해 최종 AgentEvent를 생성한다.
 *
 * 이 레이어가 관리하는 상태(직접 보유 + 트래커 위임):
 *  - messageId 블록 경계 (_launchTag, _blockSeq, _curTextId)              [직접]
 *  - 스트리밍/full 텍스트 dedup (_streamedThisMsg)                        [직접]
 *  - model-fallback dedup (_pendingFallbackNotices)                       [직접]
 *  - Orchestration id 집합 (Workflow tool_result suppress)               [직접]
 *  - Task* 누적 (TaskCreate/TaskUpdate/TaskList → todos)                  [TaskTracker]
 *  - Cron/Wakeup 루프 추적 (CronCreate/CronDelete + ScheduleWakeup → loops,
 *    LR3 Phase 04)                                                       [CronTracker]
 *  - File change pending-map (Write/Edit/… → file_changed)               [FileChangeTracker]
 *
 * RF1-followup P03: Task/Cron/FileChange를 트래커로 분리(컴포지션).
 *  - 이 클래스는 process()의 흐름·순서를 조율(orchestration)하고, 부수효과 투영은 트래커에 위임.
 *  - 트래커 메서드는 events를 인자로 push하던 것을 반환으로 바꿨고, 호출자가 같은 위치에서
 *    push하므로 이벤트 방출 순서는 분해 전과 1:1 동일(거동 불변).
 *
 * 격리 원칙(ADR-003):
 *  - 엔진 고유 도구명(Task계열/Cron계열/파일변경 도구)은 각 트래커 파일 내부에만.
 *  - emit 이벤트는 공통 AgentEvent — 엔진 누수 0.
 *  - fs 읽기(readFileSync/existsSync)는 FileChangeTracker(main 프로세스)에서만 — 신뢰경계.
 *
 * 순수성 보존:
 *  - mapClaudeStreamLine은 무상태 유지 — 이 레이어만 상태를 가진다.
 *  - process()는 side-effect 없이 이벤트 배열을 반환한다
 *    (push는 호출자가 담당 — 테스트·목-주입 용이).
 *
 * 교육 메모(SRP):
 *  - claude-stream.ts: 무상태 매핑(엔진 스키마 → AgentEvent 1:1 변환)
 *  - eventNormalizer.ts: 상태 기반 보강 조율(블록경계·dedup·트래커 위임)
 *  - {file,progress}Trackers.ts: tool_call 부수효과 → 파생 이벤트 투영
 *  - ClaudeCodeBackend.ts: 생명주기 오케스트레이터(펌프·abort·push-queue·SDK 옵션)
 *  변하는 이유가 다르므로 파일을 분리한다.
 */

import { mapClaudeStreamLine } from './claude-stream'
import { fallbackNotice } from './modelFallback'
import { FileChangeTracker } from './fileChangeTracker'
import { TaskTracker, CronTracker } from './progressTrackers'
import type { AgentEvent, AgentEventDone } from '../../shared/agent-events'

// ── model-fallback 헬퍼 re-export (RF1-followup P03: modelFallback.ts로 이전) ─────
// 공개 표면 보존: 기존 소비처(eventNormalizer.test, 과거 import 경로)가 깨지지 않도록
// modelFallback의 순수 헬퍼를 이 모듈에서 그대로 재노출한다.
export { modelDisplay, REFUSAL_CATEGORY_LABEL, fallbackNotice } from './modelFallback'

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

  // ── 트래커 (RF1-followup P03 컴포지션) ───────────────────────────────────────
  private readonly _fileTracker: FileChangeTracker
  private readonly _taskTracker = new TaskTracker()
  private readonly _cronTracker = new CronTracker()

  // ── Orchestration(Workflow) id 집합 (F-C) ────────────────────────────────────
  /**
   * Workflow tool_use id 집합.
   * "launched in background" tool_result를 suppress(카드 오완료 방지).
   */
  private _orchestrationToolIds = new Set<string>()

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

  constructor(launchTag: string, workspaceRoot?: string) {
    this._launchTag = launchTag
    this._fileTracker = new FileChangeTracker(workspaceRoot)
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
        // LR3 Phase 04: 턴 경계에서 ScheduleWakeup 체인 종료 판정(재예약 없으면 loops 제거).
        // done은 events에 포함하지 않지만, 이 정리 이벤트는 같은 턴 배치로 포함(제거가
        // done 직전에 보이도록 — 배너가 턴이 끝나는 순간 사라짐).
        for (const e of this._cronTracker.onTurnEnd()) events.push(e)
        continue
      }

      // ── Phase 1: session 이벤트 즉시 추가 ────────────────────────────────
      if (event.type === 'session') {
        events.push(event)
        continue
      }

      // ── Task* 누적 처리 (F1 fix) — TaskTracker 위임 ───────────────────────
      // TaskCreate/TaskUpdate/TaskList tool_call → taskMap 갱신 + todos 추가.
      // 해당 tool_call 자체는 events에 추가 안 함(도구 로그 제외). 해당 id의
      // tool_result도 suppress(고아 결과 방지). _curTextId 리셋 안 함(정상, Phase A-1).
      if (event.type === 'tool_call' && this._taskTracker.isTaskTool(event.name)) {
        for (const e of this._taskTracker.handle(event.id, event.name, event.input)) events.push(e)
        continue
      }
      if (event.type === 'tool_result' && this._taskTracker.isTaskResult(event.id)) {
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

      // ── File change pending-map 처리 (F2 fix) — FileChangeTracker 위임 ────
      // tool_call(Write/Edit/MultiEdit/NotebookEdit) → pending 기록(events 미추가)
      // tool_result(성공) → file_changed 추가 + pending 제거
      // tool_result(실패) → pending 제거만(emit 없음 — 유령 마커 방지)
      if (event.type === 'tool_call') {
        this._fileTracker.record(event.id, event.name, event.input)
      } else if (event.type === 'tool_result') {
        for (const e of this._fileTracker.resolve(event.id, event.ok)) events.push(e)
      }

      // ── Cron 루프 추적 (5c) — CronTracker 위임 ───────────────────────────
      // CronCreate/CronUpdate tool_call → pending 등록.
      // CronDelete tool_call → activeLoops 제거 + loops 추가.
      // CronCreate/CronUpdate tool_result → result 파싱 → activeLoops 갱신 + loops 추가.
      // ScheduleWakeup(LR3 Phase 04) tool_call/tool_result → 같은 activeLoops에 병합
      // (self-paced 루프, output 파싱 비의존 — ok 불리언 + input.delaySeconds 기반).
      if (event.type === 'tool_call' && this._cronTracker.isCronCreate(event.name)) {
        this._cronTracker.recordPending(event.id, event.input)
        // tool_call 자체는 suppress 없이 아래로 흘림(도구 카드 표시)
      } else if (event.type === 'tool_call' && this._cronTracker.isCronDelete(event.name)) {
        for (const e of this._cronTracker.handleDelete(event.input)) events.push(e)
        // tool_call 자체는 아래로 흘림
      } else if (event.type === 'tool_call' && this._cronTracker.isWakeupCall(event.name)) {
        this._cronTracker.recordWakeupPending(event.id, event.input)
        // tool_call 자체는 아래로 흘림(도구 카드 표시)
      } else if (event.type === 'tool_result' && this._cronTracker.hasPending(event.id)) {
        for (const e of this._cronTracker.resolvePending(event.id, event.output)) events.push(e)
        // tool_result도 아래로 흘림
      } else if (event.type === 'tool_result' && this._cronTracker.hasWakeupPending(event.id)) {
        for (const e of this._cronTracker.resolveWakeupPending(event.id, event.ok)) events.push(e)
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
    this._fileTracker.clear()
    this._taskTracker.clear()
    this._orchestrationToolIds.clear()

    if (this._cronTracker.hasActivity()) {
      cleanupEvents.push({ type: 'loops', loops: [] })
    }
    this._cronTracker.clear()

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
    this._fileTracker.clear()
    this._taskTracker.clear()
    this._orchestrationToolIds.clear()
    this._cronTracker.clear()
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
    this._fileTracker.clear()
    this._taskTracker.clear()
    this._orchestrationToolIds.clear()

    if (this._cronTracker.hasActiveLoops()) {
      cleanupEvents.push({ type: 'loops', loops: [] })
    }
    this._cronTracker.clear()

    return cleanupEvents
  }

  // ── 내부 헬퍼 메서드 ──────────────────────────────────────────────────────────

  private _nextBlockId(): string {
    return 'a' + this._launchTag + '-' + (++this._blockSeq)
  }
}

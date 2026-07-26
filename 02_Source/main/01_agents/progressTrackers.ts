/**
 * progressTrackers.ts — 진행 상태 트래커 (RF1-followup P03: eventNormalizer에서 분리)
 *
 * "tool_call 부수효과 → 파생 진행 이벤트" 투영을 담당하는 두 stateful 트래커:
 *  - TaskTracker: TaskCreate/TaskUpdate/TaskList → 'todos' 이벤트(할 일 패널).
 *  - CronTracker: CronCreate/CronUpdate/CronDelete **+ ScheduleWakeup**(LR3 Phase 04) →
 *    'loops' 이벤트(반복 일정 표시기). 두 도구 계열 모두 같은 `_activeLoops` 스냅샷에
 *    합류한다 — AgentEventLoops는 "전체 스냅샷 덮어쓰기" 계약(agent-events.ts)이므로,
 *    별도 트래커로 쪼개 각자 emit하면 서로의 항목을 지워버린다(교육 포인트: 병합 지점을
 *    두 곳으로 나누면 "마지막에 emit한 쪽이 이긴다"는 버그가 난다 — 그래서 CronTracker
 *    안에서 하나의 Map으로 합쳐 관리한다).
 *
 * 한 파일로 묶은 이유(응집): 둘 다 "엔진 고유 tool_call을 누적해 공통 진행 이벤트로 투영"한다 —
 *   변하는 이유가 같은 축(진행 표시). 파일 폭증(over-split) 방지.
 *
 * 격리 원칙(ADR-003): 엔진 고유 도구명(Task계열/Cron계열)은 이 파일 내부에만.
 *   emit 이벤트는 공통 AgentEvent(todos/loops) — 엔진 누수 0.
 *
 * (원본 engine.ts L603-628[Task], L155-? Cron 미러 — 분해 전 RunEventNormalizer 메서드와
 *  거동 1:1 동일. events 인자 push → 반환으로 변경, 호출자가 같은 위치에서 push해 순서 불변.)
 */

import { sanitizeDescription } from './descriptionUtils'
import type { AgentEvent, LoopInfo } from '../../shared/agent-events'

// ── TaskTracker ──────────────────────────────────────────────────────────────

/**
 * TASK_TOOLS: TaskCreate/TaskUpdate/TaskList.
 * 이 도구들은 할 일 패널로 라우팅되며 도구 로그에서 제외된다.
 * 'Task'/'Agent'(서브에이전트 스폰)은 이 Set에 없음 → subagent 이벤트(claude-stream 경로).
 * (원본 engine.ts L117 TASK_TOOLS 미러)
 */
const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList'])

/**
 * Task* 누적 트래커 (런당 1개 — RunEventNormalizer가 소유).
 * (F1 fix, 원본 engine.ts L176-180, L603-628 미러)
 */
export class TaskTracker {
  private _taskMap = new Map<string, { id: string; label: string; status: 'planned' | 'running' | 'done' }>()
  private _taskSeq = 0
  /** Task* tool_use id 집합 — 해당 id의 tool_result를 suppress(고아 결과 방지). */
  private _taskToolIds = new Set<string>()

  /** TaskCreate/TaskUpdate/TaskList 여부. */
  isTaskTool(name: string): boolean {
    return TASK_TOOLS.has(name)
  }

  /** 주어진 tool_use id가 Task* 도구였는가(tool_result suppress 판정). */
  isTaskResult(id: string): boolean {
    return this._taskToolIds.has(id)
  }

  /**
   * Task* tool_call 가로채기 — taskMap 갱신 후 [todos] 반환.
   *
   * TaskCreate: input.subject || input.description → ++_taskSeq id 발급 → taskMap.set.
   *   subject 빈 문자열이면 추가 안 함(원본 L609 `if (subject)` 미러).
   * TaskUpdate: input.taskId(방어적: taskId/task_id/id 모두 시도) → taskMap 조회.
   *   status='deleted' → taskMap.delete. 그 외 → status 갱신 + input.subject 있으면 label 갱신.
   * TaskList: 변경 없이 현재 taskMap re-emit.
   * id를 _taskToolIds에 등록 → 이후 tool_result suppress.
   */
  handle(id: string, name: string, input: unknown): AgentEvent[] {
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
          if (status) task.status = TaskTracker._mapTaskStatus(status)
          if (inp['subject']) task.label = String(inp['subject'])
        }
      }
    }
    // TaskList: 변경 없이 현재 taskMap re-emit

    const todos = [...this._taskMap.values()].map(t => ({ ...t }))
    return [{ type: 'todos', todos }]
  }

  /** 펌프 종료/abort 시 누적 상태 비움. */
  clear(): void {
    this._taskMap.clear()
    this._taskToolIds.clear()
  }

  /**
   * Task* status 문자열 → TodoItem status 매핑.
   * (claude-stream.ts todoStatus 함수와 동일 로직)
   */
  private static _mapTaskStatus(s: string): 'done' | 'running' | 'planned' {
    if (s === 'completed' || s === 'done') return 'done'
    if (s === 'in_progress' || s === 'running') return 'running'
    return 'planned'
  }
}

// ── CronTracker ──────────────────────────────────────────────────────────────

/**
 * Cron 생성 도구명 집합.
 * ADR-003: 'CronCreate' 리터럴은 어댑터 내부에만.
 */
const CRON_CREATE_TOOLS = new Set(['CronCreate', 'CronUpdate'])

/**
 * ScheduleWakeup 도구명 (LR3 Phase 04, self-paced 루프).
 * ADR-003: 'ScheduleWakeup' 리터럴은 이 파일 내부에만.
 */
const WAKEUP_TOOL = 'ScheduleWakeup'

/**
 * ScheduleWakeup 루프의 고정(singleton) LoopInfo.id.
 *
 * Cron과 달리 ScheduleWakeup은 SDK가 영속적 job id를 주지 않는다(매 예약이 "다음
 * 1회"를 가리키는 1회성 tool_use/tool_result 쌍). 실측(delay/reason/prompt)만으로는
 * 재예약이 "같은 루프의 연장"인지 "새 루프"인지 SDK가 알려주지 않으므로, 이 트래커는
 * self-paced 모니터링을 세션당 1개의 슬롯으로 모델링한다 — 재예약은 이 슬롯을
 * 갱신(교체)하고, 무재예약은 이 슬롯을 비운다. 'wakeup'은 cron job id(16진수 hex,
 * 정규식 [0-9a-f]+)와 절대 충돌하지 않는 합성 식별자.
 */
const WAKEUP_LOOP_ID = 'wakeup'

/**
 * delaySeconds(초) → 사람표기 interval 문자열.
 * 예: 270 → "self-paced ~4분 30초", 45 → "self-paced ~45초".
 * output 문자열 파싱에 의존하지 않는다(SDK 버전마다 형식이 다를 수 있음 — 프로브 실측 교훈).
 */
function formatWakeupInterval(delaySeconds: number): string {
  const total = Math.round(delaySeconds)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes > 0 && seconds > 0) return `self-paced ~${minutes}분 ${seconds}초`
  if (minutes > 0) return `self-paced ~${minutes}분`
  return `self-paced ~${seconds}초`
}

/**
 * Cron 루프 추적 트래커 (런당 1개 — RunEventNormalizer가 소유).
 * (5c — REPL 지속세션 loops 이벤트, LR3 Phase 04 — ScheduleWakeup 병합)
 */
export class CronTracker {
  private _activeLoops = new Map<string, LoopInfo>()
  private _cronPending = new Map<string, { summary: string; cron: string }>()

  // ── ScheduleWakeup 상태 (LR3 Phase 04) ────────────────────────────────────
  /** tool_use id별 미확정 wakeup 예약(파싱 결과, tool_result 대기). */
  private _wakeupPending = new Map<string, { summary: string; interval?: string }>()
  /**
   * 이번 턴에 wakeup이 (재)확정됐는가 — onTurnEnd() 판정용.
   * true로 세팅되는 시점: resolveWakeupPending(ok=true) 성공.
   * onTurnEnd()가 매 턴 끝에 소비(리셋)한다.
   */
  private _wakeupArmedThisTurn = false

  /** CronCreate/CronUpdate 여부. */
  isCronCreate(name: string): boolean {
    return CRON_CREATE_TOOLS.has(name)
  }

  /** CronDelete 여부 (ADR-003: 'CronDelete' 리터럴을 트래커 내부에 격리). */
  isCronDelete(name: string): boolean {
    return name === 'CronDelete'
  }

  /** 주어진 tool_use id가 cron pending 상태인가(tool_result resolve 판정). */
  hasPending(id: string): boolean {
    return this._cronPending.has(id)
  }

  /** 활성 루프가 하나라도 있는가(persistentPumpCleanup loops 정리 판정). */
  hasActiveLoops(): boolean {
    return this._activeLoops.size > 0
  }

  /**
   * 활성 루프 또는 pending이 있는가(abortCleanup loops 정리 판정).
   * LR3 Phase 04: wakeup pending(미확정 예약)도 활동으로 판정 — armed wakeup은
   * `_activeLoops`에 합류하므로 첫 조건에서 이미 커버된다(P02 idle-close 신호원).
   */
  hasActivity(): boolean {
    return this._activeLoops.size > 0 || this._cronPending.size > 0 || this._wakeupPending.size > 0
  }

  /**
   * CronCreate tool_use 시점: _cronPending에 {summary, cron} 등록.
   * summary: input.prompt를 sanitizeDescription으로 sanitize.
   */
  recordPending(id: string, input: unknown): void {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}
    const rawPrompt = typeof inp['prompt'] === 'string' ? inp['prompt'] : ''
    const summary = sanitizeDescription(rawPrompt)
    const cron = typeof inp['cron'] === 'string' ? inp['cron'] : ''
    this._cronPending.set(id, { summary, cron })
  }

  /**
   * CronCreate tool_result 시점: result content를 파싱해 _activeLoops 추가 후 [loops] 반환.
   *
   * 파싱 대상 (프로브 실측 content 형식):
   *   "Scheduled recurring job cc2476aa (Every minute). Session-only ..."
   *   - cronId: `job ([0-9a-f]+)` → "cc2476aa"
   *   - interval: 첫 번째 괄호 `\(([^)]+)\)` → "Every minute"
   *
   * 파싱 실패 처리(P02 reviewer 🟡-2 — idle-close 증폭 방지):
   *   - ok === false(생성 실패) → graceful [](활동 없음 — 세션 정상 idle-close 허용).
   *   - ok !== false인데 형식을 못 읽음 → **보수 폴백**: tool id를 키로 활성 등록
   *     (SDK 크론은 실재하므로 hasActivity 유지 = 세션째 루프 사망 차단 + 배너 표시).
   *     폴백 키(toolu_…)는 hex cronId·'wakeup'과 충돌 불가. CronDelete 매칭은 안 되나
   *     abort/clear 정리 경로가 회수한다.
   */
  resolvePending(id: string, output: unknown, ok?: boolean): AgentEvent[] {
    const pending = this._cronPending.get(id)
    this._cronPending.delete(id)
    if (!pending) return []
    if (ok === false) return []

    const content = typeof output === 'string' ? output : ''
    const idMatch = content ? /\bjob\s+([0-9a-f]+)\b/i.exec(content) : null
    if (!idMatch) {
      this._activeLoops.set(id, { id, summary: pending.summary })
      return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
    }
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

    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  /**
   * CronDelete tool_use 시점: input에서 cronId 추출(best-effort) → _activeLoops 제거 후 [loops] 반환.
   * 추출 실패 또는 미존재 id → [] 반환(변화 없음).
   */
  handleDelete(input: unknown): AgentEvent[] {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawId =
      typeof inp['id'] === 'string' ? inp['id'] :
      typeof inp['cronId'] === 'string' ? inp['cronId'] :
      typeof inp['jobId'] === 'string' ? inp['jobId'] :
      ''

    if (!rawId) return []
    if (!this._activeLoops.has(rawId)) return []

    this._activeLoops.delete(rawId)
    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  // ── ScheduleWakeup (LR3 Phase 04) ─────────────────────────────────────────

  /** ScheduleWakeup 여부 (ADR-003: 리터럴을 트래커 내부에 격리). */
  isWakeupCall(name: string): boolean {
    return name === WAKEUP_TOOL
  }

  /** 주어진 tool_use id가 wakeup pending 상태인가(tool_result resolve 판정). */
  hasWakeupPending(id: string): boolean {
    return this._wakeupPending.has(id)
  }

  /**
   * ScheduleWakeup tool_use 시점: input을 파싱해 _wakeupPending에 등록.
   *
   * 실측 형상(§(+)): { delaySeconds, reason, prompt }.
   * summary: reason 우선, 없으면 prompt로 폴백 → sanitizeDescription.
   * interval: delaySeconds → formatWakeupInterval (결측/비정상 → undefined, graceful).
   */
  recordWakeupPending(id: string, input: unknown): void {
    const inp = (typeof input === 'object' && input !== null && !Array.isArray(input))
      ? input as Record<string, unknown>
      : {}

    const rawReason = typeof inp['reason'] === 'string' ? inp['reason'] : ''
    const rawPrompt = typeof inp['prompt'] === 'string' ? inp['prompt'] : ''
    const summary = sanitizeDescription(rawReason || rawPrompt)

    const rawDelay = inp['delaySeconds']
    const delaySeconds = (typeof rawDelay === 'number' && Number.isFinite(rawDelay) && rawDelay > 0)
      ? rawDelay
      : null
    const interval = delaySeconds !== null ? formatWakeupInterval(delaySeconds) : undefined

    this._wakeupPending.set(id, { summary, ...(interval ? { interval } : {}) })
  }

  /**
   * ScheduleWakeup tool_result 시점: ok에 따라 wakeup 슬롯을 확정(arm)하거나 폐기한다.
   *
   * ok===true: WAKEUP_LOOP_ID 슬롯을 갱신(신규 등록 또는 교체 — 배너 1개 유지)
   *   + _wakeupArmedThisTurn=true(onTurnEnd 판정용) → [loops] 반환.
   * ok===false 또는 미등록 id: 상태 변화 없이 [] 반환(graceful, crash 0 — output 문자열
   *   파싱에 의존하지 않음, ok 불리언만 신뢰).
   */
  resolveWakeupPending(id: string, ok: boolean): AgentEvent[] {
    const pending = this._wakeupPending.get(id)
    this._wakeupPending.delete(id)
    if (!pending) return []
    if (!ok) return []

    this._activeLoops.set(WAKEUP_LOOP_ID, {
      id: WAKEUP_LOOP_ID,
      summary: pending.summary,
      ...(pending.interval ? { interval: pending.interval } : {})
    })
    this._wakeupArmedThisTurn = true

    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  /**
   * 턴 종료(done) 시점 호출 — ScheduleWakeup "1회성 예약의 연쇄" 종료 판정.
   *
   * wakeup이 armed 상태인데 **이번 턴에 재예약이 없었다면**(_wakeupArmedThisTurn=false)
   * 체인이 끊긴 것으로 보고 슬롯을 제거 → [loops](갱신 스냅샷) 반환.
   * armed가 없거나 이번 턴에 (재)예약됐다면 무변화([] 반환) — 플래그만 다음 턴을 위해 리셋.
   *
   * (eventNormalizer.process()가 'done' 이벤트 감지 시점에 호출 — CronCreate/CronDelete와
   * 달리 wakeup만 "소비되지 않으면 사라지는" 수명을 가지므로 턴 경계 훅이 필요하다.)
   *
   * @param origin 이번 턴의 발원(BF3 Phase 04, 원인 실측: LR3-P04 reviewer 🟡-①).
   *   'user' — 사용자 입력으로 시작된 턴(지속세션 인터리빙 포함). 'cron' — 지속세션에서
   *   입력 없이 자율 발동된 턴(ScheduleWakeup 자신의 continuation). 기본값 'cron'(무인자
   *   호출 시 기존 무조건 판정과 100% 동일 거동 — 하위호환, 단발 펌프는 origin 개념이
   *   아예 없어 항상 기본값으로 호출된다).
   *
   *   **user 턴은 staleArmed 판정 대상이 아니다**: 사용자 메시지에 응답하는 턴은 애초에
   *   ScheduleWakeup을 재호출할 이유가 없다 — "이번 턴에 재예약 없음"이 "체인 종료"를
   *   의미하려면 애초에 재예약이 *가능했던* 턴(자율 continuation, origin='cron')이어야
   *   한다. 이 구분이 없으면 self-paced 루프 진행 중 사용자가 메시지를 하나만 보내도
   *   armed 상태인 wakeup 슬롯이 조기 소거된다(인터리빙 배너 오판, BF3 Phase 04).
   *   origin='cron' 턴의 판정은 기존 그대로 — 반대 버그(재예약 없는 wakeup이 영구
   *   잔존, LR2-03 재림)를 막는다.
   */
  onTurnEnd(origin: 'user' | 'cron' = 'cron'): AgentEvent[] {
    const armedThisTurn = this._wakeupArmedThisTurn
    this._wakeupArmedThisTurn = false

    if (origin === 'user') return []

    const staleArmed = this._activeLoops.has(WAKEUP_LOOP_ID) && !armedThisTurn
    if (!staleArmed) return []

    this._activeLoops.delete(WAKEUP_LOOP_ID)
    return [{ type: 'loops', loops: [...this._activeLoops.values()] }]
  }

  /** 펌프 종료/abort 시 누적 상태 비움. */
  clear(): void {
    this._activeLoops.clear()
    this._cronPending.clear()
    this._wakeupPending.clear()
    this._wakeupArmedThisTurn = false
  }
}

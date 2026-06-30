/**
 * progressTrackers.ts — 진행 상태 트래커 (RF1-followup P03: eventNormalizer에서 분리)
 *
 * "tool_call 부수효과 → 파생 진행 이벤트" 투영을 담당하는 두 stateful 트래커:
 *  - TaskTracker: TaskCreate/TaskUpdate/TaskList → 'todos' 이벤트(할 일 패널).
 *  - CronTracker: CronCreate/CronUpdate/CronDelete → 'loops' 이벤트(반복 일정 표시기).
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
 * Cron 루프 추적 트래커 (런당 1개 — RunEventNormalizer가 소유).
 * (5c — REPL 지속세션 loops 이벤트)
 */
export class CronTracker {
  private _activeLoops = new Map<string, LoopInfo>()
  private _cronPending = new Map<string, { summary: string; cron: string }>()

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

  /** 활성 루프 또는 pending이 있는가(abortCleanup loops 정리 판정). */
  hasActivity(): boolean {
    return this._activeLoops.size > 0 || this._cronPending.size > 0
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
   * 파싱 실패 케이스 → graceful [] 반환(crash 0, 루프 미추가).
   */
  resolvePending(id: string, output: unknown): AgentEvent[] {
    const pending = this._cronPending.get(id)
    this._cronPending.delete(id)
    if (!pending) return []

    const content = typeof output === 'string' ? output : ''
    if (!content) return []

    const idMatch = /\bjob\s+([0-9a-f]+)\b/i.exec(content)
    if (!idMatch) return []
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

  /** 펌프 종료/abort 시 누적 상태 비움. */
  clear(): void {
    this._activeLoops.clear()
    this._cronPending.clear()
  }
}

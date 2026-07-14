/**
 * reducer/cockpit.ts — 훅 콕핏 핸들러 (GAP1 P05, P12 분해 관례 계승).
 *
 * hook_lifecycle · informational · permission_denied. applyAgentEvent 디스패처가 호출.
 * 계약은 P03 선정의분(shared/agent-events.ts AgentEventHookLifecycle·
 * AgentEventInformational·AgentEventPermissionDenied) 소비만 — 이 파일에서 새 타입 추가 0.
 * store-shape 필드명은 coordinator 고정(gap1-p05-hook-cockpit-reducer.test.ts 계약):
 *   hookRuns(HookRun[]) / thread kind 'informational'·'permission-denied'.
 *
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용(nowTime() 0).
 */
import type { AgentEvent } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'
import type { AppState, HookRun } from './types'

type HookLifecycleEvent = Extract<AgentEvent, { type: 'hook_lifecycle' }>
type InformationalEvent = Extract<AgentEvent, { type: 'informational' }>
type PermissionDeniedEvent = Extract<AgentEvent, { type: 'permission_denied' }>

/** hookRuns 상한 — 초과분은 오래된 것부터 드롭(소음/메모리 바운드, coordinator 고정값). */
const HOOK_RUNS_CAP = 200

/**
 * hook_lifecycle 이벤트 → hookRuns 타임라인 갱신(S-03 훅 콕핏 (a)).
 *
 * - phase='started': hookId로 upsert — 동일 hookId 엔트리가 이미 있으면 그대로 두고(중복
 *   append 0), 없으면 {hookId,hookName,hookEvent,status:'running',time?}를 append. cap 200
 *   초과 시 가장 오래된 엔트리부터 드롭.
 * - phase='response': 동일 hookId의 엔트리를 찾아 in-place 갱신
 *   (status:outcome??'success', exitCode?, stdout?, stderr?, output?) — 엔트리 개수 불변
 *   (페어링 upsert). 매칭 없으면(started 유실 등) 방어적으로 append.
 * - phase='progress': 동일 hookId 엔트리에 stdout/stderr/output만 병합(status 유지). 매칭
 *   없으면 no-op(진행 알림만으로 새 엔트리를 만들지 않는다 — started가 진실 원천).
 *
 * GAP1 P16 계열③: runId(4번째 인자, optional) — AgentEventPayload 엔벨로프의 runId를
 * 그대로 실어 HookRun.runId에 저장한다(빨간 배지 status==='error' 연결·턴 귀속 원천).
 * started에서 실린 runId는 response 페어링 upsert에서도 보존(spread 상속 — 아래 updated는
 * ...state.hookRuns[idx]를 먼저 펼치므로 response 이벤트가 runId를 안 실어도 유지된다).
 * renderer 내부 전용 — shared 계약 무접촉(reducer.ts 호출부만 agentPayload.runId 전달).
 */
export function handleHookLifecycle(state: AppState, event: HookLifecycleEvent, time?: string, runId?: string): AppState {
  const { phase, hookId, hookName, hookEvent } = event
  const idx = state.hookRuns.findIndex((r) => r.hookId === hookId)

  if (phase === 'started') {
    if (idx !== -1) return state // 이미 존재 — 중복 append 0
    const entry: HookRun = {
      hookId,
      hookName,
      hookEvent,
      status: 'running',
      ...(time !== undefined ? { time } : {}),
      ...(runId !== undefined ? { runId } : {}),
    }
    const nextRuns = [...state.hookRuns, entry]
    // cap 200 — 초과분은 오래된 것부터 드롭
    const trimmed = nextRuns.length > HOOK_RUNS_CAP ? nextRuns.slice(nextRuns.length - HOOK_RUNS_CAP) : nextRuns
    return { ...state, hookRuns: trimmed }
  }

  if (phase === 'response') {
    if (idx === -1) {
      // 방어적 append(started 유실) — 페어링 실패해도 기록 자체는 보존
      const entry: HookRun = {
        hookId,
        hookName,
        hookEvent,
        status: event.outcome ?? 'success',
        ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
        ...(event.stdout !== undefined ? { stdout: event.stdout } : {}),
        ...(event.stderr !== undefined ? { stderr: event.stderr } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
        ...(time !== undefined ? { time } : {}),
        ...(runId !== undefined ? { runId } : {}),
      }
      const nextRuns = [...state.hookRuns, entry]
      const trimmed = nextRuns.length > HOOK_RUNS_CAP ? nextRuns.slice(nextRuns.length - HOOK_RUNS_CAP) : nextRuns
      return { ...state, hookRuns: trimmed }
    }
    const updated: HookRun = {
      ...state.hookRuns[idx],
      status: event.outcome ?? 'success',
      ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
      ...(event.stdout !== undefined ? { stdout: event.stdout } : {}),
      ...(event.stderr !== undefined ? { stderr: event.stderr } : {}),
      ...(event.output !== undefined ? { output: event.output } : {}),
      // started runId 보존(위 spread) — response가 runId를 새로 실어오면 그 값으로 갱신.
      ...(runId !== undefined ? { runId } : {}),
    }
    const nextRuns = [...state.hookRuns]
    nextRuns[idx] = updated
    return { ...state, hookRuns: nextRuns }
  }

  // phase === 'progress' — 매칭 있을 때만 stdout/stderr/output 병합(status 유지)
  if (idx === -1) return state
  const updated: HookRun = {
    ...state.hookRuns[idx],
    ...(event.stdout !== undefined ? { stdout: event.stdout } : {}),
    ...(event.stderr !== undefined ? { stderr: event.stderr } : {}),
    ...(event.output !== undefined ? { output: event.output } : {}),
  }
  const nextRuns = [...state.hookRuns]
  nextRuns[idx] = updated
  return { ...state, hookRuns: nextRuns }
}

/**
 * informational 이벤트 → thread 인라인 item push(S-03 훅 콕핏 (b)).
 *
 * dedup 없음(연속 배너가 각각 다른 사유일 수 있어 model-fallback류와 달리 병합 판단이
 * 위험 — 소음억제는 HookTimeline 접힘 UI가 담당하고 이 경로는 정확성 우선).
 * id 접두 'inf'(model-fallback 'fb'/orchestration_denied 'dn'/compact-boundary 'cb'와 충돌 0).
 */
export function handleInformational(state: AppState, event: InformationalEvent, time?: string): AppState {
  const nextSeq = state.seq + 1
  const item: ThreadItem = {
    kind: 'informational',
    id: `inf${nextSeq}`,
    content: event.content,
    level: event.level,
    ...(event.preventContinuation !== undefined ? { preventContinuation: event.preventContinuation } : {}),
    ...(event.toolUseId !== undefined ? { toolUseId: event.toolUseId } : {}),
    ...(time !== undefined ? { time } : {}),
  }
  return {
    ...state,
    thread: [...state.thread, item],
    seq: nextSeq,
  }
}

/**
 * permission_denied 이벤트 → thread 인라인 item push(S-03 훅 콕핏 (c)).
 *
 * dedup 없음 — 자동거부 사유는 사용자의 규칙 튜닝 근거라 하나도 누락되면 안 된다
 * (뭉뚱그림 금지, 브리프 명시). id 접두 'pd'(다른 notice류와 충돌 0).
 */
export function handlePermissionDenied(state: AppState, event: PermissionDeniedEvent, time?: string): AppState {
  const nextSeq = state.seq + 1
  const item: ThreadItem = {
    kind: 'permission-denied',
    id: `pd${nextSeq}`,
    toolName: event.toolName,
    ...(event.decisionReasonType !== undefined ? { decisionReasonType: event.decisionReasonType } : {}),
    ...(event.decisionReason !== undefined ? { decisionReason: event.decisionReason } : {}),
    ...(time !== undefined ? { time } : {}),
  }
  return {
    ...state,
    thread: [...state.thread, item],
    seq: nextSeq,
  }
}

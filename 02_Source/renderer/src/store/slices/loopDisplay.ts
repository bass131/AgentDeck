/**
 * slices/loopDisplay.ts — 단일챗 loops/goal 배너 표시 상태의 앱수명 레지스트리 배선 (BF3 P07).
 *
 * sessions.ts(bgRuns 축출·conversationLoad 디스크 복원)와 runtime.ts(subscribeAgentEvents
 * 백그라운드 경로)가 공유하는 얇은 유틸 — ids.ts/conversationPayload.ts와 동일한 슬라이스 간
 * 공유 모듈 관례. loopDisplayRegistry.ts(팩토리)의 conversationId 키 인스턴스를 여기서 1개
 * 생성해 두 슬라이스가 같은 Map을 바라보게 한다.
 *
 * reviewer 🔴 봉합(2026-07-03): sessionLoopDisplayRegistry만으로는 부족했다 — bgRuns가
 * 축출되면 runtime.ts의 bgHit 매칭(`s.currentRunId === payload.runId`, s는 bgRuns의 VALUE)
 * 자체가 불가능해져, 그 이후 도착하는 loops:[](루프 자연종료)가 레지스트리에 영영 안 닿는다
 * (경로3 드롭). 그 결과 레지스트리에 죽은 루프의 배너가 stale 잔존 — "소실"이 아니라
 * "부활"(LR2-03 재림) 방향의 결함. 패널(panelSession.ts runIdToPanelKey)처럼 bgRuns 축출과
 * 무관하게 생존하는 내구 runId→conversationId 라우팅을 단일챗에도 둔다 — 이 라우팅은
 * "표시 트리오 정리 이벤트가 레지스트리에 닿게" 하는 최소 폴백 전용이다(thread 등 전체 상태
 * 복원 목적 아님 — bgRuns 자체가 없으니 그건 여전히 불가능·Phase 07 범위 밖 그대로).
 *
 * CRITICAL: 순수 in-memory — window.api/Node/fs 0. 디스크 영속 절대 금지(불변조건, 07 Phase).
 */
import { createLoopDisplayRegistry, isEmptyLoopDisplaySnapshot } from '../loopDisplayRegistry'
import type { LoopDisplaySnapshot } from '../loopDisplayRegistry'
import type { AgentEvent } from '../../../../shared/agent-events'

/** conversationId 키 레지스트리 — sessions.ts(write/read)·runtime.ts(write) 공유 인스턴스. */
export const sessionLoopDisplayRegistry = createLoopDisplayRegistry()

/**
 * syncConversationLoopDisplay — 표시 트리오를 conversationId 키로 write-through.
 * id가 null이면 no-op(아직 디스크에 저장되지 않은 대화 — bgRuns 축출/디스크 재로드 대상이
 * 될 수 없으므로 레지스트리에 남길 필요가 없다).
 */
export function syncConversationLoopDisplay(id: string | null, snapshot: LoopDisplaySnapshot): void {
  if (id === null) return
  sessionLoopDisplayRegistry.sync(id, snapshot)
}

// ── 내구 runId→conversationId 라우팅 (reviewer 🔴 봉합, panelSession.ts runIdToPanelKey 미러) ──

/**
 * runIdToConversationId — bgRuns 축출과 무관하게 생존하는 내구 라우팅.
 * 등록: 대화가 백그라운드로 밀려나는 순간(leave-스냅샷, sessions.ts). 제거: 전경 복귀 흡수·
 * 표시 트리오가 완전히 비어 더 이상 폴백이 무의미해진 시점·대화 영구 삭제.
 */
const runIdToConversationId = new Map<string, string>()

/**
 * registerConversationRun — leave-스냅샷 시점에 runId→conversationId를 등록한다.
 * 같은 conversationId를 가리키던 이전(다른 run의) 엔트리는 교체-정리한다(누수 방지 —
 * panelSession.ts dispatchToPanelManager의 SET_RUN_ID 교체-정리와 동형 취지).
 * runId===null이면 no-op(스냅샷 조건상 사실상 발생하지 않음 — 방어적).
 */
export function registerConversationRun(runId: string | null, conversationId: string): void {
  if (runId === null) return
  for (const [rid, cid] of runIdToConversationId) {
    if (cid === conversationId && rid !== runId) runIdToConversationId.delete(rid)
  }
  runIdToConversationId.set(runId, conversationId)
}

/**
 * unregisterConversationRun — runId 라우팅 명시 제거.
 * 호출 지점: (a) 전경 복귀 흡수(selectConversation bg-restore — 이후 이 run의 이벤트는
 * 정상 경로1이 처리하므로 폴백 라우팅 불필요) (b) 표시 트리오가 완전히 비어 폴백이
 * 더 이상 무의미해진 시점(runtime.ts 2.5경로).
 */
export function unregisterConversationRun(runId: string | null | undefined): void {
  if (!runId) return
  runIdToConversationId.delete(runId)
}

/** unregisterConversationRunsFor — conversationId를 가리키는 모든 라우팅 제거(대화 영구 삭제 시 정리 대칭). */
export function unregisterConversationRunsFor(conversationId: string): void {
  for (const [rid, cid] of runIdToConversationId) {
    if (cid === conversationId) runIdToConversationId.delete(rid)
  }
}

/** lookupConversationForRun — runId → conversationId(없으면 undefined). */
export function lookupConversationForRun(runId: string): string | undefined {
  return runIdToConversationId.get(runId)
}

/**
 * syncConversationLoopDisplayAndRouting — leave-스냅샷 시점의 표시 트리오 write-through +
 * 내구 라우팅 등록/정리를 한 곳에서 일관되게 처리한다(sessions.ts의 두 leave-스냅샷
 * 호출부가 공유 — drift 방지).
 *
 * 트리오가 비어 있으면(이 대화는 애초에 배너 이력이 없음) 라우팅도 등록하지 않는다 —
 * 그렇지 않으면 "루프 없는 평범한 대화"를 떠날 때마다 라우팅 엔트리가 쌓여 맵이
 * 무의미하게 커진다(reviewer 🔴 봉합 검증 중 실측 — 누수 회귀). 트리오가 비어 있고
 * 과거 등록이 남아있었다면(예: 이전 leave는 루프가 있었으나 이번엔 끝난 경우) 그 잔존도
 * 함께 정리한다.
 */
export function syncConversationLoopDisplayAndRouting(
  id: string | null,
  runId: string | null,
  snapshot: LoopDisplaySnapshot
): void {
  if (id === null) return
  sessionLoopDisplayRegistry.sync(id, snapshot)
  if (isEmptyLoopDisplaySnapshot(snapshot)) {
    unregisterConversationRunsFor(id)
  } else {
    registerConversationRun(runId, id)
  }
}

/**
 * applyLoopDisplayEventFallback — bgRuns가 이미 축출된 conversationId에 대해 loops/done/error
 * 이벤트의 "표시 트리오 효과"만 레지스트리에 직접 반영한다.
 *
 * reducer(reducer/lifecycle.ts handleLoops/handleDone/handleError) 전체를 재사용하지 않는다 —
 * 그러려면 thread 등을 포함한 완전한 AppState가 필요한데, bgRuns 자체가 없으므로 그 상태는
 * 이미 소실 수용 범위(Phase 07은 표시 트리오만 봉합 대상, thread 복원은 대상 아님)다. 대신
 * 두 핸들러의 "표시 트리오 관련 부분"만 정확히 미러한다:
 *   - loops: activeLoops 덮어쓰기 + (비어있지 않으면) loopsStoppedNotice 자동 해제 — handleLoops와 동형.
 *   - done/error: pendingCommand 무조건 null — handleDone/handleError와 동형(카드 종료).
 *   - 그 외 이벤트(text/tool_call 등): 표시 트리오 무관 — no-op.
 *
 * BL1 P03(stale-watchdog): nowMs(선택, epoch ms) — 전달되면 (a) autonomy_status 이벤트로
 * autonomyActive도 함께 갱신하고 (b) 모든 이벤트 타입에 대해 lastActivityAt을 write-through
 * 한다(활동 신호 — bgRuns가 이미 축출된 대화도 stale 판정 연속성을 잃지 않도록). 미전달
 * (구 호출부·기존 테스트)이면 기존 거동 그대로(완전 하위호환 — loops/done/error 3종만
 * 처리, 그 외 이벤트는 완전 no-op).
 *
 * CRITICAL: 순수 함수 아님(레지스트리에 직접 sync) — 그러나 window.api/Node/fs 0.
 */
export function applyLoopDisplayEventFallback(conversationId: string, event: AgentEvent, nowMs?: number): void {
  const prev = sessionLoopDisplayRegistry.read(conversationId)
  const base: LoopDisplaySnapshot = prev ?? {
    activeLoops: [], loopsStoppedNotice: false, pendingCommand: null, autonomyActive: false, lastActivityAt: null,
    goalRun: null,
  }
  const stampedLastActivityAt = nowMs ?? base.lastActivityAt ?? null

  if (event.type === 'loops') {
    sessionLoopDisplayRegistry.sync(conversationId, {
      activeLoops: event.loops,
      loopsStoppedNotice: event.loops.length > 0 ? false : base.loopsStoppedNotice,
      pendingCommand: base.pendingCommand,
      autonomyActive: base.autonomyActive,
      lastActivityAt: stampedLastActivityAt,
      // BL1 후속: loops는 goal 컨텍스트와 무관 — 불변 그대로 전달.
      goalRun: base.goalRun,
    })
    return
  }
  if (event.type === 'done' || event.type === 'error') {
    sessionLoopDisplayRegistry.sync(conversationId, {
      activeLoops: base.activeLoops,
      loopsStoppedNotice: base.loopsStoppedNotice,
      pendingCommand: null,
      // error는 handleError(reducer/lifecycle.ts)와 동형으로 autonomyActive를 즉시 끈다
      // (터미널 리셋). done은 지속세션 턴 경계에서 autonomyActive를 불변으로 두는
      // handleDone과 동형.
      autonomyActive: event.type === 'error' ? false : base.autonomyActive,
      lastActivityAt: stampedLastActivityAt,
      // BL1 후속: handleError/handleDone과 동형 — error만 goalRun 소멸(종료 신호),
      // done은 턴 경계 불변(goalRun이 살아남아야 함).
      goalRun: event.type === 'error' ? null : base.goalRun,
    })
    return
  }
  if (event.type === 'autonomy_status') {
    sessionLoopDisplayRegistry.sync(conversationId, {
      activeLoops: base.activeLoops,
      loopsStoppedNotice: base.loopsStoppedNotice,
      pendingCommand: base.pendingCommand,
      autonomyActive: event.status === 'active',
      lastActivityAt: stampedLastActivityAt,
      // BL1 후속: handleAutonomyStatus와 동형 — ended만 goalRun 소멸, active는 불변.
      goalRun: event.status === 'active' ? base.goalRun : null,
    })
    return
  }
  // 그 외 이벤트 — nowMs 미전달(하위호환)이면 완전 no-op(기존 거동). nowMs 전달 시(BL1 P03)
  // 활동 스탬프만 write-through(트리오 자체는 불변 — 이 함수의 원 계약 유지). 등록된 적
  // 없는 conversationId(prev undefined)이고 autonomyActive도 goalRun도 아니면 신규 엔트리를
  // 만들지 않는다(기존 "신규 생성 안 함" 관례 유지).
  if (nowMs === undefined) return
  if (prev === undefined && !base.autonomyActive && !base.goalRun) return
  sessionLoopDisplayRegistry.sync(conversationId, { ...base, lastActivityAt: nowMs })
}

/** 테스트 전용 리셋. */
export function __resetSessionLoopDisplayForTests(): void {
  sessionLoopDisplayRegistry.__resetForTests()
  runIdToConversationId.clear()
}

/** 테스트 전용 크기 관측(누수 회귀 가드). */
export function __getSessionLoopDisplaySizeForTests(): number {
  return sessionLoopDisplayRegistry.__sizeForTests()
}

/** 테스트 전용 라우팅 맵 크기 관측(누수 회귀 가드). */
export function __getSessionRunRoutingSizeForTests(): number {
  return runIdToConversationId.size
}

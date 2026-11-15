import { isEmptyLoopDisplaySnapshot } from './loopDisplayRegistry'
import type { LoopDisplayRegistry, LoopDisplaySnapshot } from './loopDisplayRegistry'
import type { AgentEvent } from '../../../../shared/agentEvents'
import { convKey, conversationIdOfKey, keyKind } from './sessionKeys'
import { sessionRegistry } from './sessionRegistry'

// 대화 종류의 루프 표시·runId 라우팅 보기 — 거처는 세션 레지스트리 한 벌이고(G9c), 여기 함수들은 대화 id를
// 레지스트리 키 convKey(id)로 바꿔 넘기는 얇은 포장이다. 대화 쪽 정책(떠날 때 sync, 비면 라우팅 제거,
// 대체 처리)은 이 파일과 runtime·sessions가 그대로 갖는다.

const isConvKey = (k: string): boolean => keyKind(k) === 'conv'

export const sessionLoopDisplayRegistry: LoopDisplayRegistry = {
  sync: (id, snapshot) => sessionRegistry.loopDisplay.sync(convKey(id), snapshot),
  read: (id) => sessionRegistry.loopDisplay.read(convKey(id)),
  clear: (id) => sessionRegistry.loopDisplay.clear(convKey(id)),
  clearByPrefix: (prefix) => sessionRegistry.loopDisplay.clearByPrefix(convKey(prefix)),
  clearWhere: (pred) => sessionRegistry.loopDisplay.clearWhere((k) => {
    const id = isConvKey(k) ? conversationIdOfKey(k) : undefined
    return typeof id === 'string' && pred(id)
  }),
  countWhere: (pred) => sessionRegistry.loopDisplay.countWhere((k) => {
    const id = isConvKey(k) ? conversationIdOfKey(k) : undefined
    return typeof id === 'string' && pred(id)
  }),
  __resetForTests: () => sessionRegistry.loopDisplay.clearWhere(isConvKey),
  __sizeForTests: () => sessionRegistry.loopDisplay.countWhere(isConvKey),
}

export function syncConversationLoopDisplay(id: string | null, snapshot: LoopDisplaySnapshot): void {
  if (id === null) return
  sessionLoopDisplayRegistry.sync(id, snapshot)
}

// 라우팅(대화 정책) — 대화 하나에 runId 하나. 새 run을 붙이면 그 대화의 다른 run 라우팅은 지운다.
export function registerConversationRun(runId: string | null, conversationId: string): void {
  if (runId === null) return
  const key = convKey(conversationId)
  sessionRegistry.unrouteKey(key, runId)
  sessionRegistry.route(runId, key)
}

export function unregisterConversationRun(runId: string | null | undefined): void {
  if (!runId) return
  const key = sessionRegistry.lookup(runId)
  if (key !== undefined && isConvKey(key)) sessionRegistry.unroute(runId)
}

export function unregisterConversationRunsFor(conversationId: string): void {
  sessionRegistry.unrouteKey(convKey(conversationId))
}

export function lookupConversationForRun(runId: string): string | undefined {
  const key = sessionRegistry.lookup(runId)
  if (key === undefined || !isConvKey(key)) return undefined
  return conversationIdOfKey(key) ?? undefined
}

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

// 대체 처리(대화 정책) — 상태가 bg에서 빠진 뒤(축출)에도 라우팅이 남은 run의 이벤트를 루프 표시에만 반영한다.
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
      goalRun: base.goalRun,
    })
    return
  }
  if (event.type === 'done' || event.type === 'error') {
    sessionLoopDisplayRegistry.sync(conversationId, {
      activeLoops: base.activeLoops,
      loopsStoppedNotice: base.loopsStoppedNotice,
      pendingCommand: null,
      autonomyActive: event.type === 'error' ? false : base.autonomyActive,
      lastActivityAt: stampedLastActivityAt,
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
      goalRun: event.status === 'active' ? base.goalRun : null,
    })
    return
  }
  if (nowMs === undefined) return
  if (prev === undefined && !base.autonomyActive && !base.goalRun) return
  sessionLoopDisplayRegistry.sync(conversationId, { ...base, lastActivityAt: nowMs })
}

// 대화 몫(루프 표시·라우팅)만 비운다 — 패널 쪽은 건드리지 않는다.
export function __resetSessionLoopDisplayForTests(): void {
  sessionRegistry.loopDisplay.clearWhere(isConvKey)
  sessionRegistry.unrouteWhere(isConvKey)
}

export function __getSessionLoopDisplaySizeForTests(): number {
  return sessionRegistry.__loopDisplayCountForTests('conv')
}

export function __getSessionRunRoutingSizeForTests(): number {
  return sessionRegistry.__routeCountForTests('conv')
}

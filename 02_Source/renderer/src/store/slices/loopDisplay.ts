import { createLoopDisplayRegistry, isEmptyLoopDisplaySnapshot } from '../loopDisplayRegistry'
import type { LoopDisplaySnapshot } from '../loopDisplayRegistry'
import type { AgentEvent } from '../../../../shared/agentEvents'

export const sessionLoopDisplayRegistry = createLoopDisplayRegistry()

export function syncConversationLoopDisplay(id: string | null, snapshot: LoopDisplaySnapshot): void {
  if (id === null) return
  sessionLoopDisplayRegistry.sync(id, snapshot)
}

const runIdToConversationId = new Map<string, string>()

export function registerConversationRun(runId: string | null, conversationId: string): void {
  if (runId === null) return
  for (const [rid, cid] of runIdToConversationId) {
    if (cid === conversationId && rid !== runId) runIdToConversationId.delete(rid)
  }
  runIdToConversationId.set(runId, conversationId)
}

export function unregisterConversationRun(runId: string | null | undefined): void {
  if (!runId) return
  runIdToConversationId.delete(runId)
}

export function unregisterConversationRunsFor(conversationId: string): void {
  for (const [rid, cid] of runIdToConversationId) {
    if (cid === conversationId) runIdToConversationId.delete(rid)
  }
}

export function lookupConversationForRun(runId: string): string | undefined {
  return runIdToConversationId.get(runId)
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

export function __resetSessionLoopDisplayForTests(): void {
  sessionLoopDisplayRegistry.__resetForTests()
  runIdToConversationId.clear()
}

export function __getSessionLoopDisplaySizeForTests(): number {
  return sessionLoopDisplayRegistry.__sizeForTests()
}

export function __getSessionRunRoutingSizeForTests(): number {
  return runIdToConversationId.size
}

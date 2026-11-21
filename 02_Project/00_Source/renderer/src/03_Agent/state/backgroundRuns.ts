import type { ConversationRunState } from '@renderer/00_App/state/types'
import { isRunningRetained, pickEvictions } from './runCore'
import { convKey, conversationIdOfKey } from './sessionKeys'
import { sessionRegistry } from './sessionRegistry'

// 대화를 떠날 때(detach) 전경 저장 칸의 스냅샷을 세션 레지스트리에 넣고, 돌아올 때(attach) 꺼내 전경에 쓴다.
// 대기열(queue)은 스냅샷에 넣지 않는다.

export function backgroundRunOf(conversationId: string): ConversationRunState | undefined {
  return sessionRegistry.get<ConversationRunState>(convKey(conversationId))
}

// 이미 있는 대화면 자리(축출 순서)는 그대로 두고 값만 바꾼다.
export function putBackgroundRun(conversationId: string, state: ConversationRunState): void {
  sessionRegistry.set(convKey(conversationId), state)
}

export function deleteBackgroundRun(conversationId: string): void {
  const key = convKey(conversationId)
  if (sessionRegistry.has(key)) sessionRegistry.delete(key)
}

// 삽입 순서(오래된 것부터)다.
function backgroundRunEntries(): Array<[string, ConversationRunState]> {
  const out: Array<[string, ConversationRunState]> = []
  for (const [key, state] of sessionRegistry.entries<ConversationRunState>('conv')) {
    const id = conversationIdOfKey(key)
    if (typeof id === 'string') out.push([id, state])
  }
  return out
}

export function findBackgroundRunByRunId(runId: string): [string, ConversationRunState] | undefined {
  return backgroundRunEntries().find(([, s]) => s.currentRunId === runId)
}

// 넘치면 오래된 것부터 버리되 실행 중인 run은 남긴다.
export function capBackgroundRuns(cap: number): void {
  const entries = backgroundRunEntries()
  const evicted = pickEvictions(entries, entries.length, cap, isRunningRetained)
  for (const id of evicted) deleteBackgroundRun(id)
}

export function __backgroundRunOf(conversationId: string): ConversationRunState | undefined {
  return backgroundRunOf(conversationId)
}

export function __backgroundRunIdsForTests(): string[] {
  return backgroundRunEntries().map(([id]) => id)
}

export function __seedBackgroundRunsForTests(runs: Record<string, ConversationRunState>): void {
  for (const [id, state] of Object.entries(runs)) putBackgroundRun(id, state)
}

export function __resetBackgroundRunsForTests(): void {
  for (const [id] of backgroundRunEntries()) deleteBackgroundRun(id)
}

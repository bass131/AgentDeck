import type { LoopInfo } from '../../../shared/agentEvents'

export interface LoopDisplayPendingCommand {
  name: string
  cardId: string
  beforeMsgs: number
  turns?: number
  detail?: string | null
}

export interface LoopDisplaySnapshot {
  activeLoops: LoopInfo[]
  loopsStoppedNotice: boolean
  pendingCommand?: LoopDisplayPendingCommand | null
  autonomyActive?: boolean
  lastActivityAt?: number | null
  goalRun?: { detail: string | null; turns: number; startedAt: number } | null
}

export interface LoopDisplayRegistry {
  sync: (key: string, snapshot: LoopDisplaySnapshot) => void
  read: (key: string) => LoopDisplaySnapshot | undefined
  clear: (key: string) => void
  clearByPrefix: (prefix: string) => void
  __resetForTests: () => void
  __sizeForTests: () => number
}

export function isEmptyLoopDisplaySnapshot(v: LoopDisplaySnapshot): boolean {
  return v.activeLoops.length === 0 && !v.loopsStoppedNotice && !v.pendingCommand && !v.autonomyActive && !v.goalRun
}

export function createLoopDisplayRegistry(): LoopDisplayRegistry {
  const map = new Map<string, LoopDisplaySnapshot>()
  return {
    sync(key, snapshot) {
      if (isEmptyLoopDisplaySnapshot(snapshot)) {
        map.delete(key)
        return
      }
      map.set(key, {
        activeLoops: snapshot.activeLoops,
        loopsStoppedNotice: snapshot.loopsStoppedNotice,
        pendingCommand: snapshot.pendingCommand ?? null,
        autonomyActive: snapshot.autonomyActive ?? false,
        lastActivityAt: snapshot.lastActivityAt ?? null,
        goalRun: snapshot.goalRun ?? null,
      })
    },
    read(key) {
      return map.get(key)
    },
    clear(key) {
      map.delete(key)
    },
    clearByPrefix(prefix) {
      for (const k of Array.from(map.keys())) {
        if (k.startsWith(prefix)) map.delete(k)
      }
    },
    __resetForTests() {
      map.clear()
    },
    __sizeForTests() {
      return map.size
    },
  }
}

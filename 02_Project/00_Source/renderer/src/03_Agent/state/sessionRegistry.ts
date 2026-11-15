import type { AgentEventPayload } from '@shared/ipcContract'
import { createLoopDisplayRegistry } from './loopDisplayRegistry'
import type { LoopDisplayRegistry } from './loopDisplayRegistry'
import { createStaleWatchdogs } from './runCore'
import type { RunCoreState } from './runReducer'
import { keyKind } from './sessionKeys'
import type { SessionKind } from './sessionKeys'

// 세션 레지스트리 — 키(`conv:<id|draft>`, `multi:<id>:slot:<n>`)별 run 상태의 거처 하나(G9c).
// 키별 상태 Map, runId → 키 라우팅, 루프 표시 레지스트리, stale 타이머, `onAgentEvent` 구독을 한 벌로 둔다.
// React에 기대지 않는 모듈 store다. 종류(대화·패널)마다 다른 정책은 어댑터가 defineKind 포트로 넘기고,
// 이 파일 안에는 종류 분기가 없다. 전경 대화(활성 키)의 상태는 Map이 아니라 그 종류의 활성 저장 칸(zustand
// 평탄화 필드)에 산다 — 안 A, G9c 결정 대장 [AI].

export interface RegistryEntry {
  isRunning: boolean
  currentRunId: string | null
}

export interface KindPolicy {
  // stale 타이머가 만료됐을 때(그 키의 배너를 stale로 표시한다)
  markStale: (key: string) => void
  // 활동이 이어져 stale이 아닐 때. 없으면 아무것도 안 한다.
  onFresh?: (key: string) => void
  // 이 종류가 맡을 이벤트면 적용한다. 같은 이벤트를 다른 종류도 받는다(종류마다 독립 구독이던 옛 동작).
  handleEvent: (payload: AgentEventPayload) => void
  // 활성 키의 저장 칸(안 A) — 있으면 그 키의 상태는 Map이 아니라 여기서 읽는다.
  active?: {
    key: () => string
    read: () => RegistryEntry
  }
}

const KIND_ORDER: SessionKind[] = ['conv', 'panel']

const states = new Map<string, RegistryEntry>()
const keyListeners = new Map<string, Set<() => void>>()
const changeListeners = new Set<() => void>()
const routes = new Map<string, string>()
const lives = new Map<string, number>()
const policies = new Map<SessionKind, KindPolicy>()
const holders: Record<SessionKind, number> = { conv: 0, panel: 0 }

// 실행 중인 Map 항목의 키 집합 — 바뀔 때만 새 Set으로 갈고 구독자에게 알린다(B1 Sidebar가 읽는다).
let runningKeys: ReadonlySet<string> = new Set()

function policyOf(key: string): KindPolicy | undefined {
  const kind = keyKind(key)
  return kind ? policies.get(kind) : undefined
}

function syncRunning(key: string): void {
  const now = states.get(key)?.isRunning === true
  if (runningKeys.has(key) === now) return
  const next = new Set(runningKeys)
  if (now) next.add(key)
  else next.delete(key)
  runningKeys = next
  for (const l of Array.from(changeListeners)) l()
}

const loopDisplay: LoopDisplayRegistry = createLoopDisplayRegistry()

const watchdogs = createStaleWatchdogs({
  markStale: (key) => policyOf(key)?.markStale(key),
  onFresh: (key) => policyOf(key)?.onFresh?.(key),
})

let physical: { source: unknown; unsubscribe: unknown } | null = null

function dispatchEvent(payload: AgentEventPayload): void {
  for (const kind of KIND_ORDER) {
    if (holders[kind] <= 0) continue
    policies.get(kind)?.handleEvent(payload)
  }
}

function unbindPhysical(): void {
  const prev = physical
  physical = null
  if (prev && typeof prev.unsubscribe === 'function') (prev.unsubscribe as () => void)()
}

function bindPhysical(): void {
  unbindPhysical()
  const source = window.api.onAgentEvent
  physical = { source, unsubscribe: source(dispatchEvent) }
}

function totalHolders(): number {
  return KIND_ORDER.reduce((n, k) => n + holders[k], 0)
}

export const sessionRegistry = {
  defineKind(kind: SessionKind, policy: KindPolicy): void {
    policies.set(kind, policy)
  },

  // ── 키별 상태 ──
  get<S extends RegistryEntry = RunCoreState>(key: string): S | undefined {
    return states.get(key) as S | undefined
  },
  has(key: string): boolean {
    return states.has(key)
  },
  set(key: string, state: RegistryEntry): void {
    states.set(key, state)
    syncRunning(key)
  },
  delete(key: string): void {
    states.delete(key)
    syncRunning(key)
  },
  // 삽입 순서(보관 상한의 축출 순서)를 지킨다.
  entries<S extends RegistryEntry = RunCoreState>(kind: SessionKind): Array<[string, S]> {
    const out: Array<[string, S]> = []
    for (const [k, v] of states) if (keyKind(k) === kind) out.push([k, v as S])
    return out
  },
  size(kind: SessionKind): number {
    let n = 0
    for (const k of states.keys()) if (keyKind(k) === kind) n += 1
    return n
  },
  // 실행 중 판정 — 활성 키면 그 종류의 저장 칸, 아니면 Map 항목.
  isRunning(key: string): boolean {
    const active = policyOf(key)?.active
    if (active && active.key() === key) return active.read().isRunning
    return states.get(key)?.isRunning === true
  },
  runningKeys(): ReadonlySet<string> {
    return runningKeys
  },
  subscribe(listener: () => void): () => void {
    changeListeners.add(listener)
    return () => { changeListeners.delete(listener) }
  },

  // ── 키 생애(Backlog 46) — forget이 올린다. 전송 중에 키가 폐기됐는지 가르는 데 쓴다. ──
  life(key: string): number {
    return lives.get(key) ?? 0
  },
  // 폐기 — 상태·키 구독자·라우팅·타이머를 지우고 생애를 올린다. 루프 표시는 종류 정책대로 호출부가 정리한다.
  forget(key: string): void {
    states.delete(key)
    keyListeners.delete(key)
    for (const [rid, k] of Array.from(routes)) {
      if (k === key) routes.delete(rid)
    }
    watchdogs.dispose(key)
    lives.set(key, (lives.get(key) ?? 0) + 1)
    syncRunning(key)
  },

  // ── 키 구독자(패널 화면) ──
  subscribeKey(key: string, listener: () => void): () => void {
    let set = keyListeners.get(key)
    if (!set) {
      set = new Set()
      keyListeners.set(key, set)
    }
    set.add(listener)
    return () => {
      const s = keyListeners.get(key)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) keyListeners.delete(key)
    }
  },
  keyListenerCount(key: string): number {
    return keyListeners.get(key)?.size ?? 0
  },
  notifyKey(key: string): void {
    const ls = keyListeners.get(key)
    if (!ls) return
    for (const l of ls) l()
  },

  // ── runId → 키 라우팅 ──
  route(runId: string, key: string): void {
    routes.set(runId, key)
  },
  unroute(runId: string): void {
    routes.delete(runId)
  },
  // 그 키로 가는 라우팅을 지운다. exceptRunId는 남긴다.
  unrouteKey(key: string, exceptRunId?: string): void {
    for (const [rid, k] of Array.from(routes)) {
      if (k === key && rid !== exceptRunId) routes.delete(rid)
    }
  },
  unrouteWhere(pred: (key: string) => boolean): void {
    for (const [rid, k] of Array.from(routes)) {
      if (pred(k)) routes.delete(rid)
    }
  },
  lookup(runId: string): string | undefined {
    return routes.get(runId)
  },

  // ── 루프 표시 레지스트리(키 = 레지스트리 키) ──
  loopDisplay,

  // ── stale 타이머(키마다 하나) ──
  refreshStale(key: string, state: RunCoreState | undefined): void {
    watchdogs.refresh(key, state)
  },
  disposeStale(key: string): void {
    watchdogs.dispose(key)
  },

  // ── onAgentEvent 구독 — 실제 구독은 하나이고 종류마다 몫을 센다. ──
  // rebind면 지금의 window.api로 다시 붙는다(단일 Shell 마운트). 아니면 함수가 바뀌었을 때만 다시 붙는다.
  acquireEvents(kind: SessionKind, opts: { rebind: boolean }): () => void {
    holders[kind] += 1
    if (opts.rebind || !physical || physical.source !== window.api.onAgentEvent) bindPhysical()
    let released = false
    return () => {
      if (released) return
      released = true
      holders[kind] -= 1
      if (totalHolders() === 0) unbindPhysical()
    }
  },

  // 몫을 새로 잡지 않고, 실제 구독이 옛 window.api.onAgentEvent에 붙어 있으면 지금 것으로 다시 붙는다.
  rebindIfChanged(): void {
    if (physical && physical.source !== window.api.onAgentEvent) bindPhysical()
  },

  // ── 테스트 전용 — 한 종류의 몫만 비운다. 다른 종류의 상태·구독은 건드리지 않는다. ──
  __resetKindForTests(kind: SessionKind): void {
    for (const k of Array.from(states.keys())) if (keyKind(k) === kind) states.delete(k)
    for (const k of Array.from(keyListeners.keys())) if (keyKind(k) === kind) keyListeners.delete(k)
    for (const [rid, k] of Array.from(routes)) if (keyKind(k) === kind) routes.delete(rid)
    for (const k of Array.from(lives.keys())) if (keyKind(k) === kind) lives.delete(k)
    loopDisplay.clearWhere((k) => keyKind(k) === kind)
    watchdogs.disposeWhere((k) => keyKind(k) === kind)
    runningKeys = new Set(Array.from(runningKeys).filter((k) => keyKind(k) !== kind))
  },
  __routeCountForTests(kind: SessionKind): number {
    let n = 0
    for (const k of routes.values()) if (keyKind(k) === kind) n += 1
    return n
  },
  __keyListenerKeyCountForTests(kind: SessionKind): number {
    let n = 0
    for (const k of keyListeners.keys()) if (keyKind(k) === kind) n += 1
    return n
  },
  __loopDisplayCountForTests(kind: SessionKind): number {
    return loopDisplay.countWhere((k) => keyKind(k) === kind)
  },
  __holdersForTests(kind: SessionKind): number {
    return holders[kind]
  },
}

export type SessionRegistry = typeof sessionRegistry

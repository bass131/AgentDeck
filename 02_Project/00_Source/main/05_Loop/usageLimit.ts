// 사용량 한도. 노드 세션의 한도 사건을 창별로 모으고(createLimitTracker), 실행기가 그 모음으로 멈춤을 정한다(decideLimit).
// 한도 멈춤은 판정이 아니라 실행 환경의 사건이다 — 검증 줄을 쓰지 않고 FAIL 계수에 닿지 않으며, 커서를 옮기지 않는다.
//   - 거부·초과 사용·한도 오류: 그 노드를 멈추고 이어 갈 때 그 노드를 처음부터 다시 한다.
//   - 경고: 지금 노드를 끝낸 뒤 다음 노드를 시작하지 않는다.
// 이어 가기(resumeFromLimit)는 자동(풀리는 시각이 지났다)과 사람(「지금 이어 가기」) 둘이다. 둘 다 줄을 쓰지 않는다.
import type { AgentEvent } from '@shared/agentEvents'
import type { LimitAck, LimitReason, RunState, UsageLimitHalt, UsageLimitState } from './runState'
import { scopeOf } from './runState'

const RESUME_MARGIN_MS = 2 * 60_000
const RESET_HORIZON_MS = 8 * 24 * 60 * 60_000

type WindowStatus = 'allowed' | 'allowed_warning' | 'rejected'
interface LimitWindow { window: string | null; status: WindowStatus; resetsAt: number | null; utilization: number | null; overage: boolean }
export interface LimitReport { windows: LimitWindow[]; error: boolean }

interface LimitTracker {
  // 참이면 그 세션을 바로 멈출 사건이다(거부·초과 사용·한도 오류)
  observe(e: AgentEvent): boolean
  report(): LimitReport | null
}

const isHard = (w: LimitWindow): boolean => w.status === 'rejected' || w.overage

// 시각은 받는 때의 시계로 거른다 — 지난 시각·8일보다 먼 시각·창 이름 없음은 다시 걸리는 고리를 만든다
export function createLimitTracker(now: () => number): LimitTracker {
  const windows = new Map<string | null, LimitWindow>()
  let error = false
  let seen = false
  return {
    observe(e) {
      if (e.type === 'rate_limit_error') { seen = true; error = true; return true }
      if (e.type !== 'rate_limit') return false
      seen = true
      const window = e.rateLimitType ?? null
      const at = now()
      const ms = e.resetsAt === undefined ? null : e.resetsAt * 1000
      const resetsAt = window !== null && ms !== null && ms > at && ms - at <= RESET_HORIZON_MS ? e.resetsAt as number : null
      const w: LimitWindow = {
        window, status: e.status, resetsAt, utilization: e.utilization ?? null,
        overage: e.isUsingOverage === true || e.overageInUse === true,
      }
      windows.set(window, w)
      return isHard(w)
    },
    report: () => (seen ? { windows: [...windows.values()], error } : null),
  }
}

export interface LimitDecision {
  kind: 'hard' | 'warning'
  reason: LimitReason
  window: string | null
  resetsAt: number | null
  utilization: number | null
  // 자동으로 이어 갈 시각(ms). 막는 창 하나라도 시각이 없으면 null
  resumeAtMs: number | null
  warned: LimitAck[]
}

const acked = (w: LimitWindow, acks: readonly LimitAck[], nowMs: number): boolean =>
  w.window !== null && acks.some((a) => a.window === w.window && nowMs < a.until * 1000)

export function decideLimit(report: LimitReport | null | undefined, acks: readonly LimitAck[], nowMs: number): LimitDecision | null {
  if (!report) return null
  const hard = report.windows.filter(isHard)
  const warnings = report.windows.filter((w) => w.status === 'allowed_warning' && !isHard(w) && !acked(w, acks, nowMs))
  const blocking = hard.length > 0 || report.error ? hard : warnings
  if (blocking.length === 0 && !report.error) return null
  const reason: LimitReason = hard.some((w) => w.status === 'rejected') ? 'rejected' : hard.length > 0 ? 'overage' : report.error ? 'error' : 'warning'
  const timeless = blocking.length === 0 || blocking.some((w) => w.resetsAt === null)
  const lead = blocking.find((w) => w.resetsAt === null)
    ?? blocking.reduce<LimitWindow | null>((a, w) => (a === null || (w.resetsAt as number) > (a.resetsAt as number) ? w : a), null)
  return {
    kind: reason === 'warning' ? 'warning' : 'hard',
    reason,
    window: lead?.window ?? null,
    resetsAt: lead?.resetsAt ?? null,
    utilization: lead?.utilization ?? null,
    resumeAtMs: timeless || lead === null ? null : (lead.resetsAt as number) * 1000 + RESUME_MARGIN_MS,
    warned: reason === 'warning' ? blocking.flatMap((w) => (w.window !== null && w.resetsAt !== null ? [{ window: w.window, until: w.resetsAt }] : [])) : [],
  }
}

const REASON_WORD: Record<LimitReason, string> = { warning: '경고', rejected: '거부', overage: '초과 사용', error: '한도 오류' }

function limitText(h: UsageLimitHalt): string {
  const reset = h.resetsAt === null ? '풀리는 시각 모름' : `풀리는 시각 ${new Date(h.resetsAt * 1000).toISOString()}`
  const util = h.utilization === null ? '사용률 모름' : `사용률 ${Math.round(h.utilization * 100)}%`
  const head = `사용량 한도(${REASON_WORD[h.reason]}${h.window ? `, ${h.window} 창` : ''}) — ${reset}, ${util}`
  const tail = h.human
    ? '노드 하나도 끝내지 못한 채 한도 멈춤이 두 번 이어져 사람의 「지금 이어 가기」를 기다린다'
    : h.resumeAt === null
      ? '풀리는 시각을 몰라 사람의 「지금 이어 가기」를 기다린다'
      : `${h.resumeAt} 뒤 스스로 이어 간다`
  return `${head}. ${tail}`
}

function withLimit(s: RunState, u: UsageLimitState): void {
  if (u.halt === null && u.streak === 0 && u.acks.length === 0) delete s.usageLimit
  else s.usageLimit = u
}

// 노드가 끝났다(판정이 남았다) — 이어진 멈춤 셈을 지운다
export function settleStreak(state: RunState): RunState {
  if (!state.usageLimit || state.usageLimit.streak === 0) return state
  const s = structuredClone(state)
  withLimit(s, { ...state.usageLimit, streak: 0 })
  return s
}

// 거부·초과·오류는 판정 없이 지금 커서에 건다. 경고는 지금 노드의 판정을 남긴 뒤의 상태에 건다 — 그 판정이 실행을 멈췄거나 끝냈으면 걸지 않는다
export function holdForLimit(state: RunState, d: LimitDecision, at: string): RunState {
  if (d.kind === 'warning' && state.status !== 'running') return settleStreak(state)
  const s = structuredClone(state)
  const prev = s.usageLimit ?? { halt: null, streak: 0, acks: [] }
  const streak = d.kind === 'warning' ? 1 : prev.streak + 1
  const halt: UsageLimitHalt = {
    node: s.cursor.node, goal: scopeOf(s), reason: d.reason, window: d.window, resetsAt: d.resetsAt,
    resumeAt: d.resumeAtMs === null ? null : new Date(d.resumeAtMs).toISOString(),
    utilization: d.utilization, at, human: streak >= 2, warned: d.warned,
  }
  s.status = 'usage-limit'
  s.haltReason = limitText(halt)
  withLimit(s, { ...prev, halt, streak })
  return s
}

export function resumeFromLimit(state: RunState, by: 'auto' | 'human', nowMs: number): { ok: true; state: RunState } | { ok: false; reason: string } {
  const u = state.usageLimit
  const halt = u?.halt ?? null
  if (state.status !== 'usage-limit' || !u || halt === null) return { ok: false, reason: '사용량 한도 멈춤이 아니다' }
  if (by === 'auto') {
    if (halt.human) return { ok: false, reason: '사람의 이어 가기를 기다리는 한도 멈춤이다' }
    if (halt.resumeAt === null) return { ok: false, reason: '풀리는 시각을 몰라 자동으로 이어 가지 않는다' }
    if (nowMs < Date.parse(halt.resumeAt)) return { ok: false, reason: `${halt.resumeAt} 전이다` }
  }
  const s = structuredClone(state)
  s.status = 'running'
  s.haltReason = null
  const acks = [...u.acks, ...(by === 'human' ? halt.warned : [])].filter((a) => nowMs < a.until * 1000)
  withLimit(s, { halt: null, streak: u.streak, acks })
  return { ok: true, state: s }
}

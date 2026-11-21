import { describe, expect, it } from 'vitest'
import { createRunState, validateRunState, type RunState } from '@main/05_Loop/runState'
import { createLimitTracker, decideLimit, holdForLimit, resumeFromLimit, settleStreak, type LimitReport } from '@main/05_Loop/usageLimit'
import type { AgentEvent } from '@shared/agentEvents'
import { AT, drive, loaded } from '../00_Helpers/loopFakes'

const NOW = Date.parse('2026-11-21T09:00:00Z')
const sec = (ms: number): number => Math.floor(ms / 1000)
const HOUR = 3_600_000
const limit = (over: Partial<Extract<AgentEvent, { type: 'rate_limit' }>>): AgentEvent => ({ type: 'rate_limit', status: 'allowed', ...over })

function report(events: AgentEvent[], now = NOW): { hard: boolean[]; report: LimitReport | null } {
  const t = createLimitTracker(() => now)
  const hard = events.map((e) => t.observe(e))
  return { hard, report: t.report() }
}

const T = loaded()
function running(): RunState {
  const made = createRunState(T.template, T.hash, 'M1', 'master')
  if (!made.ok) throw new Error(made.reason)
  return drive(T.template, made.state, { until: 'G1/implement' }).state
}

describe('창별 상태', () => {
  it('5시간 창의 허용이 주간 창의 경고를 지우지 않는다 — 같은 창의 허용만 그 창을 푼다', () => {
    const r = report([
      limit({ status: 'allowed_warning', rateLimitType: 'seven_day', resetsAt: sec(NOW + 48 * HOUR), utilization: 0.81 }),
      limit({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: sec(NOW + 2 * HOUR) }),
    ])
    expect(r.hard).toEqual([false, false])
    expect(decideLimit(r.report, [], NOW)).toMatchObject({ kind: 'warning', reason: 'warning', window: 'seven_day', utilization: 0.81 })
    const cleared = report([
      limit({ status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) }),
      limit({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) }),
    ])
    expect(decideLimit(cleared.report, [], NOW)).toBeNull()
  })

  it('창 이름 없는 허용은 이름 있는 창을 지우지 않는다', () => {
    const r = report([
      limit({ status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) }),
      limit({ status: 'allowed' }),
    ])
    expect(decideLimit(r.report, [], NOW)?.kind).toBe('warning')
  })

  it('거부·초과 사용·한도 오류는 받는 그 자리에서 멈출 사건이다 — 초과 상태 칸(overageStatus)만으로는 멈추지 않는다', () => {
    expect(report([limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) })]).hard).toEqual([true])
    expect(report([limit({ rateLimitType: 'seven_day', isUsingOverage: true })]).hard).toEqual([true])
    expect(report([limit({ rateLimitType: 'seven_day', overageInUse: true })]).hard).toEqual([true])
    expect(report([{ type: 'rate_limit_error' }]).hard).toEqual([true])
    expect(report([limit({ rateLimitType: 'seven_day', isUsingOverage: false, resetsAt: sec(NOW + HOUR) })]).hard).toEqual([false])
    expect(report([{ type: 'text', delta: 'x' }]).report).toBeNull()
  })
})

describe('풀리는 시각', () => {
  it('막고 있는 창들 가운데 가장 늦은 resetsAt에 2분을 더한다', () => {
    const r = report([
      limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) }),
      limit({ status: 'rejected', rateLimitType: 'seven_day', resetsAt: sec(NOW + 30 * HOUR), utilization: 1 }),
      limit({ status: 'allowed_warning', rateLimitType: 'seven_day_opus', resetsAt: sec(NOW + 90 * HOUR) }),
    ])
    const d = decideLimit(r.report, [], NOW)
    expect(d).toMatchObject({ kind: 'hard', reason: 'rejected', window: 'seven_day', utilization: 1 })
    expect(d?.resumeAtMs).toBe(sec(NOW + 30 * HOUR) * 1000 + 120_000)
  })

  it('받을 때 이미 지난 시각, 8일보다 먼 시각, 창 이름 없음은 시각 없음이다 — 그런 창이 막으면 자동으로 이어 가지 않는다', () => {
    for (const bad of [
      limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW - 1000) }),
      limit({ status: 'rejected', rateLimitType: 'seven_day', resetsAt: sec(NOW + 8 * 24 * HOUR + 60_000) }),
      limit({ status: 'rejected', resetsAt: sec(NOW + HOUR) }),
      limit({ status: 'rejected', rateLimitType: 'five_hour' }),
    ]) {
      const d = decideLimit(report([bad]).report, [], NOW)
      expect(d?.kind).toBe('hard')
      expect(d?.resetsAt).toBeNull()
      expect(d?.resumeAtMs).toBeNull()
    }
    const mixed = report([
      limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) }),
      limit({ status: 'rejected', resetsAt: sec(NOW + 2 * HOUR) }),
    ])
    expect(decideLimit(mixed.report, [], NOW)?.resumeAtMs).toBeNull()
  })

  it('사건 없이 한도 오류만 오면 시각 없는 한도 멈춤이다. 사건이 있으면 그 시각을 쓴다', () => {
    expect(decideLimit(report([{ type: 'rate_limit_error' }]).report, [], NOW)).toMatchObject({ kind: 'hard', reason: 'error', resetsAt: null, resumeAtMs: null })
    const both = report([limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) }), { type: 'rate_limit_error' }])
    expect(decideLimit(both.report, [], NOW)?.resumeAtMs).toBe(sec(NOW + HOUR) * 1000 + 120_000)
  })

  it('판정 때 이미 지난 창의 경고로는 멈추지 않는다 — 시각 모르는 경고와 거부는 그대로 막는다', () => {
    const later = NOW + 2 * HOUR
    const warned = report([limit({ status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) })])
    expect(decideLimit(warned.report, [], NOW)?.kind).toBe('warning')
    expect(decideLimit(warned.report, [], later)).toBeNull()
    expect(decideLimit(warned.report, [], sec(NOW + HOUR) * 1000)).toBeNull()
    const timeless = report([limit({ status: 'allowed_warning', rateLimitType: 'five_hour' })])
    expect(decideLimit(timeless.report, [], later)?.kind).toBe('warning')
    const rejected = report([limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) })])
    expect(decideLimit(rejected.report, [], later)?.kind).toBe('hard')
  })

  it('사용률은 공개 칸만 쓰고 없으면 null(모름)이다', () => {
    expect(decideLimit(report([limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) })]).report, [], NOW)?.utilization).toBeNull()
  })
})

describe('사람이 푼 경고', () => {
  it('그 창의 경고는 그 창의 resetsAt까지 멈추지 않고, 거부는 그대로 멈춘다', () => {
    const until = sec(NOW + 10 * HOUR)
    const acks = [{ window: 'seven_day', until }]
    const warn = report([limit({ status: 'allowed_warning', rateLimitType: 'seven_day', resetsAt: until })])
    expect(decideLimit(warn.report, acks, NOW)).toBeNull()
    const nextWindow = report([limit({ status: 'allowed_warning', rateLimitType: 'seven_day', resetsAt: sec(NOW + 20 * HOUR) })], until * 1000)
    expect(decideLimit(nextWindow.report, acks, until * 1000)?.kind).toBe('warning')
    const other = report([limit({ status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: sec(NOW + HOUR) })])
    expect(decideLimit(other.report, acks, NOW)?.kind).toBe('warning')
    const rejected = report([limit({ status: 'rejected', rateLimitType: 'seven_day', resetsAt: until })])
    expect(decideLimit(rejected.report, acks, NOW)?.kind).toBe('hard')
  })
})

describe('실행 상태의 한도 멈춤 키', () => {
  const hard = (resumeAtMs: number | null) => ({
    kind: 'hard' as const, reason: 'rejected' as const, window: 'five_hour', resetsAt: resumeAtMs === null ? null : sec(resumeAtMs - 120_000),
    utilization: null, resumeAtMs, warned: [],
  })

  it('옛 상태 파일(키 없음)은 그대로 읽히고, 꼴이 틀린 키·멈춤 없는 한도 상태는 거부한다', () => {
    const old = JSON.parse(JSON.stringify(running())) as Record<string, unknown>
    expect('usageLimit' in old).toBe(false)
    expect(validateRunState(old).ok).toBe(true)
    const held = holdForLimit(running(), hard(NOW + HOUR), AT)
    expect(validateRunState(JSON.parse(JSON.stringify(held))).ok).toBe(true)
    const extra = { ...held, usageLimit: { ...held.usageLimit, stray: 1 } }
    expect(validateRunState(extra).ok).toBe(false)
    const badReason = { ...held, usageLimit: { ...held.usageLimit, halt: { ...held.usageLimit?.halt, reason: 'nope' } } }
    expect(validateRunState(badReason).ok).toBe(false)
    expect(validateRunState({ ...held, status: 'running' }).ok).toBe(false)
    expect(validateRunState({ ...held, haltReason: null }).ok).toBe(false)
    expect(validateRunState({ ...running(), status: 'usage-limit', haltReason: '한도' }).ok).toBe(false)
  })

  it('status 오류 문구가 허용 값을 모두 적는다', () => {
    const bad = validateRunState({ ...running(), status: 'paused' })
    const reason = bad.ok ? '' : bad.errors.find((e) => e.path === '$.status')?.reason
    expect(reason).toContain('usage-limit')
    expect(reason).toContain('needs-user')
  })

  it('정수가 아닌 resetsAt은 받을 때 내린다 — 거부·경고 멈춤과 받아 둔 경고 창이 저장 뒤 다시 읽힌다', () => {
    const roundTrip = (s: RunState): boolean => validateRunState(JSON.parse(JSON.stringify(s))).ok
    const whole = sec(NOW + HOUR)
    const t = createLimitTracker(() => NOW)
    t.observe(limit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: whole + 0.5 }))
    const hardDecision = decideLimit(t.report(), [], NOW)
    if (!hardDecision) throw new Error('거부가 멈춤이 아니다')
    const held = holdForLimit(running(), hardDecision, AT)
    expect(held.usageLimit?.halt?.resetsAt).toBe(whole)
    expect(roundTrip(held)).toBe(true)

    const w = report([limit({ status: 'allowed_warning', rateLimitType: 'seven_day', resetsAt: whole + 0.25, utilization: 0.9 })])
    const warnDecision = decideLimit(w.report, [], NOW)
    if (!warnDecision) throw new Error('경고가 멈춤이 아니다')
    const warnHeld = holdForLimit(running(), warnDecision, AT)
    expect(roundTrip(warnHeld)).toBe(true)
    const human = resumeFromLimit(warnHeld, 'human', NOW)
    if (!human.ok) throw new Error(human.reason)
    expect(human.state.usageLimit?.acks).toEqual([{ window: 'seven_day', until: whole }])
    expect(roundTrip(human.state)).toBe(true)
  })

  it('사유 문구의 시각은 사람이 읽는 지역 시각이다', () => {
    const resetMs = new Date(2026, 10, 21, 19, 0).getTime()
    const d = { kind: 'hard' as const, reason: 'rejected' as const, window: 'five_hour', resetsAt: sec(resetMs), utilization: null, resumeAtMs: resetMs + 120_000, warned: [] }
    const held = holdForLimit(running(), d, AT)
    expect(held.haltReason).toContain('풀리는 시각 11월 21일 19:00')
    expect(held.haltReason).toContain('11월 21일 19:02 뒤 스스로 이어 간다')
    expect(held.haltReason).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(held.usageLimit?.halt?.resumeAt).toBe(new Date(resetMs + 120_000).toISOString())
  })

  it('한도 멈춤은 검증 줄과 FAIL 계수에 닿지 않는다 — 자동·사람 이어 가기 뒤에도 같다', () => {
    const s = running()
    s.lines.push(
      { marker: 'FAIL', at: AT, sentence: '하나', by: 'executor', node: 'checks', goal: 'G1', judge: 'rule' },
      { marker: 'FAIL', at: AT, sentence: '둘', by: 'executor', node: 'checks', goal: 'G1', judge: 'rule' },
    )
    s.failCount = 2
    const lines = JSON.stringify(s.lines)
    const held = holdForLimit(s, hard(NOW + HOUR), AT)
    expect([held.status, held.failCount, JSON.stringify(held.lines), held.cursor]).toEqual(['usage-limit', 2, lines, s.cursor])
    const early = resumeFromLimit(held, 'auto', NOW)
    expect(early.ok).toBe(false)
    const auto = resumeFromLimit(held, 'auto', NOW + HOUR)
    if (!auto.ok) throw new Error(auto.reason)
    expect([auto.state.status, auto.state.haltReason, auto.state.failCount, JSON.stringify(auto.state.lines), auto.state.cursor]).toEqual(['running', null, 2, lines, s.cursor])
    const human = resumeFromLimit(held, 'human', NOW)
    if (!human.ok) throw new Error(human.reason)
    expect([human.state.status, human.state.failCount, JSON.stringify(human.state.lines)]).toEqual(['running', 2, lines])
    expect(validateRunState(JSON.parse(JSON.stringify(human.state))).ok).toBe(true)
  })

  it('resetsAt이 없으면 자동으로 이어 가지 않고 사람의 이어 가기만 받는다', () => {
    const held = holdForLimit(running(), hard(null), AT)
    expect(held.usageLimit?.halt?.resumeAt).toBeNull()
    expect(held.haltReason).toContain('지금 이어 가기')
    expect(resumeFromLimit(held, 'auto', NOW + 365 * 24 * HOUR).ok).toBe(false)
    expect(resumeFromLimit(held, 'human', NOW).ok).toBe(true)
  })

  it('한도 이어 가기는 한도 멈춤만 푼다 — 사람 판정 대기(needs-user)와 도는 실행은 건드리지 않는다', () => {
    const halted = { ...running(), status: 'needs-user' as const, haltReason: '실패 셋' }
    expect(resumeFromLimit(halted, 'auto', NOW + 365 * 24 * HOUR).ok).toBe(false)
    expect(resumeFromLimit(halted, 'human', NOW).ok).toBe(false)
    expect(resumeFromLimit(running(), 'human', NOW).ok).toBe(false)
  })

  it('노드 하나도 끝내지 못한 채 두 번 이어지면 사람 기다림이다 — 노드가 끝나면 셈을 지운다', () => {
    const first = holdForLimit(running(), hard(NOW + HOUR), AT)
    expect(first.usageLimit?.halt?.human).toBe(false)
    const again = resumeFromLimit(first, 'auto', NOW + HOUR)
    if (!again.ok) throw new Error(again.reason)
    const second = holdForLimit(again.state, hard(NOW + 2 * HOUR), AT)
    expect(second.usageLimit?.halt?.human).toBe(true)
    expect(second.haltReason).toContain('두 번')
    expect(resumeFromLimit(second, 'auto', NOW + 3 * HOUR).ok).toBe(false)
    expect(resumeFromLimit(second, 'human', NOW).ok).toBe(true)
    const settled = settleStreak(again.state)
    expect(settled.usageLimit).toBeUndefined()
    expect(holdForLimit(settled, hard(NOW + 2 * HOUR), AT).usageLimit?.halt?.human).toBe(false)
  })

  it('경고 멈춤은 지금 노드가 끝난 뒤의 상태에 걸고, 그 노드 뒤라 셈은 하나다. 사람이 풀면 그 창을 받아 둔다', () => {
    const until = sec(NOW + 10 * HOUR)
    const warning = { kind: 'warning' as const, reason: 'warning' as const, window: 'seven_day', resetsAt: until, utilization: 0.9, resumeAtMs: until * 1000 + 120_000, warned: [{ window: 'seven_day', until }] }
    const prior = holdForLimit(running(), hard(NOW + HOUR), AT)
    const back = resumeFromLimit(prior, 'auto', NOW + HOUR)
    if (!back.ok) throw new Error(back.reason)
    const held = holdForLimit(back.state, warning, AT)
    expect([held.status, held.usageLimit?.streak, held.usageLimit?.halt?.human]).toEqual(['usage-limit', 1, false])
    const human = resumeFromLimit(held, 'human', NOW)
    if (!human.ok) throw new Error(human.reason)
    expect(human.state.usageLimit?.acks).toEqual([{ window: 'seven_day', until }])
    const notRunning = { ...running(), status: 'needs-user' as const, haltReason: '실패 셋' }
    const kept = holdForLimit(notRunning, warning, AT)
    expect([kept.status, kept.haltReason]).toEqual(['needs-user', '실패 셋'])
  })
})

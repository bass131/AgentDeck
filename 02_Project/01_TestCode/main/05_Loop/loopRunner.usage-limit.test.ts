import { describe, expect, it } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, type LoopRunner, type StepOutcome } from '@main/05_Loop/loopRunner'
import type { ReviewPort, WorkResult } from '@main/05_Loop/ports'
import type { RunState } from '@main/05_Loop/runState'
import { DOCS } from '@main/05_Loop/survivalDocs'
import type { Template } from '@main/05_Loop/template'
import { createLimitTracker, type LimitReport } from '@main/05_Loop/usageLimit'
import { labelOf, loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'

const HOUR = 3_600_000
const START = Date.parse('2026-11-21T09:00:00Z')
const sec = (ms: number): number => Math.floor(ms / 1000)

interface Ctx { template: Template; rig: Rig; runner: LoopRunner; clock: { ms: number } }
function setup(): Ctx {
  const { template, hash } = loaded()
  const rig = makeRig()
  const clock = { ms: START }
  rig.ports.clock = { now: () => new Date(clock.ms).toISOString() }
  return { template, rig, clock, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: 'C:/work/practice', base: 'master' }) }
}
async function state(ctx: Ctx): Promise<RunState> {
  const r = await ctx.runner.load()
  if (r.kind !== 'ok') throw new Error(JSON.stringify(r))
  return r.state
}
async function at(ctx: Ctx, target: string): Promise<RunState> {
  if ((await ctx.runner.load()).kind === 'missing') await ctx.runner.start('M1')
  await runLoop(ctx.runner, ctx.rig, { until: target })
  const s = await state(ctx)
  expect(labelOf(nextStep(ctx.template, s))).toBe(target)
  return s
}
const where = (_: Ctx, s: RunState): string => {
  const g = s.cursor.goal === null ? null : s.goals[s.cursor.goal]
  return g ? `${g.id}/${s.cursor.node}` : s.cursor.node
}
const win = (status: 'allowed' | 'allowed_warning' | 'rejected', resetsAtMs: number | null, over: Partial<LimitReport['windows'][number]> = {}): LimitReport =>
  ({ windows: [{ window: 'five_hour', status, resetsAt: resetsAtMs === null ? null : sec(resetsAtMs), utilization: 0.97, overage: false, ...over }], error: false })
const hardResult = (limit: LimitReport, over: Partial<WorkResult> = {}): WorkResult => ({ ok: false, summary: '사용량 한도 사건을 받아 세션을 멈췄다', cancelled: true, limit, ...over })
const kindOf = (o: StepOutcome): string => o.kind
const implementCalls = (ctx: Ctx): number => ctx.rig.session.calls.filter((c) => c === 'G1/implement').length

describe('경고 — 지금 노드를 끝낸 뒤 멈춘다', () => {
  it('작업 노드는 끝까지 하고 판정을 남긴 뒤 다음 노드 앞에서 멈춘다. 검증 줄은 늘지 않고 생존 문서에 한 줄 남는다', async () => {
    const ctx = setup()
    const before = await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = { ok: true, summary: '구현했다', limit: win('allowed_warning', START + 3 * HOUR) }
    const out = await ctx.runner.step()
    expect(kindOf(out)).toBe('limited')
    const s = await state(ctx)
    expect([s.status, where(ctx, s), s.lines.length, s.failCount]).toEqual(['usage-limit', 'G1/checks', before.lines.length, 0])
    expect(s.usageLimit?.halt).toMatchObject({ reason: 'warning', node: 'checks', goal: 'G1', utilization: 0.97, resumeAt: new Date(START + 3 * HOUR + 120_000).toISOString() })
    const doc = ctx.rig.fs.files.get(DOCS.verification) ?? ''
    const tail = doc.split('\n').filter((l) => l.startsWith('사용량 한도 멈춤:'))
    expect(tail).toHaveLength(1)
    expect(doc.split('\n').filter((l) => /^- (PASS|FAIL|USER-INPUT)/.test(l))).toHaveLength(before.lines.length)
    expect(kindOf(await ctx.runner.step())).toBe('halted')
    expect(ctx.rig.commands.calls).toHaveLength(0)
  })

  it('검수 세션의 경고는 그 검수의 통과를 남긴 뒤 멈춘다 — 검수 트리 묶음과 다음 goal PR의 대조를 깨지 않는다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/review')
    const review: ReviewPort = { review: async () => ({ verdict: 'pass', evidence: '검수 통과', limit: win('allowed_warning', START + HOUR) }) }
    ctx.rig.ports.review = review
    const runner = createLoopRunner({ ...loaded(), ports: ctx.rig.ports, cwd: 'C:/work/practice', base: 'master' })
    expect(kindOf(await runner.step())).toBe('limited')
    const s = (await runner.load()) as { state: RunState }
    expect(where(ctx, s.state)).toBe('G1/goal-pr')
    expect(s.state.lines.at(-1)).toMatchObject({ marker: 'PASS', node: 'review' })
    expect(s.state.goals[0].reviewedTree).toBe('t0')
    ctx.clock.ms = START + 2 * HOUR
    expect(kindOf(await runner.resumeLimit('auto'))).toBe('resumed')
    expect(kindOf(await runner.step())).toBe('advanced')
    expect(ctx.rig.gh.calls.some((c) => c.startsWith('createPr'))).toBe(true)
  })

  it('사람이 경고 멈춤을 풀면 그 창의 경고로는 그 창의 resetsAt까지 멈추지 않는다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = { ok: true, summary: '구현했다', limit: win('allowed_warning', START + 3 * HOUR) }
    await ctx.runner.step()
    expect(kindOf(await ctx.runner.resumeLimit('human'))).toBe('resumed')
    expect((await state(ctx)).usageLimit?.acks).toEqual([{ window: 'five_hour', until: sec(START + 3 * HOUR) }])
    await runLoop(ctx.runner, ctx.rig, { until: 'G2/implement' })
    ctx.rig.session.nextResult = { ok: true, summary: '구현했다', limit: win('allowed_warning', START + 3 * HOUR) }
    expect(kindOf(await ctx.runner.step())).toBe('advanced')
    expect(where(ctx, await state(ctx))).toBe('G2/checks')
  })

  it('경고를 받은 뒤 노드가 끝나기 전에 그 창이 풀렸으면 멈추지 않는다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    const tracker = createLimitTracker(() => ctx.clock.ms)
    tracker.observe({ type: 'rate_limit', status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: sec(START + HOUR), utilization: 0.9 })
    ctx.clock.ms = START + 2 * HOUR
    ctx.rig.session.nextResult = { ok: true, summary: '구현했다', limit: tracker.report() as LimitReport }
    expect(kindOf(await ctx.runner.step())).toBe('advanced')
    const s = await state(ctx)
    expect([s.status, where(ctx, s), s.usageLimit]).toEqual(['running', 'G1/checks', undefined])
  })

  it('경고를 받아 둔 창이라도 거부가 오면 멈춘다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = { ok: true, summary: '구현했다', limit: win('allowed_warning', START + 3 * HOUR) }
    await ctx.runner.step()
    await ctx.runner.resumeLimit('human')
    await runLoop(ctx.runner, ctx.rig, { until: 'G2/implement' })
    ctx.rig.session.nextResult = hardResult(win('rejected', START + 3 * HOUR))
    expect(kindOf(await ctx.runner.step())).toBe('limited')
    const s = await state(ctx)
    expect([s.status, where(ctx, s), s.usageLimit?.halt?.reason]).toEqual(['usage-limit', 'G2/implement', 'rejected'])
  })
})

describe('정수가 아닌 resetsAt', () => {
  it('거부·경고 멈춤을 저장한 상태를 실행기가 다시 읽는다', async () => {
    for (const status of ['rejected', 'allowed_warning'] as const) {
      const ctx = setup()
      await at(ctx, 'G1/implement')
      const tracker = createLimitTracker(() => ctx.clock.ms)
      tracker.observe({ type: 'rate_limit', status, rateLimitType: 'five_hour', resetsAt: sec(START + HOUR) + 0.5 })
      const limit = tracker.report() as LimitReport
      ctx.rig.session.nextResult = status === 'rejected' ? hardResult(limit) : { ok: true, summary: '구현했다', limit }
      expect(kindOf(await ctx.runner.step()), status).toBe('limited')
      const loaded = await ctx.runner.load()
      expect(loaded.kind, status).toBe('ok')
      expect((loaded as { state: RunState }).state.usageLimit?.halt?.resetsAt, status).toBe(sec(START + HOUR))
    }
  })
})

describe('거부·초과 사용 — 그 노드를 멈추고 이어 갈 때 처음부터 다시 한다', () => {
  it('거부면 커서가 그대로이고, 풀리는 시각 전에는 자동으로 이어 가지 않으며, 뒤에는 같은 노드의 새 세션을 연다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = hardResult(win('rejected', START + HOUR))
    expect(kindOf(await ctx.runner.step())).toBe('limited')
    let s = await state(ctx)
    expect([s.status, where(ctx, s), s.usageLimit?.halt?.reason]).toEqual(['usage-limit', 'G1/implement', 'rejected'])
    expect(kindOf(await ctx.runner.resumeLimit('auto'))).toBe('blocked')
    ctx.clock.ms = START + HOUR + 120_000
    expect(kindOf(await ctx.runner.resumeLimit('auto'))).toBe('resumed')
    s = await state(ctx)
    expect([s.status, s.haltReason]).toEqual(['running', null])
    expect(implementCalls(ctx)).toBe(1)
    expect(kindOf(await ctx.runner.step())).toBe('advanced')
    expect(implementCalls(ctx)).toBe(2)
  })

  it('초과 사용 중이면 허용 상태여도 거부와 같이 멈춘다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = hardResult(win('allowed', START + HOUR, { overage: true }))
    expect(kindOf(await ctx.runner.step())).toBe('limited')
    expect((await state(ctx)).usageLimit?.halt?.reason).toBe('overage')
  })

  it('한도 사건을 본 세션이 오류·시간 초과로 끝나도 FAIL이 아니라 한도 멈춤이다', async () => {
    for (const summary of ['세션 오류 — API Error', '시간 초과(3600초) — 세션을 취소했다']) {
      const ctx = setup()
      await at(ctx, 'G1/implement')
      ctx.rig.session.nextResult = { ok: false, summary, limit: win('rejected', START + HOUR) }
      expect(kindOf(await ctx.runner.step())).toBe('limited')
      const s = await state(ctx)
      expect([s.status, s.failCount, s.lines.filter((l) => l.marker === 'FAIL')]).toEqual(['usage-limit', 0, []])
    }
  })

  it('사건 없이 한도 오류만 오면 시각 없는 한도 멈춤이다 — 자동으로 이어 가지 않고 사람의 이어 가기를 기다린다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = hardResult({ windows: [], error: true })
    expect(kindOf(await ctx.runner.step())).toBe('limited')
    const s = await state(ctx)
    expect(s.usageLimit?.halt).toMatchObject({ reason: 'error', resetsAt: null, resumeAt: null })
    ctx.clock.ms = START + 1000 * HOUR
    expect(kindOf(await ctx.runner.resumeLimit('auto'))).toBe('blocked')
    expect(kindOf(await ctx.runner.resumeLimit('human'))).toBe('resumed')
  })
})

describe('한도 멈춤과 FAIL 계수', () => {
  it('FAIL 둘 뒤의 한도 멈춤 — 멈춤·자동 이어 가기·사람 이어 가기 어디서도 줄과 계수가 바뀌지 않고, 사람 판정 길은 거부된다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/checks')
    const cmd = ctx.template.nodes.flatMap((n) => (n.kind === 'goalLoop' ? n.steps : [n])).find((n) => n.id === 'checks')
    for (const c of (cmd as { rule: { commands: string[] } }).rule.commands) ctx.rig.commands.failing.add(c)
    await ctx.runner.step()
    await ctx.runner.step()
    await ctx.runner.step()
    let s = await state(ctx)
    expect([where(ctx, s), s.failCount]).toEqual(['G1/implement', 2])
    const lines = JSON.stringify(s.lines)
    ctx.rig.session.nextResult = hardResult(win('rejected', START + HOUR))
    await ctx.runner.step()
    s = await state(ctx)
    expect([s.status, s.failCount, JSON.stringify(s.lines)]).toEqual(['usage-limit', 2, lines])
    const refused = await ctx.runner.submit({ node: 'implement', judge: 'human', verdict: 'pass', evidence: '이어 간다' })
    expect(refused.kind).toBe('blocked')
    expect(JSON.stringify((await state(ctx)).lines)).toBe(lines)
    ctx.clock.ms = START + 2 * HOUR
    await ctx.runner.resumeLimit('auto')
    s = await state(ctx)
    expect([s.status, s.failCount, JSON.stringify(s.lines)]).toEqual(['running', 2, lines])
    ctx.rig.session.nextResult = hardResult(win('rejected', START + 3 * HOUR))
    await ctx.runner.step()
    await ctx.runner.resumeLimit('human')
    s = await state(ctx)
    expect([s.status, s.failCount, JSON.stringify(s.lines)]).toEqual(['running', 2, lines])
  })

  it('노드 하나도 끝내지 못한 채 한도 멈춤이 두 번 이어지면 사람 기다림이다', async () => {
    const ctx = setup()
    await at(ctx, 'G1/implement')
    ctx.rig.session.nextResult = hardResult(win('rejected', START + HOUR))
    await ctx.runner.step()
    ctx.clock.ms = START + 2 * HOUR
    await ctx.runner.resumeLimit('auto')
    ctx.rig.session.nextResult = hardResult(win('rejected', START + 3 * HOUR))
    await ctx.runner.step()
    const s = await state(ctx)
    expect(s.usageLimit?.halt?.human).toBe(true)
    ctx.clock.ms = START + 10 * HOUR
    expect(kindOf(await ctx.runner.resumeLimit('auto'))).toBe('blocked')
    expect(kindOf(await ctx.runner.resumeLimit('human'))).toBe('resumed')
  })
})

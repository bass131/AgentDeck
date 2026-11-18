// M09 G2 독립 검수 반영 — 실행기 쪽 구조적 고침을 고정한다.
//   중요 4: 세션이 로컬 마일스톤(·base) 브랜치에 심은 커밋을 실행기가 push하지 않는다 — 로컬 머리 == 원격 머리일 때만 가르고·병합하고·PR을
//           열며, 재개 때는 「부모가 (원격 머리, PR 머리)인 병합 커밋 하나」만 받는다.
//   차단 1: 실행기 git 설정이 바뀌면(configGuard) 단계 앞뒤에서 멈추고 판정을 남기지 않으며 래치를 건다.
//   사소: CI 기다림 상한은 시계 기준 시간(기본 60분)이고 횟수는 보조다.
import { describe, it, expect } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { repoKeyOf } from '@main/05_Loop/digestStore'
import { createLoopRunner, DEFAULT_CI_WAIT_MS, type LoopRunner, type StepOutcome } from '@main/05_Loop/loopRunner'
import type { RunState } from '@main/05_Loop/runState'
import type { Template } from '@main/05_Loop/template'
import { labelOf, loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'
const EVIL = `e${'0'.repeat(39)}`

interface Ctx { template: Template; hash: string; rig: Rig; runner: LoopRunner }
function setup(rig: Rig = makeRig(), extra: { ciWaitLimit?: number; ciWaitMs?: number } = {}): Ctx {
  const { template, hash } = loaded()
  return { template, hash, rig, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master', ...extra }) }
}
async function until(ctx: Ctx, target: string): Promise<RunState> {
  if ((await ctx.runner.load()).kind === 'missing') expect((await ctx.runner.start('M1')).kind).toBe('ok')
  const run = await runLoop(ctx.runner, ctx.rig, { until: target })
  expect(labelOf(nextStep(ctx.template, run.state))).toBe(target)
  return run.state
}
const stateOf = (out: StepOutcome): RunState => {
  if (out.state === null) throw new Error(`상태 없는 결과: ${JSON.stringify(out)}`)
  return out.state
}
const plant = (rig: Rig, branch: string): void => { rig.git.local.get(branch)?.push(EVIL) }
// 지금부터의 git 호출만 본다
const since = (rig: Rig): (() => string[]) => { const n = rig.git.calls.length; return () => rig.git.calls.slice(n) }
const remoteHas = (rig: Rig, branch: string, sha: string): boolean => rig.git.remote.get(branch)?.includes(sha) ?? false
function snapshot(rig: Rig): () => void {
  const saved = new Map(rig.fs.files)
  const digests = new Map(rig.digest.digests)
  return () => {
    rig.fs.files.clear(); for (const [k, v] of saved) rig.fs.files.set(k, v)
    rig.digest.digests.clear(); for (const [k, v] of digests) rig.digest.digests.set(k, v)
  }
}

describe('세션이 로컬 브랜치에 심은 커밋을 실행기가 push하지 않는다 (G2 검수 중요 4)', () => {
  it('goal 병합 — 로컬 마일스톤이 원격보다 앞서 있으면 병합도 push도 하지 않고 멈춘다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    plant(ctx.rig, 'milestone/M1')
    const calls = since(ctx.rig)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(stateOf(out).haltReason).toContain('원격')
    expect(calls().filter((c) => c.startsWith('merge ') || c.startsWith('push'))).toEqual([])
    expect(remoteHas(ctx.rig, 'milestone/M1', EVIL)).toBe(false)
  })

  it('goal 병합 재개 — 이번 병합 커밋 위에 커밋이 더 얹혀 있으면 push하지 않고 멈춘다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    await ctx.rig.git.checkout('milestone/M1')
    await ctx.rig.git.mergeNoFf(at.goals[0].ciSha as string, '꺼지기 전 병합')
    plant(ctx.rig, 'milestone/M1')
    const calls = since(ctx.rig)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(calls().filter((c) => c.startsWith('push'))).toEqual([])
    expect(remoteHas(ctx.rig, 'milestone/M1', EVIL)).toBe(false)
  })

  it('goal 병합 재개 — 다른 머리를 병합한 커밋 하나도 받지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    await ctx.rig.git.checkout('milestone/M1')
    ctx.rig.git.local.set('side', [...(ctx.rig.git.local.get('milestone/M1') ?? []), EVIL])
    await ctx.rig.git.mergeNoFf(EVIL, '남의 병합')
    const calls = since(ctx.rig)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(calls().filter((c) => c.startsWith('push'))).toEqual([])
  })

  // G2 재검수 차단 A — 부모만 (원격 머리, PR 머리)로 맞추고 트리는 CI를 거치지 않은 위조 병합 커밋(commit-tree)
  it('goal 병합 재개 — 부모가 맞아도 트리가 두 부모의 병합이 아닌 커밋은 push하지 않고 멈춘다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    const ms = ctx.rig.git.local.get('milestone/M1') ?? []
    const remote = ms[ms.length - 1]
    ms.push(EVIL)
    ctx.rig.git.parentsOf.set(EVIL, [remote, at.goals[0].ciSha as string])
    ctx.rig.git.forgedTrees.add(EVIL)
    const calls = since(ctx.rig)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(stateOf(out).haltReason).toContain('트리')
    expect(calls().filter((c) => c.startsWith('push'))).toEqual([])
    expect(remoteHas(ctx.rig, 'milestone/M1', EVIL)).toBe(false)
  })

  it('goal 병합 — 실행기가 만든 병합 커밋도 push 전에 트리를 대조하고, 어긋나면 push하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    const real = ctx.rig.git.mergeNoFf.bind(ctx.rig.git)
    ctx.rig.git.mergeNoFf = async (sha, message) => { const m = await real(sha, message); ctx.rig.git.forgedTrees.add(m); return m }
    const calls = since(ctx.rig)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(calls().some((c) => c.startsWith('verifyMerge'))).toBe(true)
    expect(calls().filter((c) => c.startsWith('push'))).toEqual([])
  })

  it('다음 goal 브랜치 — 로컬 마일스톤이 원격보다 앞서 있으면 가르지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G2/goal-branch')
    plant(ctx.rig, 'milestone/M1')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(ctx.rig.git.local.has('goal/M1-G2')).toBe(false)
  })

  it('마일스톤 브랜치 — 로컬 base가 원격보다 앞서 있으면 가르지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-branch')
    plant(ctx.rig, 'master')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(ctx.rig.git.local.has('milestone/M1')).toBe(false)
    expect(ctx.rig.git.calls.filter((c) => c.startsWith('push'))).toEqual([])
  })

  it('마일스톤 브랜치 재개 — 이미 있는 브랜치의 머리가 시작 SHA가 아니면 push하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-branch')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step()
    restore()
    plant(ctx.rig, 'milestone/M1')
    const pushes = ctx.rig.git.calls.filter((c) => c.startsWith('push')).length
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(ctx.rig.git.calls.filter((c) => c.startsWith('push')).length).toBe(pushes)
    expect(remoteHas(ctx.rig, 'milestone/M1', EVIL)).toBe(false)
  })

  it('마일스톤 PR — 로컬 마일스톤이 원격과 다르면 push도 PR도 하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-pr')
    plant(ctx.rig, 'milestone/M1')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(ctx.rig.gh.calls).not.toContain('createPr milestone/M1 master')
    expect(remoteHas(ctx.rig, 'milestone/M1', EVIL)).toBe(false)
  })

  it('비교군 — 심은 커밋이 없으면 같은 길이 지나간다(마일스톤 PR까지)', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-merge')
    expect(ctx.rig.gh.calls).toContain('createPr milestone/M1 master')
  })
})

describe('실행기 git 설정이 바뀌면 멈춘다 (G2 검수 차단 1)', () => {
  function guarded(): { ctx: Ctx; guard: { reason: string | null } } {
    const rig = makeRig()
    const guard = { reason: null as string | null }
    rig.ports.configGuard = { check: async () => guard.reason }
    return { ctx: setup(rig), guard }
  }

  it('작업 노드 동안 설정이 바뀌면 그 노드의 판정을 남기지 않고 사람을 부르며, 되돌려도 래치로 멈춘다', async () => {
    const { ctx, guard } = guarded()
    await until(ctx, 'G1/implement')
    const before = ctx.rig.fs.files.get('.agentdeck/run-state.json')
    ctx.rig.session.onWork = async () => { guard.reason = '실행기 git 설정이 실행기 밖에서 바뀌었다 — 바뀐 키: core.fsmonitor' }
    const out = await ctx.runner.step()
    expect(out.kind).toBe('needs-user')
    expect(out.kind === 'needs-user' && out.reason).toContain('core.fsmonitor')
    const loadedState = await ctx.runner.load()
    expect(loadedState.kind).toBe('needs-user')
    guard.reason = null
    const sessions = ctx.rig.session.calls.length
    expect((await ctx.runner.step()).kind).toBe('needs-user')
    expect(ctx.rig.session.calls.length).toBe(sessions)
    expect(ctx.rig.digest.latches.get(repoKeyOf(CWD))).toContain('core.fsmonitor')
    // 상태는 그 노드 앞 그대로다
    const fresh = setup(ctx.rig)
    expect((await fresh.runner.load()).kind).toBe('needs-user')
    expect(ctx.rig.fs.files.get('.agentdeck/run-state.json')).toBe(before)
  })

  it('단계 앞에서 이미 바뀌었으면 포트를 부르지 않는다', async () => {
    const { ctx, guard } = guarded()
    await until(ctx, 'G1/checks')
    guard.reason = '실행기 git 설정이 실행기 밖에서 바뀌었다 — 바뀐 키: filter.x.clean'
    const calls = [ctx.rig.commands.calls.length, ctx.rig.git.calls.length, ctx.rig.gh.calls.length]
    expect((await ctx.runner.step()).kind).toBe('needs-user')
    expect([ctx.rig.commands.calls.length, ctx.rig.git.calls.length, ctx.rig.gh.calls.length]).toEqual(calls)
  })
})

describe('CI 기다림 상한은 시간이다 (G2 검수 사소)', () => {
  it('기본 60분 — 횟수가 남아도 시계로 60분을 넘기면 멈춘다', async () => {
    expect(DEFAULT_CI_WAIT_MS).toBe(60 * 60_000)
    const rig = makeRig()
    let t = Date.parse('2026-11-18T10:00:00+09:00')
    rig.ports.clock = { now: () => new Date(t).toISOString() }
    const ctx = setup(rig, { ciWaitLimit: 1000 })
    await until(ctx, 'G1/ci')
    rig.gh.ci = 'pending'
    expect((await ctx.runner.step()).kind).toBe('waiting')
    t += 30 * 60_000
    expect((await ctx.runner.step()).kind).toBe('waiting')
    t += 31 * 60_000
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(stateOf(out).haltReason).toContain('60분')
  })
})

// 가짜 포트(fs·git·gh·명령·세션·검수)로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것: 실제 템플릿으로 완주, 상태는 실행기가 저장본에서 읽어 소유한다(밖에서 상태를 넣는 길이 없다, 호출은 직렬),
// 규칙 게이트 증거(검증 줄)를 실행기가 직접 쓴다, 에이전트가 쓴 「PASS」 글로는 나아가지 않는다, 재개는 같은 노드를 고른다,
// action은 확인 뒤 실행이고 이미 있는 브랜치·PR은 이번 실행의 것일 때만 받는다, CI·병합은 push한 머리에 묶인다,
// 실행기가 만든 판정이 거부되면 멈춘다, 템플릿 해시가 다르면 멈춘다.
import { describe, it, expect } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, type LoopRunner, type StepOutcome } from '@main/05_Loop/loopRunner'
import type { WorkRequest } from '@main/05_Loop/ports'
import type { RunState } from '@main/05_Loop/runState'
import { buildNodePrompt } from '@main/05_Loop/workSession'
import { DOCS, goalDocPath } from '@main/05_Loop/survivalDocs'
import type { Template } from '@main/05_Loop/template'
import { labelOf, loaded, makeRig, runLoop, variantText, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'
const REAL_ORDER = [
  'brainstorm', 'spec-approval', 'milestone-branch', 'decompose',
  'G1/goal-branch', 'G1/implement', 'G1/checks', 'G1/grade', 'G1/review', 'G1/goal-pr', 'G1/ci', 'G1/merge',
  'G2/goal-branch', 'G2/implement', 'G2/checks', 'G2/grade', 'G2/goal-pr', 'G2/ci', 'G2/merge',
  'regression', 'milestone-pr', 'milestone-merge',
]

interface Ctx { template: Template; hash: string; rig: Rig; runner: LoopRunner }
function setup(text?: string, rig: Rig = makeRig(), extra: { ciWaitLimit?: number; base?: string } = {}): Ctx {
  const { template, hash } = loaded(text)
  return { template, hash, rig, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master', ...extra }) }
}
async function reload(ctx: Ctx): Promise<RunState> {
  const r = await ctx.runner.load()
  if (r.kind !== 'ok') throw new Error(`불러오기 실패: ${JSON.stringify(r)}`)
  return r.state
}
async function ensureStarted(ctx: Ctx): Promise<void> {
  if ((await ctx.runner.load()).kind === 'missing') {
    const r = await ctx.runner.start('M1')
    if (r.kind !== 'ok') throw new Error(`시작 실패: ${JSON.stringify(r)}`)
  }
}
async function until(ctx: Ctx, target: string): Promise<RunState> {
  await ensureStarted(ctx)
  const run = await runLoop(ctx.runner, ctx.rig, { until: target })
  expect(labelOf(nextStep(ctx.template, run.state))).toBe(target)
  return run.state
}
const label = (ctx: Ctx, s: RunState): string => labelOf(nextStep(ctx.template, s))
const count = (calls: string[], prefix: string): number => calls.filter((c) => c.startsWith(prefix)).length
const stateOf = (out: StepOutcome): RunState => {
  if (out.state === null) throw new Error(`상태 없는 결과: ${JSON.stringify(out)}`)
  return out.state
}
// 「실행은 됐는데 상태 저장 전에 꺼짐」 — 생존 문서와 앱 쪽 다이제스트를 실행 전으로 되돌린다(git·gh 쪽의 일은 남는다).
function snapshot(rig: Rig): () => void {
  const saved = new Map(rig.fs.files)
  const digests = new Map(rig.digest.digests)
  return () => {
    rig.fs.files.clear(); for (const [k, v] of saved) rig.fs.files.set(k, v)
    rig.digest.digests.clear(); for (const [k, v] of digests) rig.digest.digests.set(k, v)
  }
}

describe('실제 템플릿으로 마일스톤 하나를 완주한다', () => {
  it('노드 순서·결정론적 동작·검증 줄이 템플릿을 따른다', async () => {
    const ctx = setup()
    ctx.rig.session.onWork = async (req) => {
      if (req.node.id === 'implement' && req.goal?.id === 'G2') ctx.rig.git.diff = [{ path: 'src/small.ts', added: 10, removed: 2 }]
    }
    await ensureStarted(ctx)
    const run = await runLoop(ctx.runner, ctx.rig)
    expect(run.visited).toEqual(REAL_ORDER)
    expect(run.state.status).toBe('done')
    expect(run.state.goals.map((g) => [g.id, g.grade, g.pr])).toEqual([['G1', 'strong', 100], ['G2', 'weak', 101]])
    expect(run.state.milestonePr).toBe(102)
    expect(run.state.milestoneBase).toBe('m0')
    expect(ctx.rig.gh.calls.filter((c) => c.startsWith('createPr'))).toEqual([
      'createPr goal/M1-G1 milestone/M1', 'createPr goal/M1-G2 milestone/M1', 'createPr milestone/M1 master',
    ])
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(2)
    expect(ctx.rig.review.calls).toEqual(['G1/review'])
    expect(ctx.rig.commands.calls).toEqual(Array(3).fill(null).flatMap(() => [
      { cmd: 'npm run build', cwd: CWD }, { cmd: 'npm test', cwd: CWD },
    ]))
    expect(run.state.lines.every((l) => l.by === 'executor')).toBe(true)
    expect(ctx.rig.fs.files.get(DOCS.verification)).toContain('PASS')
  })

  it('분해 노드가 goal 문서에 적은 「등급: 약」은 믿지 않고 변경 통계(80줄)로 강을 정한다', async () => {
    const ctx = setup()
    const s = await until(ctx, 'G1/review')
    expect(ctx.rig.fs.files.get(goalDocPath('G1'))).toContain('등급: 약')
    expect(s.goals[0].grade).toBe('strong')
  })
})

describe('상태는 실행기가 소유한다', () => {
  it('step·submit은 상태를 받지 않는다 — 커서를 바꾼 객체를 넘겨도 저장본의 노드를 돈다', async () => {
    const ctx = setup()
    expect(ctx.runner.step.length).toBe(0)
    expect(ctx.runner.submit.length).toBe(1)
    const at = await until(ctx, 'G1/checks')
    const forged = { ...at, cursor: { node: 'milestone-pr', goal: null } }
    const before = ctx.rig.commands.calls.length
    const out = await (ctx.runner.step as unknown as (s: RunState) => Promise<StepOutcome>)(forged)
    expect(ctx.rig.commands.calls.length).toBeGreaterThan(before)
    expect(count(ctx.rig.gh.calls, 'createPr milestone/M1')).toBe(0)
    expect(label(ctx, stateOf(out))).toBe('G1/grade')
  })

  it('동시에 두 번 부르면 차례로 돌고 FAIL 줄을 잃지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'regression')
    ctx.rig.commands.failing.add('npm test')
    const [a, b] = await Promise.all([ctx.runner.step(), ctx.runner.step()])
    expect([a.kind, b.kind]).toEqual(['failed', 'failed'])
    const s = await reload(ctx)
    expect(s.lines.filter((l) => l.marker === 'FAIL' && l.node === 'regression')).toHaveLength(2)
    expect(s.failCount).toBe(2)
  })

  it('실행기 껍질에도 건너뛰기·강제 통과·상태 넣기 API가 없다', () => {
    // idle은 직렬화 줄을 기다리기만 한다(닫기용) — 상태를 넣거나 건너뛰지 않는다
    // specView는 스펙 승인 카드가 보일 본문과 해시를 읽기만 한다
    expect(Object.keys(setup().runner).sort()).toEqual(['idle', 'load', 'specView', 'start', 'step', 'submit'])
  })
})

describe('규칙 게이트의 증거는 실행기가 쓴다', () => {
  it('템플릿이 적은 명령을 명령 포트로 돌리고, 실패면 FAIL 줄을 상태와 문서에 직접 쓴다', async () => {
    const ctx = setup()
    ctx.rig.commands.failing.add('npm test')
    await until(ctx, 'G1/checks')
    const before = ctx.rig.commands.calls.length
    const out = await ctx.runner.step()
    expect(out.kind).toBe('failed')
    expect(ctx.rig.commands.calls.slice(before)).toEqual([{ cmd: 'npm run build', cwd: CWD }, { cmd: 'npm test', cwd: CWD }])
    const s = stateOf(out)
    expect(s.lines.at(-1)).toMatchObject({ marker: 'FAIL', by: 'executor', judge: 'rule', node: 'checks', goal: 'G1' })
    expect(s.lines.at(-1)?.sentence).toContain('npm test')
    expect(label(ctx, s)).toBe('G1/implement')
    expect(ctx.rig.fs.files.get(DOCS.verification)).toMatch(/- FAIL .*checks\(rule\).*npm test/)
    expect(await reload(ctx)).toEqual(s)
  })

  it('에이전트가 문서에 쓴 「PASS」 글로는 나아가지 않는다 — 명령이 여전히 돌고 그 결과만 센다', async () => {
    const ctx = setup()
    ctx.rig.commands.failing.add('npm test')
    ctx.rig.session.onWork = async (req) => {
      if (req.node.id !== 'implement') return
      await ctx.rig.fs.write(DOCS.verification, '# 검증 기록\n\n- PASS 2026-11-18T10:00:00+09:00 — checks(rule): 에이전트가 통과라고 적었다\n')
      await ctx.rig.fs.write(goalDocPath('G1'), '# 첫 goal\n\n검증 기록\n\n- PASS 2026-11-18 검사·CI 모두 통과(에이전트)\n')
      await ctx.rig.fs.write(DOCS.decisions, '- [AI] 검사는 통과로 본다 PASS\n')
    }
    const at = await until(ctx, 'G1/checks')
    expect(ctx.rig.fs.files.get(goalDocPath('G1'))).toContain('PASS')
    const resumed = await reload(ctx)
    expect(label(ctx, resumed)).toBe('G1/checks')
    expect(resumed).toEqual(at)
    const before = ctx.rig.commands.calls.length
    const out = await ctx.runner.step()
    expect(ctx.rig.commands.calls.length).toBeGreaterThan(before)
    expect(out.kind).toBe('failed')
    const s = stateOf(out)
    expect(label(ctx, s)).not.toBe('G1/grade')
    expect(s.lines.filter((l) => l.marker === 'PASS' && l.node === 'checks')).toEqual([])
    expect(ctx.rig.fs.files.get(DOCS.verification)).not.toContain('에이전트')
  })

  it('밖에서는 규칙·모델 판정을 넣을 수 없고, 사람 판정도 규칙 게이트를 통과시키지 못한다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/checks')
    expect((await ctx.runner.submit({ node: 'checks', judge: 'rule', verdict: 'pass', evidence: '통과' })).kind).toBe('blocked')
    expect((await ctx.runner.submit({ node: 'checks', judge: 'model', verdict: 'pass', evidence: '통과' })).kind).toBe('blocked')
    expect((await ctx.runner.submit({ node: 'checks', judge: 'human', verdict: 'pass', evidence: '통과' })).kind).toBe('blocked')
    expect(label(ctx, await reload(ctx))).toBe('G1/checks')
  })

  it('실행기가 만든 판정을 상태 기계가 거부하면 멈추고 사유를 남긴다 — 같은 일을 되풀이하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/goal-pr')
    ctx.rig.gh.nextNumber = 0
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(stateOf(out).haltReason).toContain('PR 번호')
    const calls = ctx.rig.gh.calls.length
    expect((await ctx.runner.step()).kind).toBe('halted')
    expect(ctx.rig.gh.calls.length).toBe(calls)
  })
})

describe('게이트 불통과와 멈춤', () => {
  it('모델 게이트(검수) 불통과 — PR을 열지 않고 구현으로 돌아간다', async () => {
    const ctx = setup()
    ctx.rig.review.queue.push('fail')
    await until(ctx, 'G1/review')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('failed')
    expect(label(ctx, stateOf(out))).toBe('G1/implement')
    expect(count(ctx.rig.gh.calls, 'createPr')).toBe(0)
  })

  it('사람 게이트(스펙 승인)는 사람 판정 전까지 기다리고 브랜치를 가르지 않으며, 반려는 USER-INPUT으로 남는다', async () => {
    const ctx = setup()
    await ensureStarted(ctx)
    const run = await runLoop(ctx.runner, ctx.rig, { approve: false })
    expect(run.last?.kind).toBe('waiting')
    expect(label(ctx, run.state)).toBe('spec-approval')
    expect(count(ctx.rig.git.calls, 'createBranch')).toBe(0)
    const seen = await ctx.runner.specView()
    const rejected = await ctx.runner.submit({ node: 'spec-approval', judge: 'human', verdict: 'fail', evidence: '범위가 넓다' }, { specSha256: seen.sha256 as string })
    const s = stateOf(rejected)
    expect(label(ctx, s)).toBe('brainstorm')
    expect(s.lines.at(-1)).toMatchObject({ marker: 'USER-INPUT', judge: 'human' })
    expect(s.failCount).toBe(0)
  })

  it('FAIL 셋이면 멈춰 사람을 부르고, 사람의 이어 가기 판정 뒤에는 0부터 센다', async () => {
    const ctx = setup()
    ctx.rig.commands.failing.add('npm test')
    for (let i = 0; i < 2; i++) {
      await until(ctx, 'G1/checks')
      expect((await ctx.runner.step()).kind).toBe('failed')
    }
    await until(ctx, 'G1/checks')
    const third = await ctx.runner.step()
    expect(third.kind).toBe('halted')
    expect(stateOf(third).failCount).toBe(3)
    expect(ctx.rig.fs.files.get(DOCS.verification)).toContain('사람 판단 대기')
    const calls = ctx.rig.commands.calls.length
    expect((await ctx.runner.step()).kind).toBe('halted')
    expect(ctx.rig.commands.calls.length).toBe(calls)
    const resumed = await ctx.runner.submit({ node: 'implement', judge: 'human', verdict: 'pass', evidence: '시험 환경을 고쳤다' })
    expect(resumed.kind).toBe('resumed')
    const s = stateOf(resumed)
    expect(s.failCount).toBe(0)
    expect(s.lines.at(-1)).toMatchObject({ marker: 'USER-INPUT', judge: 'human', by: 'executor' })
    expect(label(ctx, s)).toBe('G1/implement')
  })

  it('마일스톤 병합 게이트는 PR 병합 사실로만 통과한다 — 밖에서 사람 pass를 넣어도 끝나지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-merge')
    expect((await ctx.runner.submit({ node: 'milestone-merge', judge: 'human', verdict: 'pass', evidence: '끝났다' })).kind).toBe('blocked')
    expect(label(ctx, await reload(ctx))).toBe('milestone-merge')
    expect((await ctx.runner.step()).kind).toBe('waiting')
  })
})

describe('재개는 같은 노드를 고르고, action은 확인 뒤 실행이다', () => {
  it('같은 문서·포트 상태에서 몇 번을 불러와도, 새 실행기로 불러와도 같은 노드다', async () => {
    const ctx = setup()
    ctx.rig.gh.ci = 'pending'
    const at = await until(ctx, 'G1/ci')
    expect((await ctx.runner.step()).kind).toBe('waiting')
    const a = await reload(ctx)
    const b = await reload(ctx)
    const other = setup(undefined, ctx.rig)
    const c = await reload(other)
    expect([label(ctx, a), label(ctx, b), label(other, c)]).toEqual(['G1/ci', 'G1/ci', 'G1/ci'])
    expect(a).toEqual(at)
    expect(c).toEqual(at)
  })

  it('브랜치가 이미 있고 이번 실행의 계보면 만들지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-branch')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step()
    restore()
    const out = await ctx.runner.step()
    expect(count(ctx.rig.git.calls, 'createBranch')).toBe(1)
    expect(out.kind === 'advanced' && out.verdict?.evidence).toContain('이미 있다')
  })

  it('이미 있는 마일스톤 브랜치가 이번 실행의 계보가 아니면 받지 않고 멈춘다', async () => {
    const ctx = setup()
    ctx.rig.git.local.set('milestone/M1', ['old0', 'old1'])
    await until(ctx, 'milestone-branch')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(stateOf(out).haltReason).toContain('계보')
    expect(count(ctx.rig.git.calls, 'createBranch')).toBe(0)
  })

  it('이미 있는 goal 브랜치가 이번 실행의 계보가 아니면 받지 않고 멈춘다', async () => {
    const ctx = setup()
    ctx.rig.git.local.set('goal/M1-G1', ['stale'])
    await until(ctx, 'G1/goal-branch')
    expect((await ctx.runner.step()).kind).toBe('halted')
  })

  it('PR이 이미 열려 있으면 다시 열지 않고 번호를 맞춘다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/goal-pr')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step()
    restore()
    const out = await ctx.runner.step()
    expect(count(ctx.rig.gh.calls, 'createPr')).toBe(1)
    expect(out.kind).toBe('advanced')
    const s = stateOf(out)
    expect(s.goals[0].pr).toBe(100)
    expect(s.goals[0].pushedSha).toBe(await ctx.rig.git.headSha('goal/M1-G1'))
    expect(label(ctx, s)).toBe('G1/ci')
  })

  it('같은 브랜치의 병합된 옛 PR이 이번에 push한 머리가 아니면 받지 않고 멈춘다', async () => {
    const ctx = setup()
    ctx.rig.gh.prs.push({ number: 50, head: 'goal/M1-G1', base: 'milestone/M1', state: 'merged', mergedHead: 'old', mergeCommitSha: 'oldm' })
    await until(ctx, 'G1/goal-pr')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(count(ctx.rig.gh.calls, 'createPr')).toBe(0)
  })

  it('goal PR 동작은 goal 브랜치로 옮긴 뒤 커밋한다 — 다른 브랜치가 체크아웃돼 있어도 마일스톤 브랜치에 얹히지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/goal-pr')
    await ctx.rig.git.checkout('milestone/M1')
    const milestoneBefore = [...(ctx.rig.git.local.get('milestone/M1') ?? [])]
    await ctx.runner.step()
    expect(ctx.rig.git.local.get('milestone/M1')).toEqual(milestoneBefore)
    expect(ctx.rig.git.calls).toContain('commit G1: 첫 goal')
    expect((ctx.rig.git.local.get('goal/M1-G1') ?? []).length).toBeGreaterThan(milestoneBefore.length)
  })

  it('CI가 이번에 push한 머리가 아닌 머리의 결과를 보고하면 판정하지 않고 기다린다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/ci')
    ctx.rig.gh.ciHead = 'f'.repeat(40)
    expect((await ctx.runner.step()).kind).toBe('waiting')
    ctx.rig.gh.ciHead = null
    expect((await ctx.runner.step()).kind).toBe('advanced')
  })

  it('CI를 읽다 gh 오류가 나면 FAIL로 세지 않고 기다린다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/ci')
    ctx.rig.gh.ciThrows = true
    expect((await ctx.runner.step()).kind).toBe('waiting')
    expect((await reload(ctx)).failCount).toBe(0)
  })

  it('CI 기다림이 상한을 넘으면 FAIL이 아니라 사람을 부르는 멈춤이다 — pending·gh 오류·머리 불일치를 모두 센다', async () => {
    const ctx = setup(undefined, makeRig(), { ciWaitLimit: 3 })
    await until(ctx, 'G1/ci')
    ctx.rig.gh.ci = 'pending'
    expect((await ctx.runner.step()).kind).toBe('waiting')
    ctx.rig.gh.ci = 'success'
    ctx.rig.gh.ciThrows = true
    expect((await ctx.runner.step()).kind).toBe('waiting')
    ctx.rig.gh.ciThrows = false
    ctx.rig.gh.ciHead = 'f'.repeat(40)
    expect((await ctx.runner.step()).kind).toBe('waiting')
    const over = await ctx.runner.step()
    expect(over.kind).toBe('halted')
    const s = stateOf(over)
    expect(s.haltReason).toContain('상한')
    expect(s.haltReason).toContain('머리')
    expect(s.failCount).toBe(0)
    expect(s.cursor).toEqual({ node: 'ci', goal: 0 })
    expect(s.lines.at(-1)).toMatchObject({ marker: 'PASS', node: 'goal-pr' })
    // 사람이 이어 가면 다시 0부터 센다
    expect((await ctx.runner.submit({ node: 'ci', judge: 'human', verdict: 'pass', evidence: '남의 push를 정리했다' })).kind).toBe('resumed')
    for (let i = 0; i < 3; i++) expect((await ctx.runner.step()).kind).toBe('waiting')
    ctx.rig.gh.ciHead = null
    expect((await ctx.runner.step()).kind).toBe('advanced')
  })

  it('CI가 판정을 내면 기다림 계수는 0으로 돌아간다', async () => {
    const ctx = setup(undefined, makeRig(), { ciWaitLimit: 2 })
    await until(ctx, 'G1/ci')
    ctx.rig.gh.ci = 'pending'
    expect((await ctx.runner.step()).kind).toBe('waiting')
    expect((await ctx.runner.step()).kind).toBe('waiting')
    ctx.rig.gh.ci = 'failure'
    expect((await ctx.runner.step()).kind).toBe('failed')
    await until(ctx, 'G1/ci')
    ctx.rig.gh.ci = 'pending'
    expect((await ctx.runner.step()).kind).toBe('waiting')
    expect((await ctx.runner.step()).kind).toBe('waiting')
    expect((await ctx.runner.step()).kind).toBe('halted')
  })

  it('상태 읽기(load)는 직렬화 줄 밖이다 — 끝나지 않는 작업 노드 동안에도 읽힌다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/implement')
    let release: () => void = () => undefined
    ctx.rig.session.onWork = (req) => (req.node.id === 'implement' ? new Promise<void>((res) => { release = res }) : Promise.resolve())
    const running = ctx.runner.step()
    await new Promise((res) => setTimeout(res, 10))
    const during = await ctx.runner.load()
    expect(during.kind === 'ok' && label(ctx, during.state)).toBe('G1/implement')
    release()
    expect((await running).kind).toBe('advanced')
    expect(label(ctx, await reload(ctx))).toBe('G1/checks')
  })

  it('load가 상태 파일을 읽은 뒤 다이제스트를 읽기 전에 쓰기 하나가 통째로 끝나도, 가짜 멈춤 없이 다시 읽어 새 상태를 낸다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/checks')
    const read = ctx.rig.fs.read.bind(ctx.rig.fs)
    let between: (() => Promise<unknown>) | null = () => ctx.runner.step()
    ctx.rig.fs.read = async (rel) => {
      const text = await read(rel)
      if (rel === DOCS.runState && between) { const run = between; between = null; await run() }
      return text
    }
    const r = await ctx.runner.load()
    expect(r.kind).toBe('ok')
    expect(r.kind === 'ok' && label(ctx, r.state)).toBe('G1/grade')
  })

  it('PR이 이미 병합됐으면 다시 병합하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step()
    restore()
    const out = await ctx.runner.step()
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(1)
    expect(out.kind === 'advanced' && out.verdict?.evidence).toContain('이미 병합')
    expect(label(ctx, stateOf(out))).toBe('G2/goal-branch')
  })

  it('사람이 GitHub에서 CI 통과 머리로 병합해 원격 마일스톤 브랜치가 바뀌면, 로컬을 원격에 맞추고 다음 goal을 그 머리에서 가른다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    const mergeCommit = ctx.rig.gh.mergeByHuman(100)
    ctx.rig.git.dirty = true
    await ctx.rig.git.commitAll('병합 뒤 늦은 커밋')
    await ctx.rig.git.push('goal/M1-G1')
    const out = await ctx.runner.step()
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(0)
    expect(out.kind).toBe('advanced')
    expect(stateOf(out).goals[0].mergedSha).toBe(mergeCommit)
    expect(ctx.rig.git.current).toBe('milestone/M1')
    expect(await ctx.rig.git.headSha('milestone/M1')).toBe(mergeCommit)
    await ctx.runner.step()
    expect(await ctx.rig.git.headSha('goal/M1-G2')).toBe(mergeCommit)
  })

  it('CI를 통과한 머리가 아닌 머리로 병합된 PR은 받지 않고 멈춘다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    ctx.rig.git.dirty = true
    await ctx.rig.git.commitAll('CI를 안 거친 커밋')
    await ctx.rig.git.push('goal/M1-G1')
    ctx.rig.gh.mergeByHuman(100)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(0)
  })

  it('로컬 병합은 됐는데 push 전에 꺼졌으면 다시 병합하지 않고 push만 한다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    const head = at.goals[0].ciSha as string
    await ctx.rig.git.checkout('milestone/M1')
    const merged = await ctx.rig.git.mergeNoFf(head, '꺼지기 전 병합')
    const out = await ctx.runner.step()
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(1)
    expect(ctx.rig.git.calls.at(-1)).toBe('push milestone/M1')
    expect(out.kind === 'advanced' && out.verdict?.evidence).toContain('push만')
    // 받는 것은 부모가 (원격 머리, PR 머리)인 병합 커밋 하나뿐이다(그 밖은 loopRunner.guards.test.ts)
    expect(ctx.rig.git.remote.get('milestone/M1')?.at(-1)).toBe(merged)
  })

  it('PR 머리가 CI를 통과한 머리와 다르면 병합하지 않고 CI로 돌아간다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/merge')
    ctx.rig.git.dirty = true
    await ctx.rig.git.commitAll('CI를 안 거친 커밋')
    await ctx.rig.git.push('goal/M1-G1')
    const out = await ctx.runner.step()
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(0)
    expect(out.kind).toBe('failed')
    expect(label(ctx, stateOf(out))).toBe('G1/ci')
  })

  it('마일스톤 PR이 이미 있으면 다시 열지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-pr')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step()
    restore()
    await ctx.runner.step()
    expect(ctx.rig.gh.calls.filter((c) => c === 'createPr milestone/M1 master')).toHaveLength(1)
  })

  it('등급 통계에서 실행기의 생존 문서(.agentdeck/)는 뺀다 — 매 단계 쓰는 상태 파일로 강이 되지 않는다', async () => {
    // 무엇이든 세는 변형본(uncountedPaths 비움)이라야 거르기가 없을 때 강이 된다
    const ctx = setup(variantText((raw) => { (raw.grading as Record<string, unknown>).uncountedPaths = [] }))
    ctx.rig.git.diff = [
      { path: 'src/a.ts', added: 5, removed: 0 },
      { path: '.agentdeck/run-state.json', added: 200, removed: 50 },
      { path: '.agentdeck\\verification.md', added: 30, removed: 0 },
    ]
    await until(ctx, 'G1/grade')
    const out = await ctx.runner.step()
    expect(out.kind === 'advanced' && stateOf(out).goals[0].grade).toBe('weak')
  })
})

describe('템플릿 해시와 상태 스키마', () => {
  it('앱의 템플릿 해시가 상태와 다르면 불러오기와 실행을 멈추고 포트를 부르지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/checks')
    const changed = setup(variantText((raw) => { raw.title = '바뀐 프로그램 개발' }), ctx.rig)
    const loadedState = await changed.runner.load()
    expect(loadedState.kind).toBe('blocked')
    expect(loadedState.kind === 'blocked' && loadedState.reason).toContain('해시')
    const calls = [ctx.rig.commands.calls.length, ctx.rig.session.calls.length, ctx.rig.git.calls.length]
    expect((await changed.runner.step()).kind).toBe('blocked')
    expect([ctx.rig.commands.calls.length, ctx.rig.session.calls.length, ctx.rig.git.calls.length]).toEqual(calls)
  })

  it('스키마에 맞지 않는 실행 상태는 불러오지도 돌리지도 않고, 이미 있는 상태 위에 새로 시작하지 않는다', async () => {
    const ctx = setup()
    await ensureStarted(ctx)
    expect((await ctx.runner.start('M1')).kind).toBe('blocked')
    await ctx.rig.fs.write(DOCS.runState, '{ "schema": 1, "cursor": "merge" }')
    // 실행기가 쓴 상태로 놓는다(옛 앱 판이 쓴 스키마 밖 상태) — 밖에서 고친 경우는 digestStore.test.ts가 본다
    ctx.rig.digest.adopt(CWD, ctx.rig.fs)
    const r = await ctx.runner.load()
    expect(r.kind).toBe('blocked')
    expect(r.kind === 'blocked' && (r.errors ?? []).length).toBeGreaterThan(0)
    expect((await ctx.runner.step()).kind).toBe('blocked')
    expect(ctx.rig.session.calls).toEqual([])
  })

  it('작업 저장소에는 템플릿 내용을 복사하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/checks')
    const written = [...ctx.rig.fs.files.keys()]
    // 마일스톤 스펙과 결정 대장은 브레인스토밍 세션(가짜)이 쓴다 — 실행기가 쓰는 것은 상태와 검증 기록뿐이다
    expect(written.filter((k) => !k.startsWith('.agentdeck/goals/')).sort()).toEqual([DOCS.decisions, DOCS.milestoneSpec, DOCS.runState, DOCS.verification].sort())
    expect(ctx.rig.fs.files.get(DOCS.runState)).not.toContain('instruction')
  })
})

describe('실행기 브랜치와 재시도 (M11 G3)', () => {
  it('[M11-G3 M09-9] 마일스톤 브랜치 push는 이름이 아니라 확인한 머리 SHA로 보낸다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-branch')
    const pushes: [string, string | undefined][] = []
    const push = ctx.rig.git.push.bind(ctx.rig.git)
    ctx.rig.git.push = async (branch, sha) => { pushes.push([branch, sha]); await push(branch, sha) }
    expect((await ctx.runner.step()).kind).toBe('advanced')
    expect(pushes).toEqual([['milestone/M1', await ctx.rig.git.headSha('milestone/M1')]])
  })

  it('[M11-G3 M09-8] 시작 SHA 없이 이미 있는 브랜치는 로컬 ref가 아니라 원격 머리로 계보를 본다 — 로컬 base를 옮긴 커밋은 push하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-branch')
    ctx.rig.git.local.set('master', ['m0', 'x1'])
    ctx.rig.git.local.set('milestone/M1', ['m0', 'x1'])
    const out = await ctx.runner.step()
    expect(out.kind).not.toBe('advanced')
    expect(ctx.rig.git.remote.get('milestone/M1') ?? []).not.toContain('x1')
  })

  it('[M11-G3 M09-12] 메인 노드가 FAIL한 뒤 같은 노드의 다음 요청은 직전 FAIL 사유를 싣는다', async () => {
    const ctx = setup()
    await ensureStarted(ctx)
    ctx.rig.session.nextResult = { ok: false, summary: '질문 도구 없이 글로 묻고 끝났다' }
    expect((await ctx.runner.step()).kind).toBe('failed')
    let seen: WorkRequest | null = null
    ctx.rig.session.onWork = async (req) => { seen = req }
    await ctx.runner.step()
    expect(ctx.rig.session.calls).toEqual(['brainstorm', 'brainstorm'])
    expect(JSON.stringify(seen)).toContain('질문 도구 없이 글로 묻고 끝났다')
    expect(buildNodePrompt(seen as unknown as WorkRequest)).toContain('질문 도구 없이 글로 묻고 끝났다')
  })
})

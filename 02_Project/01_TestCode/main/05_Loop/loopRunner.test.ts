// M09 G1 실행기 껍질 — 가짜 포트(fs·git·gh·명령·세션·검수)로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것: 실제 템플릿으로 완주, 규칙 게이트 증거(검증 줄)를 실행기가 직접 쓴다, 에이전트가 쓴 「PASS」 글로는 나아가지 않는다,
// 재개는 같은 노드를 고른다, action은 확인 뒤 실행(이미 된 일은 다시 하지 않는다), 템플릿 해시가 다르면 멈춘다.
import { describe, it, expect } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, type LoopRunner } from '@main/05_Loop/loopRunner'
import type { RunState } from '@main/05_Loop/runState'
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
function setup(text?: string, rig: Rig = makeRig()): Ctx {
  const { template, hash } = loaded(text)
  return { template, hash, rig, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD }) }
}
async function started(ctx: Ctx): Promise<RunState> {
  const r = await ctx.runner.start('M1')
  if (r.kind !== 'ok') throw new Error(`시작 실패: ${JSON.stringify(r)}`)
  return r.state
}
async function until(ctx: Ctx, label: string, from?: RunState): Promise<RunState> {
  const run = await runLoop(ctx.runner, ctx.template, ctx.rig, from ?? (await started(ctx)), { until: label })
  expect(labelOf(nextStep(ctx.template, run.state))).toBe(label)
  return run.state
}
const label = (ctx: Ctx, s: RunState): string => labelOf(nextStep(ctx.template, s))
const count = (calls: string[], prefix: string): number => calls.filter((c) => c.startsWith(prefix)).length
// 「실행은 됐는데 상태 저장 전에 꺼짐」 — 생존 문서를 실행 전으로 되돌린다(git·gh 쪽의 일은 남는다).
function snapshot(rig: Rig): () => void {
  const saved = new Map(rig.fs.files)
  return () => { rig.fs.files.clear(); for (const [k, v] of saved) rig.fs.files.set(k, v) }
}
async function reload(ctx: Ctx): Promise<RunState> {
  const r = await ctx.runner.load()
  if (r.kind !== 'ok') throw new Error(`불러오기 실패: ${JSON.stringify(r)}`)
  return r.state
}

describe('실제 템플릿으로 마일스톤 하나를 완주한다', () => {
  it('노드 순서·결정론적 동작·검증 줄이 템플릿을 따른다', async () => {
    const ctx = setup()
    ctx.rig.session.onWork = async (req) => {
      if (req.node.id === 'implement' && req.goal?.id === 'G2') ctx.rig.git.diff = [{ path: 'src/small.ts', added: 10, removed: 2 }]
    }
    const run = await runLoop(ctx.runner, ctx.template, ctx.rig, await started(ctx))
    expect(run.visited).toEqual(REAL_ORDER)
    expect(run.state.status).toBe('done')
    expect(run.state.goals.map((g) => [g.id, g.grade, g.pr])).toEqual([['G1', 'strong', 100], ['G2', 'weak', 101]])
    expect(run.state.milestonePr).toBe(102)
    expect(ctx.rig.gh.calls.filter((c) => c.startsWith('createPr'))).toEqual([
      'createPr goal/M1-G1 milestone/M1', 'createPr goal/M1-G2 milestone/M1', 'createPr milestone/M1 master',
    ])
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(2)
    expect(ctx.rig.review.calls).toEqual(['G1/review'])
    expect(ctx.rig.commands.calls).toEqual(Array(3).fill(null).flatMap(() => [
      { cmd: 'npm run build', cwd: CWD }, { cmd: 'npm test', cwd: CWD },
    ]))
    expect(run.state.lines.every((l) => l.by === 'executor')).toBe(true)
    const saved = await reload(ctx)
    expect(saved).toEqual(run.state)
    expect(ctx.rig.fs.files.get(DOCS.verification)).toContain('PASS')
  })

  it('분해 노드가 goal 문서에 적은 「등급: 약」은 믿지 않고 변경 통계(80줄)로 강을 정한다', async () => {
    const ctx = setup()
    const s = await until(ctx, 'G1/review')
    expect(ctx.rig.fs.files.get(goalDocPath('G1'))).toContain('등급: 약')
    expect(s.goals[0].grade).toBe('strong')
  })
})

describe('규칙 게이트의 증거는 실행기가 쓴다', () => {
  it('템플릿이 적은 명령을 명령 포트로 돌리고, 실패면 FAIL 줄을 상태와 문서에 직접 쓴다', async () => {
    const ctx = setup()
    ctx.rig.commands.failing.add('npm test')
    const at = await until(ctx, 'G1/checks')
    const before = ctx.rig.commands.calls.length
    const out = await ctx.runner.step(at)
    expect(out.kind).toBe('failed')
    expect(ctx.rig.commands.calls.slice(before)).toEqual([{ cmd: 'npm run build', cwd: CWD }, { cmd: 'npm test', cwd: CWD }])
    if (out.kind !== 'failed') return
    expect(out.state.lines.at(-1)).toMatchObject({ marker: 'FAIL', by: 'executor', judge: 'rule', node: 'checks', goal: 'G1' })
    expect(out.state.lines.at(-1)?.sentence).toContain('npm test')
    expect(label(ctx, out.state)).toBe('G1/implement')
    expect(ctx.rig.fs.files.get(DOCS.verification)).toMatch(/- FAIL .*checks\(rule\).*npm test/)
    expect(await reload(ctx)).toEqual(out.state)
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
    const out = await ctx.runner.step(resumed)
    expect(ctx.rig.commands.calls.length).toBeGreaterThan(before)
    expect(out.kind).toBe('failed')
    if (out.kind !== 'failed') return
    expect(label(ctx, out.state)).not.toBe('G1/grade')
    expect(out.state.lines.filter((l) => l.marker === 'PASS' && l.node === 'checks')).toEqual([])
    expect(ctx.rig.fs.files.get(DOCS.verification)).not.toContain('에이전트')
  })

  it('밖에서는 규칙·모델 판정을 넣을 수 없고, 사람 판정도 규칙 게이트를 통과시키지 못한다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/checks')
    const rule = await ctx.runner.submit(at, { node: 'checks', judge: 'rule', verdict: 'pass', evidence: '통과' })
    expect(rule.kind).toBe('blocked')
    const model = await ctx.runner.submit(at, { node: 'checks', judge: 'model', verdict: 'pass', evidence: '통과' })
    expect(model.kind).toBe('blocked')
    const human = await ctx.runner.submit(at, { node: 'checks', judge: 'human', verdict: 'pass', evidence: '통과' })
    expect(human.kind).toBe('blocked')
    expect(label(ctx, await reload(ctx))).toBe('G1/checks')
  })

  it('실행기 껍질에도 건너뛰기·강제 통과 API가 없다', () => {
    expect(Object.keys(setup().runner).sort()).toEqual(['load', 'start', 'step', 'submit'])
  })
})

describe('게이트 불통과와 멈춤', () => {
  it('모델 게이트(검수) 불통과 — PR을 열지 않고 구현으로 돌아간다', async () => {
    const ctx = setup()
    ctx.rig.review.queue.push('fail')
    const out = await ctx.runner.step(await until(ctx, 'G1/review'))
    expect(out.kind).toBe('failed')
    if (out.kind !== 'failed') return
    expect(label(ctx, out.state)).toBe('G1/implement')
    expect(count(ctx.rig.gh.calls, 'createPr')).toBe(0)
  })

  it('사람 게이트(스펙 승인)는 사람 판정 전까지 기다리고 브랜치를 가르지 않는다', async () => {
    const ctx = setup()
    const run = await runLoop(ctx.runner, ctx.template, ctx.rig, await started(ctx), { approve: false })
    expect(run.last?.kind).toBe('waiting')
    expect(label(ctx, run.state)).toBe('spec-approval')
    expect(count(ctx.rig.git.calls, 'createBranch')).toBe(0)
    const rejected = await ctx.runner.submit(run.state, { node: 'spec-approval', judge: 'human', verdict: 'fail', evidence: '범위가 넓다' })
    expect(rejected.kind === 'failed' && label(ctx, rejected.state)).toBe('brainstorm')
  })

  it('FAIL 셋이면 멈춰 사람을 부르고, 사람의 이어 가기 판정 뒤에는 0부터 센다', async () => {
    const ctx = setup()
    ctx.rig.commands.failing.add('npm test')
    let s = await until(ctx, 'G1/checks')
    for (let i = 0; i < 2; i++) {
      const out = await ctx.runner.step(s)
      expect(out.kind).toBe('failed')
      s = await until(ctx, 'G1/checks', (out as { state: RunState }).state)
    }
    const third = await ctx.runner.step(s)
    expect(third.kind).toBe('halted')
    s = (third as { state: RunState }).state
    expect(s.failCount).toBe(3)
    expect(ctx.rig.fs.files.get(DOCS.verification)).toContain('사람 판단 대기')
    const calls = ctx.rig.commands.calls.length
    expect((await ctx.runner.step(s)).kind).toBe('halted')
    expect(ctx.rig.commands.calls.length).toBe(calls)
    const resumed = await ctx.runner.submit(s, { node: 'implement', judge: 'human', verdict: 'pass', evidence: '시험 환경을 고쳤다' })
    expect(resumed.kind).toBe('resumed')
    if (resumed.kind !== 'resumed') return
    expect(resumed.state.failCount).toBe(0)
    expect(resumed.state.lines.at(-1)).toMatchObject({ marker: 'USER-INPUT', judge: 'human', by: 'executor' })
    expect(label(ctx, resumed.state)).toBe('G1/implement')
  })
})

describe('재개는 같은 노드를 고르고, action은 확인 뒤 실행이다', () => {
  it('같은 문서·포트 상태에서 몇 번을 불러와도, 새 실행기로 불러와도 같은 노드다', async () => {
    const ctx = setup()
    ctx.rig.gh.ci = 'pending'
    const at = await until(ctx, 'G1/ci')
    expect((await ctx.runner.step(at)).kind).toBe('waiting')
    const a = await reload(ctx)
    const b = await reload(ctx)
    const other = setup(undefined, ctx.rig)
    const c = await reload(other)
    expect([label(ctx, a), label(ctx, b), label(other, c)]).toEqual(['G1/ci', 'G1/ci', 'G1/ci'])
    expect(a).toEqual(at)
    expect(c).toEqual(at)
  })

  it('브랜치가 이미 있으면 만들지 않는다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'milestone-branch')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step(at)
    restore()
    const out = await ctx.runner.step(await reload(ctx))
    expect(count(ctx.rig.git.calls, 'createBranch')).toBe(1)
    expect(out.kind === 'advanced' && out.verdict?.evidence).toContain('이미 있다')
  })

  it('PR이 이미 있으면 다시 열지 않고 번호를 맞춘다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/goal-pr')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step(at)
    restore()
    const out = await ctx.runner.step(await reload(ctx))
    expect(count(ctx.rig.gh.calls, 'createPr')).toBe(1)
    expect(out.kind).toBe('advanced')
    if (out.kind !== 'advanced') return
    expect(out.state.goals[0].pr).toBe(100)
    expect(label(ctx, out.state)).toBe('G1/ci')
  })

  it('PR이 이미 병합됐으면 다시 병합하지 않는다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step(at)
    restore()
    const out = await ctx.runner.step(await reload(ctx))
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(1)
    expect(out.kind === 'advanced' && out.verdict?.evidence).toContain('이미 병합')
    expect(out.kind === 'advanced' && label(ctx, out.state)).toBe('G2/goal-branch')
  })

  it('옛 머리로 병합된 PR도 다시 병합하지 않고 상태를 맞춘다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    ctx.rig.gh.mergeByHuman(100)
    ctx.rig.git.dirty = true
    await ctx.rig.git.commitAll('늦은 커밋')
    await ctx.rig.git.push('goal/M1-G1')
    const out = await ctx.runner.step(at)
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(0)
    expect(out.kind).toBe('advanced')
    if (out.kind !== 'advanced') return
    expect(out.state.goals[0].mergedSha).toBe('h'.repeat(40))
  })

  it('로컬 병합은 됐는데 push 전에 꺼졌으면 다시 병합하지 않고 push만 한다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    const head = at.goals[0].ciSha as string
    await ctx.rig.git.checkout('milestone/M1')
    await ctx.rig.git.mergeNoFf(head, '꺼지기 전 병합')
    const out = await ctx.runner.step(at)
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(1)
    expect(ctx.rig.git.calls.at(-1)).toBe('push milestone/M1')
    expect(out.kind === 'advanced' && out.verdict?.evidence).toContain('push만')
  })

  it('PR 머리가 CI를 통과한 머리와 다르면 병합하지 않고 CI로 돌아간다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    ctx.rig.git.dirty = true
    await ctx.rig.git.commitAll('CI를 안 거친 커밋')
    await ctx.rig.git.push('goal/M1-G1')
    const out = await ctx.runner.step(at)
    expect(count(ctx.rig.git.calls, 'merge ')).toBe(0)
    expect(out.kind).toBe('failed')
    if (out.kind !== 'failed') return
    expect(label(ctx, out.state)).toBe('G1/ci')
  })

  it('goal PR 동작은 goal 브랜치로 옮긴 뒤 커밋한다 — 다른 브랜치가 체크아웃돼 있어도 마일스톤 브랜치에 얹히지 않는다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/goal-pr')
    await ctx.rig.git.checkout('milestone/M1')
    const milestoneBefore = [...(ctx.rig.git.local.get('milestone/M1') ?? [])]
    await ctx.runner.step(at)
    expect(ctx.rig.git.local.get('milestone/M1')).toEqual(milestoneBefore)
    expect(ctx.rig.git.calls).toContain('commit G1: 첫 goal')
    expect((ctx.rig.git.local.get('goal/M1-G1') ?? []).length).toBeGreaterThan(milestoneBefore.length)
  })

  it('이미 병합된 PR의 상태를 맞출 때도 마일스톤 브랜치로 옮겨 둔다 — 회귀가 그 트리에서 돈다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/merge')
    ctx.rig.gh.mergeByHuman(100)
    await ctx.runner.step(at)
    expect(ctx.rig.git.current).toBe('milestone/M1')
  })

  it('마일스톤 병합 게이트는 PR 병합 사실로만 통과한다 — 밖에서 사람 pass를 넣어도 끝나지 않는다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'milestone-merge')
    const out = await ctx.runner.submit(at, { node: 'milestone-merge', judge: 'human', verdict: 'pass', evidence: '끝났다' })
    expect(out.kind).toBe('blocked')
    expect(label(ctx, await reload(ctx))).toBe('milestone-merge')
    expect((await ctx.runner.step(at)).kind).toBe('waiting')
  })

  it('등급 통계에서 실행기의 생존 문서(.agentdeck/)는 뺀다 — 매 단계 쓰는 상태 파일로 강이 되지 않는다', async () => {
    // 모든 파일을 세는 변형본(appSourcePaths 비움)이라야 거르기가 없을 때 강이 된다
    const ctx = setup(variantText((raw) => { (raw.grading as Record<string, unknown>).appSourcePaths = [] }))
    ctx.rig.git.diff = [
      { path: 'src/a.ts', added: 5, removed: 0 },
      { path: '.agentdeck/run-state.json', added: 200, removed: 50 },
      { path: '.agentdeck\\verification.md', added: 30, removed: 0 },
    ]
    const out = await ctx.runner.step(await until(ctx, 'G1/grade'))
    expect(out.kind === 'advanced' && out.state.goals[0].grade).toBe('weak')
  })

  it('마일스톤 PR이 이미 있으면 다시 열지 않는다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'milestone-pr')
    const restore = snapshot(ctx.rig)
    await ctx.runner.step(at)
    restore()
    await ctx.runner.step(await reload(ctx))
    expect(ctx.rig.gh.calls.filter((c) => c === 'createPr milestone/M1 master')).toHaveLength(1)
  })
})

describe('템플릿 해시와 상태 스키마', () => {
  it('앱의 템플릿 해시가 상태와 다르면 불러오기와 실행을 멈추고 포트를 부르지 않는다', async () => {
    const ctx = setup()
    const at = await until(ctx, 'G1/checks')
    const changed = setup(variantText((raw) => { raw.title = '바뀐 프로그램 개발' }), ctx.rig)
    const loadedState = await changed.runner.load()
    expect(loadedState.kind).toBe('blocked')
    expect(loadedState.kind === 'blocked' && loadedState.reason).toContain('해시')
    const calls = [ctx.rig.commands.calls.length, ctx.rig.session.calls.length, ctx.rig.git.calls.length]
    expect((await changed.runner.step(at)).kind).toBe('blocked')
    expect([ctx.rig.commands.calls.length, ctx.rig.session.calls.length, ctx.rig.git.calls.length]).toEqual(calls)
  })

  it('스키마에 맞지 않는 실행 상태는 불러오지 않고, 이미 있는 상태 위에 새로 시작하지 않는다', async () => {
    const ctx = setup()
    await started(ctx)
    expect((await ctx.runner.start('M1')).kind).toBe('blocked')
    await ctx.rig.fs.write(DOCS.runState, '{ "schema": 1, "cursor": "merge" }')
    const r = await ctx.runner.load()
    expect(r.kind).toBe('blocked')
    expect(r.kind === 'blocked' && (r.errors ?? []).length).toBeGreaterThan(0)
  })

  it('작업 저장소에는 템플릿 내용을 복사하지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/checks')
    const written = [...ctx.rig.fs.files.keys()]
    expect(written.filter((k) => !k.startsWith('.agentdeck/goals/')).sort()).toEqual([DOCS.runState, DOCS.verification].sort())
    expect(ctx.rig.fs.files.get(DOCS.runState)).not.toContain('instruction')
  })
})

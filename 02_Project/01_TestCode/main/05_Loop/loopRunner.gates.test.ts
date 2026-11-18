// M09 G4 실행기 껍질의 사람·모델 게이트 — 가짜 포트로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것: 스펙 승인 판정은 사람이 본 스펙 해시에 묶인다(파일이 다르면 거부), 검수 입력은 goal 문서와 실행기가 만든 diff다,
// 검수 pass는 검수한 트리 해시에 묶여 goal 커밋·push 직전에 다시 대조된다(다르면 멈춤), 기준 브랜치는 시작할 때 상태에 적고
// 다시 열 때 다르면 멈춘다, goal PR 본문에 그 goal의 검증 줄이 실린다, 세션 취소는 FAIL로 세지 않고 멈춘다.
import { describe, expect, it } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, type LoopRunner } from '@main/05_Loop/loopRunner'
import type { RunState } from '@main/05_Loop/runState'
import { DOCS, goalDocPath } from '@main/05_Loop/survivalDocs'
import type { Template } from '@main/05_Loop/template'
import { SPEC_TEXT, labelOf, loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'

interface Ctx { template: Template; hash: string; rig: Rig; runner: LoopRunner }
function setup(rig: Rig = makeRig(), base = 'master'): Ctx {
  const { template, hash } = loaded()
  return { template, hash, rig, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base }) }
}
async function until(ctx: Ctx, target: string): Promise<RunState> {
  if ((await ctx.runner.load()).kind === 'missing') expect((await ctx.runner.start('M1')).kind).toBe('ok')
  const run = await runLoop(ctx.runner, ctx.rig, { until: target })
  expect(labelOf(nextStep(ctx.template, run.state))).toBe(target)
  return run.state
}
const human = (verdict: 'pass' | 'fail', evidence = '사람이 봤다') => ({ node: 'spec-approval', judge: 'human' as const, verdict, evidence })

describe('스펙 승인은 사람이 본 스펙 해시에 묶인다', () => {
  it('보인 본문·해시를 읽고, 같은 해시로 넣은 승인만 받는다', async () => {
    const ctx = setup()
    await until(ctx, 'spec-approval')
    const view = await ctx.runner.specView()
    expect(view.text).toBe(SPEC_TEXT)
    expect(view.sha256).toMatch(/^[0-9a-f]{64}$/)
    // 해시 없이, 틀린 해시로 넣으면 거부하고 아무 줄도 쓰지 않는다
    const before = ctx.rig.fs.files.get(DOCS.runState)
    expect((await ctx.runner.submit(human('pass'))).kind).toBe('blocked')
    expect((await ctx.runner.submit(human('pass'), { specSha256: 'f'.repeat(64) })).kind).toBe('blocked')
    // 노드 이름을 바꿔 넣어도 해시 검사를 건너뛰지 못한다
    expect((await ctx.runner.submit({ ...human('pass'), node: 'brainstorm' })).kind).toBe('blocked')
    expect(ctx.rig.fs.files.get(DOCS.runState)).toBe(before)
    const ok = await ctx.runner.submit(human('pass'), { specSha256: view.sha256 as string })
    expect(ok.kind).toBe('advanced')
    expect(ok.kind === 'advanced' && ok.verdict?.evidence).toContain(view.sha256?.slice(0, 12))
  })

  it('사람이 본 뒤 스펙 파일이 바뀌면 승인도 반려도 거부한다', async () => {
    const ctx = setup()
    await until(ctx, 'spec-approval')
    const view = await ctx.runner.specView()
    await ctx.rig.fs.write(DOCS.milestoneSpec, `${SPEC_TEXT}\n하지 않을 것: (몰래 더함)\n`)
    const pass = await ctx.runner.submit(human('pass'), { specSha256: view.sha256 as string })
    expect(pass.kind === 'blocked' && pass.reason).toContain('스펙')
    expect((await ctx.runner.submit(human('fail', '범위가 넓다'), { specSha256: view.sha256 as string })).kind).toBe('blocked')
    expect(labelOf(nextStep(ctx.template, (await ctx.runner.load() as { state: RunState }).state))).toBe('spec-approval')
  })

  it('스펙 파일이 없으면 승인할 수 없다', async () => {
    const ctx = setup()
    ctx.rig.session.onWork = async (req) => { if (req.node.id === 'brainstorm') ctx.rig.fs.files.delete(DOCS.milestoneSpec) }
    await until(ctx, 'spec-approval')
    expect(await ctx.runner.specView()).toEqual({ text: null, sha256: null })
    const r = await ctx.runner.submit(human('pass'), { specSha256: 'a'.repeat(64) })
    expect(r.kind === 'blocked' && r.reason).toContain('스펙')
  })

  it('멈춘 실행의 이어 가기(사람 pass)는 스펙 해시 없이 받는다 — 스펙 승인 판정이 아니다', async () => {
    const ctx = setup()
    ctx.rig.commands.failing.add('npm test')
    for (let i = 0; i < 3; i++) {
      await until(ctx, 'G1/checks')
      await ctx.runner.step()
    }
    expect((await ctx.runner.submit({ node: 'implement', judge: 'human', verdict: 'pass', evidence: '고쳤다' })).kind).toBe('resumed')
  })
})

describe('모델 게이트의 입력과 트리 해시 묶기', () => {
  it('검수에는 goal 문서와 실행기가 만든 diff(작업 트리 대 마일스톤 브랜치)를 준다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/review')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    const req = ctx.rig.review.requests[0]
    expect(req.goalDoc).toBe(ctx.rig.fs.files.get(goalDocPath('G1')))
    expect(req.diff).toBe(ctx.rig.git.reviewDiff)
    expect(req.base).toBe('milestone/M1')
    expect(ctx.rig.git.calls).toContain('reviewSnapshot milestone/M1')
    expect(out.state?.goals[0].reviewedTree).toBe('t0')
  })

  it('검수 pass 뒤 작업 트리가 바뀌면 커밋·push·PR을 하지 않고 멈춘다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/goal-pr')
    ctx.rig.git.tree = 't-after-review'
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.haltReason).toContain('검수')
    expect(ctx.rig.git.calls.filter((c) => c.startsWith('commit ') || c.startsWith('push goal/'))).toEqual([])
    expect(ctx.rig.gh.calls.filter((c) => c.startsWith('createPr'))).toEqual([])
    expect(out.state?.lines.filter((l) => l.marker === 'FAIL')).toEqual([])
  })

  it('검수 동안 작업 트리가 바뀌면 그 pass를 받지 않고 멈춘다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/review')
    ctx.rig.review.during = () => { ctx.rig.git.tree = 't-during' }
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.goals[0].reviewedTree ?? null).toBeNull()
  })

  it('약 등급 goal(검수 없음)은 트리 대조 없이 PR을 연다', async () => {
    const ctx = setup()
    ctx.rig.git.diff = [{ path: 'src/small.ts', added: 3, removed: 0 }]
    await until(ctx, 'G1/goal-pr')
    ctx.rig.git.tree = 't-changed'
    expect((await ctx.runner.step()).kind).toBe('advanced')
  })
})

describe('기준 브랜치와 goal PR 본문', () => {
  it('시작할 때 읽은 기준 브랜치를 상태에 적고, 다시 열 때 다른 기준 브랜치면 멈춘다', async () => {
    const ctx = setup()
    await until(ctx, 'milestone-branch')
    const r = await ctx.runner.load()
    expect(r.kind === 'ok' && r.state.base).toBe('master')
    const other = setup(ctx.rig, 'main')
    const moved = await other.runner.load()
    expect(moved.kind === 'blocked' && moved.reason).toContain('기준 브랜치')
    expect((await other.runner.step()).kind).toBe('blocked')
  })

  it('goal PR 본문에 그 goal의 검증 줄(검사·등급·검수 PASS)을 코드 울타리 안에 싣는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/ci')
    const body = ctx.rig.gh.bodies.get('goal/M1-G1') ?? ''
    expect(body).toContain('## 검증 기록')
    expect(body).toMatch(/```text[\s\S]*- PASS .*checks\(rule\)[\s\S]*- PASS .*review\(model\)[\s\S]*```/)
    expect(body).not.toContain('G2')
  })
})

describe('세션 취소는 FAIL로 세지 않고 멈춘다', () => {
  it('취소된 작업 노드는 멈춤이고 FAIL 줄이 없으며, 사람의 이어 가기로 같은 노드를 다시 돈다', async () => {
    const ctx = setup()
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    ctx.rig.session.nextResult = { ok: false, summary: '화면에서 취소했다', cancelled: true }
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.failCount).toBe(0)
    expect(out.state?.lines).toEqual([])
    expect(out.state?.haltReason).toContain('취소')
    expect((await ctx.runner.submit({ node: 'brainstorm', judge: 'human', verdict: 'pass', evidence: '다시 돌린다' })).kind).toBe('resumed')
    expect((await ctx.runner.step()).kind).toBe('advanced')
    expect(ctx.rig.session.calls).toEqual(['brainstorm', 'brainstorm'])
  })
})

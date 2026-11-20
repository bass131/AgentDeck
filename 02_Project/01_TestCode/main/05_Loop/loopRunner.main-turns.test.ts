// M10 G2 — 브레인스토밍(role main)이 메인 대화의 여러 턴이 될 때의 실행기 경계. 가짜 포트로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것:
//   - 세션 포트가 「아직 대화 중」(waiting)을 돌려주면 판정도 줄도 없이 기다린다 — 몇 번을 돌아도 FAIL이 쌓이지 않고 상태 파일이 그대로다.
//     waiting은 메인 노드에만 받는다(작업자 노드가 돌려주면 FAIL).
//   - 포트가 그 방문을 연 때의 스펙 해시(baseline)를 주면 「이번에 바뀌었나」를 그것과 대조한다 — 재기동 뒤 다시 읽은 본문이 기준이 되지 않는다.
//   - 실행기는 방문 키(마일스톤 id와 검증 줄 수)와 반려 사유(그 노드로 되돌린 사람 반려 줄)를 의뢰에 싣는다.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, visitKeyOf, type LoopRunner } from '@main/05_Loop/loopRunner'
import type { WorkRequest } from '@main/05_Loop/ports'
import type { RunState } from '@main/05_Loop/runState'
import { DOCS } from '@main/05_Loop/survivalDocs'
import type { Template } from '@main/05_Loop/template'
import { SPEC_TEXT, labelOf, loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

interface Ctx { template: Template; rig: Rig; runner: LoopRunner; reqs: WorkRequest[] }
function setup(): Ctx {
  const { template, hash } = loaded()
  const rig = makeRig()
  const reqs: WorkRequest[] = []
  const inner = rig.session.runWork.bind(rig.session)
  rig.session.runWork = async (req) => { reqs.push(req); return inner(req) }
  return { template, rig, reqs, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master' }) }
}
const stateOf = async (ctx: Ctx): Promise<RunState> => (await ctx.runner.load() as { state: RunState }).state

describe('메인 노드의 여러 턴 — 기다림은 판정이 아니다 (M10 G2)', () => {
  it('포트가 waiting을 돌려주면 줄도 FAIL도 없이 기다린다 — 다섯 번을 돌아도 상태 파일이 그대로다', async () => {
    const ctx = setup()
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    const before = ctx.rig.fs.files.get(DOCS.runState)
    const verification = ctx.rig.fs.files.get(DOCS.verification)
    for (let i = 0; i < 5; i++) {
      ctx.rig.session.nextResult = { ok: false, summary: '사용자를 기다린다', waiting: true }
      const r = await ctx.runner.step()
      expect(r.kind).toBe('waiting')
      expect(r.kind === 'waiting' && r.on).toBe('human')
    }
    expect(ctx.rig.fs.files.get(DOCS.runState)).toBe(before)
    expect(ctx.rig.fs.files.get(DOCS.verification)).toBe(verification)
    const st = await stateOf(ctx)
    expect(st.failCount).toBe(0)
    expect(st.lines).toEqual([])
    expect(labelOf(nextStep(ctx.template, st))).toBe('brainstorm')
  })

  it('작업자 노드가 waiting을 돌려주면 받지 않고 FAIL이다', async () => {
    const ctx = setup()
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    await runLoop(ctx.runner, ctx.rig, { until: 'decompose' })
    ctx.rig.session.nextResult = { ok: false, summary: '기다린다', waiting: true }
    const r = await ctx.runner.step()
    expect(r.kind).toBe('failed')
    expect(r.state?.lines.at(-1)?.marker).toBe('FAIL')
  })

  it('baseline을 주면 그것과 대조한다 — 스펙이 그 방문의 처음과 같으면 FAIL, 다르면 지금 읽은 본문과 같아도 통과한다', async () => {
    const ctx = setup()
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    await ctx.rig.fs.write(DOCS.milestoneSpec, SPEC_TEXT)
    // 포트의 버그 흉내 — 바뀌지 않았는데 끝났다고 한다
    ctx.rig.session.nextResult = { ok: true, summary: '끝', baseline: { specSha256: sha(SPEC_TEXT) } }
    const same = await ctx.runner.step()
    expect(same.kind).toBe('failed')
    expect(same.state?.lines.at(-1)?.sentence).toContain('바뀌지 않았다')
    // 재기동 꼴 — 스펙은 앞 실행에서 이미 바뀌었고(지금 읽은 본문과 같다), 방문의 처음은 다른 본문이었다
    ctx.rig.session.nextResult = { ok: true, summary: '초안을 썼다', baseline: { specSha256: null } }
    expect((await ctx.runner.step()).kind).toBe('advanced')
    expect(labelOf(nextStep(ctx.template, await stateOf(ctx)))).toBe('spec-approval')
  })

  it('방문 키는 기다리는 동안 그대로이고, 반려되면 바뀌며 반려 사유가 실린다', async () => {
    const ctx = setup()
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    ctx.rig.session.nextResult = { ok: false, summary: '기다린다', waiting: true }
    await ctx.runner.step()
    await ctx.runner.step()
    const [a, b] = ctx.reqs
    expect(a.visit).toEqual({ key: 'M1#0', rejected: null })
    expect(b.visit).toEqual(a.visit)
    // 두 번째 step은 가짜 세션의 기본(스펙을 쓴다)으로 통과한다
    const view = await ctx.runner.specView()
    const r = await ctx.runner.submit({ node: 'spec-approval', judge: 'human', verdict: 'fail', evidence: '범위가 넓다' }, { specSha256: view.sha256 as string })
    expect(r.kind).toBe('failed')
    ctx.rig.session.nextResult = { ok: false, summary: '기다린다', waiting: true }
    await ctx.runner.step()
    const c = ctx.reqs.at(-1) as WorkRequest
    expect(c.visit?.key).not.toBe(a.visit?.key)
    expect(c.visit?.rejected).toContain('범위가 넓다')
    expect((await stateOf(ctx)).failCount).toBe(0)
    // 구동자의 쓰기 창 판정이 같은 키 함수를 쓴다
    expect(visitKeyOf(await stateOf(ctx))).toBe(c.visit?.key)
  })
})

// 실행기 껍질의 사람·모델 게이트 — 가짜 포트로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것: 스펙 승인 판정은 사람이 본 스펙 해시에 묶인다(파일이 다르면 거부), 검수 입력은 goal 문서와 실행기가 만든 diff다,
// 검수 pass는 검수한 트리 해시에 묶여 goal 커밋·push 직전에 다시 대조된다(다르면 멈춤), 기준 브랜치는 시작할 때 상태에 적고
// 다시 열 때 다르면 멈춘다, goal PR 본문에 그 goal의 검증 줄이 실린다, 세션 취소는 FAIL로 세지 않고 멈춘다.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, type LoopRunner } from '@main/05_Loop/loopRunner'
import { createGitPort } from '@main/05_Loop/realPorts/gitPort'
import type { RunState } from '@main/05_Loop/runState'
import { DOCS, goalDocPath, readGoalSeeds } from '@main/05_Loop/survivalDocs'
import type { Template } from '@main/05_Loop/template'
import { SPEC_TEXT, labelOf, loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const CWD = 'C:/work/practice'
const SLOW = { timeout: 120_000 }

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
    expect(ok.kind === 'advanced' && ok.state.specSha256).toBe(view.sha256)
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

  // 브레인스토밍은 스펙 파일 없이 pass하지 않는다(아래). 승인 대기 중에 파일이 사라진 경우를 본다
  it('스펙 파일이 없으면 승인할 수 없다', async () => {
    const ctx = setup()
    await until(ctx, 'spec-approval')
    ctx.rig.fs.files.delete(DOCS.milestoneSpec)
    expect(await ctx.runner.specView()).toEqual({ text: null, sha256: null })
    const r = await ctx.runner.submit(human('pass'), { specSha256: 'a'.repeat(64) })
    expect(r.kind === 'blocked' && r.reason).toContain('스펙')
    expect((await ctx.runner.submit(human('pass'))).kind).toBe('blocked')
  })

  // 스펙 파일이 없을 때 빠져나갈 길: 해시 없는 반려는 받아 브레인스토밍으로 돌아간다(승인은 계속 해시가 필요하다)
  it('스펙 파일이 없으면 해시 없는 반려를 받아 브레인스토밍으로 돌아간다 — FAIL이 아니라 USER-INPUT이다', async () => {
    const ctx = setup()
    await until(ctx, 'spec-approval')
    ctx.rig.fs.files.delete(DOCS.milestoneSpec)
    const r = await ctx.runner.submit(human('fail', '스펙이 써지지 않았다 — 다시 이야기한다'))
    expect(r.kind).toBe('failed')
    expect(labelOf(nextStep(ctx.template, (await ctx.runner.load() as { state: RunState }).state))).toBe('brainstorm')
    expect(r.state?.failCount).toBe(0)
    expect(r.state?.lines.at(-1)?.marker).toBe('USER-INPUT')
    expect(r.state?.lines.at(-1)?.sentence).toContain('스펙 파일 없음')
    expect(r.state?.specSha256 ?? null).toBeNull()
  })

  // 실제 모델이 일반 글로 묻고 턴을 끝내 스펙 없이 브레인스토밍이 pass했다. 스펙 파일이 없거나 비면 FAIL로 다시 돈다
  it.each([['없음', null], ['빈 파일', '  \n']])('브레인스토밍이 스펙 파일(%s) 없이 끝나면 FAIL이고 브레인스토밍을 다시 돈다', async (_label, body) => {
    const ctx = setup()
    ctx.rig.session.onWork = async (req) => {
      if (req.node.id !== 'brainstorm') return
      if (body === null) ctx.rig.fs.files.delete(DOCS.milestoneSpec)
      else await ctx.rig.fs.write(DOCS.milestoneSpec, body)
    }
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    const r = await ctx.runner.step()
    expect(r.kind).toBe('failed')
    const st = (await ctx.runner.load() as { state: RunState }).state
    expect(labelOf(nextStep(ctx.template, st))).toBe('brainstorm')
    expect(st.failCount).toBe(1)
    expect(st.lines.at(-1)?.marker).toBe('FAIL')
    expect(st.lines.at(-1)?.sentence).toContain(DOCS.milestoneSpec)
  })

  // 반려 뒤(또는 다음 마일스톤에서) 옛 스펙이 남아 있으면, 아무것도 쓰지 않고 끝난 세션도 통과하던 길
  it('반려 뒤 다시 돈 브레인스토밍이 스펙도 결정 대장도 바꾸지 않고 끝나면 FAIL이다', async () => {
    const ctx = setup()
    await until(ctx, 'spec-approval')
    const view = await ctx.runner.specView()
    expect((await ctx.runner.submit(human('fail', '범위가 넓다'), { specSha256: view.sha256 as string })).kind).toBe('failed')
    ctx.rig.session.nextResult = { ok: true, summary: '글로 묻고 턴을 끝냈다' }
    const r = await ctx.runner.step()
    expect(r.kind).toBe('failed')
    expect(r.state?.lines.at(-1)?.marker).toBe('FAIL')
    expect(r.state?.lines.at(-1)?.sentence).toContain('바뀌지 않았다')
    expect(labelOf(nextStep(ctx.template, (await ctx.runner.load() as { state: RunState }).state))).toBe('brainstorm')
    // 다음 세션이 받은 답을 결정 대장에 남기면(가짜 세션의 기본) 통과한다
    expect((await ctx.runner.step()).kind).toBe('advanced')
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
    // diff·등급의 기준은 로컬 ref 이름이 아니라 goal을 가를 때 실행기가 적은 시작 SHA다
    const baseSha = out.state?.goals[0].baseSha as string
    expect(baseSha).toBeTruthy()
    expect(req.baseSha).toBe(baseSha)
    expect(ctx.rig.git.calls).toContain(`reviewSnapshot ${baseSha}`)
    expect(ctx.rig.git.calls).toContain(`diffStat ${baseSha}`)
    expect(ctx.rig.git.calls.filter((c) => /^(?:reviewSnapshot|diffStat) \S*\//.test(c))).toEqual([])
    expect(out.state?.goals[0].reviewedTree).toBe('t0')
  })

  // diff가 상한을 넘으면 잘린 diff로 검수하지 않는다(pass가 전체 트리에 묶이므로). 멈추고 FAIL로 세지 않는다
  it('diff가 상한을 넘으면 검수 세션을 열지 않고 멈춘다 — FAIL 줄이 없다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/review')
    ctx.rig.git.reviewTooLarge = 500_000
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.haltReason).toContain('상한')
    expect(out.state?.haltReason).toContain('목표를 나누거나')
    expect(ctx.rig.review.calls).toEqual([])
    expect(out.state?.failCount).toBe(0)
    expect(out.state?.lines.filter((l) => l.marker === 'FAIL')).toEqual([])
  })

  // 사람이 읽는 판정 문장은 목표·실패 어휘다(브랜치 이름은 그대로)
  it('diff를 만들지 못하면 검수를 열지 않는 실패이고, 그 문장은 「목표 시작」이다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/review')
    ctx.rig.git.reviewMissing = true
    const out = await ctx.runner.step()
    const last = out.state?.lines.at(-1)
    expect(last?.marker).toBe('FAIL')
    expect(last?.sentence).toContain('목표 시작')
    expect(last?.sentence).not.toMatch(/(?<![\w/-])goal(?![\w/-])/)
    expect(ctx.rig.review.calls).toEqual([])
  })

  it('분해 노드의 통과 문장은 「목표 N개로 나눴다」다', async () => {
    const ctx = setup()
    await until(ctx, 'decompose')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    expect(out.kind === 'advanced' ? out.verdict?.evidence : null).toMatch(/^목표 \d+개로 나눴다 — /)
  })

  // 트리를 대조한 SHA 하나를 push한다. 대조와 push 사이에 로컬 브랜치가 움직여도 그 커밋은 원격에 가지 않는다
  it('goal PR은 트리를 대조한 그 SHA를 push한다 — 대조 뒤 로컬 브랜치에 얹힌 커밋은 올리지 않는다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/goal-pr')
    const git = ctx.rig.git
    const treeOf = git.treeOf.bind(git)
    let evil: string | null = null
    git.treeOf = async (ref: string) => {
      const t = await treeOf(ref)
      if (evil === null) {
        evil = git.sha('e')
        git.commitTrees.set(evil, 't-evil')
        git.local.get('goal/M1-G1')?.push(evil)
      }
      return t
    }
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    const remote = git.remote.get('goal/M1-G1') ?? []
    expect(remote).not.toContain(evil)
    expect(out.state?.goals[0].pushedSha).toBe(remote.at(-1))
    expect(git.calls.filter((c) => c === 'push goal/M1-G1')).toHaveLength(1)
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

// 검수 기준 문서(goal 문서·승인한 스펙)는 실행기가 적은 해시에 묶인다. 구현 노드가 고치면 검수·PR 전에 멈춘다
describe('검수 기준 문서의 해시', () => {
  const sha = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex')

  it('goal 문서 읽기는 본문의 sha256을 함께 낸다', async () => {
    const rig = makeRig()
    await rig.fs.write(goalDocPath('G1'), '# 첫 goal\n\n본문\n')
    const r = await readGoalSeeds(rig.fs)
    expect(r.ok && r.goals).toEqual([{ id: 'G1', title: '첫 goal', docSha256: sha('# 첫 goal\n\n본문\n') }])
  })

  it('분해가 pass하면 goal 문서마다 sha256을, 스펙 승인이 pass하면 승인한 스펙 해시를 상태에 적는다', async () => {
    const ctx = setup()
    const s = await until(ctx, 'G1/goal-branch')
    expect(s.goals.map((g) => g.docSha256)).toEqual(['G1', 'G2'].map((id) => sha(ctx.rig.fs.files.get(goalDocPath(id)) as string)))
    expect(s.specSha256).toBe(sha(SPEC_TEXT))
  })

  it('밖에서 넣은 판정의 facts는 버린다 — 상태의 스펙 해시는 실행기가 대조한 값이다', async () => {
    const ctx = setup()
    await until(ctx, 'spec-approval')
    const view = await ctx.runner.specView()
    const out = await ctx.runner.submit({ ...human('pass'), facts: { specSha256: 'f'.repeat(64) } }, { specSha256: view.sha256 as string })
    expect(out.kind).toBe('advanced')
    expect(out.kind === 'advanced' && out.state.specSha256).toBe(view.sha256)
  })

  it('구현 노드가 goal 문서를 고치면 검수 세션을 열지 않고 멈춘다', async () => {
    const ctx = setup()
    ctx.rig.session.onWork = async (req) => {
      if (req.node.id === 'implement') await ctx.rig.fs.write(goalDocPath('G1'), '# 첫 goal\n\n완료조건: 없음\n')
    }
    await until(ctx, 'G1/review')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.haltReason).toContain('목표 문서')
    expect(out.state?.haltReason).not.toMatch(/goal 문서/)
    expect(ctx.rig.review.calls).toEqual([])
    expect(out.state?.failCount).toBe(0)
  })

  it('약 등급 goal(검수 없음)도 goal 문서가 바뀌었으면 goal PR을 열지 않는다', async () => {
    const ctx = setup()
    ctx.rig.git.diff = [{ path: 'src/small.ts', added: 3, removed: 0 }]
    await until(ctx, 'G1/goal-pr')
    await ctx.rig.fs.write(goalDocPath('G1'), '# 첫 goal\n\n바꿨다\n')
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.haltReason).toContain('목표 문서')
    expect(out.state?.haltReason).not.toMatch(/goal PR/)
    expect(ctx.rig.git.calls.filter((c) => c.startsWith('push goal/'))).toEqual([])
    expect(ctx.rig.gh.calls.filter((c) => c.startsWith('createPr'))).toEqual([])
  })

  it('승인 뒤 스펙 파일이 바뀌면 다음 노드에서 멈춘다', async () => {
    const ctx = setup()
    await until(ctx, 'G1/implement')
    await ctx.rig.fs.write(DOCS.milestoneSpec, `${SPEC_TEXT}\n하지 않을 것: (몰래 바꿈)\n`)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('halted')
    expect(out.state?.haltReason).toContain('스펙')
    expect(ctx.rig.session.calls).not.toContain('G1/implement')
  })
})

// 프로브 refmove.ts의 꼴. 작업 노드가 `git branch -f milestone/M1 HEAD`로 로컬 마일스톤 브랜치를 goal 머리로
// 옮겨도, 등급과 검수 diff는 goal을 가를 때 적은 시작 SHA로 계산한다. 같은 이름의 태그로 브랜치를 가려도 브랜치를 읽는다.
describe('기준 SHA — 실제 git (M09 G4 검수 I6)', () => {
  let repos: TempRepos
  beforeEach(() => { repos = makeTempRepos('agentdeck-g4-refmove-') })
  afterEach(() => { repos.cleanup() })

  it('로컬 마일스톤 브랜치를 goal 머리로 옮겨도 등급은 강이고 검수 diff에 그 파일이 있다', SLOW, async () => {
    const rig = makeRig()
    const git = createGitPort({ cwd: repos.work, env: repos.env })
    rig.ports.git = git
    rig.session.onWork = async (req) => {
      if (req.node.id !== 'implement') return
      fs.mkdirSync(path.join(repos.work, 'src'), { recursive: true })
      fs.writeFileSync(path.join(repos.work, 'src', 'evil.ts'), Array.from({ length: 200 }, (_, i) => `export const x${i} = ${i}`).join('\n') + '\n')
      repos.git(['add', '-A'])
      repos.git(['commit', '--quiet', '-m', 'evil'])
      // 작업 노드가 할 수 있는 일 — 로컬 마일스톤 브랜치를 goal 머리로, 같은 이름의 태그로 가리기
      repos.git(['branch', '-f', 'milestone/M1', 'HEAD'])
      repos.git(['tag', 'milestone/M1', 'HEAD'])
    }
    const { template, hash } = loaded()
    const ctx: Ctx = { template, hash, rig, runner: createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master' }) }
    const s = await until(ctx, 'G1/goal-pr')
    expect(s.goals[0].grade).toBe('strong')
    expect(rig.review.requests).toHaveLength(1)
    expect(rig.review.requests[0].diff).toContain('src/evil.ts')
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

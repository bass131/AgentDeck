// 실행기의 Taste 판정 — 가짜 포트와 실물 검수 세션 포트(가짜 백엔드)로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것: 판은 마일스톤 시작점 커밋의 프로젝트 Taste와 검수 시작 때의 전역 Taste다(작업 트리·앞 goal이 고친 Taste가 아니다),
// 프로젝트 판에 문제가 있으면 첫 goal 브랜치를 가르기 전에 멈춘다, 판을 읽지 못하거나 검사 문제가 있으면 검수를 열지 않고 멈춘다,
// 검증 기록 줄의 근거에 모든 항목의 ID와 판정이 실린다, 인정된 충돌은 실행 상태에 쌓여 마일스톤 PR 본문의 「영역 재설계 안건」에 실린다.
import { describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun } from '@main/03_Agent/AgentBackend'
import { nextStep } from '@main/05_Loop/executor'
import { createLoopRunner, type LoopRunner } from '@main/05_Loop/loopRunner'
import type { LoopPorts } from '@main/05_Loop/ports'
import { createReviewSessionPort } from '@main/05_Loop/reviewSession'
import { validateRunState, type RunState } from '@main/05_Loop/runState'
import type { Template } from '@main/05_Loop/template'
import { labelOf, loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'
const TASTE_REL = 'docs/agentdeck/Taste.md'
const PROJECT = '# 프로젝트 Taste\n\n## T1 한 화면\n- 원칙: 시작점의 원칙\n\n## T5 장식\n- 원칙: 담백하게\n- 금지: 그라데이션\n'
const GLOBAL = '# 전역 Taste\n\n## T1 말투\n- 원칙: 평문\n'

function scriptedBackend(answer: (prompt: string) => string): { backend: AgentBackend; prompts: string[] } {
  const prompts: string[] = []
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      const prompt = String(req.messages[0]?.content ?? '')
      prompts.push(prompt)
      return {
        events: (async function* () {
          await Promise.resolve()
          yield { type: 'text' as const, delta: answer(prompt), messageId: 'm1' }
          yield { type: 'done' as const }
        })(),
        abort() {}, interrupt() {}, push() {}, respond() {},
      }
    },
  }
  return { backend, prompts }
}

interface Ctx { template: Template; rig: Rig; runner: LoopRunner; prompts: string[] }
type Global = string | null | Error
function setup(answer: (prompt: string) => string, global: Global = GLOBAL): Ctx {
  const { template, hash } = loaded()
  const rig = makeRig()
  const { backend, prompts } = scriptedBackend(answer)
  const review = createReviewSessionPort({ backend, cwd: CWD, env: {}, appLoopDir: 'C:/app/loop' })
  const ports: LoopPorts = {
    ...rig.ports,
    review,
    taste: { readGlobal: async () => { if (global instanceof Error) throw global; return global } },
  }
  return { template, rig, runner: createLoopRunner({ template, hash, ports, cwd: CWD, base: 'master' }), prompts }
}
async function atReview(ctx: Ctx): Promise<RunState> {
  expect((await ctx.runner.start('M1')).kind).toBe('ok')
  const run = await runLoop(ctx.runner, ctx.rig, { until: 'G1/review' })
  expect(labelOf(nextStep(ctx.template, run.state))).toBe('G1/review')
  return run.state
}
const reply = (...lines: string[]) => (): string => ['근거를 본다.', ...lines].join('\n')
const idsIn = (prompt: string): string[] => [...(prompt.split('## Taste 체크리스트')[1] ?? '').matchAll(/^## ([PG]-T\d+)/gm)].map((m) => m[1])
// 프롬프트에 실린 항목마다 줄을 쓴다. marks에 없는 항목은 pass다
const answering = (marks: Record<string, string> = {}, extra: string[] = []) => (prompt: string): string =>
  ['근거를 본다.', ...idsIn(prompt).map((id) => `TASTE ${id}: ${marks[id] ?? 'pass — 맞다'}`), ...extra, 'VERDICT: pass'].join('\n')
const PASS_ALL = answering()

describe('판의 고정', () => {
  it('마일스톤 시작점의 프로젝트 Taste와 전역 Taste를 체크리스트로 싣는다 — 작업 트리에서 바뀐 Taste가 아니다', async () => {
    const ctx = setup(PASS_ALL)
    const state = await atReview(ctx)
    ctx.rig.git.committed.set(`${state.milestoneBase}:${TASTE_REL}`, PROJECT)
    await ctx.rig.fs.write(TASTE_REL, PROJECT.replace('시작점의 원칙', '작업 노드가 고친 원칙'))
    ctx.rig.git.reviewDiff = `diff --git a/Docs/AgentDeck/Taste.md b/Docs/AgentDeck/Taste.md\n-- 원칙: 시작점의 원칙\n+- 원칙: 작업 노드가 고친 원칙\n`
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    expect(ctx.rig.git.calls).toContain(`fileAt ${state.milestoneBase} ${TASTE_REL}`)
    const prompt = ctx.prompts[0]
    expect(prompt).toContain('## P-T1 한 화면\n- 원칙: 시작점의 원칙')
    expect(prompt).toContain('## G-T1 말투')
    expect(prompt.split('## Taste 체크리스트')[1]).not.toContain('작업 노드가 고친 원칙')
    expect(out.state?.lines.at(-1)?.sentence).toContain('docs/agentdeck/')
  })

  it('앞 goal이 Taste를 고쳐 병합해도 다음 goal의 판은 마일스톤 시작점의 원문이다 — 약 등급 goal은 검수 없이 병합된다', async () => {
    const ctx = setup(PASS_ALL)
    ctx.rig.git.committed.set(`m0:${TASTE_REL}`, PROJECT)
    ctx.rig.git.committed.set(`*:${TASTE_REL}`, PROJECT.replace('시작점의 원칙', '앞 goal이 고친 원칙'))
    ctx.rig.session.onWork = async (req) => {
      if (req.node.id !== 'implement') return
      ctx.rig.git.diff = req.goal?.id === 'G1' ? [{ path: TASTE_REL, added: 2, removed: 1 }] : [{ path: 'src/index.ts', added: 80, removed: 0 }]
    }
    expect((await ctx.runner.start('M1')).kind).toBe('ok')
    const run = await runLoop(ctx.runner, ctx.rig, { until: 'G2/review' })
    expect(labelOf(nextStep(ctx.template, run.state))).toBe('G2/review')
    expect(run.state.milestoneBase).toBe('m0')
    expect(run.state.goals[0].grade).toBe('weak')
    expect(run.state.goals[0].mergedSha).toBeTruthy()
    expect(run.state.goals[1].baseSha).not.toBe('m0')
    expect(ctx.prompts).toEqual([])
    expect((await ctx.runner.step()).kind).toBe('advanced')
    expect(ctx.prompts[0]).toContain('## P-T1 한 화면\n- 원칙: 시작점의 원칙')
    expect(ctx.prompts[0]).not.toContain('앞 goal이 고친 원칙')
  })

  it('마일스톤 시작점의 프로젝트 Taste를 판으로 쓸 수 없으면 첫 goal 브랜치를 가르기 전에 멈춘다 — 이 실행에서는 고칠 수 없다고 적는다', async () => {
    const fixed = '판은 마일스톤 시작점 커밋 m0의 원문이라 이 실행에서는 고칠 수 없다. 기본 브랜치에서 고친 뒤 새 실행으로'
    const cases: [string, (ctx: Ctx) => void][] = [
      ['검사 문제', (ctx) => { ctx.rig.git.committed.set(`*:${TASTE_REL}`, `${PROJECT}\n## T1 겹침\n- 원칙: x\n`) }],
      ['프로젝트 Taste를 읽지 못했다', (ctx) => { ctx.rig.git.fileAtError = '대소문자만 다른 경로가 2개 있다' }],
    ]
    for (const [reason, arrange] of cases) {
      const ctx = setup(PASS_ALL)
      arrange(ctx)
      expect((await ctx.runner.start('M1')).kind).toBe('ok')
      const run = await runLoop(ctx.runner, ctx.rig)
      expect(run.state.status, reason).toBe('needs-user')
      expect(run.state.haltReason, reason).toContain(reason)
      expect(run.state.haltReason, reason).toContain(fixed)
      expect(run.state.cursor, reason).toEqual({ goal: 0, node: 'goal-branch' })
      expect(ctx.rig.session.calls, reason).not.toContain('G1/implement')
      expect(ctx.rig.git.calls.filter((c) => c.startsWith('createBranch goal/')), reason).toEqual([])
      expect(run.state.lines.filter((l) => l.marker === 'FAIL'), reason).toEqual([])
    }
  })

  it('두 층 모두 없으면 체크리스트 절이 없고 TASTE 줄을 읽지 않는다 — 지금 검수 그대로다', async () => {
    const ctx = setup(reply('TASTE P-T1: fail — 체크리스트에 없는 줄', 'VERDICT: pass'), null)
    await atReview(ctx)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    expect(ctx.prompts[0]).not.toContain('Taste')
    expect(ctx.prompts[0]).not.toContain('TASTE')
    expect(out.state?.lines.at(-1)?.sentence).not.toContain('Taste')
  })

  it('한 층만 있으면 그 층만 싣는다', async () => {
    const ctx = setup(reply('TASTE G-T1: pass — 평문', 'VERDICT: pass'))
    await atReview(ctx)
    expect((await ctx.runner.step()).kind).toBe('advanced')
    expect(ctx.prompts[0]).toContain('## G-T1 말투')
    expect(ctx.prompts[0]).not.toContain('## P-')
  })

  it('판을 읽지 못하거나 검사 문제가 있으면 검수를 열지 않고 멈춘다 — FAIL 줄이 없다', async () => {
    const fixable = '사람이 전역 Taste를 고치고 이어 간다'
    const fixed = '이 실행에서는 고칠 수 없다'
    const cases: [string, string, (ctx: Ctx, base: string) => void, Global][] = [
      ['프로젝트 Taste를 읽지 못했다', fixed, (ctx) => { ctx.rig.git.fileAtError = 'git cat-file 실패' }, GLOBAL],
      ['전역 Taste를 읽지 못했다', fixable, () => undefined, new Error('EACCES')],
      ['프로젝트 Taste에 검사 문제', fixed, (ctx, base) => { ctx.rig.git.committed.set(`${base}:${TASTE_REL}`, `${PROJECT}\n## T1 겹침\n- 원칙: x\n`) }, GLOBAL],
      ['전역 Taste에 검사 문제', fixable, () => undefined, '# 전역 Taste\n\n```\n## T1 a\n```\n'],
    ]
    for (const [reason, wording, arrange, global] of cases) {
      const ctx = setup(PASS_ALL, global)
      const state = await atReview(ctx)
      arrange(ctx, state.milestoneBase as string)
      const out = await ctx.runner.step()
      expect(out.kind, reason).toBe('halted')
      expect(out.state?.haltReason, reason).toContain(reason)
      expect(out.state?.haltReason, reason).toContain(wording)
      expect(ctx.prompts, reason).toEqual([])
      expect(out.state?.lines.filter((l) => l.marker === 'FAIL'), reason).toEqual([])
    }
  })
})

describe('검증 기록 줄의 근거', () => {
  it('TASTE fail이 있으면 VERDICT pass여도 FAIL 줄이고, 근거에 모든 항목의 ID와 판정·금지 표시가 실린다', async () => {
    const ctx = setup(reply('TASTE P-T1: pass — 한 화면', 'TASTE P-T5: fail — 그라데이션 배경', 'TASTE G-T1: n/a — 글 없음', 'VERDICT: pass'))
    const state = await atReview(ctx)
    ctx.rig.git.committed.set(`${state.milestoneBase}:${TASTE_REL}`, PROJECT)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('failed')
    const line = out.state?.lines.at(-1)
    expect(line?.marker).toBe('FAIL')
    expect(line?.node).toBe('review')
    expect(line?.sentence).toMatch(/^Taste P-T1 pass, P-T5 fail\(금지\), G-T1 n\/a/)
    expect(line?.sentence).toContain('VERDICT는 pass였지만 Taste 판정으로 불통과')
    expect(line?.sentence).toContain('P-T5: 그라데이션 배경')
  })

  it('80개 항목이 모두 pass여도 VERDICT fail이면 그 사유가 남고, pass 근거는 항목이 많고 충돌 줄이 길어도 검수 트리와 함께 400자 안이다', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `## T${i + 1} 항목 ${i + 1}\n- 원칙: 원칙 ${i + 1}`).join('\n\n')
    const long = (verdict: string, extra: string[] = []) => (prompt: string): string =>
      ['긴 근거 '.repeat(80), ...idsIn(prompt).map((id) => `TASTE ${id}: pass — ${'충분히 긴 근거 글 '.repeat(5)}`), ...extra, verdict].join('\n')
    const conflict = `TASTE-CONFLICT P-${'X'.repeat(300)} G-${'Y'.repeat(300)}: ${'Z'.repeat(600)}`
    for (const [answer, kind, must] of [[long('VERDICT: fail'), 'failed', '검수 세션이 VERDICT: fail을 냈다'], [long('VERDICT: pass', [conflict]), 'advanced', '(검수 트리 ']] as const) {
      const ctx = setup(answer, null)
      ctx.rig.git.committed.set(`*:${TASTE_REL}`, `# 프로젝트 Taste\n\n${many}\n`)
      await atReview(ctx)
      ctx.rig.git.reviewDiff = `diff --git a/${TASTE_REL} b/${TASTE_REL}\n+x\n`
      const out = await ctx.runner.step()
      expect(out.kind, must).toBe(kind)
      const sentence = out.state?.lines.at(-1)?.sentence ?? ''
      expect(sentence, must).toContain(must)
      expect(sentence, must).toContain('pass 80개')
      expect(sentence, must).toContain('docs/agentdeck/')
      expect(sentence.length, must).toBeLessThan(400)
      if (kind === 'advanced') expect(sentence).toMatch(/\(검수 트리 \S+\)$/)
    }
  })

  it('검수 한 번에 줄 하나다 — 항목이 많아도 모든 ID·판정과 검수 트리가 한 줄에 남는다', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `## T${i + 1} 항목 ${i + 1}\n- 원칙: 원칙 ${i + 1}`).join('\n\n')
    const ids = Array.from({ length: 30 }, (_, i) => `P-T${i + 1}`)
    const ctx = setup(reply('긴 근거 '.repeat(80), ...ids.map((id) => `TASTE ${id}: pass — ${'충분히 긴 근거 글 '.repeat(5)}`), 'VERDICT: pass'), null)
    const state = await atReview(ctx)
    ctx.rig.git.committed.set(`${state.milestoneBase}:${TASTE_REL}`, `# 프로젝트 Taste\n\n${many}\n`)
    const before = state.lines.length
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    expect(out.state?.lines.length).toBe(before + 1)
    const sentence = out.state?.lines.at(-1)?.sentence ?? ''
    for (const id of ids) expect(sentence).toMatch(new RegExp(`${id}(?!\\d)[^,;]*pass|pass[^;]*${id}(?!\\d)`))
    expect(sentence).toContain('(검수 트리 ')
    expect(sentence.endsWith('…')).toBe(false)
  })
})

describe('충돌 안건', () => {
  const conflict = answering({ 'G-T1': 'fail — 버튼 글이 평문이 아니다' }, ['TASTE-CONFLICT P-T1 G-T1: 버튼 글은 프로젝트의 한 화면 규칙을 따랐다'])

  it('조건이 맞는 충돌로 밀린 전역 fail은 세지 않고, 그 충돌을 실행 상태에 쌓아 마일스톤 PR 본문의 「영역 재설계 안건」에 싣는다', async () => {
    const ctx = setup(conflict)
    await atReview(ctx)
    ctx.rig.git.committed.set(`*:${TASTE_REL}`, PROJECT)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    expect(out.state?.lines.at(-1)?.sentence).toContain('G-T1 fail(면제 P-T1)')
    expect(out.state?.goals[0].tasteConflicts).toEqual([{ project: 'P-T1', global: 'G-T1', note: '버튼 글은 프로젝트의 한 화면 규칙을 따랐다' }])
    const done = await runLoop(ctx.runner, ctx.rig)
    expect(done.state.status).toBe('done')
    const body = ctx.rig.gh.bodies.get('milestone/M1') ?? ''
    const agenda = body.split('## 영역 재설계 안건')[1] ?? ''
    expect(agenda).toContain('- G1 — 프로젝트 P-T1 대 전역 G-T1, 프로젝트 쪽을 따랐다: 버튼 글은 프로젝트의 한 화면 규칙을 따랐다')
  })

  it('안건이 없으면 「영역 재설계 안건」 절에 「없음」을 싣는다', async () => {
    const ctx = setup(PASS_ALL)
    await atReview(ctx)
    expect((await runLoop(ctx.runner, ctx.rig)).state.status).toBe('done')
    expect(ctx.rig.gh.bodies.get('milestone/M1')).toMatch(/## 영역 재설계 안건\n\n- 없음\n/)
  })

  it('충돌 칸이 없는 옛 실행 상태도 그대로 읽히고, 꼴이 틀린 충돌 칸은 거부한다', async () => {
    const ctx = setup(conflict)
    const state = await atReview(ctx)
    expect('tasteConflicts' in state.goals[0]).toBe(false)
    expect(validateRunState(JSON.parse(JSON.stringify(state))).ok).toBe(true)
    const good = structuredClone(state)
    good.goals[0].tasteConflicts = [{ project: 'P-T1', global: 'G-T2', note: 'x' }]
    expect(validateRunState(good).ok).toBe(true)
    for (const bad of [[{ project: 'G-T1', global: 'G-T2', note: 'x' }], [{ project: 'P-T1', global: 'G-T2', note: '' }], [{ project: 'P-T1', global: 'G-T2', note: 'x', extra: 1 }], 'x']) {
      const s = structuredClone(state) as unknown as { goals: Record<string, unknown>[] }
      s.goals[0].tasteConflicts = bad
      expect(validateRunState(s).ok, JSON.stringify(bad)).toBe(false)
    }
  })
})

// 실행기의 Taste 판정 — 가짜 포트와 실물 검수 세션 포트(가짜 백엔드)로 프로덕션 createLoopRunner를 돈다.
// 고정하는 것: 판은 goal 시작 SHA의 프로젝트 Taste와 검수 시작 때의 전역 Taste다(작업 트리의 Taste가 아니다), 판을 읽지 못하거나
// 검사 문제가 있으면 검수를 열지 않고 멈춘다, 검증 기록 줄의 근거에 모든 항목의 ID와 판정이 실린다, 인정된 충돌은 실행 상태에 쌓여
// 마일스톤 PR 본문의 「영역 재설계 안건」에 실린다.
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
const baseOf = (s: RunState): string => s.goals[0].baseSha as string
const reply = (...lines: string[]) => (): string => ['근거를 본다.', ...lines].join('\n')
const idsIn = (prompt: string): string[] => [...(prompt.split('## Taste 체크리스트')[1] ?? '').matchAll(/^## ([PG]-T\d+)/gm)].map((m) => m[1])
// 프롬프트에 실린 항목마다 줄을 쓴다. marks에 없는 항목은 pass다
const answering = (marks: Record<string, string> = {}, extra: string[] = []) => (prompt: string): string =>
  ['근거를 본다.', ...idsIn(prompt).map((id) => `TASTE ${id}: ${marks[id] ?? 'pass — 맞다'}`), ...extra, 'VERDICT: pass'].join('\n')
const PASS_ALL = answering()

describe('판의 고정', () => {
  it('goal 시작 SHA의 프로젝트 Taste와 전역 Taste를 체크리스트로 싣는다 — 작업 트리에서 바뀐 Taste가 아니다', async () => {
    const ctx = setup(PASS_ALL)
    const state = await atReview(ctx)
    ctx.rig.git.committed.set(`${baseOf(state)}:${TASTE_REL}`, PROJECT)
    await ctx.rig.fs.write(TASTE_REL, PROJECT.replace('시작점의 원칙', '작업 노드가 고친 원칙'))
    ctx.rig.git.reviewDiff = `diff --git a/${TASTE_REL} b/${TASTE_REL}\n-- 원칙: 시작점의 원칙\n+- 원칙: 작업 노드가 고친 원칙\n`
    const out = await ctx.runner.step()
    expect(out.kind).toBe('advanced')
    expect(ctx.rig.git.calls).toContain(`fileAt ${baseOf(state)} ${TASTE_REL}`)
    const prompt = ctx.prompts[0]
    expect(prompt).toContain('## P-T1 한 화면\n- 원칙: 시작점의 원칙')
    expect(prompt).toContain('## G-T1 말투')
    expect(prompt.split('## Taste 체크리스트')[1]).not.toContain('작업 노드가 고친 원칙')
    expect(out.state?.lines.at(-1)?.sentence).toContain('docs/agentdeck/')
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
    const cases: [string, (ctx: Ctx, base: string) => void, Global][] = [
      ['프로젝트 Taste를 읽지 못했다', (ctx) => { ctx.rig.git.fileAtError = 'git cat-file 실패' }, GLOBAL],
      ['전역 Taste를 읽지 못했다', () => undefined, new Error('EACCES')],
      ['검사 문제', (ctx, base) => { ctx.rig.git.committed.set(`${base}:${TASTE_REL}`, `${PROJECT}\n## T1 겹침\n- 원칙: x\n`) }, GLOBAL],
      ['검사 문제', () => undefined, '# 전역 Taste\n\n```\n## T1 a\n```\n'],
    ]
    for (const [reason, arrange, global] of cases) {
      const ctx = setup(PASS_ALL, global)
      const state = await atReview(ctx)
      arrange(ctx, baseOf(state))
      const out = await ctx.runner.step()
      expect(out.kind, reason).toBe('halted')
      expect(out.state?.haltReason, reason).toContain(reason)
      expect(ctx.prompts, reason).toEqual([])
      expect(out.state?.lines.filter((l) => l.marker === 'FAIL'), reason).toEqual([])
    }
  })
})

describe('검증 기록 줄의 근거', () => {
  it('TASTE fail이 있으면 VERDICT pass여도 FAIL 줄이고, 근거에 모든 항목의 ID와 판정·금지 표시가 실린다', async () => {
    const ctx = setup(reply('TASTE P-T1: pass — 한 화면', 'TASTE P-T5: fail — 그라데이션 배경', 'TASTE G-T1: n/a — 글 없음', 'VERDICT: pass'))
    const state = await atReview(ctx)
    ctx.rig.git.committed.set(`${baseOf(state)}:${TASTE_REL}`, PROJECT)
    const out = await ctx.runner.step()
    expect(out.kind).toBe('failed')
    const line = out.state?.lines.at(-1)
    expect(line?.marker).toBe('FAIL')
    expect(line?.node).toBe('review')
    expect(line?.sentence).toMatch(/^Taste P-T1 pass, P-T5 fail\(금지\), G-T1 n\/a/)
    expect(line?.sentence).toContain('P-T5: 그라데이션 배경')
  })

  it('검수 한 번에 줄 하나다 — 항목이 많아도 모든 ID·판정과 검수 트리가 한 줄에 남는다', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `## T${i + 1} 항목 ${i + 1}\n- 원칙: 원칙 ${i + 1}`).join('\n\n')
    const ids = Array.from({ length: 30 }, (_, i) => `P-T${i + 1}`)
    const ctx = setup(reply('긴 근거 '.repeat(80), ...ids.map((id) => `TASTE ${id}: pass — ${'충분히 긴 근거 글 '.repeat(5)}`), 'VERDICT: pass'), null)
    const state = await atReview(ctx)
    ctx.rig.git.committed.set(`${baseOf(state)}:${TASTE_REL}`, `# 프로젝트 Taste\n\n${many}\n`)
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

// M09 G1 — 실행기의 바깥 껍질. 포트로 현재 노드를 한 번 실행하고, 그 결과를 판정 하나로 만들어
// 순수 상태 기계(applyVerdict)에 넣은 뒤 생존 문서(run-state.json, verification.md)에 쓴다.
// 상태는 실행기가 소유한다 — step()·submit(verdict)은 상태를 받지 않고 매번 검증된 저장본을 읽으며, 호출은 하나씩 차례로 돈다.
// 그래서 밖에서 커서를 바꾼 상태 객체를 넣는 길이 없고, 겹친 호출이 서로의 검증 줄을 덮어쓰지 않는다.
// 규칙 게이트의 판정과 검증 줄은 여기서 실행기가 만든다 — 명령 포트로 템플릿이 적은 명령을 돌린 결과, git 포트의 변경 통계,
// gh 포트의 CI 상태가 증거다. 밖에서 넣을 수 있는 판정은 사람 판정(submit)뿐이고, 모델 판정은 검수 포트로 받는다.
// 실행기가 만든 판정을 상태 기계가 거부하면 같은 노드의 stop으로 바꿔 멈춘다(사유는 haltReason, 이어 갈 때 USER-INPUT 줄).
// action 노드는 모두 「확인 뒤 실행」이다. 이미 있는 브랜치·PR은 이번 실행의 것일 때만 받는다 —
//   브랜치는 상태에 적은 시작 SHA의 계보일 때, 병합된 PR은 이번에 push한 머리(goal이면 CI를 통과한 머리)와 같을 때.
//   아니면 stop이다. 그래서 「실행은 됐는데 상태 저장 전에 꺼짐」 뒤의 재개가 같은 일을 두 번 하지 않고, 남의 것을 받지도 않는다.
// 재개: load()가 run-state.json을 스키마와 템플릿 해시로 확인하고 같은 노드를 고른다. git·gh와 맞추는 일은 다음 step의 action이 한다.
import {
  applyVerdict, checkResumable, expectedJudge, judgeCi, judgeCommands, nextStep, oneSentence,
  type CommandRun, type NextStep, type Verdict,
} from './executor'
import { computeGrade, type FileChange } from './grade'
import type { LoopPorts } from './ports'
import { createRunState, type GoalState, type RunState } from './runState'
import { readGoalSeeds, readNodeDocs, readRunState, writeRunState, writeVerification } from './survivalDocs'
import type { ActionNode, GateNode, SchemaError, StepNode, Template, WorkNode } from './template'

export interface LoopRunnerDeps {
  template: Template
  hash: string
  ports: LoopPorts
  // 작업 저장소 뿌리 — 검사 명령의 cwd
  cwd: string
}

export type StepOutcome =
  | { kind: 'advanced' | 'failed' | 'halted' | 'resumed' | 'done'; state: RunState; verdict: Verdict | null }
  | { kind: 'waiting'; on: 'human' | 'ci'; state: RunState }
  | { kind: 'blocked'; reason: string; state: RunState | null; errors?: SchemaError[] }

export type LoadResult =
  | { kind: 'missing' }
  | { kind: 'blocked'; reason: string; errors?: SchemaError[] }
  | { kind: 'ok'; state: RunState; next: NextStep }

export interface LoopRunner {
  start(milestoneId: string): Promise<LoadResult>
  load(): Promise<LoadResult>
  step(): Promise<StepOutcome>
  submit(verdict: Verdict): Promise<StepOutcome>
}

export interface BranchNames { base: string; milestone: string; goal: string | null }

export function branchNames(template: Template, milestoneId: string, goalId: string | null): BranchNames {
  const fill = (pattern: string): string => pattern.split('{milestone}').join(milestoneId).split('{goal}').join(goalId ?? '')
  return {
    base: template.branches.base,
    milestone: fill(template.branches.milestone),
    goal: goalId === null ? null : fill(template.branches.goal),
  }
}

type Produced = { kind: 'verdict'; verdict: Verdict } | { kind: 'waiting'; on: 'human' | 'ci' }

// 실행기가 매 단계 쓰는 생존 문서는 goal의 변경이 아니므로 등급 통계에서 뺀다(템플릿과 관계없이).
const EXECUTOR_OWNED = /^(\.[\\/])*\.agentdeck[\\/]/
const short = (sha: string | null | undefined): string => (sha ? sha.slice(0, 8) : '(없음)')
const errorText = (e: unknown): string => oneSentence(e instanceof Error ? e.message : String(e))
const v = (node: StepNode, verdict: Verdict['verdict'], evidence: string, facts?: Verdict['facts']): Verdict =>
  ({ node: node.id, judge: expectedJudge(node), verdict, evidence, facts })

export function createLoopRunner(deps: LoopRunnerDeps): LoopRunner {
  const { template, hash, ports, cwd } = deps
  const { git, gh } = ports

  // 호출 직렬화 — 앞 호출이 끝난 뒤에 다음 호출이 저장본을 읽는다.
  let chain: Promise<unknown> = Promise.resolve()
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }

  async function persist(state: RunState): Promise<void> {
    await writeRunState(ports.fs, state)
    await writeVerification(ports.fs, state)
  }

  async function readCurrent(): Promise<{ ok: true; state: RunState } | { ok: false; outcome: StepOutcome }> {
    const read = await readRunState(ports.fs)
    if (read.kind === 'missing') return { ok: false, outcome: { kind: 'blocked', reason: '실행 상태가 없다 — start로 시작한다', state: null } }
    if (read.kind === 'invalid') {
      return { ok: false, outcome: { kind: 'blocked', reason: '실행 상태가 스키마에 맞지 않는다', state: null, errors: read.errors } }
    }
    const check = checkResumable(template, hash, read.state)
    if (!check.ok) return { ok: false, outcome: { kind: 'blocked', reason: check.reason, state: read.state } }
    return { ok: true, state: read.state }
  }

  async function commit(state: RunState, verdict: Verdict, origin: 'executor' | 'outside'): Promise<StepOutcome> {
    let applied = applyVerdict(template, state, verdict, ports.clock.now())
    if (!applied.ok) {
      if (origin === 'outside') return { kind: 'blocked', reason: applied.reason, state }
      // 실행기가 만든 판정이 거부됐다 — 같은 일을 되풀이하지 않도록 그 노드의 stop으로 멈춘다.
      const here = nextStep(template, state)
      if (here.kind !== 'work' && here.kind !== 'gate' && here.kind !== 'action') return { kind: 'blocked', reason: applied.reason, state }
      const stop: Verdict = { node: here.node.id, judge: expectedJudge(here.node), verdict: 'stop', evidence: `실행기가 만든 판정을 상태 기계가 거부했다 — ${applied.reason}` }
      applied = applyVerdict(template, state, stop, ports.clock.now())
      if (!applied.ok) return { kind: 'blocked', reason: applied.reason, state }
      await persist(applied.state)
      return { kind: 'halted', state: applied.state, verdict: stop }
    }
    const s = applied.state
    await persist(s)
    if (state.status === 'needs-user' && s.status === 'running') return { kind: 'resumed', state: s, verdict }
    const kind = s.status === 'done' ? 'done'
      : s.status === 'needs-user' ? 'halted'
        : verdict.verdict === 'pass' ? 'advanced' : 'failed'
    return { kind, state: s, verdict }
  }

  async function runWork(node: WorkNode, state: RunState, goal: GoalState | null): Promise<Verdict> {
    try {
      const docs = await readNodeDocs(ports.fs, node.docs, goal?.id ?? null)
      const res = await ports.session.runWork({ milestoneId: state.milestoneId, node, goal, docs })
      if (!res.ok) return v(node, 'fail', `작업 세션이 일을 마치지 못했다 — ${res.summary}`)
      if (node.produces !== 'goals') return v(node, 'pass', `작업 세션이 끝났다 — ${res.summary}`)
      const seeds = await readGoalSeeds(ports.fs)
      if (!seeds.ok) return v(node, 'fail', `분해 결과를 읽지 못했다 — ${seeds.reason}`)
      return v(node, 'pass', `goal ${seeds.goals.length}개로 나눴다 — ${seeds.goals.map((g) => g.id).join(', ')}`, { goals: seeds.goals })
    } catch (e) {
      return v(node, 'fail', `작업 세션 오류 — ${errorText(e)}`)
    }
  }

  async function runRule(node: GateNode, goal: GoalState | null, names: BranchNames): Promise<Produced> {
    const rule = node.rule
    try {
      switch (rule?.type) {
        case 'commands': {
          const runs: CommandRun[] = []
          for (const cmd of rule.commands) {
            const r = await ports.command.run(cmd, cwd)
            runs.push({ cmd, ...r })
            if (r.code !== 0) break
          }
          return { kind: 'verdict', verdict: judgeCommands(node, runs) }
        }
        case 'grade': {
          let stat: FileChange[] | null = null
          try { stat = await git.diffStat(names.milestone) } catch { stat = null }
          const g = computeGrade(template.grading, stat === null ? null : stat.filter((f) => !EXECUTOR_OWNED.test(f.path)))
          return { kind: 'verdict', verdict: v(node, 'pass', `등급 ${g.grade === 'strong' ? '강' : '약'} — ${g.reason}`, { grade: g.grade }) }
        }
        case 'ci': {
          if (!goal || goal.pr === null) return { kind: 'verdict', verdict: v(node, 'fail', 'PR 번호가 없어 CI를 읽을 수 없다') }
          // gh 읽기 오류는 FAIL이 아니라 기다림이다(마일스톤 병합 게이트와 같다). 기다림의 상한은 G2가 실제 포트와 함께 둔다.
          let ci
          try { ci = await gh.ciStatus(goal.pr) } catch { return { kind: 'waiting', on: 'ci' } }
          // 이번에 push한 머리의 결과가 아니면 판정하지 않는다.
          const judged = judgeCi(node, ci, goal.pushedSha)
          return judged ? { kind: 'verdict', verdict: judged } : { kind: 'waiting', on: 'ci' }
        }
        default:
          return { kind: 'verdict', verdict: v(node, 'fail', '규칙이 없는 규칙 게이트다') }
      }
    } catch (e) {
      return { kind: 'verdict', verdict: v(node, 'fail', `${node.title} 검사를 돌리지 못했다 — ${errorText(e)}`) }
    }
  }

  async function runGate(node: GateNode, state: RunState, goal: GoalState | null, names: BranchNames): Promise<Produced> {
    if (node.judge === 'rule') return runRule(node, goal, names)
    if (node.judge === 'model') {
      try {
        const r = await ports.review.review({ milestoneId: state.milestoneId, node, goal })
        return { kind: 'verdict', verdict: { node: node.id, judge: 'model', verdict: r.verdict, evidence: r.evidence } }
      } catch (e) {
        return { kind: 'verdict', verdict: v(node, 'fail', `검수 세션이 판정을 내지 못했다 — ${errorText(e)}`) }
      }
    }
    // 사람 게이트 — 마일스톤 병합은 사람이 PR을 병합한 사실이 판정이다. 그 밖은 submit을 기다린다.
    if (node.watch === 'milestonePrMerged' && state.milestonePr !== null) {
      try {
        const pr = await gh.getPr(state.milestonePr)
        if (pr?.state === 'merged') {
          return { kind: 'verdict', verdict: v(node, 'pass', `사람이 PR ${pr.number}을 병합했다(병합 커밋 ${short(pr.mergeCommitSha)})`) }
        }
        if (pr?.state === 'closed') {
          return { kind: 'verdict', verdict: v(node, 'stop', `PR ${pr.number}이 병합 없이 닫혔다 — 사람 판단이 필요하다`) }
        }
      } catch {
        return { kind: 'waiting', on: 'human' }
      }
    }
    return { kind: 'waiting', on: 'human' }
  }

  // 브랜치는 시작 SHA의 계보일 때만 이번 실행의 것으로 받는다. 상태에 시작 SHA가 없으면(만든 뒤 저장 전에 꺼짐) from의 지금 머리로 본다.
  async function ensureBranch(node: ActionNode, name: string, from: string, recordedStart: string | null, pushNew: boolean): Promise<Verdict> {
    if (await git.branchExists(name)) {
      const start = recordedStart ?? (await git.headSha(from))
      if (!start || !(await git.isAncestor(start, name))) {
        return v(node, 'stop', `${name} 브랜치가 이미 있는데 이번 실행이 가른 계보(시작 ${short(start)})가 아니다 — 사람 판단이 필요하다`)
      }
      await git.checkout(name)
      if (pushNew) await git.push(name)
      return v(node, 'pass', `${name} 브랜치가 이미 있다(시작 ${short(start)}의 계보) — 만들지 않고 옮겨 갔다`, { baseSha: start })
    }
    await git.syncToRemote(from)
    const start = await git.headSha(from)
    if (!start) return v(node, 'fail', `${from}의 머리를 읽지 못해 ${name}을 가르지 않았다`)
    await git.createBranch(name, from)
    await git.checkout(name)
    if (pushNew) await git.push(name)
    return v(node, 'pass', `${name} 브랜치를 ${from}의 ${short(start)}에서 갈랐다`, { baseSha: start })
  }

  async function ensurePr(node: ActionNode, head: string, base: string, title: string, body: string, commitFirst: boolean): Promise<Verdict> {
    // 커밋은 지금 체크아웃된 브랜치에 얹힌다. 재개 사이에 브랜치가 바뀌었어도 PR 머리 브랜치에 커밋하도록 먼저 옮긴다.
    await git.checkout(head)
    if (commitFirst && (await git.hasChanges())) await git.commitAll(title)
    await git.push(head)
    const pushed = await git.headSha(head)
    if (!pushed) return v(node, 'fail', `${head}의 머리를 읽지 못했다`)
    const found = await gh.findPr(head, base)
    if (found) {
      if (found.state === 'open') return v(node, 'pass', `PR ${found.number}이 이미 열려 있다 — 다시 열지 않았다`, { pr: found.number, pushedSha: pushed })
      if (found.state === 'merged' && found.headSha === pushed) {
        return v(node, 'pass', `PR ${found.number}은 이번에 push한 머리 ${short(pushed)}로 이미 병합됐다`, { pr: found.number, pushedSha: pushed })
      }
      return v(node, 'stop', `${head} → ${base}의 PR ${found.number}이 ${found.state} 상태이고 머리 ${short(found.headSha)}가 이번에 push한 ${short(pushed)}와 다르다 — 이번 실행의 PR이 아니다`)
    }
    const created = await gh.createPr({ head, base, title, body })
    return v(node, 'pass', `PR ${created.number}을 열었다(${head} → ${base}, 머리 ${short(pushed)})`, { pr: created.number, pushedSha: pushed })
  }

  async function mergeGoal(node: ActionNode, goal: GoalState, names: BranchNames): Promise<Verdict> {
    if (goal.pr === null) return v(node, 'fail', 'PR 번호가 없어 병합할 수 없다')
    const pr = await gh.getPr(goal.pr)
    if (!pr) return v(node, 'fail', `PR ${goal.pr}을 읽지 못했다`)
    if (pr.state === 'merged') {
      if (pr.headSha !== goal.ciSha) {
        return v(node, 'stop', `PR ${pr.number}이 CI를 통과한 머리 ${short(goal.ciSha)}가 아닌 ${short(pr.headSha)}로 병합됐다 — 사람 판단이 필요하다`)
      }
      // 다음 노드(다음 goal 브랜치 가르기·회귀)가 원격과 같은 마일스톤 브랜치 위에서 돌도록 옮기고 맞춘다.
      await git.checkout(names.milestone)
      await git.syncToRemote(names.milestone)
      return v(node, 'pass', `PR ${pr.number}은 CI를 통과한 머리 ${short(pr.headSha)}로 이미 병합됐다(병합 커밋 ${short(pr.mergeCommitSha)}) — 다시 병합하지 않고 상태를 맞췄다`,
        { mergedSha: pr.mergeCommitSha ?? pr.headSha })
    }
    if (pr.state === 'closed') return v(node, 'stop', `PR ${pr.number}이 병합 없이 닫혔다 — 사람 판단이 필요하다`)
    // 머리 SHA 대조 — CI를 통과한 머리와 지금 PR 머리가 같을 때만 병합한다.
    if (pr.headSha !== goal.ciSha) {
      return v(node, 'fail', `PR 머리 ${short(pr.headSha)}가 CI를 통과한 머리 ${short(goal.ciSha)}와 달라 병합하지 않았다`)
    }
    await git.checkout(names.milestone)
    await git.syncToRemote(names.milestone)
    if (await git.isAncestor(pr.headSha, names.milestone)) {
      await git.push(names.milestone)
      const sha = await git.headSha(names.milestone)
      return v(node, 'pass', `머리 ${short(pr.headSha)}는 이미 ${names.milestone}에 있다 — 다시 병합하지 않고 push만 했다`, { mergedSha: sha ?? pr.headSha })
    }
    const merged = await git.mergeNoFf(pr.headSha, `Merge PR #${pr.number}: ${goal.id} ${goal.title}`)
    await git.push(names.milestone)
    return v(node, 'pass', `머리 ${short(pr.headSha)}를 ${names.milestone}에 --no-ff로 병합하고 push했다(병합 커밋 ${short(merged)})`, { mergedSha: merged })
  }

  function milestoneReport(state: RunState): string {
    const rows = state.goals.map((g) => `- ${g.id} ${g.title} — 등급 ${g.grade === 'weak' ? '약' : '강'}, PR ${g.pr ?? '없음'}`)
    return [`# ${state.milestoneId} 마일스톤 결과 보고`, '', ...rows, '', '검증 기록은 `.agentdeck/verification.md`에 있다.'].join('\n')
  }

  async function runAction(node: ActionNode, state: RunState, goal: GoalState | null, names: BranchNames): Promise<Verdict> {
    try {
      switch (node.action) {
        case 'createMilestoneBranch':
          return await ensureBranch(node, names.milestone, names.base, state.milestoneBase, true)
        case 'createGoalBranch':
          if (!goal || names.goal === null) return v(node, 'fail', 'goal 밖에서 goal 브랜치를 가를 수 없다')
          return await ensureBranch(node, names.goal, names.milestone, goal.baseSha, false)
        case 'openGoalPr':
          if (!goal || names.goal === null) return v(node, 'fail', 'goal 밖에서 goal PR을 열 수 없다')
          return await ensurePr(node, names.goal, names.milestone, `${goal.id}: ${goal.title}`, `goal ${goal.id} — ${goal.title}`, true)
        case 'mergeGoal':
          if (!goal) return v(node, 'fail', 'goal 밖에서 goal을 병합할 수 없다')
          return await mergeGoal(node, goal, names)
        case 'openMilestonePr':
          return await ensurePr(node, names.milestone, names.base, `${state.milestoneId} 마일스톤`, milestoneReport(state), false)
      }
    } catch (e) {
      return v(node, 'fail', `${node.title} 중 오류 — ${errorText(e)}`)
    }
  }

  async function produce(next: NextStep, state: RunState): Promise<Produced | null> {
    if (next.kind === 'done' || next.kind === 'needs-user') return null
    const names = branchNames(template, state.milestoneId, next.goal?.id ?? null)
    switch (next.kind) {
      case 'work': return { kind: 'verdict', verdict: await runWork(next.node, state, next.goal) }
      case 'gate': return runGate(next.node, state, next.goal, names)
      case 'action': return { kind: 'verdict', verdict: await runAction(next.node, state, next.goal, names) }
    }
  }

  async function load(): Promise<LoadResult> {
    const read = await readRunState(ports.fs)
    if (read.kind === 'missing') return read
    if (read.kind === 'invalid') return { kind: 'blocked', reason: '실행 상태가 스키마에 맞지 않는다', errors: read.errors }
    const check = checkResumable(template, hash, read.state)
    if (!check.ok) return { kind: 'blocked', reason: check.reason }
    return { kind: 'ok', state: read.state, next: nextStep(template, read.state) }
  }

  return {
    start: (milestoneId) => exclusive(async () => {
      const existing = await readRunState(ports.fs)
      if (existing.kind !== 'missing') return { kind: 'blocked', reason: '실행 상태가 이미 있다 — 새로 시작하지 않는다(load로 이어 간다)' }
      const created = createRunState(template, hash, milestoneId)
      if (!created.ok) return { kind: 'blocked', reason: created.reason }
      await persist(created.state)
      return { kind: 'ok', state: created.state, next: nextStep(template, created.state) }
    }),

    load: () => exclusive(load),

    step: () => exclusive(async () => {
      const cur = await readCurrent()
      if (!cur.ok) return cur.outcome
      const state = cur.state
      const next = nextStep(template, state)
      if (next.kind === 'done') return { kind: 'done', state, verdict: null }
      if (next.kind === 'needs-user') return { kind: 'halted', state, verdict: null }
      const produced = await produce(next, state)
      if (!produced) return { kind: 'halted', state, verdict: null }
      if (produced.kind === 'waiting') return { kind: 'waiting', on: produced.on, state }
      return commit(state, produced.verdict, 'executor')
    }),

    submit: (verdict) => exclusive(async () => {
      const cur = await readCurrent()
      if (!cur.ok) return cur.outcome
      const state = cur.state
      if (verdict.judge !== 'human') {
        return { kind: 'blocked', reason: '밖에서 넣는 판정은 사람 판정뿐이다 — 규칙·모델 판정은 실행기가 포트로 만든다', state }
      }
      // watch가 붙은 사람 게이트(마일스톤 병합)는 사람이 PR을 병합한 사실로만 통과한다. 멈춘 뒤의 이어 가기는 받는다.
      const next = nextStep(template, state)
      if (state.status === 'running' && next.kind === 'gate' && next.node.watch && verdict.verdict === 'pass') {
        return { kind: 'blocked', reason: `${next.node.id}는 PR 병합 사실로만 통과한다 — 병합 버튼으로 병합한다`, state }
      }
      return commit(state, verdict, 'outside')
    }),
  }
}

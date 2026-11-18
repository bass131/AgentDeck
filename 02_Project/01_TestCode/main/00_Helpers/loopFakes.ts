// M09 G1 시험 도우미 — 실제 템플릿 파일 읽기와 변형본 가공, 실행기 포트의 가짜(fs·git·gh·명령·세션·검수·시계).
// 가짜는 상태만 흉내 내고 판정은 하지 않는다. 판정은 언제나 프로덕션 함수(executor·grade·loopRunner)가 한다.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { applyVerdict, expectedJudge, nextStep, type GoalSeed, type NextStep, type Verdict, type VerdictFacts, type CiStatus } from '@main/05_Loop/executor'
import type { FileChange } from '@main/05_Loop/grade'
import type { LoopRunner, StepOutcome } from '@main/05_Loop/loopRunner'
import type {
  CommandPort, CommandResult, FsPort, GhPort, GitPort, LoopPorts, PrInfo, PrState, ReviewPort, SessionPort, WorkRequest,
} from '@main/05_Loop/ports'
import type { RunState } from '@main/05_Loop/runState'
import { loadTemplate, type Grade, type Template } from '@main/05_Loop/template'

const TEMPLATE_PATH = fileURLToPath(new URL('../../../00_Source/main/05_Loop/templates/program-dev.json', import.meta.url))

export const AT = '2026-11-18T10:00:00+09:00'
export const GOALS: GoalSeed[] = [{ id: 'G1', title: '첫 goal' }, { id: 'G2', title: '둘째 goal' }]

// ---- 템플릿 ----
export interface RawNode { id: string; kind: string; steps: RawNode[]; [key: string]: unknown }
export interface RawTemplate { nodes: RawNode[]; [key: string]: unknown }

export function programDevText(): string {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8')
}

export function variantText(mutate: (raw: RawTemplate) => void): string {
  const raw = JSON.parse(programDevText()) as RawTemplate
  mutate(raw)
  return JSON.stringify(raw, null, 2)
}

function listOf(raw: RawTemplate, id: string): RawNode[] {
  if (raw.nodes.some((n) => n.id === id)) return raw.nodes
  const loop = raw.nodes.find((n) => n.kind === 'goalLoop' && n.steps.some((s) => s.id === id))
  if (!loop) throw new Error(`시험 도우미: 템플릿에 ${id}가 없다`)
  return loop.steps
}
export function findRawNode(raw: RawTemplate, id: string): RawNode {
  return listOf(raw, id).find((n) => n.id === id) as RawNode
}
export function removeRawNode(raw: RawTemplate, id: string): void {
  const list = listOf(raw, id)
  list.splice(list.findIndex((n) => n.id === id), 1)
}
export function swapRawNodes(raw: RawTemplate, a: string, b: string): void {
  const list = listOf(raw, a)
  const i = list.findIndex((n) => n.id === a)
  const j = list.findIndex((n) => n.id === b)
  if (j < 0) throw new Error('시험 도우미: 같은 구획의 노드끼리만 바꾼다')
  ;[list[i], list[j]] = [list[j], list[i]]
}

export function loaded(text: string = programDevText()): { template: Template; hash: string } {
  const r = loadTemplate(text)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return { template: r.template, hash: r.hash }
}

// ---- 순수 상태 기계 몰기 — 모든 노드를 통과시키며 방문한 노드를 모은다 ----
export function labelOf(next: NextStep): string {
  if (next.kind === 'done' || next.kind === 'needs-user') return next.kind
  return next.goal ? `${next.goal.id}/${next.node.id}` : next.node.id
}

function factsFor(next: NextStep, goals: GoalSeed[], grades: Record<string, Grade>): VerdictFacts | undefined {
  if (next.kind === 'work' && next.node.produces === 'goals') return { goals }
  if (next.kind === 'gate' && next.node.rule?.type === 'grade') return next.goal && grades[next.goal.id] ? { grade: grades[next.goal.id] } : {}
  if (next.kind === 'gate' && next.node.rule?.type === 'ci') return { ciSha: 'c1' }
  if (next.kind !== 'action') return undefined
  switch (next.node.action) {
    case 'createMilestoneBranch': case 'createGoalBranch': return { baseSha: 'b1' }
    case 'openGoalPr': return { pr: 7, pushedSha: 'c1' }
    case 'openMilestonePr': return { pr: 8 }
    default: return undefined
  }
}

export interface DriveOptions { goals?: GoalSeed[]; grades?: Record<string, Grade>; until?: string; limit?: number }
export function drive(template: Template, state: RunState, opts: DriveOptions = {}): { visited: string[]; state: RunState } {
  const goals = opts.goals ?? GOALS
  const visited: string[] = []
  let s = state
  for (let i = 0; i < (opts.limit ?? 500); i++) {
    const next = nextStep(template, s)
    if (next.kind === 'done' || next.kind === 'needs-user') break
    const label = labelOf(next)
    if (label === opts.until) break
    visited.push(label)
    const v: Verdict = { node: next.node.id, judge: expectedJudge(next.node), verdict: 'pass', evidence: '시험 통과', facts: factsFor(next, goals, opts.grades ?? {}) }
    const r = applyVerdict(template, s, v, AT)
    if (!r.ok) throw new Error(`${label}: ${r.reason}`)
    s = r.state
  }
  return { visited, state: s }
}

// ---- 가짜 포트 ----
export class FakeFs implements FsPort {
  readonly files = new Map<string, string>()
  async read(rel: string): Promise<string | null> { return this.files.get(rel) ?? null }
  async write(rel: string, text: string): Promise<void> { this.files.set(rel, text) }
  async list(relDir: string): Promise<string[]> {
    const prefix = `${relDir}/`
    return [...this.files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => k.slice(prefix.length))
  }
}

const last = (list: string[] | undefined): string | null => (list && list.length > 0 ? list[list.length - 1] : null)
const startsWith = (whole: string[], part: string[]): boolean => whole.length >= part.length && part.every((x, i) => whole[i] === x)

export class FakeGit implements GitPort {
  readonly calls: string[] = []
  readonly local = new Map<string, string[]>([['master', ['m0']]])
  readonly remote = new Map<string, string[]>([['master', ['m0']]])
  current = 'master'
  dirty = false
  diff: FileChange[] | null = [{ path: 'src/index.ts', added: 80, removed: 0 }]
  private seq = 0

  sha(prefix: string): string { this.seq++; return `${prefix}${String(this.seq).padStart(39, '0')}` }
  async branchExists(name: string): Promise<boolean> { return this.local.has(name) }
  async createBranch(name: string, from: string): Promise<void> {
    this.calls.push(`createBranch ${name} ${from}`)
    this.local.set(name, [...(this.local.get(from) ?? [])])
  }
  async checkout(name: string): Promise<void> {
    if (!this.local.has(name)) throw new Error(`없는 브랜치 ${name}`)
    this.current = name
  }
  async headSha(ref: string): Promise<string | null> { return last(this.local.get(ref)) }
  async hasChanges(): Promise<boolean> { return this.dirty }
  async commitAll(message: string): Promise<string> {
    this.calls.push(`commit ${message}`)
    const sha = this.sha('c')
    this.local.get(this.current)?.push(sha)
    this.dirty = false
    return sha
  }
  async push(branch: string): Promise<void> {
    this.calls.push(`push ${branch}`)
    this.remote.set(branch, [...(this.local.get(branch) ?? [])])
  }
  async syncToRemote(branch: string): Promise<string | null> {
    this.calls.push(`sync ${branch}`)
    const local = this.local.get(branch)
    const remote = this.remote.get(branch)
    if (!local) throw new Error(`없는 브랜치 ${branch}`)
    if (remote && !startsWith(local, remote)) {
      if (!startsWith(remote, local)) throw new Error(`${branch}의 로컬과 원격이 갈라졌다`)
      this.local.set(branch, [...remote])
    }
    return last(this.local.get(branch))
  }
  async isAncestor(sha: string, ref: string): Promise<boolean> { return this.local.get(ref)?.includes(sha) ?? false }
  async mergeNoFf(sha: string, message: string): Promise<string> {
    this.calls.push(`merge ${sha} ${message}`)
    const hist = this.local.get(this.current) ?? []
    const src = [...this.local.values()].find((h) => h.includes(sha)) ?? [sha]
    for (const x of src.slice(0, src.indexOf(sha) + 1)) if (!hist.includes(x)) hist.push(x)
    const merged = this.sha('m')
    hist.push(merged)
    return merged
  }
  async diffStat(base: string): Promise<FileChange[] | null> {
    this.calls.push(`diffStat ${base}`)
    return this.diff
  }
}

export interface FakePr { number: number; head: string; base: string; state: PrState; mergedHead: string | null; mergeCommitSha: string | null }

export class FakeGh implements GhPort {
  readonly calls: string[] = []
  readonly prs: FakePr[] = []
  ci: CiStatus['state'] = 'success'
  // CI가 보고하는 머리를 바꿔 「아직 옛 머리의 결과」를 흉내 낸다.
  ciHead: string | null = null
  ciThrows = false
  nextNumber = 100
  constructor(private readonly git: FakeGit) {}

  // GitHub처럼 원격 base가 PR 머리를 품으면 병합됨으로 닫는다.
  private view(pr: FakePr): PrInfo {
    const head = last(this.git.remote.get(pr.head)) ?? ''
    if (pr.state === 'open' && head && this.git.remote.get(pr.base)?.includes(head)) {
      pr.state = 'merged'
      pr.mergedHead = head
      pr.mergeCommitSha = last(this.git.remote.get(pr.base))
    }
    return { number: pr.number, state: pr.state, headSha: pr.mergedHead ?? head, mergeCommitSha: pr.mergeCommitSha }
  }
  async findPr(head: string, base: string): Promise<PrInfo | null> {
    this.calls.push(`findPr ${head} ${base}`)
    const pr = [...this.prs].reverse().find((p) => p.head === head && p.base === base)
    return pr ? this.view(pr) : null
  }
  async getPr(number: number): Promise<PrInfo | null> {
    const pr = this.prs.find((p) => p.number === number)
    return pr ? this.view(pr) : null
  }
  async createPr(req: { head: string; base: string; title: string; body: string }): Promise<PrInfo> {
    this.calls.push(`createPr ${req.head} ${req.base}`)
    const pr: FakePr = { number: this.nextNumber++, head: req.head, base: req.base, state: 'open', mergedHead: null, mergeCommitSha: null }
    this.prs.push(pr)
    return this.view(pr)
  }
  async ciStatus(number: number): Promise<CiStatus> {
    this.calls.push(`ci ${number}`)
    if (this.ciThrows) throw new Error('gh: HTTP 502')
    const info = await this.getPr(number)
    return { state: this.ci, headSha: this.ciHead ?? info?.headSha ?? '', summary: 'hard-gates' }
  }
  // 사람이 GitHub·앱 버튼으로 병합한 것을 흉내 낸다 — 원격 base에 PR 머리와 병합 커밋이 얹힌다.
  mergeByHuman(number: number): string {
    const pr = this.prs.find((p) => p.number === number)
    if (!pr) throw new Error(`없는 PR ${number}`)
    const headHist = this.git.remote.get(pr.head) ?? []
    const base = [...(this.git.remote.get(pr.base) ?? [])]
    for (const x of headHist) if (!base.includes(x)) base.push(x)
    const merged = this.git.sha('h')
    base.push(merged)
    this.git.remote.set(pr.base, base)
    pr.state = 'merged'
    pr.mergedHead = last(headHist)
    pr.mergeCommitSha = merged
    return merged
  }
}

export class FakeCommands implements CommandPort {
  readonly calls: { cmd: string; cwd: string }[] = []
  readonly failing = new Set<string>()
  async run(cmd: string, cwd: string): Promise<CommandResult> {
    this.calls.push({ cmd, cwd })
    return this.failing.has(cmd) ? { code: 1, stdout: '', stderr: `${cmd}: 시험 2건 실패` } : { code: 0, stdout: 'ok', stderr: '' }
  }
}

// 작업 세션 흉내 — 분해 노드면 goal 문서를 쓰고(에이전트가 적은 「등급: 약」 포함), 구현 노드면 작업 트리를 더럽힌다.
export class FakeSession implements SessionPort {
  readonly calls: string[] = []
  goals: { id: string; title: string; extra?: string }[] = GOALS.map((g) => ({ ...g }))
  onWork: ((req: WorkRequest) => Promise<void>) | null = null
  constructor(private readonly files: FakeFs, private readonly git: FakeGit) {}
  async runWork(req: WorkRequest): Promise<{ ok: boolean; summary: string }> {
    this.calls.push(req.goal ? `${req.goal.id}/${req.node.id}` : req.node.id)
    if (req.node.produces === 'goals') {
      for (const g of this.goals) await this.files.write(`.agentdeck/goals/${g.id}.md`, `# ${g.title}\n\n등급: 약\n${g.extra ?? ''}`)
    }
    if (req.node.id === 'implement') this.git.dirty = true
    if (this.onWork) await this.onWork(req)
    return { ok: true, summary: '끝' }
  }
}

export class FakeReview implements ReviewPort {
  readonly calls: string[] = []
  readonly queue: ('pass' | 'fail' | 'stop')[] = []
  async review(req: Parameters<ReviewPort['review']>[0]): Promise<{ verdict: 'pass' | 'fail' | 'stop'; evidence: string }> {
    this.calls.push(req.goal ? `${req.goal.id}/${req.node.id}` : req.node.id)
    const verdict = this.queue.shift() ?? 'pass'
    return { verdict, evidence: verdict === 'pass' ? '검수 통과' : '경계 시험이 빠졌다' }
  }
}

export interface Rig {
  fs: FakeFs
  git: FakeGit
  gh: FakeGh
  commands: FakeCommands
  session: FakeSession
  review: FakeReview
  ports: LoopPorts
}
export function makeRig(): Rig {
  const files = new FakeFs()
  const git = new FakeGit()
  const gh = new FakeGh(git)
  const commands = new FakeCommands()
  const session = new FakeSession(files, git)
  const review = new FakeReview()
  let tick = 0
  const clock = { now: () => `2026-11-18T10:${String(Math.floor(tick / 60)).padStart(2, '0')}:${String(tick++ % 60).padStart(2, '0')}+09:00` }
  return { fs: files, git, gh, commands, session, review, ports: { command: commands, git, gh, fs: files, session, review, clock } }
}

// ---- 실행기 껍질 몰기 — 상태는 실행기가 저장본에서 읽는다. 사람 게이트는 사람 판정으로, 마일스톤 병합은 사람의 GitHub 병합으로 답한다 ----
export interface RunOptions { until?: string; limit?: number; approve?: boolean }
export async function runLoop(
  runner: LoopRunner, rig: Rig, opts: RunOptions = {},
): Promise<{ visited: string[]; state: RunState; last: StepOutcome | null }> {
  const visited: string[] = []
  let lastOutcome: StepOutcome | null = null
  const current = async (): Promise<{ state: RunState; next: NextStep }> => {
    const r = await runner.load()
    if (r.kind !== 'ok') throw new Error(`시험 도우미: 상태를 읽지 못했다 — ${JSON.stringify(r)}`)
    return r
  }
  for (let i = 0; i < (opts.limit ?? 500); i++) {
    const { state, next } = await current()
    const label = labelOf(next)
    if (next.kind === 'done' || next.kind === 'needs-user' || label === opts.until) break
    const out = await runner.step()
    lastOutcome = out
    if (out.kind === 'waiting' && out.on === 'human') {
      if (opts.approve === false) break
      if (next.kind === 'gate' && next.node.watch === 'milestonePrMerged' && state.milestonePr !== null) {
        rig.gh.mergeByHuman(state.milestonePr)
        continue
      }
      const sub = await runner.submit({ node: next.kind === 'gate' ? next.node.id : '', judge: 'human', verdict: 'pass', evidence: '사람이 승인했다' })
      lastOutcome = sub
      if (sub.kind === 'blocked') break
      visited.push(label)
      continue
    }
    if (out.kind === 'waiting' || out.kind === 'blocked') break
    visited.push(label)
  }
  return { visited, state: (await current()).state, last: lastOutcome }
}

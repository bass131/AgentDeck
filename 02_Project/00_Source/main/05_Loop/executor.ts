// M09 G1 — 실행기 상태 기계. 템플릿 + 상태 + 판정 → 다음 상태와 다음 할 일. 순수 함수다(시각은 인자로 받는다).
// 커서를 움직이는 길은 applyVerdict 하나다. 판정 하나의 꼴(Verdict)은 규칙·모델·사람 게이트와 작업·동작 노드의 완료에 공통이다.
// 건너뛰기·강제 통과·커서 설정·계수 리셋 API는 없다. 멈춘 실행을 다시 돌리는 것도 같은 꼴의 사람 판정(pass)이며,
// 그 판정은 USER-INPUT 줄을 쓰고 커서는 그대로 둔다 — 멈춘 노드를 다시 돌 뿐 통과시키지 않는다.
// 판정의 node가 현재 커서와 다르거나 judge가 노드의 판정 주체와 다르면 거부한다. 작업·동작 노드의 판정 주체는 'executor'다.
import {
  isNonEmptyString,
  type ActionNode, type GateNode, type GoalLoopNode, type Grade, type Judge, type StepNode, type Template, type WorkNode,
} from './template'
import { GOAL_ID, failsSinceUserInput, scopeOf, type Cursor, type GoalState, type Marker, type RunState } from './runState'

// 헌법 7조의 수다. 템플릿이 바꾸지 못하게 코드에 둔다.
export const FAIL_LIMIT = 3

export type VerdictJudge = Judge | 'executor'
export type VerdictKind = 'pass' | 'fail' | 'stop'
export interface GoalSeed { id: string; title: string }
// 판정이 실어 오는 사실. 노드 종이 읽는 칸만 쓰이고 나머지는 버린다(분해 노드가 적은 등급 같은 것).
export interface VerdictFacts {
  grade?: Grade
  goals?: GoalSeed[]
  pr?: number
  ciSha?: string
  mergedSha?: string
}
export interface Verdict {
  node: string
  judge: VerdictJudge
  verdict: VerdictKind
  evidence: string
  facts?: VerdictFacts
}

export type NextStep =
  | { kind: 'work'; node: WorkNode; goal: GoalState | null }
  | { kind: 'gate'; node: GateNode; goal: GoalState | null }
  | { kind: 'action'; node: ActionNode; goal: GoalState | null }
  | { kind: 'needs-user'; reason: string }
  | { kind: 'done' }

export type ApplyResult = { ok: true; state: RunState; next: NextStep } | { ok: false; reason: string }

export interface CommandRun { cmd: string; code: number; stdout: string; stderr: string }
export interface CiStatus { state: 'pending' | 'success' | 'failure'; headSha: string; summary: string }

interface Located { node: StepNode; loop: GoalLoopNode | null; index: number; topIndex: number }

function locate(template: Template, cursor: Cursor): Located | null {
  for (let i = 0; i < template.nodes.length; i++) {
    const n = template.nodes[i]
    if (n.kind === 'goalLoop') {
      if (cursor.goal === null) continue
      const j = n.steps.findIndex((s) => s.id === cursor.node)
      if (j >= 0) return { node: n.steps[j], loop: n, index: j, topIndex: i }
    } else if (cursor.goal === null && n.id === cursor.node) {
      return { node: n, loop: null, index: i, topIndex: i }
    }
  }
  return null
}

export function expectedJudge(node: StepNode): VerdictJudge {
  return node.kind === 'gate' ? node.judge : 'executor'
}

// 한 줄 한 문장으로 접는다 — 검증 줄과 멈춤 사유에 쓴다.
export function oneSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 400 ? `${flat.slice(0, 399)}…` : flat
}

export function nextStep(template: Template, state: RunState): NextStep {
  if (state.status === 'done') return { kind: 'done' }
  if (state.status === 'needs-user') return { kind: 'needs-user', reason: state.haltReason ?? '사람 판단을 기다린다' }
  const here = locate(template, state.cursor)
  if (!here) return { kind: 'needs-user', reason: `커서 노드 ${state.cursor.node}가 템플릿에 없다` }
  const goal = state.cursor.goal === null ? null : state.goals[state.cursor.goal] ?? null
  const node = here.node
  switch (node.kind) {
    case 'work': return { kind: 'work', node, goal }
    case 'gate': return { kind: 'gate', node, goal }
    case 'action': return { kind: 'action', node, goal }
  }
}

// 앱을 다시 켰을 때 이 상태를 이 템플릿으로 이어 가도 되는가.
export function checkResumable(template: Template, hash: string, state: RunState): { ok: true } | { ok: false; reason: string } {
  if (state.template.id !== template.id) {
    return { ok: false, reason: `상태의 템플릿 ${state.template.id}와 앱의 템플릿 ${template.id}가 다르다` }
  }
  if (state.template.hash !== hash) {
    return { ok: false, reason: '상태에 적힌 템플릿 해시가 앱의 템플릿과 다르다 — 템플릿이 바뀌었으므로 멈춘다' }
  }
  if (state.status !== 'done' && !locate(template, state.cursor)) {
    return { ok: false, reason: `커서 노드 ${state.cursor.node}가 템플릿에 없다` }
  }
  return { ok: true }
}

function halt(s: RunState, reason: string): void {
  s.status = 'needs-user'
  s.haltReason = oneSentence(reason)
}

function enterTop(template: Template, s: RunState, i: number): void {
  if (i >= template.nodes.length) { s.status = 'done'; return }
  const n = template.nodes[i]
  if (n.kind !== 'goalLoop') { s.cursor = { node: n.id, goal: null }; return }
  if (s.goals.length === 0) { halt(s, 'goal 목록이 비어 goal 고리에 들어갈 수 없다'); return }
  s.goals[0].status = 'active'
  s.cursor = { node: n.steps[0].id, goal: 0 }
}

function moveForward(template: Template, s: RunState): void {
  const here = locate(template, s.cursor)
  if (!here) { halt(s, `커서 노드 ${s.cursor.node}가 템플릿에 없다`); return }
  if (here.loop && s.cursor.goal !== null) {
    const g = s.cursor.goal
    if (here.index + 1 < here.loop.steps.length) { s.cursor = { node: here.loop.steps[here.index + 1].id, goal: g }; return }
    s.goals[g].status = 'done'
    if (g + 1 < s.goals.length) {
      s.goals[g + 1].status = 'active'
      s.cursor = { node: here.loop.steps[0].id, goal: g + 1 }
      return
    }
  }
  enterTop(template, s, here.topIndex + 1)
}

// when 조건이 맞지 않는 노드는 템플릿이 적은 대로 지나간다. 판정이 아니라 템플릿의 조건이고, 등급을 모르면 강으로 본다.
function settle(template: Template, s: RunState): void {
  for (let guard = 0; guard < 10_000 && s.status === 'running'; guard++) {
    const here = locate(template, s.cursor)
    const when = here?.node.when
    if (!when) return
    const goal = s.cursor.goal === null ? null : s.goals[s.cursor.goal]
    if (when.grade === (goal?.grade ?? 'strong')) return
    moveForward(template, s)
  }
}

const isPr = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

// 통과 판정의 사실을 상태에 싣는다. 틀린 꼴이면 사유를 돌려주고 판정 전체를 거부한다.
function applyFacts(node: StepNode, s: RunState, goal: GoalState | null, facts: VerdictFacts | undefined): string | null {
  if (node.kind === 'work' && node.produces === 'goals') {
    if (s.goals.length > 0) return 'goal 목록은 한 번만 정한다'
    const seeds: unknown = facts?.goals
    if (!Array.isArray(seeds) || seeds.length === 0) return '분해의 통과에는 goal이 하나 이상 있어야 한다'
    const ids = new Set<string>()
    const goals: GoalState[] = []
    for (const g of seeds as unknown[]) {
      const id = (g as GoalSeed | null)?.id
      const title = (g as GoalSeed | null)?.title
      if (!isNonEmptyString(id) || !GOAL_ID.test(id) || ids.has(id) || !isNonEmptyString(title)) {
        return `goal 꼴이 틀렸다 — ${JSON.stringify(id)}`
      }
      ids.add(id)
      goals.push({ id, title: oneSentence(title), grade: null, status: 'pending', pr: null, ciSha: null, mergedSha: null })
    }
    s.goals = goals
    return null
  }
  if (node.kind === 'gate' && node.rule?.type === 'grade' && goal) {
    // 한 goal 안에서 한 번 강이면 강으로 남는다 — 검수 불통과 뒤 변경을 줄이거나 옮겨 검수를 끄지 못하게 한다.
    goal.grade = goal.grade === 'strong' || facts?.grade !== 'weak' ? 'strong' : 'weak'
    return null
  }
  if (node.kind === 'gate' && node.rule?.type === 'ci' && goal) {
    const sha = facts?.ciSha
    if (!isNonEmptyString(sha)) return 'CI 통과에는 머리 SHA가 있어야 한다'
    goal.ciSha = sha
    return null
  }
  if (node.kind !== 'action') return null
  const pr = facts?.pr
  switch (node.action) {
    case 'openGoalPr':
      if (!goal || !isPr(pr)) return 'goal PR 번호가 있어야 한다'
      goal.pr = pr
      return null
    case 'mergeGoal': {
      if (!goal) return '병합할 goal이 없다'
      const sha = facts?.mergedSha
      goal.mergedSha = isNonEmptyString(sha) ? sha : null
      return null
    }
    case 'openMilestonePr':
      if (!isPr(pr)) return '마일스톤 PR 번호가 있어야 한다'
      s.milestonePr = pr
      return null
    default:
      return null
  }
}

const reject = (reason: string): ApplyResult => ({ ok: false, reason })

export function applyVerdict(template: Template, state: RunState, verdict: Verdict, at: string): ApplyResult {
  if (state.status === 'done') return reject('실행이 이미 끝났다')
  const here = locate(template, state.cursor)
  if (!here) return reject(`커서 노드 ${state.cursor.node}가 템플릿에 없다`)
  if (verdict.node !== here.node.id) return reject(`현재 노드는 ${here.node.id}다 — ${verdict.node}의 판정은 받지 않는다`)
  if (!isNonEmptyString(verdict.evidence)) return reject('판정에는 증거 한 문장이 있어야 한다')
  if (!['pass', 'fail', 'stop'].includes(verdict.verdict)) return reject(`모르는 판정 ${JSON.stringify(verdict.verdict)}`)

  const s = structuredClone(state)
  const goal = s.cursor.goal === null ? null : s.goals[s.cursor.goal] ?? null
  const scope = goal?.id ?? null
  const line = (marker: Marker, sentence: string = verdict.evidence): void => {
    s.lines.push({ marker, at, sentence: oneSentence(sentence), by: 'executor', node: here.node.id, goal: scope, judge: verdict.judge })
  }

  if (s.status === 'needs-user') {
    if (verdict.judge !== 'human' || verdict.verdict !== 'pass') {
      return reject('멈춘 실행은 사람의 이어 가기 판정(human pass)으로만 다시 돈다')
    }
    // 멈춘 사유를 사람의 답과 함께 남긴다 — 예외 호출의 횟수와 이유를 줄에서 셀 수 있게.
    line('USER-INPUT', `멈춤 사유: ${s.haltReason ?? '(없음)'} — 사람 판단: ${verdict.evidence}`)
    s.status = 'running'
    s.haltReason = null
    s.failCount = failsSinceUserInput(s.lines, scope)
    return { ok: true, state: s, next: nextStep(template, s) }
  }

  const want = expectedJudge(here.node)
  if (verdict.judge !== want) return reject(`${here.node.id}의 판정 주체는 ${want}다 — ${verdict.judge}의 판정은 받지 않는다`)

  if (verdict.verdict === 'pass') {
    const problem = applyFacts(here.node, s, goal, verdict.facts)
    if (problem) return reject(problem)
    if (here.node.kind !== 'work') line('PASS')
    moveForward(template, s)
    settle(template, s)
  } else if (verdict.verdict === 'fail') {
    line('FAIL')
    const fails = failsSinceUserInput(s.lines, scope)
    if (here.node.onFail) {
      s.cursor = { node: here.node.onFail.goto, goal: s.cursor.goal }
      settle(template, s)
    }
    if (fails >= FAIL_LIMIT) halt(s, `마지막 USER-INPUT 뒤 FAIL ${fails}번 — ${verdict.evidence}`)
  } else {
    halt(s, verdict.evidence)
  }
  s.failCount = failsSinceUserInput(s.lines, scopeOf(s))
  return { ok: true, state: s, next: nextStep(template, s) }
}

// ---- 규칙 판정 — 실행기가 포트로 얻은 관측에서만 만든다 ----

const lastLine = (text: string): string => text.trim().split(/\r?\n/).filter((l) => l.trim() !== '').at(-1) ?? ''

export function judgeCommands(node: GateNode, runs: readonly CommandRun[]): Verdict {
  const expected = node.rule?.type === 'commands' ? node.rule.commands : []
  const base = { node: node.id, judge: 'rule' as const }
  const failed = runs.find((r) => r.code !== 0)
  if (failed) {
    const out = lastLine(failed.stderr) || lastLine(failed.stdout) || '출력 없음'
    return { ...base, verdict: 'fail', evidence: `명령 ${failed.cmd}이 exit ${failed.code}로 실패했다 — ${out}` }
  }
  const complete = expected.length > 0 && runs.length === expected.length && runs.every((r, i) => r.cmd === expected[i])
  if (!complete) return { ...base, verdict: 'fail', evidence: '템플릿이 적은 명령을 다 돌리지 않아 통과로 볼 수 없다' }
  return { ...base, verdict: 'pass', evidence: `${expected.join(', ')} 모두 exit 0` }
}

// CI가 아직 돌고 있으면 판정이 없다(null) — 기다림은 FAIL로 세지 않는다.
export function judgeCi(node: GateNode, ci: CiStatus): Verdict | null {
  if (ci.state === 'pending') return null
  const head = ci.headSha.slice(0, 8)
  if (ci.state === 'success') {
    return { node: node.id, judge: 'rule', verdict: 'pass', evidence: `CI 통과 — 머리 ${head}, ${ci.summary}`, facts: { ciSha: ci.headSha } }
  }
  return { node: node.id, judge: 'rule', verdict: 'fail', evidence: `CI 실패 — 머리 ${head}, ${ci.summary}` }
}

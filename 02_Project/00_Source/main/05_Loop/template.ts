// 템플릿은 앱 자원이다. 작업 저장소에는 id와 해시만 적는다. 해시는 파싱한 값의 정규 직렬화(키 정렬)의 sha256이라
// 줄바꿈·들여쓰기 차이(Windows 줄바꿈 변환 포함)로는 바뀌지 않고, 값이 하나라도 바뀌면 바뀐다.
// 검사는 손으로 한다(새 의존성 없음). 모르는 키도 거부한다 — 오타가 조용히 기본값으로 떨어지지 않게 한다(fail-closed).
//
// 형식 요약
//   nodes: 마일스톤 구획의 순서. 노드 종은 work(담당 세션이 일함)·gate(판정 주체 rule|model|human)·action(실행기 코드의
//          결정론적 단계)이고, goal마다 반복되는 구획은 goalLoop 하나로 적는다(steps가 goal마다 같은 순서로 돈다).
//   onFail.goto: 불통과 때 돌아갈 노드. 같은 구획의 자기 또는 앞 노드만 가리킨다 — 앞으로 뛰면 게이트를 건너뛰는 통로다.
//                마일스톤 구획에서 goal 고리를 건너 고리 앞을 가리키는 것도 막는다(끝난 goal 목록 위로 분해를 다시 돌게 된다).
//   when.grade: goal 고리 안에서 그 goal의 등급이 맞을 때만 켜지는 노드. 등급을 모르면 강으로 본다.
//   grading: 문턱(기본 50), uncountedPaths(세지 않는 경로 — 금지 목록), protectedPaths(건드리면 강). 꼴은 grade.ts의 작은 glob.
import { createHash } from 'node:crypto'

export type Judge = 'rule' | 'model' | 'human'
export type Grade = 'strong' | 'weak'
export type DocKind = 'milestoneSpec' | 'goal' | 'decisions' | 'verification'
type ActionKind = 'createMilestoneBranch' | 'createGoalBranch' | 'openGoalPr' | 'mergeGoal' | 'openMilestonePr'
type RuleCheck = { type: 'commands'; commands: string[] } | { type: 'grade' } | { type: 'ci' }

interface OnFail { goto: string }
export interface When { grade: Grade }

interface NodeBase {
  id: string
  title: string
  onFail?: OnFail
  when?: When
}
export interface WorkNode extends NodeBase {
  kind: 'work'
  role: 'main' | 'worker'
  instruction: string
  docs: DocKind[]
  produces?: 'goals'
}
export interface GateNode extends NodeBase {
  kind: 'gate'
  judge: Judge
  rule?: RuleCheck
  watch?: 'milestonePrMerged'
}
export interface ActionNode extends NodeBase {
  kind: 'action'
  action: ActionKind
}
export type StepNode = WorkNode | GateNode | ActionNode
export interface GoalLoopNode {
  kind: 'goalLoop'
  id: string
  title: string
  steps: StepNode[]
}
type MilestoneNode = StepNode | GoalLoopNode

export interface GradingPolicy {
  strongLineThreshold: number
  uncountedPaths: string[]
  protectedPaths: string[]
}
// 브랜치 이름 꼴. {milestone}·{goal} 자리에 id가 들어간다(마일스톤 꼴에는 {goal}을 둘 수 없다).
// 기준 브랜치(base)는 템플릿에 두지 않는다. 열 때 작업 저장소 origin의 기본 브랜치를 읽고(openLoop), 시작할 때 상태에 적는다.
interface BranchPolicy {
  milestone: string
  goal: string
}
export interface Template {
  id: string
  version: 1
  title: string
  grading: GradingPolicy
  branches: BranchPolicy
  nodes: MilestoneNode[]
}

export interface SchemaError { path: string; reason: string }
type TemplateCheck = { ok: true; template: Template } | { ok: false; errors: SchemaError[] }
export type TemplateLoad = { ok: true; template: Template; hash: string } | { ok: false; errors: SchemaError[] }

const DEFAULT_STRONG_LINE_THRESHOLD = 50
const NODE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const JUDGES: readonly Judge[] = ['rule', 'model', 'human']
const GRADES: readonly Grade[] = ['strong', 'weak']
const ROLES = ['main', 'worker'] as const
const DOC_KINDS: readonly DocKind[] = ['milestoneSpec', 'goal', 'decisions', 'verification']
type Scope = 'milestone' | 'loop'
const ACTION_SCOPE: Record<ActionKind, Scope> = {
  createMilestoneBranch: 'milestone',
  openMilestonePr: 'milestone',
  createGoalBranch: 'loop',
  openGoalPr: 'loop',
  mergeGoal: 'loop',
}
const COMMON_KEYS = ['id', 'kind', 'title', 'onFail', 'when'] as const

// ---- 검사 도구 (실행 상태 스키마도 같은 도구를 쓴다) ----
export type Obj = Record<string, unknown>
export type ErrSink = (path: string, reason: string) => void
export const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const includes = <T>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v)
export function rejectUnknownKeys(o: Obj, path: string, allowed: readonly string[], err: ErrSink): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) err(`${path}.${k}`, `모르는 키 ${k}`)
}

// ---- 해시 ----
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (isObject(v)) {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

export function templateHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

// 템플릿 텍스트를 읽어 검사한다. 파일 읽기는 부르는 쪽(배선·시험)이 한다.
export function loadTemplate(text: string): TemplateLoad {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [{ path: '$', reason: `JSON으로 읽을 수 없다 — ${(e as Error).message}` }] }
  }
  const checked = validateTemplate(raw)
  if (!checked.ok) return checked
  return { ok: true, template: checked.template, hash: templateHash(raw) }
}

export function validateTemplate(raw: unknown): TemplateCheck {
  const errors: SchemaError[] = []
  const err: ErrSink = (path, reason) => { errors.push({ path, reason }) }
  if (!isObject(raw)) return { ok: false, errors: [{ path: '$', reason: '템플릿은 객체여야 한다' }] }
  rejectUnknownKeys(raw, '$', ['id', 'version', 'title', 'grading', 'branches', 'nodes'], err)
  if (!isNonEmptyString(raw.id) || !NODE_ID.test(raw.id)) err('$.id', 'id는 소문자 kebab 꼴이어야 한다')
  if (raw.version !== 1) err('$.version', '지원하는 형식 판은 1뿐이다')
  if (!isNonEmptyString(raw.title)) err('$.title', '제목이 있어야 한다')
  const grading = checkGrading(raw.grading, err)
  const branches = checkBranches(raw.branches, err)
  checkNodes(raw.nodes, err)
  if (errors.length > 0 || !grading || !branches) return { ok: false, errors }
  return {
    ok: true,
    template: {
      id: raw.id as string,
      version: 1,
      title: raw.title as string,
      grading,
      branches,
      nodes: structuredClone(raw.nodes) as MilestoneNode[],
    },
  }
}

function stringList(v: unknown, path: string, err: ErrSink): string[] | undefined {
  if (v === undefined) return []
  if (!Array.isArray(v) || !v.every(isNonEmptyString)) {
    err(path, '비어 있지 않은 문자열 배열이어야 한다')
    return undefined
  }
  return [...v]
}

function checkGrading(v: unknown, err: ErrSink): GradingPolicy | undefined {
  const p = '$.grading'
  if (!isObject(v)) { err(p, '등급 규칙 객체가 있어야 한다'); return undefined }
  rejectUnknownKeys(v, p, ['strongLineThreshold', 'uncountedPaths', 'protectedPaths'], err)
  const t = v.strongLineThreshold === undefined ? DEFAULT_STRONG_LINE_THRESHOLD : v.strongLineThreshold
  if (typeof t !== 'number' || !Number.isInteger(t) || t < 1) {
    err(`${p}.strongLineThreshold`, '1 이상의 정수여야 한다')
    return undefined
  }
  const uncountedPaths = stringList(v.uncountedPaths, `${p}.uncountedPaths`, err)
  const protectedPaths = stringList(v.protectedPaths, `${p}.protectedPaths`, err)
  if (!uncountedPaths || !protectedPaths) return undefined
  return { strongLineThreshold: t, uncountedPaths, protectedPaths }
}

function checkBranches(v: unknown, err: ErrSink): BranchPolicy | undefined {
  const p = '$.branches'
  if (!isObject(v)) { err(p, '브랜치 꼴 객체가 있어야 한다'); return undefined }
  rejectUnknownKeys(v, p, ['milestone', 'goal'], err)
  const { milestone, goal } = v
  let ok = true
  if (!isNonEmptyString(milestone) || !milestone.includes('{milestone}')) {
    err(`${p}.milestone`, '{milestone} 자리가 있는 꼴이어야 한다'); ok = false
  } else if (milestone.includes('{goal}')) {
    err(`${p}.milestone`, '마일스톤 브랜치 꼴에는 {goal} 자리를 둘 수 없다'); ok = false
  }
  if (!isNonEmptyString(goal) || !goal.includes('{goal}')) { err(`${p}.goal`, '{goal} 자리가 있는 꼴이어야 한다'); ok = false }
  return ok ? { milestone: milestone as string, goal: goal as string } : undefined
}

function checkId(n: Obj, p: string, seen: Map<string, string>, err: ErrSink): void {
  const id = n.id
  if (!isNonEmptyString(id) || !NODE_ID.test(id)) { err(`${p}.id`, 'id는 소문자 kebab 꼴이어야 한다'); return }
  const prev = seen.get(id)
  if (prev !== undefined) err(`${p}.id`, `중복 id ${id} — ${prev}에도 있다`)
  else seen.set(id, p)
}

function checkNodes(v: unknown, err: ErrSink): void {
  const path = '$.nodes'
  if (!Array.isArray(v)) { err(path, '노드 배열이어야 한다'); return }
  if (v.length === 0) { err(path, '순서가 비었다 — 노드가 하나 이상 있어야 한다'); return }
  const seen = new Map<string, string>()
  let loops = 0
  let loopIndex = -1
  let producers = 0
  let producerIndex = -1
  v.forEach((n: unknown, i) => {
    const p = `${path}[${i}]`
    if (isObject(n) && n.kind === 'goalLoop') {
      loops++
      if (loopIndex < 0) loopIndex = i
      checkLoop(n, p, seen, err)
      return
    }
    checkStep(n, p, 'milestone', seen, err)
    if (isObject(n) && n.kind === 'work' && n.produces === 'goals') {
      producers++
      if (producerIndex < 0) producerIndex = i
    }
  })
  if (loops > 1) err(path, 'goal 고리는 하나만 둘 수 있다')
  if (producers > 1) err(path, 'goal을 내는 작업 노드는 하나만 둘 수 있다')
  if (loops > 0 && (producerIndex < 0 || producerIndex > loopIndex)) {
    err(`${path}[${loopIndex}]`, 'goal 고리 앞에 goal을 내는 작업 노드(produces: goals)가 있어야 한다')
  }
  if (loops === 0 && producers > 0) err(path, 'goal을 내는 작업 노드가 있는데 goal 고리가 없다')
  checkGotos(v, path, seen, err)
}

function checkLoop(n: Obj, p: string, seen: Map<string, string>, err: ErrSink): void {
  rejectUnknownKeys(n, p, ['id', 'kind', 'title', 'steps'], err)
  checkId(n, p, seen, err)
  if (!isNonEmptyString(n.title)) err(`${p}.title`, '제목이 있어야 한다')
  const steps = n.steps
  if (!Array.isArray(steps)) { err(`${p}.steps`, '노드 배열이어야 한다'); return }
  if (steps.length === 0) { err(`${p}.steps`, 'goal 고리의 순서가 비었다 — 노드가 하나 이상 있어야 한다'); return }
  steps.forEach((s: unknown, k) => checkStep(s, `${p}.steps[${k}]`, 'loop', seen, err))
  checkGotos(steps, `${p}.steps`, seen, err)
}

function checkStep(n: unknown, p: string, scope: Scope, seen: Map<string, string>, err: ErrSink): void {
  if (!isObject(n)) { err(p, '노드는 객체여야 한다'); return }
  if (n.kind === 'goalLoop') { err(`${p}.kind`, 'goal 고리 안에 goal 고리를 둘 수 없다'); return }
  checkId(n, p, seen, err)
  if (!isNonEmptyString(n.title)) err(`${p}.title`, '제목이 있어야 한다')
  if (n.onFail !== undefined) {
    if (!isObject(n.onFail) || !isNonEmptyString(n.onFail.goto)) err(`${p}.onFail`, '{ goto: <id> } 꼴이어야 한다')
    else rejectUnknownKeys(n.onFail, `${p}.onFail`, ['goto'], err)
  }
  if (n.when !== undefined) {
    if (scope !== 'loop') err(`${p}.when`, 'when은 goal 고리 안에서만 쓴다')
    else if (!isObject(n.when) || !includes(GRADES, n.when.grade)) err(`${p}.when`, '{ grade: strong|weak } 꼴이어야 한다')
    else rejectUnknownKeys(n.when, `${p}.when`, ['grade'], err)
  }
  switch (n.kind) {
    case 'work': checkWork(n, p, scope, err); break
    case 'gate': checkGate(n, p, scope, err); break
    case 'action': checkAction(n, p, scope, err); break
    default: err(`${p}.kind`, `알 수 없는 노드 종 ${JSON.stringify(n.kind)} — work·gate·action·goalLoop 중 하나`)
  }
}

function checkWork(n: Obj, p: string, scope: Scope, err: ErrSink): void {
  rejectUnknownKeys(n, p, [...COMMON_KEYS, 'role', 'instruction', 'docs', 'produces'], err)
  if (!includes(ROLES, n.role)) err(`${p}.role`, `알 수 없는 담당 ${JSON.stringify(n.role)} — main·worker 중 하나`)
  if (!isNonEmptyString(n.instruction)) err(`${p}.instruction`, '지시가 있어야 한다')
  if (!Array.isArray(n.docs)) err(`${p}.docs`, '문서 종 배열이어야 한다')
  else {
    n.docs.forEach((d: unknown, k) => {
      if (!includes(DOC_KINDS, d)) err(`${p}.docs[${k}]`, `알 수 없는 문서 종 ${JSON.stringify(d)}`)
      else if (d === 'goal' && scope !== 'loop') err(`${p}.docs[${k}]`, 'goal 문서는 goal 고리 안에서만 준다')
    })
  }
  if (n.produces !== undefined) {
    if (n.produces !== 'goals') err(`${p}.produces`, 'produces는 goals뿐이다')
    else if (scope !== 'milestone') err(`${p}.produces`, 'goal은 마일스톤 구획에서만 낸다')
  }
}

function checkGate(n: Obj, p: string, scope: Scope, err: ErrSink): void {
  rejectUnknownKeys(n, p, [...COMMON_KEYS, 'judge', 'rule', 'watch'], err)
  if (!includes(JUDGES, n.judge)) {
    err(`${p}.judge`, `알 수 없는 판정 주체 ${JSON.stringify(n.judge)} — rule·model·human 중 하나`)
  }
  if (n.judge === 'rule') checkRule(n.rule, `${p}.rule`, scope, err)
  else if (n.rule !== undefined) err(`${p}.rule`, 'rule은 규칙 게이트에만 쓴다')
  if (n.watch !== undefined) {
    if (n.watch !== 'milestonePrMerged') err(`${p}.watch`, 'watch는 milestonePrMerged뿐이다')
    else if (n.judge !== 'human' || scope !== 'milestone') err(`${p}.watch`, '마일스톤 구획의 사람 게이트에만 쓴다')
  }
}

function checkRule(r: unknown, p: string, scope: Scope, err: ErrSink): void {
  if (!isObject(r)) { err(p, '규칙 게이트에는 rule이 있어야 한다'); return }
  switch (r.type) {
    case 'commands':
      rejectUnknownKeys(r, p, ['type', 'commands'], err)
      if (!Array.isArray(r.commands) || r.commands.length === 0 || !r.commands.every(isNonEmptyString)) {
        err(`${p}.commands`, '비어 있지 않은 명령 문자열 배열이어야 한다')
      }
      break
    case 'grade':
    case 'ci':
      rejectUnknownKeys(r, p, ['type'], err)
      if (scope !== 'loop') err(`${p}.type`, `${r.type} 규칙은 goal 고리 안에서만 쓴다`)
      break
    default:
      err(`${p}.type`, `알 수 없는 규칙 ${JSON.stringify(r.type)} — commands·grade·ci 중 하나`)
  }
}

function checkAction(n: Obj, p: string, scope: Scope, err: ErrSink): void {
  rejectUnknownKeys(n, p, [...COMMON_KEYS, 'action'], err)
  const a = n.action
  if (typeof a !== 'string' || !Object.hasOwn(ACTION_SCOPE, a)) {
    err(`${p}.action`, `알 수 없는 동작 ${JSON.stringify(a)}`)
    return
  }
  const want = ACTION_SCOPE[a as ActionKind]
  if (want !== scope) err(`${p}.action`, `${a}는 ${want === 'loop' ? 'goal 고리' : '마일스톤 구획'}에서만 쓴다`)
}

// 실패 참조는 같은 구획의 자기 또는 앞 노드만 가리킨다. 마일스톤 구획에서는 goal 고리를 건너지도 못한다.
function checkGotos(list: unknown[], path: string, seen: Map<string, string>, err: ErrSink): void {
  const index = new Map<string, number>()
  list.forEach((n, i) => {
    if (isObject(n) && typeof n.id === 'string' && n.kind !== 'goalLoop' && !index.has(n.id)) index.set(n.id, i)
  })
  const isLoop = (k: number): boolean => isObject(list[k]) && (list[k] as Obj).kind === 'goalLoop'
  list.forEach((n, i) => {
    if (!isObject(n) || !isObject(n.onFail) || typeof n.onFail.goto !== 'string') return
    const target = n.onFail.goto
    const p = `${path}[${i}].onFail.goto`
    const j = index.get(target)
    if (j === undefined) {
      err(p, seen.has(target) ? `${target}는 다른 구획의 노드다 — 같은 구획 안만 가리킨다` : `없는 id ${target}를 가리킨다`)
    } else if (j > i) {
      err(p, `${target}는 뒤에 있다 — 실패 때 앞으로 뛰면 게이트를 건너뛰므로 자기 또는 앞 노드만 가리킨다`)
    } else {
      for (let k = j + 1; k < i; k++) {
        if (isLoop(k)) { err(p, `${target}로 가면 goal 고리를 건너 고리 앞으로 간다 — 끝난 goal 위로 분해를 다시 돌 수 없다`); break }
      }
    }
  })
}

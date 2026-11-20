// M09 G1 — 실행 상태 스키마. 작업 저장소의 `.agentdeck/run-state.json`에 실린다.
// 템플릿 내용은 싣지 않고 id와 해시만 적는다(해시가 앱의 템플릿과 다르면 실행기가 멈춘다).
// 검증 줄은 실행기만 쓴다(by: 'executor'). FAIL 계수는 줄 목록에서 다시 셀 수 있는 값이라 불러올 때 다시 센다.
// 저장된 계수가 다시 센 값과 다르거나, running인데 그 범위의 FAIL이 이미 FAIL_LIMIT 이상이거나,
// needs-user인데 멈춘 사유가 없으면 상태를 거부한다 — 계수나 status 한 칸만 고쳐서는 멈춤을 풀지 못한다.
// 다만 이 검사는 자기 일관성만 본다. 줄 목록까지 함께 고치면 통과한다. 작업 세션이 `.agentdeck/`를 직접 쓰는 길에는 겹이 둘이다 —
// 루프 잠금 노드와 앱 쪽 다이제스트·위조 래치. 둘 다 편집 도구와 순진한 Bash 편집을 잡는 겹이고, 다이제스트는 키 없는 해시라
// 세션이 앱 영역에 쓰면 맞출 수 있다(ports.ts 머리 주석).
import {
  isNonEmptyString, isObject, rejectUnknownKeys,
  type ErrSink, type Grade, type Judge, type SchemaError, type StepNode, type Template,
} from './template'

// 헌법 7조의 수 — 마지막 USER-INPUT 뒤 FAIL이 이만큼이면 멈춘다. 템플릿이 바꾸지 못하게 코드에 둔다.
export const FAIL_LIMIT = 3

export type Marker = 'PASS' | 'FAIL' | 'USER-INPUT'
type LineJudge =Judge | 'executor'
interface VerificationLine {
  marker: Marker
  at: string
  sentence: string
  by: 'executor'
  node: string
  // 줄이 속한 범위 — goal id, 마일스톤 구획이면 null. FAIL 계수는 범위마다 센다.
  goal: string | null
  judge: LineJudge
}
type GoalStatus ='pending' | 'active' | 'done'
export interface GoalState {
  id: string
  title: string
  grade: Grade | null
  status: GoalStatus
  // goal 브랜치를 가른 시작 SHA(이미 있는 브랜치가 이번 실행의 계보인지 본다)
  baseSha: string | null
  pr: number | null
  // goal PR 동작이 마지막으로 push한 머리 — CI는 이 머리의 결과만 판정한다
  pushedSha: string | null
  ciSha: string | null
  mergedSha: string | null
  // M09 G4 — 모델 게이트(검수)가 pass를 낸 작업 트리 해시. goal PR 동작이 커밋·push 직전에 지금 트리와 대조한다.
  // 옛 상태에는 없을 수 있다(없으면 null로 읽는다).
  reviewedTree?: string | null
  // M09 G4 검수 I7 — 분해 노드가 pass할 때 실행기가 읽은 goal 문서의 sha256. 검수 직전과 goal PR 직전에 지금 문서와 대조한다.
  // 옛 상태에는 없을 수 있다(없으면 대조하지 않는다).
  docSha256?: string | null
}
// goal은 goal 고리 안이면 goal 목록의 위치, 마일스톤 구획이면 null.
export interface Cursor { node: string; goal: number | null }
type RunStatus ='running' | 'needs-user' | 'done'
export interface RunState {
  schema: 1
  milestoneId: string
  template: { id: string; hash: string }
  // M09 G4 — 시작할 때 읽은 기준 브랜치(origin 기본 브랜치). 다시 열 때 읽은 값과 다르면 실행기가 멈춘다. 옛 상태에는 없을 수 있다.
  base?: string | null
  // M09 G4 검수 I7 — 사람이 스펙 승인에서 본 스펙의 sha256(실행기가 대조한 값). 그 뒤 노드에서 스펙 파일이 다르면 실행기가 멈춘다.
  specSha256?: string | null
  status: RunStatus
  haltReason: string | null
  cursor: Cursor
  // 마일스톤 브랜치를 가른 시작 SHA
  milestoneBase: string | null
  goals: GoalState[]
  milestonePr: number | null
  failCount: number
  lines: VerificationLine[]
}
type RunStateCheck ={ ok: true; state: RunState } | { ok: false; errors: SchemaError[] }

const MILESTONE_ID =/^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const GOAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const HASH = /^[0-9a-f]{64}$/
const MARKERS: readonly Marker[] = ['PASS', 'FAIL', 'USER-INPUT']
const LINE_JUDGES: readonly LineJudge[] = ['rule', 'model', 'human', 'executor']
const STATUSES: readonly RunStatus[] = ['running', 'needs-user', 'done']
const GOAL_STATUSES: readonly GoalStatus[] = ['pending', 'active', 'done']

export function createRunState(
  template: Template, hash: string, milestoneId: string, base: string | null = null,
): { ok: true; state: RunState } | { ok: false; reason: string } {
  if (!MILESTONE_ID.test(milestoneId)) return { ok: false, reason: `마일스톤 id ${JSON.stringify(milestoneId)}가 id 꼴이 아니다` }
  if (!HASH.test(hash)) return { ok: false, reason: '템플릿 해시가 sha256 16진수가 아니다' }
  if (base !== null && !isNonEmptyString(base)) return { ok: false, reason: '기준 브랜치 이름이 비었다' }
  // 스키마 검사가 goal 고리 앞에 분해 노드를 요구하므로 첫 노드는 언제나 고리가 아니다.
  const first = template.nodes[0] as StepNode
  return {
    ok: true,
    state: {
      schema: 1,
      milestoneId,
      template: { id: template.id, hash },
      base,
      status: 'running',
      haltReason: null,
      cursor: { node: first.id, goal: null },
      milestoneBase: null,
      goals: [],
      milestonePr: null,
      failCount: 0,
      lines: [],
    },
  }
}

export function scopeOf(state: Pick<RunState, 'cursor' | 'goals'>): string | null {
  return state.cursor.goal === null ? null : state.goals[state.cursor.goal]?.id ?? null
}

// 그 범위에서 마지막 USER-INPUT 줄 뒤에 쌓인 FAIL 수.
export function failsSinceUserInput(lines: readonly VerificationLine[], scope: string | null): number {
  let n = 0
  for (const l of lines) {
    if (l.goal !== scope) continue
    if (l.marker === 'USER-INPUT') n = 0
    else if (l.marker === 'FAIL') n++
  }
  return n
}

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isPr = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
const nullOr = <T>(v: unknown, test: (x: unknown) => x is T): boolean => v === null || test(v)
const oneOf = <T>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v)

function checkGoal(g: unknown, p: string, err: ErrSink): void {
  if (!isObject(g)) { err(p, 'goal은 객체여야 한다'); return }
  rejectUnknownKeys(g, p, ['id', 'title', 'grade', 'status', 'baseSha', 'pr', 'pushedSha', 'ciSha', 'mergedSha', 'reviewedTree', 'docSha256'], err)
  if (g.reviewedTree !== undefined && !nullOr(g.reviewedTree, isNonEmptyString)) err(`${p}.reviewedTree`, '문자열이나 null')
  if (g.docSha256 !== undefined && !nullOr(g.docSha256, (x: unknown): x is string => typeof x === 'string' && HASH.test(x))) err(`${p}.docSha256`, 'sha256 16진수나 null')
  if (!isNonEmptyString(g.id) || !GOAL_ID.test(g.id)) err(`${p}.id`, 'goal id 꼴이 아니다')
  if (!isNonEmptyString(g.title)) err(`${p}.title`, '제목이 있어야 한다')
  if (!(g.grade === null || g.grade === 'strong' || g.grade === 'weak')) err(`${p}.grade`, 'strong·weak·null 중 하나')
  if (!oneOf(GOAL_STATUSES, g.status)) err(`${p}.status`, 'pending·active·done 중 하나')
  if (!nullOr(g.pr, isPr)) err(`${p}.pr`, '양의 정수나 null')
  for (const k of ['baseSha', 'pushedSha', 'ciSha', 'mergedSha'] as const) {
    if (!nullOr(g[k], isNonEmptyString)) err(`${p}.${k}`, '문자열이나 null')
  }
}

function checkLine(l: unknown, p: string, err: ErrSink): void {
  if (!isObject(l)) { err(p, '검증 줄은 객체여야 한다'); return }
  rejectUnknownKeys(l, p, ['marker', 'at', 'sentence', 'by', 'node', 'goal', 'judge'], err)
  if (!oneOf(MARKERS, l.marker)) err(`${p}.marker`, 'PASS·FAIL·USER-INPUT 중 하나')
  if (!isNonEmptyString(l.at)) err(`${p}.at`, '시각이 있어야 한다')
  if (!isNonEmptyString(l.sentence)) err(`${p}.sentence`, '한 문장이 있어야 한다')
  if (l.by !== 'executor') err(`${p}.by`, '검증 줄은 실행기만 쓴다')
  if (!isNonEmptyString(l.node)) err(`${p}.node`, '노드 id가 있어야 한다')
  if (!nullOr(l.goal, isNonEmptyString)) err(`${p}.goal`, 'goal id나 null')
  if (!oneOf(LINE_JUDGES, l.judge)) err(`${p}.judge`, 'rule·model·human·executor 중 하나')
}

export function validateRunState(raw: unknown): RunStateCheck {
  const errors: SchemaError[] = []
  const err: ErrSink = (path, reason) => { errors.push({ path, reason }) }
  if (!isObject(raw)) return { ok: false, errors: [{ path: '$', reason: '실행 상태는 객체여야 한다' }] }
  rejectUnknownKeys(raw, '$', [
    'schema', 'milestoneId', 'template', 'base', 'specSha256', 'status', 'haltReason', 'cursor', 'milestoneBase', 'goals', 'milestonePr', 'failCount', 'lines',
  ], err)
  if (raw.schema !== 1) err('$.schema', '지원하는 상태 판은 1뿐이다')
  if (raw.base !== undefined && !nullOr(raw.base, isNonEmptyString)) err('$.base', '기준 브랜치 이름이나 null')
  if (raw.specSha256 !== undefined && !nullOr(raw.specSha256, (x: unknown): x is string => typeof x === 'string' && HASH.test(x))) {
    err('$.specSha256', 'sha256 16진수나 null')
  }
  if (!isNonEmptyString(raw.milestoneId) || !MILESTONE_ID.test(raw.milestoneId)) err('$.milestoneId', '마일스톤 id 꼴이 아니다')
  const t = raw.template
  if (!isObject(t)) err('$.template', '{ id, hash } 객체여야 한다')
  else {
    rejectUnknownKeys(t, '$.template', ['id', 'hash'], err)
    if (!isNonEmptyString(t.id)) err('$.template.id', '템플릿 id가 있어야 한다')
    if (typeof t.hash !== 'string' || !HASH.test(t.hash)) err('$.template.hash', 'sha256 16진수여야 한다')
  }
  if (!oneOf(STATUSES, raw.status)) err('$.status', 'running·needs-user·done 중 하나')
  if (!nullOr(raw.haltReason, isNonEmptyString)) err('$.haltReason', '문자열이나 null')
  const c = raw.cursor
  if (!isObject(c)) err('$.cursor', '{ node, goal } 객체여야 한다')
  else {
    rejectUnknownKeys(c, '$.cursor', ['node', 'goal'], err)
    if (!isNonEmptyString(c.node)) err('$.cursor.node', '노드 id가 있어야 한다')
    if (!nullOr(c.goal, isIndex)) err('$.cursor.goal', '0 이상의 정수나 null')
  }
  if (!nullOr(raw.milestoneBase, isNonEmptyString)) err('$.milestoneBase', '문자열이나 null')
  if (!Array.isArray(raw.goals)) err('$.goals', '배열이어야 한다')
  else raw.goals.forEach((g: unknown, i) => checkGoal(g, `$.goals[${i}]`, err))
  if (!nullOr(raw.milestonePr, isPr)) err('$.milestonePr', '양의 정수나 null')
  if (!isIndex(raw.failCount)) err('$.failCount', '0 이상의 정수여야 한다')
  if (!Array.isArray(raw.lines)) err('$.lines', '배열이어야 한다')
  else raw.lines.forEach((l: unknown, i) => checkLine(l, `$.lines[${i}]`, err))
  if (errors.length > 0) return { ok: false, errors }

  const state = structuredClone(raw) as unknown as RunState
  const ids = new Set<string>()
  state.goals.forEach((g, i) => {
    if (ids.has(g.id)) err(`$.goals[${i}].id`, `중복 goal id ${g.id}`)
    ids.add(g.id)
  })
  if (state.status === 'needs-user' && state.haltReason === null) err('$.haltReason', '멈춘 상태에는 멈춘 사유가 있어야 한다')
  if (state.cursor.goal !== null && state.cursor.goal >= state.goals.length) err('$.cursor.goal', 'goal 목록 밖을 가리킨다')
  else {
    const derived = failsSinceUserInput(state.lines, scopeOf(state))
    if (state.failCount !== derived) err('$.failCount', `줄 목록에서 센 값 ${derived}과 다르다`)
    if (state.status === 'running' && derived >= FAIL_LIMIT) {
      err('$.status', `마지막 USER-INPUT 뒤 FAIL이 ${derived}번인데 running이다 — 사람의 이어 가기 없이 멈춤을 풀 수 없다`)
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, state }
}

// 실행기의 바깥 껍질. 포트로 현재 노드를 한 번 실행하고, 그 결과를 판정 하나로 만들어
// 순수 상태 기계(applyVerdict)에 넣은 뒤 생존 문서(run-state.json, verification.md)에 쓴다.
// 상태는 실행기가 소유한다 — step()·submit(verdict)은 상태를 받지 않고 매번 검증된 저장본을 읽으며, 호출은 하나씩 차례로 돈다.
// 그래서 밖에서 커서를 바꾼 상태 객체를 넣는 길이 없고, 겹친 호출이 서로의 검증 줄을 덮어쓰지 않는다.
// 규칙 게이트의 판정과 검증 줄은 여기서 실행기가 만든다 — 명령 포트로 템플릿이 적은 명령을 돌린 결과, git 포트의 변경 통계,
// gh 포트의 CI 상태가 증거다. 밖에서 넣을 수 있는 판정은 사람 판정(submit)뿐이고, 모델 판정은 검수 포트로 받는다.
// 실행기가 만든 판정을 상태 기계가 거부하면 같은 노드의 stop으로 바꿔 멈춘다(사유는 haltReason, 이어 갈 때 USER-INPUT 줄).
// action 노드는 모두 「확인 뒤 실행」이다. 이미 있는 브랜치·PR은 이번 실행의 것일 때만 받는다 —
//   브랜치는 상태에 적은 시작 SHA의 계보일 때, 병합된 PR은 이번에 push한 머리(goal이면 CI를 통과한 머리)와 같을 때.
//   아니면 stop이다. 그래서 「실행은 됐는데 상태 저장 전에 꺼짐」 뒤의 재개가 같은 일을 두 번 하지 않고, 남의 것을 받지도 않는다.
// 재개: load()가 run-state.json을 다이제스트·스키마·템플릿 해시로 확인하고 같은 노드를 고른다. git·gh와 맞추는 일은 다음 step의 action이 한다.
//
// 앱 쪽 다이제스트(ports.digest). 상태를 쓸 때마다 정규 JSON의 sha256을 앱 영역에 적고, load·step·submit·start는
//   저장본이 그와 다르면 사람을 부른다(kind 'needs-user', 「상태 파일이 실행기 밖에서 바뀌었다」). 다이제스트 없이 파일만 있거나
//   파일 없이 다이제스트만 있어도 같다 — 다이제스트는 start만 만든다. 불일치 때는 아무것도 쓰지 않는다. 쓰기 직전에도 한 번 더 본다
//   (작업 노드 세션이 그 노드 동안 상태 파일을 고쳤으면 덮어쓰지 않고 멈춘다).
//   쓰기 순서는 사본 → run-state.json → 다이제스트 → verification.md다. 상태 파일과 다이제스트 사이에 꺼지면 재개 때 불일치로 멈춘다
//   (사람이 확인하고 푼다). 다이제스트는 편집 도구와 순진한 Bash 편집을 잡는 겹이다 — 키 없는 해시라 세션이 앱 영역에 쓰면 맞출 수 있다.
// load는 직렬화 줄 밖이다(끝나지 않는 노드 동안에도 읽힌다). 쓰는 중에 읽어 불일치가 나면 그 쓰기가 끝난 뒤 한 번 다시 읽는다.
// CI 기다림 상한. pending·gh 오류·머리 불일치로 판정 없이 기다린 시간을 같은 goal·같은 push 머리마다 시계(ports.clock)로 잰다
//   (ciWaitMs, 기본 60분). 횟수(ciWaitLimit)는 보조 상한이다. 넘으면 그 CI 노드의 stop으로 멈춘다(FAIL로 세지 않는다).
//   판정이 나거나 멈추면 처음으로 돌아간다. 기다림 기록은 실행기 메모리에만 있다.
// 실행기 쪽 보호
//   - 위조 래치: 다이제스트 불일치나 git 설정 변경을 한 번 보면 사유를 앱 영역(DigestStore.writeLatch)과 메모리에 남긴다. 걸려 있으면
//     start·load·step·submit 모두 짝이 맞아도 사람을 부른다. 푸는 길은 사람의 「확인하고 풀기」다(loopDriver — 실행기를 닫고
//     래치를 지운 뒤 다시 연다. 실행기 자신에게는 푸는 API가 없다). load의 첫 불일치는 쓰기와 겹친 것일 수 있어 한 번 다시
//     읽고, 다시 읽어도 다르고 진행 중인 쓰기가 없을 때만 래치를 건다.
//   - git 설정 대조(ports.configGuard): step 앞뒤로 본다. 바뀌었으면 그 노드의 판정을 남기지 않고 래치를 건다.
//   - 원격과 로컬 대조: 작업 노드는 로컬 브랜치에 커밋할 수 있다. 실행기는 원격에 없는 커밋을 올리지 않는다 —
//     base·마일스톤에서 가를 때, goal을 병합할 때, 마일스톤 PR을 열 때 로컬 머리가 원격 머리와 같아야 한다. goal 병합의 재개는
//     「부모가 (원격 머리, PR 머리)인 병합 커밋 하나」만 받아 push한다. 이미 있는 마일스톤 브랜치는 머리가 시작 SHA일 때만 push한다.
//     재개 꼴이든 이번 병합이든, push 전에 그 병합 커밋의 트리가 두 부모의 깨끗한 병합(git.verifyMerge)인지 본다.
//     부모만 맞춘 위조(commit-tree)와 교체 객체로 바꾼 트리를 원격에 올리지 않는다.
//     goal 브랜치의 커밋은 일의 결과라 push한다(CI와 PR 머리 대조를 지난다).
// 판정은 본 내용에 묶는다.
//   - 스펙 승인: watch 없는 사람 게이트의 판정(승인·반려)은 사람이 본 `.agentdeck/milestone-spec.md`의 sha256(specView)을 함께 받는다.
//     파일이 없거나, 해시가 없거나, 지금 파일의 해시와 다르면 거부한다(blocked, 아무것도 쓰지 않는다). 멈춘 실행의 이어 가기는 묶지 않는다.
//   - 검수: 실행기가 한 임시 인덱스에서 작업 트리 해시와 마일스톤 브랜치 대비 diff를 만들어(git.reviewSnapshot) goal 문서와 함께
//     검수 포트에 준다. 검수 뒤 트리가 바뀌었으면 pass를 받지 않고 멈춘다. pass는 그 트리 해시를 goal에 남기고(reviewedTree),
//     goal PR 동작이 커밋 전(작업 트리)과 push 전(커밋한 트리)에 다시 대조해 다르면 멈춘다.
//   - 기준 브랜치: 템플릿이 아니라 부르는 쪽(openLoop — origin 기본 브랜치)이 준다. 시작할 때 상태에 적고, 다시 열 때 다르면 멈춘다.
//   - goal PR 본문에 그 goal의 검증 줄을 싣는다(renderGoalLines). 본문은 PR을 만들 때만 정하므로 CI·병합 줄은 실리지 않는다.
//   - 세션 취소(실행기 닫기·화면의 취소)는 FAIL로 세지 않고 멈춘다(stop) — 사람의 이어 가기로 같은 노드를 다시 돈다.
//   - 상태 사본(DigestStore.writeCopy)은 상태 파일과 같은 글이다. 상태 위조 래치를 풀 때 구동자가 이 사본으로 상태 파일을 되돌린다
//     (위조본을 받지 않는다).
//   - 스펙 파일이 없으면 해시 없는 반려만 받는다(브레인스토밍으로 돌아가는 길). 승인은 계속 해시가 있어야 한다.
//   - 등급과 검수 diff의 기준은 실행기가 상태에 쥔 goal 시작 SHA(goal.baseSha)다 — 작업 노드가 옮길 수 있는 로컬 ref 이름이 아니다.
//   - 분해 pass가 적은 goal 문서 해시와 스펙 승인 pass가 적은 스펙 해시를 대조한다. goal 문서는 검수 직전과 goal PR 직전,
//     스펙은 승인 뒤 매 노드 앞에서 본다. 다르면 멈춘다(stop — FAIL로 세지 않는다).
//   - goal PR은 SHA를 한 번 읽어 그 커밋의 트리를 대조하고 그 SHA를 push한다(`<sha>:refs/heads/<b>`).
//   - 검수 diff가 상한을 넘으면 검수를 열지 않고 멈춘다(잘린 diff로 낸 pass가 전체 트리에 묶이지 않게).
//   - 밖에서 넣는 사람 판정의 facts는 버린다 — 상태 사실은 실행기가 대조한 값만 싣는다.
//   - 프로젝트 Taste의 판은 마일스톤 시작점 커밋에서 읽는다 — 약 등급 goal이 검수 없이 병합한 Taste가 다음 goal의 판이 되지 않게.
import {
  applyVerdict, checkResumable, expectedJudge, judgeCi, judgeCommands, nextStep, oneSentence,
  type CommandRun, type NextStep, type Verdict,
} from './executor'
import { repoKeyOf, stateDigest } from './digestStore'
import { computeGrade, type FileChange } from './grade'
import type { LoopPorts } from './ports'
import { createRunState, validateRunState, type GoalState, type RunState } from './runState'
import {
  DOCS, goalDocPath, readGoalSeeds, readNodeDocs, readSpecView, renderGoalLines, runStateText, sha256Text, writeVerification,
} from './survivalDocs'
import { tasteChecklist, type TasteCheckItem } from './tasteVerdict'
import type { ActionNode, GateNode, SchemaError, StepNode, Template, WorkNode } from './template'
import { PROJECT_TASTE_REL } from '@main/13_Taste/tasteStore'

const DEFAULT_CI_WAIT_LIMIT = 120
export const DEFAULT_CI_WAIT_MS = 60 * 60_000
export const TAMPERED_REASON = '상태 파일이 실행기 밖에서 바뀌었다'

// 메인 노드 방문의 키. 기다리는 동안은 줄이 늘지 않아 같고, 판정(반려·FAIL)이 줄을 더하면 바뀐다.
// 메인 대화 포트(WorkRequest.visit)와 구동자의 쓰기 창 판정이 같이 쓴다.
export const visitKeyOf = (state: RunState): string => `${state.milestoneId}#${state.lines.length}`
const LATCH_TAIL = '— 위조 래치가 걸렸다. 사람이 화면에서 확인하고 풀기 전까지 짝이 맞아도 멈춘다.'

interface LoopRunnerDeps {
  template: Template
  hash: string
  ports: LoopPorts
  // 작업 저장소 뿌리 — 검사 명령의 cwd, 다이제스트 키(repoKeyOf)
  cwd: string
  // 기준 브랜치(openLoop가 origin 기본 브랜치를 읽어 준다). 마일스톤 브랜치를 가르는 곳이자 마일스톤 PR이 가는 곳이다.
  base: string
  // 판정 없이 기다린 CI의 시간 상한(시계 기준, 기본 60분)과 step 수의 보조 상한. 넘으면 멈춘다.
  ciWaitMs?: number
  ciWaitLimit?: number
}

export type StepOutcome =
  | { kind: 'advanced' | 'failed' | 'halted' | 'resumed' | 'done'; state: RunState; verdict: Verdict | null }
  | { kind: 'waiting'; on: 'human' | 'ci'; state: RunState }
  | { kind: 'blocked'; reason: string; state: RunState | null; errors?: SchemaError[] }
  | { kind: 'needs-user'; reason: string; state: null }

export type LoadResult =
  | { kind: 'missing' }
  | { kind: 'blocked'; reason: string; errors?: SchemaError[] }
  | { kind: 'needs-user'; reason: string }
  | { kind: 'ok'; state: RunState; next: NextStep }

// 사람 판정과 함께 오는 것 — 사람이 화면에서 본 내용의 해시
interface SubmitSeen {specSha256?: string }
interface SpecView {text: string | null; sha256: string | null }

export interface LoopRunner {
  start(milestoneId: string): Promise<LoadResult>
  load(): Promise<LoadResult>
  step(): Promise<StepOutcome>
  submit(verdict: Verdict, seen?: SubmitSeen): Promise<StepOutcome>
  // 스펙 승인 카드가 보일 본문과 해시(직렬화 줄 밖 — 읽기만 한다)
  specView(): Promise<SpecView>
  // 직렬화 줄의 지금 끝까지 기다린다(닫기 전에 진행 중인 step의 쓰기를 마치게).
  idle(): Promise<void>
}

interface BranchNames { base: string; milestone: string; goal: string | null }

function branchNames(template: Template, milestoneId: string, goalId: string | null, base: string): BranchNames {
  const fill = (pattern: string): string => pattern.split('{milestone}').join(milestoneId).split('{goal}').join(goalId ?? '')
  return {
    base,
    milestone: fill(template.branches.milestone),
    goal: goalId === null ? null : fill(template.branches.goal),
  }
}

type Produced = { kind: 'verdict'; verdict: Verdict } | { kind: 'waiting'; on: 'human' | 'ci'; why?: string }

// 저장본 읽기의 결과. ok에는 읽은 파일의 다이제스트를 싣는다(쓰기 직전 대조에 쓴다).
type Checked =
  | { kind: 'missing' }
  | { kind: 'tampered'; reason: string }
  | { kind: 'invalid'; errors: SchemaError[] }
  | { kind: 'ok'; state: RunState; digest: string }

class Tampered extends Error {}

// 끝난 실행의 보관 자리(backlog.md는 옮기지 않는다). 보관본은 실행기가 다시 읽지 않는다.
export const ARCHIVE_DIR = `${DOCS.dir}/archive`
export const finishedNotice = (milestoneId: string): string => `끝난 실행(${milestoneId}) — 새 마일스톤을 시작하면 보관해요`
class ArchiveFailed extends Error {}
const ARCHIVED_DOCS = [DOCS.milestoneSpec, DOCS.decisions, DOCS.verification] as const

// 실행기가 매 단계 쓰는 생존 문서는 goal의 변경이 아니므로 등급 통계에서 뺀다(템플릿과 관계없이).
const EXECUTOR_OWNED = /^(\.[\\/])*\.agentdeck[\\/]/
// 특수 글자가 든 경로는 git이 따옴표로 감싼다
const TASTE_DOCS_DIFF = /^diff --git "?a\/docs\/agentdeck\//im
const short = (sha: string | null | undefined): string => (sha ? sha.slice(0, 8) : '(없음)')
const errorText = (e: unknown): string => oneSentence(e instanceof Error ? e.message : String(e))
const v = (node: StepNode, verdict: Verdict['verdict'], evidence: string, facts?: Verdict['facts']): Verdict =>
  ({ node: node.id, judge: expectedJudge(node), verdict, evidence, facts })
const tamperedStep = (reason: string): StepOutcome => ({ kind: 'needs-user', reason, state: null })
const NOT_PUSHED = '원격에 없는 커밋은 실행기가 올리지 않는다(작업 노드가 로컬 브랜치에 커밋했을 수 있다) — 사람 판단이 필요하다'
// 사람이 본 스펙에 묶이는 게이트 — watch가 없는 사람 게이트(템플릿의 스펙 승인)
const specBound = (node: GateNode): boolean => node.judge === 'human' && !node.watch

export function createLoopRunner(deps: LoopRunnerDeps): LoopRunner {
  const { template, hash, ports, cwd, base } = deps
  const { git, gh } = ports
  const repoKey = repoKeyOf(cwd)
  const ciWaitLimit = deps.ciWaitLimit ?? DEFAULT_CI_WAIT_LIMIT
  const ciWaitMs = deps.ciWaitMs ?? DEFAULT_CI_WAIT_MS

  // 호출 직렬화 — 앞 호출이 끝난 뒤에 다음 호출이 저장본을 읽는다. load는 줄 밖이다.
  let chain: Promise<unknown> = Promise.resolve()
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }
  let persisting: Promise<void> | null = null
  let ciWait: { key: string; count: number; since: number } | null = null

  // ── 위조 래치 ──
  let latched: string | null = null
  // 래치 파일 경로를 사유에 싣는다 — 사람이 어디를 확인할지 안다. 푸는 길은 화면의 「확인하고 풀기」다.
  const latchFile = ((): string | null => { try { return ports.digest.latchPath?.(repoKey) ?? null } catch { return null } })()
  const latchText = (reason: string): string => `${reason} ${LATCH_TAIL}${latchFile ? ` 래치 파일: ${latchFile}` : ''}`
  async function latchedReason(): Promise<string | null> {
    if (latched === null) {
      const stored = await ports.digest.readLatch(repoKey)
      if (stored) latched = stored
    }
    return latched === null ? null : latchText(latched)
  }
  async function latch(reason: string): Promise<string> {
    if (latched === null) {
      latched = reason
      // 앱 영역에 못 써도 메모리 래치는 남는다(이 실행기가 살아 있는 동안)
      try { await ports.digest.writeLatch(repoKey, reason) } catch { /* 메모리 래치 */ }
    }
    return latchText(latched)
  }
  async function configTripped(): Promise<string | null> {
    const reason = await ports.configGuard?.check()
    return reason ? latch(reason) : null
  }

  // 다시 열 때 읽은 기준 브랜치가 시작할 때 적은 것과 같은가. 옛 상태(칸 없음)는 지금 값을 쓴다.
  const baseMoved = (state: RunState): string | null =>
    state.base != null && state.base !== base
      ? `시작할 때 적은 기준 브랜치 ${state.base}와 지금 읽은 기준 브랜치 ${base}가 다르다 — origin의 기본 브랜치가 바뀌었는지 사람이 확인한다`
      : null

  async function readChecked(): Promise<Checked> {
    const text = await ports.fs.read(DOCS.runState)
    const stored = await ports.digest.read(repoKey)
    if (text === null) {
      return stored === null ? { kind: 'missing' } : { kind: 'tampered', reason: `${TAMPERED_REASON} — 앱에 다이제스트가 있는데 상태 파일이 없다` }
    }
    if (stored === null) return { kind: 'tampered', reason: `${TAMPERED_REASON} — 앱에 이 저장소의 다이제스트가 없다(다이제스트는 새로 시작할 때만 만든다)` }
    let raw: unknown
    try { raw = JSON.parse(text) } catch { return { kind: 'tampered', reason: `${TAMPERED_REASON} — JSON으로 읽히지 않는다` } }
    const digest = stateDigest(raw)
    if (digest !== stored) return { kind: 'tampered', reason: `${TAMPERED_REASON} — 앱에 적은 다이제스트와 다르다` }
    const checked = validateRunState(raw)
    return checked.ok ? { kind: 'ok', state: checked.state, digest } : { kind: 'invalid', errors: checked.errors }
  }

  // expected: 이번 호출이 읽은 저장본의 다이제스트(새로 시작이면 null — 파일이 없어야 한다).
  // prepare: 대조 뒤 쓰기 전에 돈다(보관). 같은 persisting 안이라 그 틈에 읽는 load가 래치를 걸지 않는다.
  // 상태 파일을 쓰기 전에 실패하면 prepare가 돌려준 되돌리기를 부른다(되돌린 결과를 한 문장으로 돌려준다).
  async function persist(state: RunState, expected: string | null, prepare?: () => Promise<() => Promise<string>>): Promise<void> {
    const run = (async () => {
      const now = await ports.fs.read(DOCS.runState)
      const nowDigest = now === null ? null : (() => { try { return stateDigest(JSON.parse(now)) } catch { return 'unreadable' } })()
      if (nowDigest !== expected) throw new Tampered(`${TAMPERED_REASON} — 이번 단계가 읽은 뒤 상태 파일이 바뀌어 덮어쓰지 않았다`)
      const undo = prepare ? await prepare() : null
      // 사본 → 상태 파일 → 다이제스트. 어디서 꺼져도 사본은 상태 파일보다 낡지 않다.
      const text = runStateText(state)
      try {
        await ports.digest.writeCopy(repoKey, text)
        await ports.fs.write(DOCS.runState, text)
      } catch (e) {
        if (!undo) throw e
        throw new ArchiveFailed(`새 실행 상태를 쓰지 못했다(${errorText(e)}) — ${await undo()}`)
      }
      await ports.digest.write(repoKey, stateDigest(JSON.parse(text)))
      await writeVerification(ports.fs, state)
    })()
    persisting = run
    try { await run } finally { if (persisting === run) persisting = null }
  }

  // 파일이 든 자리는 쓰인 것으로 본다(보관이 옮겨 넣는 곳은 그 폴더와 goals/뿐이다) — 되돌린 뒤 남은 빈 폴더는 다시 쓴다.
  // 같은 이름이 있으면 시각 꼬리(숫자만 — Windows 이름에 쓸 수 없는 글자를 뺀다), 그것도 있으면 번호를 더 붙인다.
  async function archiveDirFor(milestoneId: string): Promise<string> {
    const taken = async (dir: string): Promise<boolean> => {
      if (!(await ports.fs.exists(dir))) return false
      try { return (await ports.fs.list(dir)).length > 0 || (await ports.fs.list(`${dir}/goals`)).length > 0 } catch { return true }
    }
    const first = `${ARCHIVE_DIR}/${milestoneId}`
    if (!(await taken(first))) return first
    const stamped = `${first}-${ports.clock.now().replace(/[^0-9]/g, '').slice(0, 14)}`
    for (let n = 1; n < 100; n++) {
      const name = n === 1 ? stamped : `${stamped}-${n}`
      if (!(await taken(name))) return name
    }
    throw new Error(`보관 자리 ${stamped}의 이름이 모두 쓰였다`)
  }

  // persist의 prepare. 돌려주는 함수는 새 상태를 쓰지 못했을 때의 되돌리기다(앱 영역 사본도 옛것으로 둔다).
  async function archive(state: RunState): Promise<() => Promise<string>> {
    const moved: [string, string][] = []
    const back = async (): Promise<string[]> => {
      const left: string[] = []
      for (const [from, to] of moved.splice(0).reverse()) {
        try { await ports.fs.move(to, from) } catch (e) { left.push(`${to} → ${from}(${errorText(e)})`) }
      }
      return left
    }
    const backText = (left: string[]): string => (left.length === 0 ? '옮긴 파일은 되돌렸다' : `되돌리지 못한 파일: ${left.join(', ')}`)
    let copy: string | null = null
    let oldText: string | null = null
    try {
      copy = await ports.digest.readCopy(repoKey)
      oldText = await ports.fs.read(DOCS.runState)
      const dir = await archiveDirFor(state.milestoneId)
      const plan: [string, string][] = (await ports.fs.list(DOCS.goalsDir)).map((n) => [`${DOCS.goalsDir}/${n}`, `${dir}/goals/${n}`])
      for (const doc of ARCHIVED_DOCS) if (await ports.fs.exists(doc)) plan.push([doc, `${dir}/${doc.slice(DOCS.dir.length + 1)}`])
      plan.push([DOCS.runState, `${dir}/run-state.json`])
      for (const [from, to] of plan) {
        await ports.fs.move(from, to)
        moved.push([from, to])
      }
    } catch (e) {
      throw new ArchiveFailed(`${errorText(e)} — ${backText(await back())}`)
    }
    // 사본이 없던 실행이면 옛 상태 본문을 사본으로 쓴다 — 디스크·다이제스트·사본이 옛 실행으로 맞는다
    const restore = copy ?? oldText ?? runStateText(state)
    return async () => {
      const files = backText(await back())
      try {
        await ports.digest.writeCopy(repoKey, restore)
        return files
      } catch (e) {
        return `${files} / 앱 영역 상태 사본을 맞추지 못했다(${errorText(e)})`
      }
    }
  }

  async function readCurrent(): Promise<{ ok: true; state: RunState; digest: string } | { ok: false; outcome: StepOutcome }> {
    const held = await latchedReason()
    if (held) return { ok: false, outcome: tamperedStep(held) }
    const read = await readChecked()
    if (read.kind === 'missing') return { ok: false, outcome: { kind: 'blocked', reason: '실행 상태가 없다 — start로 시작한다', state: null } }
    if (read.kind === 'tampered') return { ok: false, outcome: tamperedStep(await latch(read.reason)) }
    if (read.kind === 'invalid') {
      return { ok: false, outcome: { kind: 'blocked', reason: '실행 상태가 스키마에 맞지 않는다', state: null, errors: read.errors } }
    }
    const check = checkResumable(template, hash, read.state)
    if (!check.ok) return { ok: false, outcome: { kind: 'blocked', reason: check.reason, state: read.state } }
    const moved = baseMoved(read.state)
    if (moved) return { ok: false, outcome: { kind: 'blocked', reason: moved, state: read.state } }
    return { ok: true, state: read.state, digest: read.digest }
  }

  async function save(next: RunState, digest: string): Promise<StepOutcome | null> {
    try {
      await persist(next, digest)
      return null
    } catch (e) {
      if (e instanceof Tampered) return tamperedStep(await latch(e.message))
      throw e
    }
  }

  async function commit(state: RunState, digest: string, verdict: Verdict, origin: 'executor' | 'outside'): Promise<StepOutcome> {
    ciWait = null
    let applied = applyVerdict(template, state, verdict, ports.clock.now())
    if (!applied.ok) {
      if (origin === 'outside') return { kind: 'blocked', reason: applied.reason, state }
      // 실행기가 만든 판정이 거부됐다 — 같은 일을 되풀이하지 않도록 그 노드의 stop으로 멈춘다.
      const here = nextStep(template, state)
      if (here.kind !== 'work' && here.kind !== 'gate' && here.kind !== 'action') return { kind: 'blocked', reason: applied.reason, state }
      const stop: Verdict = { node: here.node.id, judge: expectedJudge(here.node), verdict: 'stop', evidence: `실행기가 만든 판정을 상태 기계가 거부했다 — ${applied.reason}` }
      applied = applyVerdict(template, state, stop, ports.clock.now())
      if (!applied.ok) return { kind: 'blocked', reason: applied.reason, state }
      const refused = await save(applied.state, digest)
      if (refused) return refused
      return { kind: 'halted', state: applied.state, verdict: stop }
    }
    const s = applied.state
    const refused = await save(s, digest)
    if (refused) return refused
    if (state.status === 'needs-user' && s.status === 'running') return { kind: 'resumed', state: s, verdict }
    const kind = s.status === 'done' ? 'done'
      : s.status === 'needs-user' ? 'halted'
        : verdict.verdict === 'pass' ? 'advanced' : 'failed'
    return { kind, state: s, verdict }
  }

  // 사람 반려가 이 노드로 되돌렸으면 그 줄의 문장(메인 대화의 반려 사유 턴). 마지막 줄이 그 반려일 때만이다.
  function rejectedInto(state: RunState, node: WorkNode): string | null {
    const last = state.lines.at(-1)
    if (!last || last.marker !== 'USER-INPUT' || last.judge !== 'human') return null
    const gate = template.nodes.find((n) => n.kind === 'gate' && n.id === last.node)
    return gate?.kind === 'gate' && gate.onFail?.goto === node.id ? last.sentence : null
  }

  // 메인 노드가 직전에 FAIL했으면 그 줄의 문장(다시 도는 세션이 같은 실수를 되풀이하지 않게)
  function failedInto(state: RunState, node: WorkNode): string | null {
    const last = state.lines.at(-1)
    return node.role === 'main' && last?.marker === 'FAIL' && last.node === node.id ? last.sentence : null
  }

  // null: 메인 노드의 여러 턴 대화가 아직 끝나지 않았다(판정 없이 기다린다)
  async function runWork(node: WorkNode, state: RunState, goal: GoalState | null): Promise<Verdict | null> {
    try {
      const docs = await readNodeDocs(ports.fs, node.docs, goal?.id ?? null)
      const visit = { key: visitKeyOf(state), rejected: rejectedInto(state, node), failed: failedInto(state, node) }
      const res = await ports.session.runWork({ milestoneId: state.milestoneId, node, goal, docs, visit })
      // 대화 중(사람을 기다림)은 판정이 아니다. 메인 노드에만 받는다
      if (res.waiting) {
        if (node.role === 'main') return null
        return v(node, 'fail', `작업자 노드 세션이 끝나지 않은 채 돌아왔다 — ${res.summary}`)
      }
      // 취소(실행기 닫기·화면의 취소)는 검증 실패가 아니다 — FAIL로 세지 않고 멈춘다
      if (res.cancelled) return v(node, 'stop', `작업 세션이 취소됐다 — ${res.summary}. 사람이 이어 가기로 같은 노드를 다시 돌린다`)
      if (!res.ok) return v(node, 'fail', `작업 세션이 일을 마치지 못했다 — ${res.summary}`)
      // 스펙을 다루는 메인 노드(브레인스토밍)는 스펙 파일을 남겨야 끝난 것이다. 없거나 비었으면 다시 돈다.
      // 반려 뒤나 다음 마일스톤에서는 옛 스펙이 남아 있으므로, 이번 세션에서 스펙이나 결정 대장이 바뀌었는지도 본다
      // (세션 전 본문은 위 readNodeDocs가 읽어 둔 값이다).
      // 메인 대화 포트가 방문의 처음 스펙 해시(baseline)를 주면 스펙만 그것과 대조한다(결정 대장은 턴마다 바뀐다).
      if (node.role === 'main' && node.docs.includes('milestoneSpec')) {
        const spec = await ports.fs.read(DOCS.milestoneSpec)
        if (spec === null || spec.trim() === '') {
          return v(node, 'fail', `작업 세션이 ${DOCS.milestoneSpec}를 쓰지 않고 끝났다 — ${res.summary}`)
        }
        if (res.baseline) {
          if (sha256Text(spec) === res.baseline.specSha256) {
            return v(node, 'fail', `이번 브레인스토밍 방문에서 ${DOCS.milestoneSpec}가 바뀌지 않았다 — ${res.summary}`)
          }
        } else {
          const decisionsSame = !node.docs.includes('decisions') || (await ports.fs.read(DOCS.decisions)) === (docs.decisions ?? null)
          if (spec === (docs.milestoneSpec ?? null) && decisionsSame) {
            return v(node, 'fail', `이번 세션에서 ${DOCS.milestoneSpec}도 ${DOCS.decisions}도 바뀌지 않았다 — ${res.summary}`)
          }
        }
      }
      if (node.produces !== 'goals') return v(node, 'pass', `작업 세션이 끝났다 — ${res.summary}`)
      const seeds = await readGoalSeeds(ports.fs)
      if (!seeds.ok) return v(node, 'fail', `분해 결과를 읽지 못했다 — ${seeds.reason}`)
      return v(node, 'pass', `목표 ${seeds.goals.length}개로 나눴다 — ${seeds.goals.map((g) => g.id).join(', ')}`, { goals: seeds.goals })
    } catch (e) {
      return v(node, 'fail', `작업 세션 오류 — ${errorText(e)}`)
    }
  }

  async function runRule(node: GateNode, goal: GoalState | null): Promise<Produced> {
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
          // 기준은 실행기가 쥔 goal 시작 SHA. 없으면 통계 없음(강)이다
          let stat: FileChange[] | null = null
          try { stat = goal?.baseSha ? await git.diffStat(goal.baseSha) : null } catch { stat = null }
          const g = computeGrade(template.grading, stat === null ? null : stat.filter((f) => !EXECUTOR_OWNED.test(f.path)))
          return { kind: 'verdict', verdict: v(node, 'pass', `등급 ${g.grade === 'strong' ? '강' : '약'} — ${g.reason}`, { grade: g.grade }) }
        }
        case 'ci': {
          if (!goal || goal.pr === null) return { kind: 'verdict', verdict: v(node, 'fail', 'PR 번호가 없어 CI를 읽을 수 없다') }
          // gh 읽기 오류는 FAIL이 아니라 기다림이다(마일스톤 병합 게이트와 같다). 기다림의 상한은 step이 잰다.
          let ci
          try { ci = await gh.ciStatus(goal.pr) } catch (e) { return { kind: 'waiting', on: 'ci', why: `gh 오류 — ${errorText(e)}` } }
          // 이번에 push한 머리의 결과가 아니면 판정하지 않는다.
          const judged = judgeCi(node, ci, goal.pushedSha)
          if (judged) return { kind: 'verdict', verdict: judged }
          const why = ci.state === 'pending'
            ? `CI가 아직 끝나지 않았다(머리 ${short(ci.headSha)}, ${ci.summary})`
            : `CI가 보고한 머리 ${short(ci.headSha)}가 이번에 push한 머리 ${short(goal.pushedSha)}가 아니다`
          return { kind: 'waiting', on: 'ci', why }
        }
        default:
          return { kind: 'verdict', verdict: v(node, 'fail', '규칙이 없는 규칙 게이트다') }
      }
    } catch (e) {
      return { kind: 'verdict', verdict: v(node, 'fail', `${node.title} 검사를 돌리지 못했다 — ${errorText(e)}`) }
    }
  }

  // 모델 게이트 — 실행기가 검수 입력(goal 문서, 작업 트리 대 마일스톤 브랜치 diff)과 트리 해시를 만들고, pass를 그 트리에 묶는다.
  async function runReview(node: GateNode, state: RunState, goal: GoalState | null, names: BranchNames): Promise<Verdict> {
    try {
      // diff의 기준은 goal을 가를 때 실행기가 적은 시작 SHA다(작업 노드가 옮길 수 있는 로컬 ref 이름이 아니다)
      const baseSha = goal?.baseSha ?? null
      if (!baseSha) return v(node, 'stop', '목표 시작 SHA가 상태에 없어 검수 diff의 기준을 정할 수 없다 — 사람 판단이 필요하다')
      // 검수 기준 문서가 분해 때 읽은 것과 같은가. 검수에 주는 본문과 대조하는 본문이 같은 읽기다
      const goalDoc = goal ? await ports.fs.read(goalDocPath(goal.id)) : null
      const drift = goalDocDrift(goal, goalDoc)
      if (drift) return v(node, 'stop', `${drift} 검수를 열지 않았다`)
      // 판을 읽지 못하면 Taste 판정이 조용히 꺼지지 않게 멈춘다(설정 문제라 FAIL로 세지 않는다)
      const plate = await tastePlate(state)
      if (!plate.ok) return v(node, 'stop', `Taste 판을 쓸 수 없어 검수를 열지 않았다 — ${plate.reason}`)
      const snap = await git.reviewSnapshot(baseSha)
      if (!snap) return v(node, 'fail', `${names.milestone}의 목표 시작 ${short(baseSha)} 대비 diff를 만들지 못해 검수를 열지 않았다`)
      // 잘린 diff로 검수하지 않는다(pass가 전체 트리에 묶이므로). FAIL로 세지 않고 멈춘다
      if (snap.tooLarge) {
        return v(node, 'stop', `검수 diff가 ${snap.chars ?? '?'}자로 상한을 넘어 검수를 열지 않았다 — 목표를 나누거나 사람이 판단한다`)
      }
      const r = await ports.review.review({
        milestoneId: state.milestoneId, node, goal, goalDoc, diff: snap.diff, base: names.milestone, baseSha,
        taste: plate.items, tasteDocsChanged: TASTE_DOCS_DIFF.test(snap.diff),
      })
      if (r.verdict !== 'pass') return { node: node.id, judge: 'model', verdict: r.verdict, evidence: r.evidence }
      const after = await git.worktreeTree()
      if (after !== snap.tree) {
        return v(node, 'stop', `검수 동안 작업 트리가 바뀌었다(${short(snap.tree)} → ${short(after)}) — 검수 pass를 받지 않았다. 사람 판단이 필요하다`)
      }
      const facts = { reviewedTree: snap.tree, ...(r.tasteConflicts?.length ? { tasteConflicts: r.tasteConflicts } : {}) }
      return { node: node.id, judge: 'model', verdict: 'pass', evidence: `${r.evidence} (검수 트리 ${short(snap.tree)})`, facts }
    } catch (e) {
      return v(node, 'fail', `검수 세션이 판정을 내지 못했다 — ${errorText(e)}`)
    }
  }

  async function projectPlate(state: RunState): Promise<{ ok: true; text: string | null } | { ok: false; reason: string }> {
    const base = state.milestoneBase
    if (!base) return { ok: false, reason: '마일스톤 시작 SHA가 상태에 없어 프로젝트 Taste의 판을 정할 수 없다 — 사람 판단이 필요하다' }
    const fixed = `판은 마일스톤 시작점 커밋 ${short(base)}의 원문이라 이 실행에서는 고칠 수 없다. 기본 브랜치에서 고친 뒤 새 실행으로`
    let text: string | null
    try { text = await git.fileAt(base, PROJECT_TASTE_REL) } catch (e) {
      return { ok: false, reason: `${fixed} — 일시적인 읽기 오류면 이어 가기로 다시 읽는다. 마일스톤 시작 ${short(base)}의 프로젝트 Taste를 읽지 못했다(${PROJECT_TASTE_REL} — ${errorText(e)})` }
    }
    const checked = tasteChecklist({ project: text, global: null })
    return checked.ok ? { ok: true, text } : { ok: false, reason: `${fixed} — ${checked.reason}` }
  }

  async function tastePlate(state: RunState): Promise<{ ok: true; items: TasteCheckItem[] } | { ok: false; reason: string }> {
    const project = await projectPlate(state)
    if (!project.ok) return project
    const fixable = '사람이 전역 Taste를 고치고 이어 간다'
    let global: string | null
    try { global = (await ports.taste?.readGlobal()) ?? null } catch (e) {
      return { ok: false, reason: `${fixable} — 전역 Taste를 읽지 못했다(${errorText(e)})` }
    }
    const checked = tasteChecklist({ project: project.text, global })
    return checked.ok ? checked : { ok: false, reason: `${fixable} — ${checked.reason}` }
  }

  async function runGate(node: GateNode, state: RunState, goal: GoalState | null, names: BranchNames): Promise<Produced> {
    if (node.judge === 'rule') return runRule(node, goal)
    if (node.judge === 'model') return { kind: 'verdict', verdict: await runReview(node, state, goal, names) }
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

  // 로컬 branch 머리가 원격 머리와 같은가. 다르면(원격에 없음 포함) 사유를 돌려준다.
  async function driftOf(branch: string): Promise<string | null> {
    const remote = await git.remoteSha(branch)
    const local = await git.headSha(branch)
    if (remote === null) return `원격에 ${branch} 브랜치가 없다 — ${NOT_PUSHED}`
    if (local !== remote) return `로컬 ${branch}(${short(local)})가 원격(${short(remote)})과 다르다 — ${NOT_PUSHED}`
    return null
  }

  // 브랜치는 시작 SHA의 계보일 때만 이번 실행의 것으로 받는다. 상태에 시작 SHA가 없으면(만든 뒤 저장 전에 꺼짐) from의 원격 머리로 본다
  // (로컬 ref는 작업 노드가 옮길 수 있다).
  // push하는 브랜치(마일스톤)는 머리가 시작 SHA와 같을 때만 받고, 그 SHA를 push한다(확인 뒤 로컬 브랜치가 옮겨져도 따라가지 않는다).
  async function ensureBranch(node: ActionNode, name: string, from: string, recordedStart: string | null, pushNew: boolean): Promise<Verdict> {
    if (await git.branchExists(name)) {
      const start = recordedStart ?? (await git.remoteSha(from))
      if (!start || !(await git.isAncestor(start, name))) {
        return v(node, 'stop', `${name} 브랜치가 이미 있는데 이번 실행이 가른 계보(시작 ${short(start)})가 아니다 — 사람 판단이 필요하다`)
      }
      if (pushNew) {
        const head = await git.headSha(name)
        if (head !== start) return v(node, 'stop', `이미 있는 ${name}의 머리 ${short(head)}가 시작 ${short(start)}가 아니다 — ${NOT_PUSHED}`)
      }
      await git.checkout(name)
      if (pushNew) await git.push(name, start)
      return v(node, 'pass', `${name} 브랜치가 이미 있다(시작 ${short(start)}의 계보) — 만들지 않고 옮겨 갔다`, { baseSha: start })
    }
    await git.syncToRemote(from)
    const drift = await driftOf(from)
    if (drift) return v(node, 'stop', `${name}을 가르지 않았다 — ${drift}`)
    const start = await git.headSha(from)
    if (!start) return v(node, 'fail', `${from}의 머리를 읽지 못해 ${name}을 가르지 않았다`)
    await git.createBranch(name, from)
    await git.checkout(name)
    if (pushNew) {
      const head = await git.headSha(name)
      if (head !== start) return v(node, 'stop', `가른 ${name}의 머리 ${short(head)}가 ${from}에서 읽은 ${short(start)}가 아니다 — ${NOT_PUSHED}`)
      await git.push(name, start)
    }
    return v(node, 'pass', `${name} 브랜치를 ${from}의 ${short(start)}에서 갈랐다`, { baseSha: start })
  }

  // inSync: 마일스톤 PR — 로컬 머리가 원격과 같을 때만 연다(push하지 않는다). goal PR은 goal 브랜치의 일을 커밋해 push한다.
  // reviewedTree: 검수 pass가 묶인 트리. 있으면 커밋 전 작업 트리와 push 전 커밋 트리가 그것과 같아야 한다 — 다르면 멈춘다.
  async function ensurePr(
    node: ActionNode, head: string, base: string, title: string, body: string, commitFirst: boolean, inSync: boolean,
    reviewedTree: string | null = null,
  ): Promise<Verdict> {
    // 커밋은 지금 체크아웃된 브랜치에 얹힌다. 재개 사이에 브랜치가 바뀌었어도 PR 머리 브랜치에 커밋하도록 먼저 옮긴다.
    await git.checkout(head)
    let pushed: string | null
    if (inSync) {
      const drift = await driftOf(head)
      if (drift) return v(node, 'stop', `PR을 열지 않았다 — ${drift}`)
      pushed = await git.headSha(head)
    } else {
      if (reviewedTree !== null) {
        const now = await git.worktreeTree()
        if (now !== reviewedTree) {
          return v(node, 'stop', `검수한 트리 ${short(reviewedTree)}와 지금 작업 트리 ${short(now)}가 달라 커밋·push하지 않았다 — 검수 뒤 바뀐 것이다. 사람 판단이 필요하다`)
        }
      }
      if (commitFirst && (await git.hasChanges())) await git.commitAll(title)
      // 머리 SHA를 한 번 읽어, 그 커밋의 트리를 대조하고 그 SHA를 push한다(사이에 로컬 브랜치가 옮겨져도 따라가지 않는다).
      // 작업 노드가 로컬에 커밋해 hasChanges가 거짓이어도 push 전에 커밋한 트리를 본다
      const sha = await git.headSha(head)
      if (!sha) return v(node, 'fail', `${head}의 머리를 읽지 못했다`)
      if (reviewedTree !== null) {
        const committed = await git.treeOf(sha)
        if (committed !== reviewedTree) {
          return v(node, 'stop', `${head}의 커밋 ${short(sha)} 트리 ${short(committed)}가 검수한 트리 ${short(reviewedTree)}가 아니라 push하지 않았다 — 사람 판단이 필요하다`)
        }
      }
      await git.push(head, sha)
      pushed = sha
    }
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
    const ms = names.milestone
    if (pr.state === 'merged') {
      if (pr.headSha !== goal.ciSha) {
        return v(node, 'stop', `PR ${pr.number}이 CI를 통과한 머리 ${short(goal.ciSha)}가 아닌 ${short(pr.headSha)}로 병합됐다 — 사람 판단이 필요하다`)
      }
      // 다음 노드(다음 goal 브랜치 가르기·회귀)가 원격과 같은 마일스톤 브랜치 위에서 돌도록 옮기고 맞춘다.
      await git.checkout(ms)
      await git.syncToRemote(ms)
      const drift = await driftOf(ms)
      if (drift) return v(node, 'stop', `PR ${pr.number}은 병합됐지만 ${drift}`)
      return v(node, 'pass', `PR ${pr.number}은 CI를 통과한 머리 ${short(pr.headSha)}로 이미 병합됐다(병합 커밋 ${short(pr.mergeCommitSha)}) — 다시 병합하지 않고 상태를 맞췄다`,
        { mergedSha: pr.mergeCommitSha ?? pr.headSha })
    }
    if (pr.state === 'closed') return v(node, 'stop', `PR ${pr.number}이 병합 없이 닫혔다 — 사람 판단이 필요하다`)
    // 머리 SHA 대조 — CI를 통과한 머리와 지금 PR 머리가 같을 때만 병합한다.
    if (pr.headSha !== goal.ciSha) {
      return v(node, 'fail', `PR 머리 ${short(pr.headSha)}가 CI를 통과한 머리 ${short(goal.ciSha)}와 달라 병합하지 않았다`)
    }
    await git.checkout(ms)
    await git.syncToRemote(ms)
    const remote = await git.remoteSha(ms)
    const local = await git.headSha(ms)
    if (remote === null) return v(node, 'stop', `원격에 ${ms} 브랜치가 없다 — ${NOT_PUSHED}`)
    if (local !== remote) {
      // 재개 — 「로컬 병합은 됐는데 push 전에 꺼짐」만 받는다: 부모가 (원격 머리, PR 머리)인 병합 커밋 하나.
      const parents = local ? await git.parents(local) : []
      if (local && parents.length === 2 && parents[0] === remote && parents[1] === pr.headSha) {
        // 부모만 맞춘 위조(commit-tree)를 받지 않는다 — 트리가 두 부모의 깨끗한 병합이어야 한다
        const forged = await git.verifyMerge(local, remote, pr.headSha)
        if (forged) return v(node, 'stop', `${ms}의 로컬 머리를 push하지 않았다 — ${forged}. ${NOT_PUSHED}`)
        // 확인한 그 병합 SHA를 push한다(goal PR과 같은 꼴). 확인 뒤 로컬 브랜치가 옮겨져도 따라가지 않는다
        await git.push(ms, local)
        return v(node, 'pass', `${ms}의 로컬 머리 ${short(local)}가 원격 머리와 PR 머리 ${short(pr.headSha)}의 병합 커밋이다 — 다시 병합하지 않고 push만 했다`, { mergedSha: local ?? pr.headSha })
      }
      return v(node, 'stop', `로컬 ${ms}(${short(local)})가 원격(${short(remote)})과 다르고, 원격 머리와 PR 머리를 부모로 한 병합 커밋 하나가 아니다 — ${NOT_PUSHED}`)
    }
    if (await git.isAncestor(pr.headSha, ms)) {
      return v(node, 'pass', `머리 ${short(pr.headSha)}는 이미 원격 ${ms}에 있다 — 다시 병합하지 않았다`, { mergedSha: remote })
    }
    const merged = await git.mergeNoFf(pr.headSha, `Merge PR #${pr.number}: ${goal.id} ${goal.title}`)
    // 실행기 git은 교체 객체를 따르지 않는다(gitPort). 그래도 push 전에 병합 커밋의 부모와 트리를 구조로 한 번 더 본다.
    const bad = await git.verifyMerge(merged, remote, pr.headSha)
    if (bad) return v(node, 'stop', `${ms}에 병합했지만 push하지 않았다 — ${bad}. 사람 판단이 필요하다`)
    await git.push(ms, merged)
    return v(node, 'pass', `머리 ${short(pr.headSha)}를 ${ms}에 --no-ff로 병합하고 push했다(병합 커밋 ${short(merged)})`, { mergedSha: merged })
  }

  // 「영역 재설계 안건」은 늘 싣는다 — 안건이 없으면 「없음」(절이 빠진 것과 안건이 없는 것을 가른다)
  function milestoneReport(state: RunState): string {
    const rows = state.goals.map((g) => `- ${g.id} ${g.title} — 등급 ${g.grade === 'weak' ? '약' : '강'}, PR ${g.pr ?? '없음'}`)
    const agenda = state.goals.flatMap((g) => (g.tasteConflicts ?? []).map((c) =>
      `- ${g.id} — 프로젝트 ${c.project} 대 전역 ${c.global}, 프로젝트 쪽을 따랐다: ${c.note}`))
    return [
      `# ${state.milestoneId} 마일스톤 결과 보고`, '', ...rows, '',
      '## 영역 재설계 안건', '', ...(agenda.length > 0 ? agenda : ['- 없음']), '',
      '검증 기록은 `.agentdeck/verification.md`에 있다.',
    ].join('\n')
  }

  // goal 문서가 분해 때 실행기가 읽은 본문과 같은가. 다르면 사유(멈춤), 같거나 옛 상태(해시 없음)면 null.
  function goalDocDrift(goal: GoalState | null, text: string | null): string | null {
    const recorded = goal?.docSha256 ?? null
    if (!goal || recorded === null) return null
    const path = goalDocPath(goal.id)
    if (text === null) return `분해 때 읽은 목표 문서 ${path}가 없어졌다 — 사람 판단이 필요하다.`
    const now = sha256Text(text)
    if (now === recorded) return null
    return `목표 문서 ${path}가 분해 때 적은 해시 ${short(recorded)}와 다르다(지금 ${short(now)}) — 검수 기준 문서가 바뀌었다. 사람이 되돌리거나 판단한다.`
  }

  async function runAction(node: ActionNode, state: RunState, goal: GoalState | null, names: BranchNames): Promise<Verdict> {
    try {
      switch (node.action) {
        case 'createMilestoneBranch':
          return await ensureBranch(node, names.milestone, names.base, state.milestoneBase, true)
        case 'createGoalBranch': {
          if (!goal || names.goal === null) return v(node, 'fail', 'goal 밖에서 goal 브랜치를 가를 수 없다')
          // 프로젝트 판은 이 실행에서 고칠 수 없으니 작업을 쓰기 전에 멈춘다. 전역 판은 사람이 고치면 풀리므로 검수 때 본다
          const plate = await projectPlate(state)
          if (!plate.ok) return v(node, 'stop', `프로젝트 Taste를 판으로 쓸 수 없어 ${names.goal}을 가르지 않았다 — ${plate.reason}`)
          return await ensureBranch(node, names.goal, names.milestone, goal.baseSha, false)
        }
        case 'openGoalPr': {
          if (!goal || names.goal === null) return v(node, 'fail', 'goal 밖에서 goal PR을 열 수 없다')
          // 검수 없는(약 등급) goal도 PR 전에 goal 문서를 대조한다
          const drift = goalDocDrift(goal, await ports.fs.read(goalDocPath(goal.id)))
          if (drift) return v(node, 'stop', `${drift} 목표 PR을 열지 않았다`)
          const body = `goal ${goal.id} — ${goal.title}\n\n${renderGoalLines(state, goal.id)}\n`
          return await ensurePr(node, names.goal, names.milestone, `${goal.id}: ${goal.title}`, body, true, false, goal.reviewedTree ?? null)
        }
        case 'mergeGoal':
          if (!goal) return v(node, 'fail', 'goal 밖에서 goal을 병합할 수 없다')
          return await mergeGoal(node, goal, names)
        case 'openMilestonePr':
          return await ensurePr(node, names.milestone, names.base, `${state.milestoneId} 마일스톤`, milestoneReport(state), false, true)
      }
    } catch (e) {
      return v(node, 'fail', `${node.title} 중 오류 — ${errorText(e)}`)
    }
  }

  async function produce(next: NextStep, state: RunState): Promise<Produced | null> {
    if (next.kind === 'done' || next.kind === 'needs-user') return null
    const names = branchNames(template, state.milestoneId, next.goal?.id ?? null, state.base ?? base)
    switch (next.kind) {
      case 'work': {
        const verdict = await runWork(next.node, state, next.goal)
        // 메인 노드의 대화가 사람을 기다린다. 판정 없이 기다림으로 돌려준다(줄을 쓰지 않는다)
        return verdict === null ? { kind: 'waiting', on: 'human' } : { kind: 'verdict', verdict }
      }
      case 'gate': return runGate(next.node, state, next.goal, names)
      case 'action': return { kind: 'verdict', verdict: await runAction(next.node, state, next.goal, names) }
    }
  }

  async function loadOnce(): Promise<LoadResult> {
    const read = await readChecked()
    if (read.kind === 'missing') return read
    if (read.kind === 'tampered') return { kind: 'needs-user', reason: read.reason }
    if (read.kind === 'invalid') return { kind: 'blocked', reason: '실행 상태가 스키마에 맞지 않는다', errors: read.errors }
    // 끝난 실행은 위조·스키마 검사를 지난 뒤에만 여기 닿는다. 템플릿이 바뀌었어도 막지 않는다(start가 보관한다)
    if (read.state.status === 'done') return { kind: 'ok', state: read.state, next: nextStep(template, read.state) }
    const check = checkResumable(template, hash, read.state)
    if (!check.ok) return { kind: 'blocked', reason: check.reason }
    const moved = baseMoved(read.state)
    if (moved) return { kind: 'blocked', reason: moved }
    return { kind: 'ok', state: read.state, next: nextStep(template, read.state) }
  }

  // CI 기다림 한 번을 잰다. 상한(시간 또는 횟수)을 넘었으면 사유를 돌려준다.
  function ciWaitExceeded(key: string): string | null {
    const at = Date.parse(ports.clock.now())
    ciWait = ciWait?.key === key ? { ...ciWait, count: ciWait.count + 1 } : { key, count: 1, since: at }
    if (Number.isFinite(at) && Number.isFinite(ciWait.since) && at - ciWait.since > ciWaitMs) return `상한 ${Math.round(ciWaitMs / 60_000)}분`
    return ciWait.count > ciWaitLimit ? `상한 ${ciWaitLimit}번` : null
  }

  return {
    start: (milestoneId) => exclusive(async () => {
      const held = await latchedReason()
      if (held) return { kind: 'needs-user', reason: held }
      const existing = await readChecked()
      if (existing.kind === 'tampered') return { kind: 'needs-user', reason: await latch(existing.reason) }
      // 끝난 실행만 보관하고 새로 연다. 끝나지 않은 실행은 지금처럼 거부한다
      const done = existing.kind === 'ok' && existing.state.status === 'done' ? existing : null
      if (existing.kind !== 'missing' && !done) return { kind: 'blocked', reason: '실행 상태가 이미 있다 — 새로 시작하지 않는다(load로 이어 간다)' }
      const created = createRunState(template, hash, milestoneId, base)
      if (!created.ok) return { kind: 'blocked', reason: created.reason }
      try {
        await persist(created.state, done?.digest ?? null, done ? () => archive(done.state) : undefined)
      } catch (e) {
        if (e instanceof Tampered) return { kind: 'needs-user', reason: await latch(e.message) }
        if (e instanceof ArchiveFailed && done) {
          return { kind: 'blocked', reason: `끝난 실행(${done.state.milestoneId})을 보관하지 못해 새로 시작하지 않았다 — ${e.message}` }
        }
        throw e
      }
      return { kind: 'ok', state: created.state, next: nextStep(template, created.state) }
    }),

    // 직렬화 줄 밖 — 끝나지 않는 노드 동안에도 읽힌다. 상태 파일과 다이제스트를 따로 읽으므로 그 사이에 쓰기가 끼면 어긋날 수 있다.
    // 불일치면 진행 중인 쓰기가 있으면 끝나기를 기다린 뒤, 없으면 바로 한 번 다시 읽는다. 다시 읽어도 다르면 멈춤이고,
    // 그때 진행 중인 쓰기가 없으면 래치를 건다(쓰기와 겹친 것이 아니다).
    load: async () => {
      const held = await latchedReason()
      if (held) return { kind: 'needs-user', reason: held }
      const first = await loadOnce()
      if (first.kind !== 'needs-user') return first
      await persisting?.catch(() => undefined)
      const second = await loadOnce()
      if (second.kind !== 'needs-user' || persisting !== null) return second
      return { kind: 'needs-user', reason: await latch(second.reason) }
    },

    step: () => exclusive(async () => {
      const before = await latchedReason() ?? await configTripped()
      if (before) return tamperedStep(before)
      const cur = await readCurrent()
      if (!cur.ok) return cur.outcome
      const state = cur.state
      const next = nextStep(template, state)
      if (next.kind === 'done') return { kind: 'done', state, verdict: null }
      if (next.kind === 'needs-user') return { kind: 'halted', state, verdict: null }
      // 승인한 스펙이 그 뒤 바뀌었으면 어느 노드도 돌리지 않고 멈춘다. 스펙을 쓰는 노드(메인 노드)와 스펙 승인 게이트 자신은 뺀다
      const writesSpec = (next.kind === 'work' && next.node.role === 'main') || (next.kind === 'gate' && specBound(next.node))
      if (state.specSha256 && !writesSpec) {
        const view = await readSpecView(ports.fs)
        if (view.sha256 !== state.specSha256) {
          const stop = v(next.node, 'stop', `승인한 스펙(sha256 ${short(state.specSha256)})과 지금 스펙 파일(${view.sha256 ? `sha256 ${short(view.sha256)}` : '없음'})이 다르다 — 승인 뒤 스펙이 바뀌었다. 사람이 되돌리거나 판단한다`)
          return commit(state, cur.digest, stop, 'executor')
        }
      }
      const produced = await produce(next, state)
      // 노드 동안(작업 세션 포함) 실행기 git 설정이 바뀌었으면 그 판정을 남기지 않는다.
      const after = await configTripped()
      if (after) return tamperedStep(after)
      if (!produced) return { kind: 'halted', state, verdict: null }
      if (produced.kind === 'waiting') {
        if (produced.on !== 'ci' || next.kind !== 'gate') return { kind: 'waiting', on: produced.on, state }
        const exceeded = ciWaitExceeded(`${next.goal?.id ?? ''}@${next.goal?.pushedSha ?? ''}`)
        if (!exceeded) return { kind: 'waiting', on: 'ci', state }
        const stop = v(next.node, 'stop', `CI 기다림이 ${exceeded}을 넘었다 — 마지막: ${produced.why ?? '판정 없음'}`)
        return commit(state, cur.digest, stop, 'executor')
      }
      return commit(state, cur.digest, produced.verdict, 'executor')
    }),

    // seen은 기본값이 있어 submit.length는 1이다 — 상태를 받는 자리가 없다.
    submit: (verdict, seen: SubmitSeen = {}) => exclusive(async () => {
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
      // 스펙 승인 판정은 사람이 본 스펙 해시에 묶인다 — 병합 버튼의 「보인 SHA로만」과 같은 규칙이다.
      // 밖에서 넣는 판정의 facts는 버린다 — 상태 사실(스펙 해시 같은 것)은 실행기가 대조한 값만 싣는다
      let bound: Verdict = { node: verdict.node, judge: verdict.judge, verdict: verdict.verdict, evidence: verdict.evidence }
      // 노드 이름과 관계없이 본다 — 다른 이름의 판정은 상태 기계가 거부하지만, 해시 검사가 그 거부에 기대지 않게 한다
      if (state.status === 'running' && next.kind === 'gate' && specBound(next.node)) {
        const view = await readSpecView(ports.fs)
        if (view.sha256 === null) {
          // 스펙 파일이 없으면 해시 없는 반려만 받는다(브레인스토밍으로 돌아가는 길). 승인은 받지 않는다
          if (verdict.verdict !== 'fail') return { kind: 'blocked', reason: `${DOCS.milestoneSpec}가 없어 스펙 승인 판정을 받지 않는다 — 반려로 브레인스토밍에 돌아간다`, state }
          return commit(state, cur.digest, { ...bound, evidence: `${verdict.evidence} (스펙 파일 없음)` }, 'outside')
        }
        if (!seen.specSha256) return { kind: 'blocked', reason: '스펙 승인 판정에는 사람이 본 스펙의 sha256이 있어야 한다', state }
        if (seen.specSha256 !== view.sha256) {
          return {
            kind: 'blocked',
            reason: `사람이 본 스펙(sha256 ${short(seen.specSha256)})과 지금 스펙 파일(sha256 ${short(view.sha256)})이 다르다 — 바뀐 스펙을 다시 보고 판정한다`,
            state,
          }
        }
        bound = {
          ...bound,
          evidence: `${verdict.evidence} (스펙 sha256 ${view.sha256.slice(0, 12)})`,
          ...(verdict.verdict === 'pass' ? { facts: { specSha256: view.sha256 } } : {}),
        }
      }
      return commit(state, cur.digest, bound, 'outside')
    }),

    specView: () => readSpecView(ports.fs),

    idle: () => chain.then(() => undefined),
  }
}

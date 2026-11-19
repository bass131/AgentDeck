// M09 G1 실행기 상태 기계 — 순수 함수(nextStep·applyVerdict)만 부른다.
// 고정하는 것: 실행 순서가 템플릿(실제 파일과 변형본)을 그대로 따른다, 규칙·모델·사람 게이트의 불통과에서 다음 노드로 가지 않는다,
// 마지막 USER-INPUT 뒤 FAIL 셋이면 멈추고 USER-INPUT 뒤엔 0부터 센다, 판정 하나의 꼴 말고는 나아가는 길이 없다.
import { describe, it, expect } from 'vitest'
import * as executor from '@main/05_Loop/executor'
import {
  FAIL_LIMIT, applyVerdict, checkResumable, judgeCi, judgeCommands, nextStep, type Verdict,
} from '@main/05_Loop/executor'
import { createRunState, failsSinceUserInput, validateRunState, type RunState } from '@main/05_Loop/runState'
import type { GateNode, Template } from '@main/05_Loop/template'
import {
  AT, GOALS, drive, findRawNode, labelOf, loaded, removeRawNode, swapRawNodes, variantText,
} from '../00_Helpers/loopFakes'

const fresh = (t: Template, hash: string): RunState => {
  const r = createRunState(t, hash, 'M1')
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const apply = (t: Template, s: RunState, v: Verdict): RunState => {
  const r = applyVerdict(t, s, v, AT)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const verdict = (node: string, judge: Verdict['judge'], kind: Verdict['verdict'], evidence = '시험 증거'): Verdict =>
  ({ node, judge, verdict: kind, evidence })

const REAL_ORDER = [
  'brainstorm', 'spec-approval', 'milestone-branch', 'decompose',
  'G1/goal-branch', 'G1/implement', 'G1/checks', 'G1/grade', 'G1/review', 'G1/goal-pr', 'G1/ci', 'G1/merge',
  'G2/goal-branch', 'G2/implement', 'G2/checks', 'G2/grade', 'G2/goal-pr', 'G2/ci', 'G2/merge',
  'regression', 'milestone-pr', 'milestone-merge',
]
const GRADES = { G1: 'strong', G2: 'weak' } as const

describe('실행 순서는 템플릿을 그대로 따른다', () => {
  it('실제 program-dev.json — 강 등급 goal만 독립 검수를 지난다', () => {
    const { template, hash } = loaded()
    const run = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES })
    expect(run.visited).toEqual(REAL_ORDER)
    expect(run.state.status).toBe('done')
    expect(run.state.goals.map((g) => [g.id, g.grade, g.status])).toEqual([['G1', 'strong', 'done'], ['G2', 'weak', 'done']])
  })

  it('노드를 빼면(회귀) 그 노드가 순서에서 빠진다', () => {
    const { template, hash } = loaded(variantText((raw) => removeRawNode(raw, 'regression')))
    const run = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES })
    expect(run.visited).toEqual(REAL_ORDER.filter((l) => l !== 'regression'))
  })

  it('등급 게이트를 빼면 등급을 모르므로 강으로 보고 두 goal 모두 검수를 지난다', () => {
    const { template, hash } = loaded(variantText((raw) => removeRawNode(raw, 'grade')))
    const run = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES })
    expect(run.visited).toEqual([
      'brainstorm', 'spec-approval', 'milestone-branch', 'decompose',
      'G1/goal-branch', 'G1/implement', 'G1/checks', 'G1/review', 'G1/goal-pr', 'G1/ci', 'G1/merge',
      'G2/goal-branch', 'G2/implement', 'G2/checks', 'G2/review', 'G2/goal-pr', 'G2/ci', 'G2/merge',
      'regression', 'milestone-pr', 'milestone-merge',
    ])
  })

  it('순서를 바꾸면(검사↔등급, 마일스톤 브랜치↔분해) 실행 순서도 바뀐다', () => {
    const { template, hash } = loaded(variantText((raw) => {
      swapRawNodes(raw, 'checks', 'grade')
      swapRawNodes(raw, 'milestone-branch', 'decompose')
    }))
    const run = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES })
    expect(run.visited).toEqual([
      'brainstorm', 'spec-approval', 'decompose', 'milestone-branch',
      'G1/goal-branch', 'G1/implement', 'G1/grade', 'G1/checks', 'G1/review', 'G1/goal-pr', 'G1/ci', 'G1/merge',
      'G2/goal-branch', 'G2/implement', 'G2/grade', 'G2/checks', 'G2/goal-pr', 'G2/ci', 'G2/merge',
      'regression', 'milestone-pr', 'milestone-merge',
    ])
  })

  it('goal 하나면 고리가 한 번만 돈다', () => {
    const { template, hash } = loaded()
    const run = drive(template, fresh(template, hash), { goals: [GOALS[0]], grades: { G1: 'weak' } })
    expect(run.visited.filter((l) => l.startsWith('G'))).toEqual([
      'G1/goal-branch', 'G1/implement', 'G1/checks', 'G1/grade', 'G1/goal-pr', 'G1/ci', 'G1/merge',
    ])
  })
})

describe('게이트의 불통과에서는 다음 노드로 가지 않는다', () => {
  const { template, hash } = loaded()
  const at = (label: string, grades: Record<string, 'strong' | 'weak'> = GRADES): RunState =>
    drive(template, fresh(template, hash), { goals: GOALS, grades, until: label }).state

  it('규칙 게이트(검사) 불통과 — 템플릿이 적은 구현으로 돌아가고 FAIL 줄을 실행기가 쓴다', () => {
    const s = apply(template, at('G1/checks'), verdict('checks', 'rule', 'fail', 'npm test exit 1'))
    expect(labelOf(nextStep(template, s))).toBe('G1/implement')
    expect(s.lines.at(-1)).toMatchObject({ marker: 'FAIL', by: 'executor', node: 'checks', goal: 'G1', judge: 'rule' })
    expect(s.failCount).toBe(1)
  })

  it('모델 게이트(독립 검수) 불통과 — 구현으로 돌아가고 PR로 가지 않는다', () => {
    const s = apply(template, at('G1/review'), verdict('review', 'model', 'fail', '경계 시험이 없다'))
    expect(labelOf(nextStep(template, s))).toBe('G1/implement')
  })

  it('사람 게이트(스펙 승인) 불통과 — 브레인스토밍으로 돌아가고 브랜치를 가르지 않는다', () => {
    const s = apply(template, at('spec-approval'), verdict('spec-approval', 'human', 'fail', '범위가 넓다'))
    expect(labelOf(nextStep(template, s))).toBe('brainstorm')
  })

  it('사람의 반려는 검증 실패가 아니다 — FAIL로 세지 않고 USER-INPUT 줄로 남긴다', () => {
    let s = at('spec-approval')
    for (let i = 0; i < FAIL_LIMIT; i++) {
      s = apply(template, s, verdict('spec-approval', 'human', 'fail', `반려 ${i + 1}`))
      s = drive(template, s, { until: 'spec-approval' }).state
    }
    expect(s.status).toBe('running')
    expect(s.lines.map((l) => l.marker)).toEqual(['USER-INPUT', 'USER-INPUT', 'USER-INPUT'])
    expect(s.failCount).toBe(0)
  })

  it('실패 참조가 없는 게이트(회귀·마일스톤 병합)는 그 자리에 머문다', () => {
    const r = apply(template, at('regression'), verdict('regression', 'rule', 'fail', 'npm test exit 1'))
    expect(labelOf(nextStep(template, r))).toBe('regression')
    const m = apply(template, at('milestone-merge'), verdict('milestone-merge', 'human', 'fail', '보고를 고쳐라'))
    expect(labelOf(nextStep(template, m))).toBe('milestone-merge')
  })

  it('멈춤(stop)은 사람을 부르는 상태가 된다', () => {
    const s = apply(template, at('spec-approval'), verdict('spec-approval', 'human', 'stop', '범위를 다시 정해야 한다'))
    expect(s.status).toBe('needs-user')
    expect(nextStep(template, s)).toEqual({ kind: 'needs-user', reason: '범위를 다시 정해야 한다' })
  })
})

describe('FAIL 계수 — 마지막 USER-INPUT 뒤 셋이면 멈춘다', () => {
  const { template, hash } = loaded()
  const regression = (): RunState => drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'regression' }).state
  const fail = (s: RunState): RunState => apply(template, s, verdict('regression', 'rule', 'fail', 'npm test exit 1'))

  it(`FAIL ${FAIL_LIMIT}번째에 멈추고, 멈춘 동안 규칙·모델 통과로는 나아가지 않는다`, () => {
    let s = fail(fail(regression()))
    expect(s.status).toBe('running')
    s = fail(s)
    expect(s.status).toBe('needs-user')
    expect(s.failCount).toBe(3)
    expect(nextStep(template, s).kind).toBe('needs-user')
    expect(applyVerdict(template, s, verdict('regression', 'rule', 'pass'), AT).ok).toBe(false)
    expect(applyVerdict(template, s, verdict('regression', 'model', 'pass'), AT).ok).toBe(false)
  })

  it('사람의 이어 가기 판정은 USER-INPUT 줄을 쓰고 같은 노드를 다시 돌게 하며 계수는 0부터다', () => {
    let s = fail(fail(fail(regression())))
    s = apply(template, s, verdict('regression', 'human', 'pass', '테스트 환경을 고쳤다, 다시 돌려라'))
    expect(s.status).toBe('running')
    expect(s.lines.at(-1)).toMatchObject({ marker: 'USER-INPUT', by: 'executor', judge: 'human' })
    // 멈춘 사유와 사람의 답이 함께 줄로 남는다 — 예외 호출의 횟수와 이유를 줄에서 셀 수 있다
    expect(s.lines.at(-1)?.sentence).toContain('FAIL 3번')
    expect(s.lines.at(-1)?.sentence).toContain('테스트 환경을 고쳤다')
    expect(s.failCount).toBe(0)
    expect(labelOf(nextStep(template, s))).toBe('regression')
    s = fail(fail(s))
    expect(s.status).toBe('running')
    expect(fail(s).status).toBe('needs-user')
  })

  it('계수는 goal마다 따로다 — 앞 goal의 FAIL이 다음 goal로 넘어가지 않는다', () => {
    let s = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'G1/checks' }).state
    s = apply(template, s, verdict('checks', 'rule', 'fail', 'exit 1'))
    s = drive(template, s, { goals: GOALS, grades: GRADES, until: 'G1/checks' }).state
    s = apply(template, s, verdict('checks', 'rule', 'fail', 'exit 1'))
    expect(s.failCount).toBe(2)
    s = drive(template, s, { goals: GOALS, grades: GRADES, until: 'G2/checks' }).state
    expect(s.failCount).toBe(0)
    s = apply(template, s, verdict('checks', 'rule', 'fail', 'exit 1'))
    expect(s.status).toBe('running')
    expect(failsSinceUserInput(s.lines, 'G1')).toBe(2)
    expect(failsSinceUserInput(s.lines, 'G2')).toBe(1)
  })
})

describe('나아가는 길은 판정 하나뿐이다', () => {
  const { template, hash } = loaded()
  const checks = (): RunState => drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'G1/checks' }).state

  it('현재 노드가 아닌 노드의 판정은 받지 않는다 — 건너뛰기 불가', () => {
    const r = applyVerdict(template, checks(), verdict('merge', 'executor', 'pass'), AT)
    expect(r.ok).toBe(false)
  })

  it('판정 주체가 노드와 다르면 받지 않는다', () => {
    const s = checks()
    expect(applyVerdict(template, s, verdict('checks', 'human', 'pass'), AT).ok).toBe(false)
    expect(applyVerdict(template, s, verdict('checks', 'model', 'pass'), AT).ok).toBe(false)
    expect(applyVerdict(template, s, verdict('checks', 'executor', 'pass'), AT).ok).toBe(false)
    const spec = drive(template, fresh(template, hash), { until: 'spec-approval' }).state
    expect(applyVerdict(template, spec, verdict('spec-approval', 'rule', 'pass'), AT).ok).toBe(false)
  })

  it('증거 없는 판정과 모르는 판정 꼴은 받지 않는다', () => {
    const s = checks()
    expect(applyVerdict(template, s, verdict('checks', 'rule', 'pass', '  '), AT).ok).toBe(false)
    expect(applyVerdict(template, s, { ...verdict('checks', 'rule', 'pass'), verdict: 'skip' as never }, AT).ok).toBe(false)
  })

  it('끝난 실행은 판정을 받지 않는다', () => {
    const done = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES }).state
    expect(applyVerdict(template, done, verdict('milestone-merge', 'human', 'pass'), AT).ok).toBe(false)
  })

  it('실행기 모듈에는 건너뛰기·강제 통과·커서 설정 함수가 없다', () => {
    expect(Object.keys(executor).sort()).toEqual([
      'FAIL_LIMIT', 'applyVerdict', 'checkResumable', 'expectedJudge', 'judgeCi', 'judgeCommands', 'nextStep', 'oneSentence',
    ])
  })
})

describe('분해와 등급', () => {
  const { template, hash } = loaded()

  it('분해 노드가 적은 등급은 믿지 않는다 — 등급 게이트만 등급을 정하고, 모르면 강이다', () => {
    let s = drive(template, fresh(template, hash), { until: 'decompose' }).state
    const seeds = [{ id: 'G1', title: '하나', grade: 'weak' }] as unknown as { id: string; title: string }[]
    s = apply(template, s, { ...verdict('decompose', 'executor', 'pass'), facts: { goals: seeds } })
    expect(s.goals[0].grade).toBeNull()
    s = drive(template, s, { until: 'G1/grade' }).state
    s = apply(template, s, verdict('grade', 'rule', 'pass', '통계 없음'))
    expect(s.goals[0].grade).toBe('strong')
    expect(labelOf(nextStep(template, s))).toBe('G1/review')
  })

  it('한 goal 안에서 한 번 강이면 다시 재도 강으로 남는다 — 검수 불통과 뒤 변경을 줄여 검수를 끄지 못한다', () => {
    let s = drive(template, fresh(template, hash), { goals: GOALS, grades: { G1: 'strong' }, until: 'G1/review' }).state
    s = apply(template, s, verdict('review', 'model', 'fail', '경계 시험이 없다'))
    s = drive(template, s, { goals: GOALS, grades: { G1: 'weak' }, until: 'G1/review' }).state
    expect(labelOf(nextStep(template, s))).toBe('G1/review')
    expect(s.goals[0].grade).toBe('strong')
  })

  it('멈춤(stop) 사유는 사람이 이어 갈 때 USER-INPUT 줄에 함께 남는다', () => {
    let s = drive(template, fresh(template, hash), { until: 'spec-approval' }).state
    s = apply(template, s, verdict('spec-approval', 'human', 'stop', '범위를 다시 정해야 한다'))
    s = apply(template, s, verdict('spec-approval', 'human', 'pass', '범위를 줄였다'))
    expect(s.lines.at(-1)?.marker).toBe('USER-INPUT')
    expect(s.lines.at(-1)?.sentence).toContain('범위를 다시 정해야 한다')
    expect(labelOf(nextStep(template, s))).toBe('spec-approval')
  })

  // G4 검수 중요 I7 — 실행기가 읽은 goal 문서 해시와 승인한 스펙 해시를 상태 사실로 싣는다. 꼴이 틀린 해시는 null(대조하지 않음)이다
  it('분해 pass의 goal 문서 해시와 스펙 승인 pass의 스펙 해시를 상태에 싣는다 — 스키마가 받는다', () => {
    let s = drive(template, fresh(template, hash), { until: 'spec-approval' }).state
    s = apply(template, s, { ...verdict('spec-approval', 'human', 'pass'), facts: { specSha256: 'a'.repeat(64) } })
    expect(s.specSha256).toBe('a'.repeat(64))
    s = drive(template, s, { until: 'decompose' }).state
    const seeds = [{ id: 'G1', title: '하나', docSha256: 'b'.repeat(64) }, { id: 'G2', title: '둘', docSha256: 'not-a-hash' }]
    s = apply(template, s, { ...verdict('decompose', 'executor', 'pass'), facts: { goals: seeds } })
    expect(s.goals.map((g) => g.docSha256)).toEqual(['b'.repeat(64), null])
    expect(validateRunState(JSON.parse(JSON.stringify(s))).ok).toBe(true)
    expect(validateRunState({ ...JSON.parse(JSON.stringify(s)), specSha256: 'x' }).ok).toBe(false)
  })

  it('goal 없는 분해 통과는 받지 않는다', () => {
    const s = drive(template, fresh(template, hash), { until: 'decompose' }).state
    expect(applyVerdict(template, s, verdict('decompose', 'executor', 'pass'), AT).ok).toBe(false)
  })
})

describe('규칙 판정 함수', () => {
  const { template } = loaded()
  const all = template.nodes.flatMap((n) => (n.kind === 'goalLoop' ? n.steps : [n]))
  const checksNode = all.find((n) => n.id === 'checks') as GateNode
  const ciNode = all.find((n) => n.id === 'ci') as GateNode
  const run = (cmd: string, code: number) => ({ cmd, code, stdout: '', stderr: code ? '2 failed' : '' })

  it('템플릿의 명령이 모두 exit 0일 때만 통과다', () => {
    expect(judgeCommands(checksNode, [run('npm run build', 0), run('npm test', 0)]).verdict).toBe('pass')
    const failed = judgeCommands(checksNode, [run('npm run build', 0), run('npm test', 1)])
    expect(failed.verdict).toBe('fail')
    expect(failed.evidence).toContain('npm test')
    expect(judgeCommands(checksNode, [run('npm run build', 0)]).verdict).toBe('fail')
    expect(judgeCommands(checksNode, [run('echo ok', 0), run('npm test', 0)]).verdict).toBe('fail')
  })

  it('CI는 대기 중이면 판정이 없고, 통과면 머리 SHA를 남긴다', () => {
    expect(judgeCi(ciNode, { state: 'pending', headSha: 'a1', summary: '' }, 'a1')).toBeNull()
    expect(judgeCi(ciNode, { state: 'success', headSha: 'a1', summary: 'hard-gates' }, 'a1')).toMatchObject({ verdict: 'pass', facts: { ciSha: 'a1' } })
    expect(judgeCi(ciNode, { state: 'failure', headSha: 'a1', summary: 'hard-gates' }, 'a1')?.verdict).toBe('fail')
  })

  it('CI 결과가 push한 머리의 것이 아니거나 push한 머리를 모르면 통과·실패 모두 판정하지 않는다', () => {
    expect(judgeCi(ciNode, { state: 'success', headSha: 'old', summary: 'hard-gates' }, 'a1')).toBeNull()
    expect(judgeCi(ciNode, { state: 'failure', headSha: 'old', summary: 'hard-gates' }, 'a1')).toBeNull()
    expect(judgeCi(ciNode, { state: 'success', headSha: 'a1', summary: 'hard-gates' }, null)).toBeNull()
  })
})

describe('실행 상태 스키마와 재개 조건', () => {
  const { template, hash } = loaded()

  it('새 상태는 첫 노드에서 시작하고 템플릿 id와 해시만 적는다', () => {
    const s = fresh(template, hash)
    expect(s).toMatchObject({ schema: 1, milestoneId: 'M1', template: { id: 'program-dev', hash }, status: 'running', cursor: { node: 'brainstorm', goal: null } })
    expect(JSON.stringify(s)).not.toContain('instruction')
  })

  it('저장한 상태를 다시 읽으면 같고, 줄 목록과 다른 FAIL 계수·모르는 값은 거부한다', () => {
    let s = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'G1/checks' }).state
    s = apply(template, s, verdict('checks', 'rule', 'fail', 'exit 1'))
    const round = validateRunState(JSON.parse(JSON.stringify(s)))
    expect(round.ok && round.state).toEqual(s)
    expect(validateRunState({ ...s, failCount: 0 }).ok).toBe(false)
    expect(validateRunState({ ...s, status: 'skipped' }).ok).toBe(false)
    expect(validateRunState({ ...s, cursor: { node: 'checks', goal: 9 } }).ok).toBe(false)
    expect(validateRunState({ ...s, forcePass: true }).ok).toBe(false)
  })

  it('FAIL 셋으로 멈춘 상태의 status만 running으로 고쳐도 받지 않는다 — 계수는 줄에서 다시 센다', () => {
    let s = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'regression' }).state
    for (let i = 0; i < FAIL_LIMIT; i++) s = apply(template, s, verdict('regression', 'rule', 'fail', 'exit 1'))
    expect(s.status).toBe('needs-user')
    expect(validateRunState(JSON.parse(JSON.stringify(s))).ok).toBe(true)
    expect(validateRunState({ ...s, status: 'running', haltReason: null }).ok).toBe(false)
    expect(validateRunState({ ...s, haltReason: null }).ok).toBe(false)
  })

  it('템플릿 해시나 id가 다르거나 커서 노드가 템플릿에 없으면 이어 가지 않는다', () => {
    const s = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'regression' }).state
    expect(checkResumable(template, hash, s).ok).toBe(true)
    expect(checkResumable(template, 'f'.repeat(64), s).ok).toBe(false)
    const other = loaded(variantText((raw) => { raw.id = 'other' }))
    expect(checkResumable(other.template, other.hash, s).ok).toBe(false)
    const without = loaded(variantText((raw) => removeRawNode(raw, 'regression')))
    expect(checkResumable(without.template, s.template.hash, s).ok).toBe(false)
  })

  // M09 G4 — 기준 브랜치는 시작할 때 상태에 적고, 검수 pass는 검수한 트리 해시를 goal에 남긴다
  it('기준 브랜치와 검수 트리 해시를 상태에 싣고 다시 읽는다 — 옛 상태(칸 없음)도 받는다', () => {
    const made = createRunState(template, hash, 'M1', 'main')
    if (!made.ok) throw new Error(made.reason)
    expect(made.state.base).toBe('main')
    expect(createRunState(template, hash, 'M1', ' ').ok).toBe(false)
    let s = drive(template, made.state, { goals: GOALS, grades: GRADES, until: 'G1/review' }).state
    // 트리 해시 없는 검수 pass는 받지 않는다 — 판정을 무엇에 묶을지 모른다
    expect(applyVerdict(template, s, verdict('review', 'model', 'pass', '검수 통과'), AT).ok).toBe(false)
    s = apply(template, s, { ...verdict('review', 'model', 'pass', '검수 통과'), facts: { reviewedTree: 'tree-1' } })
    expect(s.goals[0].reviewedTree).toBe('tree-1')
    const round = validateRunState(JSON.parse(JSON.stringify(s)))
    expect(round.ok && round.state.base).toBe('main')
    const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete legacy.base
    for (const g of legacy.goals as Record<string, unknown>[]) delete g.reviewedTree
    expect(validateRunState(legacy).ok).toBe(true)
    expect(validateRunState({ ...s, base: '' }).ok).toBe(false)
    expect(validateRunState({ ...s, goals: s.goals.map((g) => ({ ...g, reviewedTree: 7 })) }).ok).toBe(false)
  })

  it('검수 불통과는 남아 있던 검수 트리 해시를 지운다 — 옛 pass로 다음 커밋을 통과시키지 않는다', () => {
    let s = drive(template, fresh(template, hash), { goals: GOALS, grades: GRADES, until: 'G1/review' }).state
    s.goals[0].reviewedTree = 'old-tree'
    s = apply(template, s, verdict('review', 'model', 'fail', '경계 시험이 빠졌다'))
    expect(s.goals[0].reviewedTree).toBeNull()
  })

  it('변형본 시험의 실패 참조 가공이 실제 노드를 고친다', () => {
    const text = variantText((raw) => { findRawNode(raw, 'checks').onFail = { goto: 'checks' } })
    const { template: t, hash: h } = loaded(text)
    const s = apply(t, drive(t, fresh(t, h), { goals: GOALS, grades: GRADES, until: 'G1/checks' }).state, verdict('checks', 'rule', 'fail', 'exit 1'))
    expect(labelOf(nextStep(t, s))).toBe('G1/checks')
  })
})

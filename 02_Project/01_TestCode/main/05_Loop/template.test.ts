// 실제 `program-dev.json`을 읽고, 스키마 오류 꼴(알 수 없는 노드 종·판정 주체,
// 중복 id, 없는 id 참조, 빈 순서 등)을 경로와 이유가 담긴 목록으로 거부하는지 고정한다.
// 변형본은 시험 안에서 실제 파일을 가공해 만든다.
import { describe, it, expect } from 'vitest'
import { canonicalJson, loadTemplate, templateHash, validateTemplate, type SchemaError } from '@main/05_Loop/template'
import { programDevText, variantText, findRawNode } from '../00_Helpers/loopFakes'

const errorsOf = (text: string): SchemaError[] => {
  const r = loadTemplate(text)
  expect(r.ok, '거부되어야 한다').toBe(false)
  return r.ok ? [] : r.errors
}
const hasError = (errors: SchemaError[], path: string, reasonPart: string): boolean =>
  errors.some((e) => e.path === path && e.reason.includes(reasonPart))

describe('실제 템플릿 program-dev.json', () => {
  it('스키마 검사를 통과하고 노드 순서가 파일 그대로다', () => {
    const r = loadTemplate(programDevText())
    if (!r.ok) throw new Error(JSON.stringify(r.errors))
    expect(r.template.id).toBe('program-dev')
    expect(r.template.nodes.map((n) => n.id)).toEqual([
      'brainstorm', 'spec-approval', 'milestone-branch', 'decompose', 'goals',
      'regression', 'milestone-pr', 'milestone-merge',
    ])
    const loop = r.template.nodes.find((n) => n.kind === 'goalLoop')
    expect(loop && loop.kind === 'goalLoop' ? loop.steps.map((s) => s.id) : []).toEqual([
      'goal-branch', 'implement', 'checks', 'grade', 'review', 'goal-pr', 'ci', 'merge',
    ])
  })

  it('게이트 셋의 판정 주체와 조건이 템플릿에 적혀 있다', () => {
    const r = loadTemplate(programDevText())
    if (!r.ok) throw new Error('불러오기 실패')
    const all = r.template.nodes.flatMap((n) => (n.kind === 'goalLoop' ? n.steps : [n]))
    const gate = (id: string) => all.find((n) => n.id === id)
    expect(gate('spec-approval')).toMatchObject({ kind: 'gate', judge: 'human' })
    expect(gate('checks')).toMatchObject({ kind: 'gate', judge: 'rule', rule: { type: 'commands' } })
    expect(gate('review')).toMatchObject({ kind: 'gate', judge: 'model', when: { grade: 'strong' } })
    expect(gate('milestone-merge')).toMatchObject({ kind: 'gate', judge: 'human', watch: 'milestonePrMerged' })
    expect(r.template.grading.strongLineThreshold).toBe(50)
  })

  it('해시는 sha256 16진수이고, 들여쓰기·줄바꿈만 바뀌면 같고 값이 바뀌면 다르다', () => {
    const text = programDevText()
    const r = loadTemplate(text)
    if (!r.ok) throw new Error('불러오기 실패')
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/)
    const reflowed = JSON.stringify(JSON.parse(text), null, 4).replace(/\n/g, '\r\n')
    expect(reflowed).not.toBe(text)
    const again = loadTemplate(reflowed)
    expect(again.ok && again.hash).toBe(r.hash)
    const changed = loadTemplate(variantText((raw) => { raw.title = '프로그램 개발 2' }))
    expect(changed.ok && changed.hash).not.toBe(r.hash)
    expect(templateHash(JSON.parse(text))).toBe(r.hash)
  })

  it('정규 직렬화는 키 순서와 무관하다', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }))
  })

  it('문턱을 적지 않으면 기본 50이다', () => {
    const r = loadTemplate(variantText((raw) => { delete (raw.grading as Record<string, unknown>).strongLineThreshold }))
    expect(r.ok && r.template.grading.strongLineThreshold).toBe(50)
  })
})

describe('스키마 오류를 경로와 이유로 거부한다', () => {
  it('JSON이 아니면 거부한다', () => {
    expect(hasError(errorsOf('{ "id": '), '$', 'JSON')).toBe(true)
  })

  it('알 수 없는 노드 종을 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'regression').kind = 'robot' }))
    expect(hasError(errors, '$.nodes[5].kind', '알 수 없는 노드 종')).toBe(true)
  })

  it('알 수 없는 판정 주체를 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'checks').judge = 'oracle' }))
    expect(hasError(errors, '$.nodes[4].steps[2].judge', '알 수 없는 판정 주체')).toBe(true)
  })

  it('중복 id를 거부한다 — 구획이 달라도 같다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'implement').id = 'brainstorm' }))
    expect(hasError(errors, '$.nodes[4].steps[1].id', '중복 id')).toBe(true)
  })

  it('없는 id를 가리키는 실패 참조를 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'checks').onFail = { goto: 'nowhere' } }))
    expect(hasError(errors, '$.nodes[4].steps[2].onFail.goto', '없는 id')).toBe(true)
  })

  it('앞으로 뛰는 실패 참조를 거부한다 — 건너뛰기 통로가 된다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'checks').onFail = { goto: 'merge' } }))
    expect(hasError(errors, '$.nodes[4].steps[2].onFail.goto', '뒤에 있다')).toBe(true)
  })

  it('다른 구획의 노드를 가리키는 실패 참조를 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'checks').onFail = { goto: 'brainstorm' } }))
    expect(hasError(errors, '$.nodes[4].steps[2].onFail.goto', '다른 구획')).toBe(true)
  })

  it('빈 순서를 거부한다 — 마일스톤 구획과 goal 고리 모두', () => {
    expect(hasError(errorsOf(variantText((raw) => { raw.nodes = [] })), '$.nodes', '비었다')).toBe(true)
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'goals').steps = [] }))
    expect(hasError(errors, '$.nodes[4].steps', '비었다')).toBe(true)
  })

  it('규칙 게이트에 rule이 없거나 알 수 없는 규칙이면 거부한다', () => {
    expect(hasError(errorsOf(variantText((raw) => { delete findRawNode(raw, 'checks').rule })),
      '$.nodes[4].steps[2].rule', 'rule이 있어야')).toBe(true)
    expect(hasError(errorsOf(variantText((raw) => { findRawNode(raw, 'checks').rule = { type: 'vibes' } })),
      '$.nodes[4].steps[2].rule.type', '알 수 없는 규칙')).toBe(true)
  })

  it('명령 목록이 비면 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'checks').rule = { type: 'commands', commands: [] } }))
    expect(hasError(errors, '$.nodes[4].steps[2].rule.commands', '명령')).toBe(true)
  })

  it('모르는 키를 거부한다 — 오타가 기본값으로 떨어지지 않게', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'review').skip = true }))
    expect(hasError(errors, '$.nodes[4].steps[4].skip', '모르는 키')).toBe(true)
  })

  it('알 수 없는 동작과 구획이 맞지 않는 동작을 거부한다', () => {
    expect(hasError(errorsOf(variantText((raw) => { findRawNode(raw, 'merge').action = 'forcePush' })),
      '$.nodes[4].steps[7].action', '알 수 없는 동작')).toBe(true)
    expect(hasError(errorsOf(variantText((raw) => { findRawNode(raw, 'milestone-pr').action = 'mergeGoal' })),
      '$.nodes[6].action', 'goal 고리에서만')).toBe(true)
  })

  it('goal 고리 앞에 goal을 내는 분해 노드가 없으면 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { delete findRawNode(raw, 'decompose').produces }))
    expect(hasError(errors, '$.nodes[4]', 'goal을 내는 작업 노드')).toBe(true)
  })

  it('goal 고리 안에 goal 고리를 두면 거부한다', () => {
    const errors = errorsOf(variantText((raw) => {
      findRawNode(raw, 'goals').steps.push({ id: 'inner', kind: 'goalLoop', title: '안쪽', steps: [] })
    }))
    expect(hasError(errors, '$.nodes[4].steps[8].kind', '고리 안에')).toBe(true)
  })

  it('마일스톤 구획에서 goal 고리를 건너 고리 앞을 가리키는 실패 참조를 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { findRawNode(raw, 'regression').onFail = { goto: 'milestone-branch' } }))
    expect(hasError(errors, '$.nodes[5].onFail.goto', 'goal 고리를 건너')).toBe(true)
  })

  it('마일스톤 브랜치 꼴에 {goal} 자리를 두면 거부한다', () => {
    const errors = errorsOf(variantText((raw) => { (raw.branches as Record<string, unknown>).milestone = 'milestone/{milestone}-{goal}' }))
    expect(hasError(errors, '$.branches.milestone', '{goal}')).toBe(true)
  })

  it('등급 규칙은 세지 않는 목록과 보호 경로를 쓴다 — 옛 허용 목록 키(appSourcePaths)는 모르는 키다', () => {
    const r = loadTemplate(programDevText())
    if (!r.ok) throw new Error('불러오기 실패')
    expect(r.template.grading.uncountedPaths).toEqual(['*.md'])
    expect(r.template.grading.protectedPaths).toEqual(expect.arrayContaining(['.github/', 'package*.json', '**/*.test.*', 'tests/', 'vite.config.*', '__tests__/']))
    const errors = errorsOf(variantText((raw) => { (raw.grading as Record<string, unknown>).appSourcePaths = ['src/'] }))
    expect(hasError(errors, '$.grading.appSourcePaths', '모르는 키')).toBe(true)
  })

  it('형식 판과 브랜치 꼴을 검사한다 — 기준 브랜치 이름은 꼴 검사 대상이 아니다(M09 G4)', () => {
    expect(hasError(errorsOf(variantText((raw) => { raw.version = 2 })), '$.version', '1뿐')).toBe(true)
    expect(hasError(errorsOf(variantText((raw) => { (raw.branches as Record<string, unknown>).goal = 'goal/x' })),
      '$.branches.goal', '{goal}')).toBe(true)
  })

  // 기준 브랜치는 템플릿에 두지 않는다. 열 때 작업 저장소 origin의 기본 브랜치를 읽는다(openLoop).
  it('브랜치 꼴에는 기준 브랜치(base)가 없고, 적으면 모르는 키로 거부한다', () => {
    const r = loadTemplate(programDevText())
    if (!r.ok) throw new Error('불러오기 실패')
    expect(Object.keys(r.template.branches).sort()).toEqual(['goal', 'milestone'])
    const errors = errorsOf(variantText((raw) => { (raw.branches as Record<string, unknown>).base = 'master' }))
    expect(hasError(errors, '$.branches.base', '모르는 키')).toBe(true)
  })

  it('객체가 아니면 거부한다', () => {
    const r = validateTemplate([])
    expect(r.ok).toBe(false)
  })
})

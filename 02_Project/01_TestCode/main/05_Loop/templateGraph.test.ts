// M10 G5 — 그래프 읽기. 같은 템플릿을 넣으면 노드·선·되돌아가는 길·목표 반복 틀을 빠짐없이 내고, 위치 칸이 모든 노드에 있다.
// 최대 횟수는 실행기의 FAIL_LIMIT에서 온다(글자로 박지 않는다).
import { describe, expect, it } from 'vitest'
import { loadTemplate, type Template } from '@main/05_Loop/template'
import { FAIL_LIMIT } from '@main/05_Loop/runState'
import { templateGraph } from '@main/05_Loop/templateGraph'
import { GRAPH_CARD } from '@shared/13_Loop/graph'
import { programDevText } from '../00_Helpers/loopFakes'

function programDev(): Template {
  const r = loadTemplate(programDevText())
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.template
}

describe('templateGraph — 템플릿을 화면용 그래프로 (M10 G5)', () => {
  it('노드마다 하나씩, 템플릿 순서대로 종류·범위·명령·다음·실패 경로·등급 조건을 낸다', () => {
    const g = templateGraph(programDev())
    expect(g.templateId).toBe('program-dev')
    expect(g.failLimit).toBe(FAIL_LIMIT)
    expect(g.nodes.map((n) => n.id)).toEqual([
      'brainstorm', 'spec-approval', 'milestone-branch', 'decompose',
      'goal-branch', 'implement', 'checks', 'grade', 'review', 'goal-pr', 'ci', 'merge',
      'regression', 'milestone-pr', 'milestone-merge',
    ])
    const n = (id: string) => g.nodes.find((x) => x.id === id)
    expect(n('brainstorm')).toMatchObject({ kind: 'work', scope: 'milestone', role: 'main', next: 'spec-approval', onFail: null })
    // 사람의 반려는 USER-INPUT이라 실패로 세지 않는다 — 횟수 상한이 없다(G5 검수 2)
    expect(n('spec-approval')).toMatchObject({ kind: 'human', onFail: { goto: 'brainstorm', limit: null } })
    expect(n('milestone-branch')).toMatchObject({ kind: 'action', role: null })
    expect(n('decompose')).toMatchObject({ kind: 'work', role: 'worker', next: 'goal-branch' })
    expect(n('checks')).toMatchObject({
      kind: 'rule', scope: 'goal', rule: 'commands', commands: ['npm run build', 'npm test'], next: 'grade',
      onFail: { goto: 'implement', limit: FAIL_LIMIT },
    })
    expect(n('grade')).toMatchObject({ kind: 'rule', rule: 'grade', commands: [], onFail: null })
    expect(n('review')).toMatchObject({ kind: 'model', when: { grade: 'strong' }, onFail: { goto: 'implement' } })
    expect(n('ci')).toMatchObject({ kind: 'rule', rule: 'ci' })
    expect(n('merge')).toMatchObject({ kind: 'action', next: 'regression', onFail: { goto: 'ci' } })
    expect(n('milestone-merge')).toMatchObject({ kind: 'human', next: null })
  })

  it('다음 선은 순서를 잇고, 되돌아가는 길은 onFail.goto마다 하나, 반복 틀은 끝에서 처음으로 돌아간다', () => {
    const g = templateGraph(programDev())
    const of = (kind: string) => g.edges.filter((e) => e.kind === kind).map((e) => `${e.from}>${e.to}`)
    expect(of('next')).toEqual([
      'brainstorm>spec-approval', 'spec-approval>milestone-branch', 'milestone-branch>decompose', 'decompose>goal-branch',
      'goal-branch>implement', 'implement>checks', 'checks>grade', 'grade>review', 'review>goal-pr', 'goal-pr>ci', 'ci>merge',
      'merge>regression', 'regression>milestone-pr', 'milestone-pr>milestone-merge',
    ])
    expect(of('fail')).toEqual(['spec-approval>brainstorm', 'checks>implement', 'review>implement', 'ci>implement', 'merge>ci'])
    expect(of('repeat')).toEqual(['merge>goal-branch'])
    expect(g.goalLoop).toEqual({
      id: 'goals', title: '목표마다',
      nodes: ['goal-branch', 'implement', 'checks', 'grade', 'review', 'goal-pr', 'ci', 'merge'],
    })
    // M10 G5 — 화면에 보이는 노드 제목은 한글이다(PR·CI는 그대로)
    expect(g.nodes.find((x) => x.id === 'decompose')?.title).toBe('목표 분해')
    expect(g.nodes.find((x) => x.id === 'goal-branch')?.title).toBe('목표 브랜치 가르기')
    for (const n of [...g.nodes, g.goalLoop]) expect(n?.title, n?.id).not.toMatch(/goal|FAIL|PASS|Backlog/i)
  })

  it('위치 칸이 모든 노드에 있고 카드가 겹치지 않는다 — 반복 틀은 줄 하나를 따로 쓴다', () => {
    const g = templateGraph(programDev())
    for (const node of g.nodes) {
      expect(Number.isFinite(node.position.x) && Number.isFinite(node.position.y)).toBe(true)
    }
    const boxes = g.nodes.map((x) => x.position)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const apart = Math.abs(boxes[i].x - boxes[j].x) >= GRAPH_CARD.width || Math.abs(boxes[i].y - boxes[j].y) >= GRAPH_CARD.height
        expect(apart, `${g.nodes[i].id}·${g.nodes[j].id}`).toBe(true)
      }
    }
    const rowOf = (id: string) => g.nodes.find((x) => x.id === id)?.position.y
    expect(rowOf('brainstorm')).toBeLessThan(rowOf('implement') as number)
    expect(rowOf('implement')).toBeLessThan(rowOf('regression') as number)
    expect(rowOf('goal-branch')).toBe(rowOf('merge'))
  })

  it('같은 템플릿이면 같은 그래프다 — 템플릿 값을 고치지 않는다', () => {
    const t = programDev()
    const before = JSON.stringify(t)
    expect(templateGraph(t)).toEqual(templateGraph(programDev()))
    expect(JSON.stringify(t)).toBe(before)
  })

  it('반복 틀이 없는 템플릿도 다음 선만으로 그린다', () => {
    const t: Template = { ...programDev(), nodes: [
      { id: 'a', kind: 'work', title: 'A', role: 'worker', instruction: 'x', docs: [] },
      { id: 'b', kind: 'gate', title: 'B', judge: 'rule', rule: { type: 'commands', commands: ['npm test'] }, onFail: { goto: 'a' } },
    ] }
    const g = templateGraph(t)
    expect(g.goalLoop).toBeNull()
    expect(g.edges).toEqual([{ from: 'a', to: 'b', kind: 'next' }, { from: 'b', to: 'a', kind: 'fail' }])
  })
})

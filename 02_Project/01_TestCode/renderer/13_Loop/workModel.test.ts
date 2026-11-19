import { describe, expect, it } from 'vitest'
import type { LoopStatus } from '../../../../02_Project/00_Source/shared/ipcContract'
import { addProject, decisionsOf, folderName, goalProgress, projectTag } from '@renderer/13_Loop/workModel'

const CWD = 'C:\\work\\practice'
const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'running', milestoneId: 'M02', node: 'G2/implement', nodeTitle: '구현', reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], ...over,
})
const approval = { node: 'spec-approval', title: '스펙 승인', spec: '# M02', sha256: 'a'.repeat(64) }

describe('프로젝트 진행 꼬리표 (M10 G4)', () => {
  it('브레인스토밍·진행 중·멈춤·병합 대기 — 상태의 단계와 메인 노드 표시에서만 고른다', () => {
    expect(projectTag(null)).toBeNull()
    expect(projectTag(st({ phase: 'closed', milestoneId: null }))).toBeNull()
    expect(projectTag(st({ mainNode: true }))).toEqual({ label: 'M02 · 브레인스토밍', tone: 'brain' })
    // 스펙 승인 기다림은 브레인스토밍의 끝이다(시안 「작업 · 브레인스토밍」)
    expect(projectTag(st({ phase: 'waiting-human', approval }))).toEqual({ label: 'M02 · 브레인스토밍', tone: 'brain' })
    expect(projectTag(st())).toEqual({ label: 'M02 · 진행 중', tone: 'run' })
    expect(projectTag(st({ phase: 'waiting-ci' }))).toEqual({ label: 'M02 · 진행 중', tone: 'run' })
    for (const phase of ['halted', 'latched', 'blocked', 'open-failed'] as const) {
      expect(projectTag(st({ phase }))).toEqual({ label: 'M02 · 멈춤', tone: 'stop' })
    }
    expect(projectTag(st({ phase: 'waiting-human', milestonePr: 6 }))).toEqual({ label: 'M02 · 병합 대기', tone: 'merge' })
    expect(projectTag(st({ phase: 'not-started', milestoneId: null }))).toEqual({ label: '시작 전', tone: 'idle' })
    expect(projectTag(st({ phase: 'done' }))).toEqual({ label: 'M02 · 끝', tone: 'idle' })
  })
})

describe('기다리는 결정 (M10 G4)', () => {
  it('메인 대화의 카드와 스펙 승인은 「메인 대화에 있어」 가리킴이고, 마일스톤 PR 병합은 PR 칸을 가리킨다', () => {
    const card = { kind: 'question' as const, requestId: 'q1', node: 'brainstorm', goal: null, text: '', questions: [{ question: 'M02에서 무엇을 더할까?', options: [] }], inChat: true }
    const own = { kind: 'permission' as const, requestId: 'p1', node: 'implement', goal: 'G2', text: '', toolName: 'Edit', summary: 'a.ts' }
    expect(decisionsOf(st())).toEqual([])
    const d = decisionsOf(st({ phase: 'waiting-human', approval, cards: [card as never, own], milestonePr: null }))
    expect(d).toEqual([
      { kind: 'chat', title: '질문 1개 — 메인 대화에 있어', text: 'M02에서 무엇을 더할까?' },
      { kind: 'chat', title: '스펙 승인 — 메인 대화에 있어', text: '스펙 승인' },
    ])
    expect(decisionsOf(st({ phase: 'waiting-human', milestonePr: 6 }))).toEqual([
      { kind: 'merge', title: '마일스톤 PR #6 병합 — 아래 PR 칸에서', text: '병합은 사람이 버튼으로 한다' },
    ])
  })
})

describe('goal 진척과 작업 폴더 목록 (M10 G4)', () => {
  it('goal 진척은 끝난 수/전체 수다', () => {
    expect(goalProgress(st())).toBeNull()
    expect(goalProgress(st({ goals: [
      { id: 'G1', title: 'a', status: 'done', grade: 'strong', pr: 4 },
      { id: 'G2', title: 'b', status: 'active', grade: null, pr: null },
    ] }))).toEqual({ done: 1, total: 2 })
  })

  it('작업 폴더 목록에 더하기는 같은 폴더(표기만 다른 것 포함)를 겹쳐 넣지 않고 뒤에 붙인다', () => {
    expect(addProject([], CWD)).toEqual([CWD])
    expect(addProject([CWD], 'c:/work/practice/')).toEqual([CWD])
    expect(addProject([CWD], 'C:\\work\\other')).toEqual([CWD, 'C:\\work\\other'])
  })

  it('폴더 이름은 경로의 끝 이름이다', () => {
    expect(folderName('C:\\work\\practice\\')).toBe('practice')
    expect(folderName('/home/me/repo')).toBe('repo')
  })
})

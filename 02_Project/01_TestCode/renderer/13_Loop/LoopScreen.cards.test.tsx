// @vitest-environment jsdom
// M09 G4 루프 화면의 카드 — 예외 한 줄, 질문·권한 카드, 스펙 승인 카드, 래치 풀기 카드, 마일스톤 PR 카드가 상태에 따라 보이고
// 사람의 답이 맞는 loop IPC 호출(인자 포함)로 간다. 스펙 승인은 받은 sha256과 expectNode를 그대로 싣는다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { LoopCard, LoopPhase, LoopStatus } from '../../../../02_Project/00_Source/shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const ROOT = 'C:\\work\\practice-root'
const SHA = 'ab'.repeat(32)
const TOKEN = 'cd'.repeat(32)

const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: ROOT, phase: 'running', milestoneId: 'M01', node: null, nodeTitle: null, reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, ...over,
})

type Fn = ReturnType<typeof vi.fn>
let api: Record<string, Fn>
let git: { prRead: Fn; prMerge: Fn }

function install(initial: LoopStatus): void {
  api = {
    loopOpen: vi.fn().mockResolvedValue(initial),
    loopStart: vi.fn().mockResolvedValue(initial),
    loopStatus: vi.fn().mockResolvedValue(initial),
    loopDecide: vi.fn().mockResolvedValue({ ok: true, status: initial }),
    loopAnswerCard: vi.fn().mockResolvedValue({ ok: true }),
    loopCancelSession: vi.fn().mockResolvedValue({ ok: true }),
    loopReleaseLatch: vi.fn().mockResolvedValue({ ok: true, status: initial }),
    loopClose: vi.fn().mockResolvedValue({ ok: true }),
    onLoopState: vi.fn(() => () => {}),
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
  }
  git = { prRead: vi.fn().mockResolvedValue({ ok: false, error: 'PR 읽기 시험' }), prMerge: vi.fn() }
  Object.defineProperty(window, 'api', { value: adaptFlatApi({ ...api, git }), writable: true, configurable: true })
}

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const btn = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement
const click = async (el: HTMLElement): Promise<void> => {
  await act(async () => { fireEvent.click(el) })
  await flush()
}

async function renderScreen(initial: LoopStatus) {
  install(initial)
  const { LoopScreen } = await import('@renderer/13_Loop')
  const r = render(<LoopScreen initialCwd={CWD} onCwdChange={() => {}} onClose={() => {}} />)
  await flush()
  return r
}

afterEach(() => cleanup())
beforeEach(() => { document.body.innerHTML = '' })

describe('예외 한 줄 (M09 G4)', () => {
  const cases: [LoopPhase, string][] = [
    ['waiting-human', '사람 대기'],
    ['waiting-ci', 'CI 대기'],
    ['halted', '멈춤'],
    ['blocked', '진행 불가'],
    ['open-failed', '열기 실패'],
    ['latched', '래치'],
  ]
  for (const [phase, label] of cases) {
    it(`${phase}면 「${label}」과 사유 원문을 한 줄로 보인다`, async () => {
      await renderScreen(st({ phase, reason: `사유 원문 ${phase} — 그대로` }))
      const line = screen.getByRole('status')
      expect(line.textContent).toContain(label)
      expect(line.textContent).toContain(`사유 원문 ${phase} — 그대로`)
    })
  }

  it('래치가 있으면 래치 파일 경로도 그 줄에 보인다', async () => {
    await renderScreen(st({
      phase: 'latched', reason: '상태 파일 위조',
      latch: { reason: '상태 파일 위조', file: 'C:\\app\\digests\\x.latch', changed: [], state: null, token: TOKEN },
    }))
    expect(screen.getByRole('status').textContent).toContain('C:\\app\\digests\\x.latch')
  })

  it('여섯 단계 밖이라도 사유가 있으면(시작 실패 등) 「알림」으로 한 줄 보인다', async () => {
    await renderScreen(st({ phase: 'not-started', reason: '실행 상태를 만들지 못했다' }))
    const line = screen.getByRole('status')
    expect(line.textContent).toContain('알림')
    expect(line.textContent).toContain('실행 상태를 만들지 못했다')
  })

  it('running·done에 사유가 없으면 예외 줄이 없다', async () => {
    await renderScreen(st({ phase: 'running' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('halted면 「이어 가기」가 decide {verdict:pass, evidence, expectNode: status.node}를 보내고, 거부 사유를 보인다', async () => {
    await renderScreen(st({ phase: 'halted', node: 'G1/review', reason: 'FAIL 셋' }))
    api.loopDecide.mockResolvedValue({ ok: false, reason: '화면이 본 노드와 지금 노드가 다르다', status: st({ phase: 'halted', node: 'G1/review' }) })
    await click(btn('이어 가기'))
    expect(api.loopDecide).toHaveBeenCalledTimes(1)
    const req = api.loopDecide.mock.calls[0][0]
    expect(req).toMatchObject({ cwd: CWD, verdict: 'pass', expectNode: 'G1/review' })
    expect(typeof req.evidence).toBe('string')
    expect(req.evidence.trim().length).toBeGreaterThan(0)
    expect(req.specSha256).toBeUndefined()
    expect(screen.getByText('화면이 본 노드와 지금 노드가 다르다')).toBeTruthy()
  })
})

describe('질문 카드와 권한 카드 (M09 G4)', () => {
  const question: LoopCard = {
    kind: 'question', requestId: 'q-1', node: 'brainstorm', goal: null, text: '목표를 먼저 정해요',
    questions: [{ question: '어느 쪽으로 갈까요?', header: '방향', options: [{ label: '작게', description: '' }, { label: '크게', description: '' }] }],
  }
  const permission: LoopCard = {
    kind: 'permission', requestId: 'p-1', node: 'brainstorm', goal: null, text: '파일을 읽어요', toolName: 'Bash', summary: 'git status',
  }

  it('질문 카드는 세션 글을 보이고, 답하기로 질문 창을 열어 고른 답을 answerCard {kind:question, answers}로 보낸다', async () => {
    await renderScreen(st({ cards: [question], sessionActive: true }))
    expect(screen.getByText('목표를 먼저 정해요')).toBeTruthy()
    await click(btn('답하기'))
    fireEvent.click(screen.getByText('크게'))
    await flush()
    expect(api.loopAnswerCard).toHaveBeenCalledWith({ cwd: CWD, requestId: 'q-1', response: { kind: 'question', answers: [['크게']] } })
  })

  it('질문 창에서 건너뛰면 answers:null로 보낸다(세션 취소와 다르다)', async () => {
    await renderScreen(st({ cards: [question], sessionActive: true }))
    await click(btn('답하기'))
    fireEvent.click(screen.getAllByRole('button', { name: '건너뛰기' })[0])
    await flush()
    expect(api.loopAnswerCard).toHaveBeenCalledWith({ cwd: CWD, requestId: 'q-1', response: { kind: 'question', answers: null } })
    expect(api.loopCancelSession).not.toHaveBeenCalled()
  })

  it('권한 카드는 도구와 요약을 보이고 허용·거부를 behavior로 보낸다', async () => {
    await renderScreen(st({ cards: [permission], sessionActive: true }))
    const card = screen.getByTestId('loop-card-p-1')
    expect(within(card).getByText('Bash')).toBeTruthy()
    expect(within(card).getByText('git status')).toBeTruthy()
    await click(within(card).getByRole('button', { name: '허용' }))
    expect(api.loopAnswerCard).toHaveBeenLastCalledWith({ cwd: CWD, requestId: 'p-1', response: { kind: 'permission', behavior: 'allow' } })
  })

  it('권한 카드의 거부는 behavior:deny다. 받아지지 않으면(ok:false) 사유를 보인다', async () => {
    await renderScreen(st({ cards: [permission], sessionActive: true }))
    api.loopAnswerCard.mockResolvedValue({ ok: false })
    await click(btn('거부'))
    expect(api.loopAnswerCard).toHaveBeenLastCalledWith({ cwd: CWD, requestId: 'p-1', response: { kind: 'permission', behavior: 'deny' } })
    expect(screen.getByText(/카드 답이 받아지지 않았어요/)).toBeTruthy()
  })

  it('세션 취소는 cancelSession({cwd})다', async () => {
    await renderScreen(st({ cards: [permission], sessionActive: true }))
    await click(btn('세션 취소'))
    expect(api.loopCancelSession).toHaveBeenCalledWith({ cwd: CWD })
  })
})

describe('스펙 승인 카드 (M09 G4)', () => {
  const approval = { node: 'spec-approve', title: '스펙 승인', spec: '# 마일스톤 스펙\n\n목표: 작게', sha256: SHA }

  it('스펙 본문과 sha256 앞 12자리를 보이고, 승인은 받은 sha256과 expectNode를 그대로 실어 decide pass를 보낸다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: 'spec-approve', approval }))
    expect(screen.getByText(/목표: 작게/)).toBeTruthy()
    expect(screen.getByText(SHA.slice(0, 12))).toBeTruthy()
    await click(btn('승인'))
    const req = api.loopDecide.mock.calls[0][0]
    expect(req).toMatchObject({ cwd: CWD, verdict: 'pass', specSha256: SHA, expectNode: 'spec-approve' })
    expect(req.evidence.trim().length).toBeGreaterThan(0)
  })

  it('반려는 사유가 있어야 켜지고, 사유를 evidence로 verdict:fail을 같은 sha256·expectNode와 보낸다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: 'spec-approve', approval }))
    expect(btn('반려').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('반려 사유'), { target: { value: '범위가 너무 크다' } })
    await click(btn('반려'))
    expect(api.loopDecide).toHaveBeenCalledWith({
      cwd: CWD, verdict: 'fail', evidence: '범위가 너무 크다', specSha256: SHA, expectNode: 'spec-approve',
    })
  })

  it('ok:false면 reason을 보인다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: 'spec-approve', approval }))
    api.loopDecide.mockResolvedValue({ ok: false, reason: '사람이 본 스펙과 지금 스펙 파일이 다르다', status: st({ phase: 'waiting-human', node: 'spec-approve', approval }) })
    await click(btn('승인'))
    expect(screen.getByText('사람이 본 스펙과 지금 스펙 파일이 다르다')).toBeTruthy()
  })

  it('spec이나 sha256이 null이면 승인 버튼이 꺼진다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: 'spec-approve', approval: { ...approval, spec: null, sha256: null } }))
    expect(btn('승인').disabled).toBe(true)
  })

  it('지금 노드가 없으면 expectNode를 싣지 않는다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: null, approval }))
    await click(btn('승인'))
    expect('expectNode' in api.loopDecide.mock.calls[0][0]).toBe(false)
  })
})

describe('래치 풀기 카드 (M09 G4)', () => {
  const latch = { reason: '실행기 git 설정이 바뀌었다', file: 'C:\\app\\x.latch', changed: ['core.hooksPath', '.git/config'], state: 'cursor G1/implement', token: TOKEN }

  it('사유·파일·바뀐 목록·상태 요약을 보이고 「확인하고 풀기」가 releaseLatch {cwd, token}을 보낸다', async () => {
    await renderScreen(st({ phase: 'latched', reason: latch.reason, latch }))
    const card = screen.getByTestId('loop-latch')
    expect(within(card).getByText('core.hooksPath')).toBeTruthy()
    expect(within(card).getByText('.git/config')).toBeTruthy()
    expect(within(card).getByText('cursor G1/implement')).toBeTruthy()
    expect(within(card).getByText('C:\\app\\x.latch')).toBeTruthy()
    await click(btn('확인하고 풀기'))
    expect(api.loopReleaseLatch).toHaveBeenCalledWith({ cwd: CWD, token: TOKEN })
  })

  it('open-failed에서 온 래치도 카드로 보이고, 실패 사유를 보인다', async () => {
    await renderScreen(st({ phase: 'open-failed', reason: '설정 차이', latch }))
    api.loopReleaseLatch.mockResolvedValue({ ok: false, reason: '화면이 본 래치와 지금 래치가 다르다', status: st({ phase: 'open-failed', latch }) })
    await click(btn('확인하고 풀기'))
    expect(screen.getByText('화면이 본 래치와 지금 래치가 다르다')).toBeTruthy()
  })

  it('래치가 없으면 카드가 없다', async () => {
    await renderScreen(st({ phase: 'running' }))
    expect(screen.queryByTestId('loop-latch')).toBeNull()
  })
})

describe('마일스톤 PR 카드 (M09 G4)', () => {
  it('milestonePr가 있으면 기존 PR 카드를 작업 저장소 뿌리와 번호로 보인다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: 'milestone-merge', milestonePr: 7 }))
    expect(screen.getByTestId('pr-card')).toBeTruthy()
    expect(git.prRead).toHaveBeenCalledWith({ cwd: ROOT, number: 7, url: undefined })
    expect(git.prMerge).not.toHaveBeenCalled()
  })

  it('root가 없으면 화면의 cwd로 읽는다', async () => {
    await renderScreen(st({ phase: 'waiting-human', root: null, milestonePr: 7 }))
    expect(git.prRead).toHaveBeenCalledWith({ cwd: CWD, number: 7, url: undefined })
  })

  it('milestonePr가 없으면 PR 카드가 없다', async () => {
    await renderScreen(st({ phase: 'running' }))
    expect(screen.queryByTestId('pr-card')).toBeNull()
  })
})

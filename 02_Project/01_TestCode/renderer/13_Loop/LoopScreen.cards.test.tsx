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
      latch: { reason: '상태 파일 위조', file: 'C:\\app\\digests\\x.latch', changed: [], state: null, restore: null, token: TOKEN },
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

  // G4 검수 사소 7 — 진행 불가(설정을 고친 뒤 다시 열어야 하는 꼴)에서 빠져나갈 버튼. 닫고 다시 연다
  it('blocked면 「다시 열기」가 close 뒤 open을 보낸다', async () => {
    await renderScreen(st({ phase: 'blocked', reason: '자동 모드 허용 노드가 꺼져 있다 — 켠 뒤 루프 화면의 「다시 열기」' }))
    api.loopStatus.mockResolvedValue(st({ phase: 'closed' }))
    api.loopOpen.mockResolvedValue(st({ phase: 'not-started' }))
    await click(btn('다시 열기'))
    expect(api.loopClose).toHaveBeenCalledWith({ cwd: CWD })
    expect(api.loopOpen).toHaveBeenCalledWith({ cwd: CWD })
    expect(api.loopClose.mock.invocationCallOrder[0]).toBeLessThan(api.loopOpen.mock.invocationCallOrder[0])
  })

  it('blocked가 아니면 「다시 열기」가 없다', async () => {
    await renderScreen(st({ phase: 'halted', reason: 'x' }))
    expect(screen.queryByRole('button', { name: '다시 열기' })).toBeNull()
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

  // G4 검수 사소 8 — 다른 호출이 도는 동안 낸 질문 답을 버리지 않는다. 앞 호출이 끝난 뒤 보낸다
  it('다른 호출이 도는 동안 낸 질문 답은 버리지 않고 그 호출이 끝난 뒤 보낸다', async () => {
    const second: LoopCard = { ...question, requestId: 'q-2', text: '두 번째' }
    await renderScreen(st({ cards: [question, second], sessionActive: true }))
    let releaseFirst: (v: { ok: boolean }) => void = () => {}
    api.loopAnswerCard.mockImplementationOnce(() => new Promise((r) => { releaseFirst = r }))
    await click(within(screen.getByTestId('loop-card-q-1')).getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByText('크게'))
    await flush()
    expect(api.loopAnswerCard).toHaveBeenCalledTimes(1)
    // 첫 답이 도는 동안(busy) 두 번째 카드의 답하기는 창을 연다 — 고른 답은 대기열에 들어간다
    const card2 = screen.getByTestId('loop-card-q-2')
    await click(within(card2).getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByText('작게'))
    await flush()
    expect(api.loopAnswerCard).toHaveBeenCalledTimes(1)
    // 대기열에 든 카드는 다시 답하지 못한다(같은 답을 두 번 보내지 않게)
    expect((within(card2).getByRole('button', { name: '답하기' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { releaseFirst({ ok: true }) })
    await flush()
    await flush()
    expect(api.loopAnswerCard).toHaveBeenCalledTimes(2)
    expect(api.loopAnswerCard).toHaveBeenLastCalledWith({ cwd: CWD, requestId: 'q-2', response: { kind: 'question', answers: [['작게']] } })
  })

  // G4 확인 검수 — 대기열에 든 답의 보내기가 실패하면(throw) 답한 표시를 되돌리고 사유를 보인다(카드가 남아 있으면 다시 답할 수 있다)
  it('대기열 답의 보내기가 throw하면 답하기를 다시 켜고 사유를 보인다', async () => {
    const second: LoopCard = { ...question, requestId: 'q-2', text: '두 번째' }
    await renderScreen(st({ cards: [question, second], sessionActive: true }))
    let releaseFirst: (v: { ok: boolean }) => void = () => {}
    api.loopAnswerCard
      .mockImplementationOnce(() => new Promise((r) => { releaseFirst = r }))
      .mockRejectedValueOnce(new Error('보내기 시험 실패'))
    await click(within(screen.getByTestId('loop-card-q-1')).getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByText('크게'))
    await flush()
    const card2 = screen.getByTestId('loop-card-q-2')
    await click(within(card2).getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByText('작게'))
    await flush()
    expect((within(card2).getByRole('button', { name: '답하기' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { releaseFirst({ ok: true }) })
    await flush()
    await flush()
    expect(api.loopAnswerCard).toHaveBeenCalledTimes(2)
    expect((within(screen.getByTestId('loop-card-q-2')).getByRole('button', { name: '답하기' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/보내기 시험 실패/)).toBeTruthy()
  })

  it('대기열 답이 받아지지 않으면(ok:false) 답하기를 다시 켜고 사유를 보인다', async () => {
    const second: LoopCard = { ...question, requestId: 'q-2', text: '두 번째' }
    await renderScreen(st({ cards: [question, second], sessionActive: true }))
    let releaseFirst: (v: { ok: boolean }) => void = () => {}
    api.loopAnswerCard
      .mockImplementationOnce(() => new Promise((r) => { releaseFirst = r }))
      .mockResolvedValueOnce({ ok: false })
    await click(within(screen.getByTestId('loop-card-q-1')).getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByText('크게'))
    await flush()
    await click(within(screen.getByTestId('loop-card-q-2')).getByRole('button', { name: '답하기' }))
    fireEvent.click(screen.getByText('작게'))
    await flush()
    await act(async () => { releaseFirst({ ok: true }) })
    await flush()
    await flush()
    expect((within(screen.getByTestId('loop-card-q-2')).getByRole('button', { name: '답하기' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/카드 답이 받아지지 않았어요/)).toBeTruthy()
  })

  // G4 확인 검수 — 루프를 닫았다 다시 열면 답한 표시를 비운다. 새 세션의 첫 질문 카드가 옛 카드와 같은 id여도 답할 수 있게 보인다
  it('루프를 닫았다 열고 이어 가면 새 세션의 첫 질문 카드가 답할 수 있는 상태로 보인다', async () => {
    await renderScreen(st({ cards: [question], sessionActive: true }))
    await click(btn('답하기'))
    fireEvent.click(screen.getByText('크게'))
    await flush()
    expect(btn('답하기').disabled).toBe(true)
    api.loopStatus.mockResolvedValue(st({ phase: 'closed' }))
    await click(btn('루프 닫기'))
    api.loopOpen.mockResolvedValue(st({ cards: [question], sessionActive: true }))
    await click(btn('열기'))
    expect(api.loopOpen).toHaveBeenCalledWith({ cwd: CWD })
    expect(btn('답하기').disabled).toBe(false)
  })

  it('「다시 열기」(닫고 다시 열기)도 답한 표시를 비운다', async () => {
    await renderScreen(st({ phase: 'blocked', reason: '진행 불가', cards: [question], sessionActive: true }))
    await click(btn('답하기'))
    fireEvent.click(screen.getByText('크게'))
    await flush()
    expect(btn('답하기').disabled).toBe(true)
    api.loopOpen.mockResolvedValue(st({ cards: [question], sessionActive: true }))
    await click(btn('다시 열기'))
    expect(btn('답하기').disabled).toBe(false)
  })

  // G4 확인 검수 — 루프 질문 창은 루프 오버레이(z 60) 층으로 쌓인다. 대화 질문 창(z 80)이 떠 있으면 나중에 연 루프 창은 키를 받지 않는다
  it('대화 질문 창이 떠 있으면 나중에 연 루프 질문 창은 숫자 키를 받지 않는다', async () => {
    install(st({ cards: [question], sessionActive: true }))
    const { LoopScreen } = await import('@renderer/13_Loop')
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const conv = vi.fn()
    const CONV = [{ header: 'C', question: '대화 창 질문', options: [{ label: 'c1', description: '' }], multiSelect: false }]
    render(
      <>
        <QuestionModal open={true} questions={CONV} onAnswer={conv} onDismiss={vi.fn()} />
        <LoopScreen initialCwd={CWD} onCwdChange={() => {}} onClose={() => {}} />
      </>,
    )
    await flush()
    await click(btn('답하기'))
    expect(screen.getByText('어느 쪽으로 갈까요?')).toBeTruthy()
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    await flush()
    expect(conv).toHaveBeenCalledWith([['c1']])
    expect(api.loopAnswerCard).not.toHaveBeenCalled()
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

  // G4 검수 중요 I3 — 스펙 파일이 없을 때 빠져나갈 길. 반려는 해시 없이 보낸다(main이 해시 없는 반려만 받는다)
  it('스펙 파일이 없으면 반려는 켜지고 해시 없이 verdict:fail을 보낸다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: 'spec-approve', approval: { ...approval, spec: null, sha256: null } }))
    fireEvent.change(screen.getByLabelText('반려 사유'), { target: { value: '스펙이 써지지 않았다' } })
    expect(btn('반려').disabled).toBe(false)
    await click(btn('반려'))
    expect(api.loopDecide).toHaveBeenCalledWith({ cwd: CWD, verdict: 'fail', evidence: '스펙이 써지지 않았다', expectNode: 'spec-approve' })
  })

  it('지금 노드가 없으면 expectNode를 싣지 않는다', async () => {
    await renderScreen(st({ phase: 'waiting-human', node: null, approval }))
    await click(btn('승인'))
    expect('expectNode' in api.loopDecide.mock.calls[0][0]).toBe(false)
  })
})

describe('래치 풀기 카드 (M09 G4)', () => {
  const latch = { reason: '실행기 git 설정이 바뀌었다', file: 'C:\\app\\x.latch', changed: ['core.hooksPath', '.git/config'], state: 'cursor G1/implement', restore: null, token: TOKEN }

  // G4 검수 중요 I1 — 상태 위조 래치는 풀면 실행기가 마지막으로 쓴 사본으로 되돌린다. 그 사본을 보인다
  it('되돌릴 사본이 있으면 「풀면 되돌릴 상태」로 보인다', async () => {
    await renderScreen(st({ phase: 'latched', reason: '상태 파일 위조', latch: { ...latch, changed: [], restore: 'cursor brainstorm (사본)' } }))
    const card = screen.getByTestId('loop-latch')
    expect(within(card).getByText('풀면 되돌릴 상태')).toBeTruthy()
    expect(within(card).getByText('cursor brainstorm (사본)')).toBeTruthy()
  })

  it('사유·파일·바뀐 목록·상태 요약을 보이고 「확인하고 풀기」가 releaseLatch {cwd, token}을 보낸다', async () => {
    await renderScreen(st({ phase: 'latched', reason: latch.reason, latch }))
    const card = screen.getByTestId('loop-latch')
    expect(within(card).getByText('core.hooksPath')).toBeTruthy()
    // 바뀐 목록은 main이 준 글(키·값·출처 파일) 그대로다(G4 검수 B1)
    expect(within(card).getByText('바뀐 설정·파일(값과 출처 포함)')).toBeTruthy()
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

  // G4 확인 검수 — 풀기 중 상태 파일이 바뀌어 거부되면 main이 새 token의 래치를 싣는다. 화면은 그 카드를 다시 보이고, 다시 누르면 새 token을 보낸다
  it('풀기가 거부되며 새 token의 래치가 오면 카드를 다시 보이고, 다시 누르면 새 token으로 보낸다', async () => {
    const NEXT = 'ef'.repeat(32)
    await renderScreen(st({ phase: 'latched', reason: latch.reason, latch }))
    const reason = '화면이 본 뒤 상태 파일이 바뀌어 래치를 풀지 않았다 — 새로 뜬 래치를 다시 보고 푼다'
    api.loopReleaseLatch.mockResolvedValueOnce({ ok: false, reason, status: st({ phase: 'open-failed', reason, latch: { ...latch, token: NEXT } }) })
    await click(btn('확인하고 풀기'))
    expect(screen.getByTestId('loop-latch')).toBeTruthy()
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0)
    await click(btn('확인하고 풀기'))
    expect(api.loopReleaseLatch).toHaveBeenLastCalledWith({ cwd: CWD, token: NEXT })
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

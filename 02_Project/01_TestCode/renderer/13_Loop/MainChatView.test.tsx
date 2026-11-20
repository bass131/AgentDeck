// @vitest-environment jsdom
// M10 G3 메인 대화 보기 — 작업 폴더의 메인 대화(main 소유)를 loop.mainRead와 loop.mainState push로 받아 그린다.
// 고정하는 것:
//   - 기록: 사람 글(줄 섬·보냄), 메인 글(마크다운), 사건 줄(종류별 모양), 알림(오류·저장 실패).
//     메인 깃발 사건(flag-raised·flag-lowered)은 사람의 이어 가기(resumed)와 다른 모양이다.
//   - 순서: 첫 읽기·보내기·새로 열기의 응답이 그 사이 온 push보다 늦으면 응답의 보기로 되돌아가지 않는다. 다른 폴더의 push는 버린다.
//   - 입력칸: 열린 실행기가 없으면 막고 까닭을 보인다. 메인이 도는 중·사람을 기다림·줄 선 글 수를 보인다.
//   - 일시 정지: 깃발이 올라 있으면 표시와 「이어 가기」 — 깃발 내리기(loop.lowerFlag)만 부르고 사람 판정(decide)은 부르지 않는다.
//   - 취소는 대상을 골라 보낸다(메인 턴 main / 작업 세션 worker). 새 메인 대화는 확인을 한 번 받은 뒤 loop.mainNew다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { LoopEventKind, LoopStatus, MainChatItem, MainChatView } from '../../../../02_Project/00_Source/shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

// 독립 검수 중요 2 — 기록의 글을 다시 그렸는지 센다. 진짜 마크다운 보기를 그대로 그리고, 그린 원문만 적는다
const md = vi.hoisted(() => ({ renders: [] as string[] }))
vi.mock('@renderer/05_Conversation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/05_Conversation')>()
  const { createElement } = await import('react')
  const Spy = (p: { source: string }): ReturnType<typeof actual.MarkdownView> => {
    md.renders.push(p.source)
    return createElement(actual.MarkdownView, p)
  }
  return { ...actual, MarkdownView: Spy }
})

const CWD = 'C:\\work\\practice'

const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'running', milestoneId: 'M01', node: 'brainstorm', nodeTitle: '브레인스토밍', reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], ...over,
})
const mv = (over: Partial<MainChatView> = {}): MainChatView => ({
  cwd: CWD, root: CWD, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0, ...over,
})
const at = '2026-11-19T05:00:00.000Z'
const user = (id: string, text: string, state: 'queued' | 'sent'): MainChatItem => ({ id, at, kind: 'user', text, state })
const said = (id: string, text: string): MainChatItem => ({ id, at, kind: 'assistant', text, turn: 'user' })
const ev = (id: string, kind: LoopEventKind, text: string): MainChatItem => ({ id, at, kind: 'event', event: { kind, node: null, goal: null, text } })
const note = (id: string, text: string): MainChatItem => ({ id, at, kind: 'notice', text })

type Fn = ReturnType<typeof vi.fn>
let api: Record<string, Fn>
let mainHandlers: Set<(v: MainChatView) => void>
let stateHandlers: Set<(s: LoopStatus) => void>

function install(view: MainChatView = mv(), status: LoopStatus = st()): void {
  mainHandlers = new Set()
  stateHandlers = new Set()
  api = {
    loopMainRead: vi.fn().mockResolvedValue(view),
    loopMainSend: vi.fn().mockResolvedValue({ ok: true, view }),
    loopMainNew: vi.fn().mockResolvedValue({ ok: true, view: mv() }),
    loopLowerFlag: vi.fn().mockResolvedValue({ ok: true, view: mv({ ...view, paused: false }) }),
    loopStatus: vi.fn().mockResolvedValue(status),
    loopDecide: vi.fn().mockResolvedValue({ ok: true, status }),
    loopAnswerCard: vi.fn().mockResolvedValue({ ok: true }),
    loopCancelSession: vi.fn().mockResolvedValue({ ok: true }),
    onLoopMainState: vi.fn((cb: (v: MainChatView) => void) => { mainHandlers.add(cb); return () => mainHandlers.delete(cb) }),
    onLoopState: vi.fn((cb: (s: LoopStatus) => void) => { stateHandlers.add(cb); return () => stateHandlers.delete(cb) }),
  }
  Object.defineProperty(window, 'api', { value: adaptFlatApi(api), writable: true, configurable: true })
}

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const pushView = async (v: MainChatView): Promise<void> => { await act(async () => { for (const h of [...mainHandlers]) h(v) }) }
const pushState = async (s: LoopStatus): Promise<void> => { await act(async () => { for (const h of [...stateHandlers]) h(s) }) }
const chat = (): HTMLElement => screen.getByRole('region', { name: '메인 대화' })
const btn = (name: string): HTMLButtonElement => within(chat()).getByRole('button', { name }) as HTMLButtonElement
const click = async (el: HTMLElement): Promise<void> => { await act(async () => { fireEvent.click(el) }); await flush() }

async function renderChat(cwd: string | null = CWD) {
  const { MainChatView } = await import('@renderer/13_Loop')
  const r = render(<MainChatView cwd={cwd} />)
  await flush()
  return r
}

beforeEach(() => install())
afterEach(() => cleanup())

describe('메인 대화 기록 (M10 G3)', () => {
  it('사람 글은 줄 섬·보냄을, 메인 글은 마크다운을, 사건 줄은 종류를, 알림은 오류·저장 실패 글을 보인다', async () => {
    install(mv({
      items: [
        user('u1', '범위는 덧셈', 'sent'), said('a1', '좋아, **결정 대장**에 적었어'), user('u2', '타임아웃은 짧게', 'queued'),
        ev('e1', 'goal-merged', 'G1 목표를 병합했다'), ev('e2', 'fail', 'G2/checks 실패 — npm test'),
        note('n1', '턴이 오류로 끝났다 — 연결 끊김'), note('n2', '대화 기록을 저장하지 못했다 — EACCES'),
      ],
    }))
    const { container } = await renderChat()
    expect(api.loopMainRead).toHaveBeenCalledWith({ cwd: CWD })
    const sent = container.querySelector('[data-item="u1"]') as HTMLElement
    const queued = container.querySelector('[data-item="u2"]') as HTMLElement
    expect(sent.getAttribute('data-state')).toBe('sent')
    expect(within(sent).getByText('보냄')).toBeTruthy()
    expect(queued.getAttribute('data-state')).toBe('queued')
    expect(within(queued).getByText('줄 서 있어요')).toBeTruthy()
    // 메인 글은 기존 마크다운 보기로 그린다
    const said1 = container.querySelector('[data-item="a1"]') as HTMLElement
    expect(said1.querySelector('.markdown-view strong')?.textContent).toBe('결정 대장')
    expect(container.querySelector('[data-item="e1"]')?.getAttribute('data-kind')).toBe('goal-merged')
    expect(container.querySelector('[data-item="e2"]')?.getAttribute('data-kind')).toBe('fail')
    expect(container.querySelector('[data-item="e1"]')?.getAttribute('data-tone')).not.toBe(container.querySelector('[data-item="e2"]')?.getAttribute('data-tone'))
    expect(screen.getByText('턴이 오류로 끝났다 — 연결 끊김')).toBeTruthy()
    expect(screen.getByText('대화 기록을 저장하지 못했다 — EACCES')).toBeTruthy()
    expect(container.querySelector('[data-item="n2"]')?.classList.contains('mc-notice')).toBe(true)
  })

  it('메인 깃발 사건(flag-raised·flag-lowered)은 사람의 이어 가기(resumed)와 다른 이름표와 모양으로 그린다', async () => {
    install(mv({
      items: [
        ev('f1', 'flag-raised', '일시 정지 깃발을 올렸다'), ev('f2', 'flag-lowered', '일시 정지 깃발을 내렸다'),
        ev('r1', 'resumed', '사람이 멈춘 실행을 이어 갔다 — 봤다'),
      ],
    }))
    const { container } = await renderChat()
    const raised = container.querySelector('[data-item="f1"]') as HTMLElement
    const lowered = container.querySelector('[data-item="f2"]') as HTMLElement
    const resumed = container.querySelector('[data-item="r1"]') as HTMLElement
    expect(raised.getAttribute('data-tone')).toBe('flag')
    expect(lowered.getAttribute('data-tone')).toBe('flag')
    expect(resumed.getAttribute('data-tone')).toBe('human')
    const label = (el: HTMLElement): string => (el.querySelector('.mc-evt-k') as HTMLElement).textContent ?? ''
    expect(label(raised)).toContain('깃발')
    expect(label(lowered)).toContain('깃발')
    expect(label(resumed)).not.toContain('깃발')
    expect(label(resumed)).toContain('사람')
  })

  it('사건 종류마다 이름표가 있다 — 이름표 표가 종류 전부를 덮는다', async () => {
    const { EVENT_LOOK } = await import('@renderer/13_Loop/mainChatModel')
    const kinds: LoopEventKind[] = [
      'node-start', 'node-end', 'fail', 'halt', 'error', 'goal-merged', 'milestone-pr', 'spec-approved', 'spec-rejected',
      'flag-raised', 'flag-lowered', 'resumed', 'backlog', 'latched', 'done',
    ]
    expect(Object.keys(EVENT_LOOK).sort()).toEqual([...kinds].sort())
    for (const k of kinds) expect(EVENT_LOOK[k].label.trim().length, k).toBeGreaterThan(0)
    // M10 G5 — 작업 모드의 화면 글은 한글로 맞춘다. 이름표에 영어 낱말(PR 제외)을 두지 않는다
    expect([EVENT_LOOK['node-start'].label, EVENT_LOOK['node-end'].label, EVENT_LOOK.fail.label, EVENT_LOOK.backlog.label]).toEqual(['시작', '통과', '실패', '미룬 일'])
    for (const k of kinds) expect(EVENT_LOOK[k].label.replace(/\bPR\b/g, ''), k).not.toMatch(/[A-Za-z]/)
  })

  it('입력칸 안내 글도 한글이다 — 「미룬 일로」', async () => {
    const { PLACEHOLDER } = await import('@renderer/13_Loop/MainChatView')
    expect(PLACEHOLDER).toContain('「미룬 일로」')
    expect(PLACEHOLDER).not.toMatch(/Backlog/)
  })
})

describe('읽기와 push의 순서 (M10 G3)', () => {
  it('첫 읽기 응답이 그 사이 온 push보다 늦으면 응답의 낡은 보기로 되돌아가지 않는다', async () => {
    let resolveRead: (v: MainChatView) => void = () => {}
    install()
    api.loopMainRead.mockReturnValue(new Promise<MainChatView>((r) => { resolveRead = r }))
    await renderChat()
    await pushView(mv({ items: [said('a2', '새 글')] }))
    expect(screen.getByText('새 글')).toBeTruthy()
    await act(async () => { resolveRead(mv({ items: [said('a1', '낡은 글')] })) })
    await flush()
    expect(screen.getByText('새 글')).toBeTruthy()
    expect(screen.queryByText('낡은 글')).toBeNull()
  })

  it('같은 폴더의 push는 표기 차이가 있어도 받고, 다른 폴더의 push는 버린다', async () => {
    await renderChat()
    await pushView(mv({ cwd: 'C:\\work\\other', items: [said('x', '다른 폴더')] }))
    expect(screen.queryByText('다른 폴더')).toBeNull()
    await pushView(mv({ cwd: 'c:/work/practice/', items: [said('y', '같은 폴더')] }))
    expect(screen.getByText('같은 폴더')).toBeTruthy()
  })

  it('보내기 중에 push가 오면 늦게 온 응답의 보기로 덮지 않는다', async () => {
    let resolveSend: (r: { ok: boolean; view: MainChatView }) => void = () => {}
    await renderChat()
    api.loopMainSend.mockReturnValue(new Promise((r) => { resolveSend = r }))
    fireEvent.change(within(chat()).getByLabelText('메인에게 말하기'), { target: { value: '안녕' } })
    await click(btn('보내기'))
    await pushView(mv({ items: [user('u1', '안녕', 'sent'), said('a1', '반가워')] }))
    await act(async () => { resolveSend({ ok: true, view: mv({ items: [user('u1', '안녕', 'queued')] }) }) })
    await flush()
    expect(screen.getByText('반가워')).toBeTruthy()
  })

  it('작업 폴더가 바뀌면 옛 폴더의 보기를 지우고 새 폴더의 보기를 읽는다 — 옛 폴더의 늦은 응답과 push는 버린다', async () => {
    let resolveOld: (v: MainChatView) => void = () => {}
    install()
    api.loopMainRead.mockReturnValueOnce(new Promise<MainChatView>((r) => { resolveOld = r }))
    const { MainChatView: View } = await import('@renderer/13_Loop')
    const r = render(<View cwd={CWD} />)
    await flush()
    const OTHER = 'C:\\work\\second'
    api.loopMainRead.mockResolvedValue(mv({ cwd: OTHER, items: [said('b1', '둘째 폴더')] }))
    r.rerender(<View cwd={OTHER} />)
    await flush()
    expect(api.loopMainRead).toHaveBeenLastCalledWith({ cwd: OTHER })
    expect(screen.getByText('둘째 폴더')).toBeTruthy()
    await act(async () => { resolveOld(mv({ items: [said('a1', '첫 폴더의 늦은 응답')] })) })
    await pushView(mv({ items: [said('a2', '첫 폴더의 push')] }))
    await flush()
    expect(screen.queryByText('첫 폴더의 늦은 응답')).toBeNull()
    expect(screen.queryByText('첫 폴더의 push')).toBeNull()
    expect(screen.getByText('둘째 폴더')).toBeTruthy()
  })

  it('화면이 사라지면 두 push 구독을 푼다', async () => {
    const r = await renderChat()
    expect(mainHandlers.size).toBe(1)
    expect(stateHandlers.size).toBe(1)
    r.unmount()
    expect(mainHandlers.size).toBe(0)
    expect(stateHandlers.size).toBe(0)
  })
})

describe('입력칸 (M10 G3)', () => {
  it('작업 폴더가 없으면 IPC를 부르지 않고 고르라는 까닭을 보인다', async () => {
    await renderChat(null)
    expect(api.loopMainRead).not.toHaveBeenCalled()
    expect(btn('보내기').disabled).toBe(true)
    expect(within(chat()).getByText(/작업 폴더를 먼저 골라요/)).toBeTruthy()
  })

  it('열린 실행기가 없으면(root null) 입력을 막고 까닭을 보인다', async () => {
    install(mv({ root: null, items: [said('a1', '지난 기록')] }), st({ phase: 'closed', root: null }))
    await renderChat()
    expect(screen.getByText('지난 기록')).toBeTruthy()
    const box = within(chat()).getByLabelText('메인에게 말하기') as HTMLTextAreaElement
    expect(box.disabled).toBe(true)
    expect(btn('보내기').disabled).toBe(true)
    expect(within(chat()).getByText(/실행기가 열려 있지 않아요/)).toBeTruthy()
  })

  it('보내기는 loop.mainSend({cwd, text})다 — 받으면 입력칸을 비우고, 받지 않으면(ok:false) 사유를 보인다. Enter도 보낸다', async () => {
    await renderChat()
    const box = within(chat()).getByLabelText('메인에게 말하기') as HTMLTextAreaElement
    expect(btn('보내기').disabled).toBe(true)
    fireEvent.change(box, { target: { value: '범위는 덧셈으로' } })
    await click(btn('보내기'))
    expect(api.loopMainSend).toHaveBeenCalledWith({ cwd: CWD, text: '범위는 덧셈으로' })
    expect(box.value).toBe('')
    api.loopMainSend.mockResolvedValue({ ok: false, reason: '메인 대화가 닫혔다', view: mv() })
    fireEvent.change(box, { target: { value: '둘째 줄' } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    await flush()
    expect(api.loopMainSend).toHaveBeenLastCalledWith({ cwd: CWD, text: '둘째 줄' })
    expect(within(chat()).getByText('메인 대화가 닫혔다')).toBeTruthy()
    expect(box.value).toBe('둘째 줄')
    // Shift+Enter는 줄바꿈이다(보내지 않는다)
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter', shiftKey: true }) })
    expect(api.loopMainSend).toHaveBeenCalledTimes(2)
  })

  it('메인이 도는 중, 사람을 기다림, 줄 선 글 수를 보인다', async () => {
    install(mv({ busy: true, queued: 2 }))
    await renderChat()
    expect(within(chat()).getByText('메인이 답하는 중이에요')).toBeTruthy()
    expect(within(chat()).getByText('줄 선 글 2개')).toBeTruthy()
    await pushView(mv({ busy: false, waitingUser: true, queued: 0 }))
    expect(within(chat()).queryByText('메인이 답하는 중이에요')).toBeNull()
    expect(within(chat()).getByText('메인이 네 말을 기다려요')).toBeTruthy()
  })
})

describe('일시 정지와 취소 (M10 G3, Backlog 9·12)', () => {
  it('깃발이 올라 있으면 대화 위에 표시와 「이어 가기」 — 깃발 내리기(lowerFlag {cwd})만 부르고 사람 판정은 부르지 않는다', async () => {
    install(mv({ paused: true }), st({ paused: true, phase: 'halted', reason: 'FAIL 셋' }))
    await renderChat()
    expect(within(chat()).getByText(/일시 정지 깃발이 올라 있어요/)).toBeTruthy()
    await click(btn('이어 가기'))
    expect(api.loopLowerFlag).toHaveBeenCalledWith({ cwd: CWD })
    expect(api.loopDecide).not.toHaveBeenCalled()
    expect(within(chat()).queryByText(/일시 정지 깃발이 올라 있어요/)).toBeNull()
  })

  it('깃발 내리기가 받아지지 않으면 사유를 보인다. 깃발이 없으면 표시가 없다', async () => {
    install(mv({ paused: true }))
    api.loopLowerFlag.mockResolvedValue({ ok: false, reason: '일시 정지 깃발이 올라 있지 않다', view: mv({ paused: true }) })
    await renderChat()
    await click(btn('이어 가기'))
    expect(within(chat()).getByText('일시 정지 깃발이 올라 있지 않다')).toBeTruthy()
    await pushView(mv({ paused: false }))
    expect(within(chat()).queryByRole('button', { name: '이어 가기' })).toBeNull()
  })

  it('취소는 대상을 골라 보낸다 — 메인 턴이 돌면 「메인 턴 멈추기」(main), 작업 세션이 돌면 「작업 세션 멈추기」(worker)', async () => {
    install(mv({ busy: true }), st({ sessionActive: true, node: 'G1/implement', mainBusy: true }))
    await renderChat()
    await click(btn('메인 턴 멈추기'))
    expect(api.loopCancelSession).toHaveBeenLastCalledWith({ cwd: CWD, target: 'main' })
    await click(btn('작업 세션 멈추기'))
    expect(api.loopCancelSession).toHaveBeenLastCalledWith({ cwd: CWD, target: 'worker' })
    api.loopCancelSession.mockResolvedValue({ ok: false })
    await click(btn('작업 세션 멈추기'))
    expect(within(chat()).getByText(/멈출 작업 세션이 없어요/)).toBeTruthy()
  })

  it('도는 것이 없으면 멈추기 버튼이 없다. 브레인스토밍의 세션은 메인 대화라 작업 세션 멈추기를 보이지 않는다', async () => {
    await renderChat()
    expect(within(chat()).queryByRole('button', { name: '메인 턴 멈추기' })).toBeNull()
    expect(within(chat()).queryByRole('button', { name: '작업 세션 멈추기' })).toBeNull()
    await pushState(st({ sessionActive: true, mainBusy: false }))
    await pushView(mv({ brainstorming: true }))
    expect(within(chat()).queryByRole('button', { name: '작업 세션 멈추기' })).toBeNull()
  })
})

describe('메인 대화 보기의 순수 도우미 (M10 G3)', () => {
  it('입력을 막는 까닭 — 폴더 없음, 읽는 중, 열린 실행기 없음(root null). 열려 있으면 null', async () => {
    const { blockedReason } = await import('@renderer/13_Loop/mainChatModel')
    expect(blockedReason(null, null)).toMatch(/작업 폴더를 먼저 골라요/)
    expect(blockedReason(CWD, null)).toMatch(/읽는 중/)
    expect(blockedReason(CWD, mv({ root: null }))).toMatch(/실행기가 열려 있지 않아요/)
    expect(blockedReason(CWD, mv())).toBeNull()
  })

  it('메인 글의 시각은 지역 시각 HH:MM이고, 읽지 못하면 비운다', async () => {
    const { clockOf } = await import('@renderer/13_Loop/mainChatModel')
    const d = new Date(2026, 10, 19, 9, 5)
    expect(clockOf(d.toISOString())).toBe('09:05')
    expect(clockOf('아님')).toBe('')
  })

  it('작업 세션 멈추기는 작업·검수 세션이 떠 있을 때만 — 브레인스토밍(메인 대화)과, 노드를 돌지 않는데 메인 턴만 도는 경우는 빼고', async () => {
    const { workSessionLive } = await import('@renderer/13_Loop/mainChatModel')
    expect(workSessionLive(null, mv())).toBe(false)
    expect(workSessionLive(st({ sessionActive: false }), mv())).toBe(false)
    expect(workSessionLive(st({ sessionActive: true }), mv())).toBe(true)
    expect(workSessionLive(st({ sessionActive: true }), mv({ brainstorming: true }))).toBe(false)
    expect(workSessionLive(st({ sessionActive: true, mainBusy: true, phase: 'waiting-human' }), mv({ busy: true }))).toBe(false)
    expect(workSessionLive(st({ sessionActive: true, mainBusy: true, phase: 'running' }), mv({ busy: true }))).toBe(true)
  })

  it('지금 노드가 메인 노드(브레인스토밍)면 보기 없이도 작업 세션이 아니다', async () => {
    const { workSessionLive } = await import('@renderer/13_Loop/mainChatModel')
    expect(workSessionLive(st({ sessionActive: true, mainNode: true }), null)).toBe(false)
    expect(workSessionLive(st({ sessionActive: true, mainNode: true, mainBusy: true, phase: 'running' }), mv({ busy: true }))).toBe(false)
    expect(workSessionLive(st({ sessionActive: true, mainNode: false }), null)).toBe(true)
  })

  it('입력을 막는 까닭의 안내는 현황판을 가리킨다', async () => {
    const { blockedReason } = await import('@renderer/13_Loop/mainChatModel')
    expect(blockedReason(null, null)).toMatch(/현황판/)
    expect(blockedReason(CWD, mv({ root: null }))).toMatch(/현황판/)
    expect(blockedReason(null, null)).not.toMatch(/루프 화면/)
  })
})

describe('새 메인 대화 (M10 G3)', () => {
  it('확인을 한 번 받은 뒤 loop.mainNew({cwd})다 — 그만두면 부르지 않는다', async () => {
    await renderChat()
    await click(btn('새 메인 대화'))
    expect(api.loopMainNew).not.toHaveBeenCalled()
    expect(within(chat()).getByText(/지금 기록을 보관하고 새 메인 대화를 열까요/)).toBeTruthy()
    await click(btn('그만두기'))
    expect(api.loopMainNew).not.toHaveBeenCalled()
    await click(btn('새 메인 대화'))
    await click(btn('새로 열기'))
    expect(api.loopMainNew).toHaveBeenCalledWith({ cwd: CWD })
  })

  it('새로 열기가 받아지지 않으면 사유를 보인다', async () => {
    api.loopMainNew.mockResolvedValue({ ok: false, reason: '새 메인 대화를 여는 중이다', view: mv() })
    await renderChat()
    await click(btn('새 메인 대화'))
    await click(btn('새로 열기'))
    expect(within(chat()).getByText('새 메인 대화를 여는 중이다')).toBeTruthy()
  })
})

// G3 독립 검수 반영 — 모르는 사건 종류, 다시 그리기, 입력칸·멈추기 알림·끝 보이기, 한글 조합 중 Enter
describe('G3 독립 검수 반영 (M10 G3)', () => {
  const box = (): HTMLTextAreaElement => within(chat()).getByLabelText('메인에게 말하기') as HTMLTextAreaElement

  it('모르는 사건 종류(옛 빌드가 남긴 paused 꼴)가 와도 화면이 무너지지 않는다 — 이름표는 종류 이름, 모양은 muted', async () => {
    const old = { id: 'o1', at, kind: 'event', event: { kind: 'paused', node: null, goal: null, text: '옛 깃발' } } as unknown as MainChatItem
    install(mv({ items: [old, said('a1', '뒤에 온 글')] }))
    const { container } = await renderChat()
    const el = container.querySelector('[data-item="o1"]') as HTMLElement
    expect(el.getAttribute('data-tone')).toBe('muted')
    expect(el.querySelector('.mc-evt-k')?.textContent).toBe('paused')
    expect(screen.getByText('옛 깃발')).toBeTruthy()
    expect(screen.getByText('뒤에 온 글')).toBeTruthy()
  })

  it('사건 모양 고르기 — 아는 종류는 표의 모양, 모르는 종류(객체 원형의 이름 포함)는 종류 이름·muted', async () => {
    const { EVENT_LOOK, lookOf } = await import('@renderer/13_Loop/mainChatModel')
    expect(lookOf('fail')).toEqual(EVENT_LOOK.fail)
    expect(lookOf('flag-raised')).toEqual(EVENT_LOOK['flag-raised'])
    expect(lookOf('paused')).toEqual({ label: 'paused', tone: 'muted' })
    expect(lookOf('constructor')).toEqual({ label: 'constructor', tone: 'muted' })
  })

  it('기록 한 줄의 같음 — 새 객체여도 그리는 칸이 같으면 같고, 칸 하나라도 다르면 다르다', async () => {
    const { sameItem } = await import('@renderer/13_Loop/mainChatModel')
    expect(sameItem(said('a1', '글'), said('a1', '글'))).toBe(true)
    expect(sameItem(said('a1', '글'), said('a2', '글'))).toBe(false)
    expect(sameItem(said('a1', '글'), said('a1', '글 고침'))).toBe(false)
    expect(sameItem(said('a1', '글'), { ...said('a1', '글'), turn: 'event' } as MainChatItem)).toBe(false)
    expect(sameItem(said('a1', '글'), { ...said('a1', '글'), at: '2026-11-19T06:00:00.000Z' } as MainChatItem)).toBe(false)
    expect(sameItem(user('u1', '글', 'queued'), user('u1', '글', 'sent'))).toBe(false)
    expect(sameItem(user('u1', '글', 'sent'), { ...user('u1', '글', 'sent'), proxy: true } as MainChatItem)).toBe(false)
    expect(sameItem(note('n1', '알림'), note('n1', '알림'))).toBe(true)
    expect(sameItem(note('n1', '글'), said('n1', '글'))).toBe(false)
    const e1 = ev('e1', 'fail', 'FAIL')
    expect(sameItem(e1, ev('e1', 'fail', 'FAIL'))).toBe(true)
    expect(sameItem(e1, ev('e1', 'halt', 'FAIL'))).toBe(false)
    const withNode = { id: 'e1', at, kind: 'event', event: { kind: 'fail', node: 'checks', goal: 'G1', text: 'FAIL', verdict: 'fail' } } as MainChatItem
    expect(sameItem(e1, withNode)).toBe(false)
    expect(sameItem(withNode, { ...withNode, event: { ...(withNode as { event: object }).event, verdict: 'stop' } } as MainChatItem)).toBe(false)
  })

  it('입력칸에 쓰는 동안 기록의 글을 다시 그리지 않는다 — 같은 내용의 새 push도 다시 그리지 않고, 바뀐 글만 다시 그린다', async () => {
    const items = (): MainChatItem[] => [said('a1', '첫 답'), said('a2', '둘째 답'), user('u1', '질문', 'queued')]
    install(mv({ items: items() }))
    const { container } = await renderChat()
    expect(md.renders.length).toBeGreaterThan(0)
    md.renders.length = 0
    fireEvent.change(box(), { target: { value: '가' } })
    fireEvent.change(box(), { target: { value: '가나' } })
    expect(md.renders).toEqual([])
    await pushView(mv({ items: items() }))
    await pushState(st({ node: 'G1/implement' }))
    expect(md.renders).toEqual([])
    // 같은 id라도 내용이 바뀌면 다시 그린다 — 메인 글의 글자, 사람 글의 줄 섬 → 보냄
    await pushView(mv({ items: [said('a1', '첫 답'), said('a2', '둘째 답 고침'), user('u1', '질문', 'sent')] }))
    expect(md.renders).toEqual(['둘째 답 고침'])
    expect(container.querySelector('[data-item="u1"]')?.getAttribute('data-state')).toBe('sent')
    expect(box().value).toBe('가나')
  })

  it('보내기 응답을 기다리는 동안 새로 쓴 글은 응답 뒤에도 지우지 않는다', async () => {
    let resolveSend: (r: { ok: boolean; view: MainChatView }) => void = () => {}
    await renderChat()
    api.loopMainSend.mockReturnValue(new Promise((r) => { resolveSend = r }))
    fireEvent.change(box(), { target: { value: '첫 말' } })
    await click(btn('보내기'))
    expect(api.loopMainSend).toHaveBeenCalledWith({ cwd: CWD, text: '첫 말' })
    fireEvent.change(box(), { target: { value: '다음 말' } })
    await act(async () => { resolveSend({ ok: true, view: mv() }) })
    await flush()
    expect(box().value).toBe('다음 말')
  })

  it('입력칸을 떼어 낸 뒤에도 작업 폴더를 바꾸면 쓰던 글이 그대로 남는다', async () => {
    const { MainChatView: View } = await import('@renderer/13_Loop')
    const r = render(<View cwd={CWD} />)
    await flush()
    fireEvent.change(box(), { target: { value: '쓰던 글' } })
    const OTHER = 'C:\\work\\second'
    api.loopMainRead.mockResolvedValue(mv({ cwd: OTHER }))
    r.rerender(<View cwd={OTHER} />)
    await flush()
    expect(box().value).toBe('쓰던 글')
  })

  it('멈추기 실패 알림은 멈출 것(메인 턴·작업 세션)이 모두 사라지면 함께 걷힌다', async () => {
    install(mv({ busy: true }))
    await renderChat()
    api.loopCancelSession.mockResolvedValue({ ok: false })
    await click(btn('메인 턴 멈추기'))
    expect(within(chat()).getByText(/멈출 메인 턴이 없어요/)).toBeTruthy()
    await pushView(mv({ busy: false }))
    expect(within(chat()).queryByText(/멈출 메인 턴이 없어요/)).toBeNull()
    expect(chat().querySelector('.mc-cancel')).toBeNull()
  })

  it('기록이 상한(500)에 닿아 길이가 그대로여도 새 글이 오면 기록의 끝을 보인다', async () => {
    const many = (from: number): MainChatItem[] => Array.from({ length: 500 }, (_, i) => note(`n${from + i}`, `글 ${from + i}`))
    install(mv({ items: many(0) }))
    const { container } = await renderChat()
    const thread = container.querySelector('.mc-thread') as HTMLElement
    const set = vi.fn()
    Object.defineProperty(thread, 'scrollHeight', { configurable: true, get: () => 9000 })
    Object.defineProperty(thread, 'scrollTop', { configurable: true, get: () => 0, set })
    await pushView(mv({ items: many(1) }))
    expect(set).toHaveBeenCalledWith(9000)
  })

  it('한글 조합 중의 Enter(isComposing)는 보내지 않는다 — 조합이 끝난 Enter는 보낸다', async () => {
    // 이 시험이 헛돌지 않는다는 받침 — 시험 환경의 키 사건이 isComposing을 정말 싣는다(싣지 않으면 막는 줄이 없어도 통과한다)
    expect(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }).isComposing).toBe(true)
    await renderChat()
    fireEvent.change(box(), { target: { value: '한글' } })
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter', isComposing: true }) })
    await flush()
    expect(api.loopMainSend).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }) })
    await flush()
    expect(api.loopMainSend).toHaveBeenCalledWith({ cwd: CWD, text: '한글' })
  })
})

describe('메인 세션 사건을 대화 기록에 얹기 (M11 G4)', () => {
  type Ev = import('../../../../02_Project/00_Source/shared/agentEvents').AgentEvent
  type Rec = import('../../../../02_Project/00_Source/shared/ipcContract').LoopSessionRecord
  const turn = (id: string, answer: string, done = true): Ev[] => [
    { type: 'session', sessionId: 'S1' },
    { type: 'tool_call', id: `t-${id}`, name: 'Read', input: {} },
    ...(answer === '' ? [] : [{ type: 'text', messageId: id, delta: answer } as Ev]),
    ...(done ? [{ type: 'done' } as Ev] : []),
  ]
  const rec = (events: Ev[], truncated = false): Rec => ({ session: { key: 'main', kind: 'main', node: null, goal: null, sessionId: 'S1' }, events, next: events.length, truncated, live: true })
  const shape = (rows: ReturnType<typeof import('@renderer/13_Loop/mainChatModel').mainChatRows>): string[] =>
    rows.map((r) => (r.kind === 'item' ? `${r.item.id}${r.turn ? `+${r.turn.key}` : ''}` : `${r.turn.key}${r.live ? '*' : ''}`))

  it('[M11-G4 M10-22] 끝난 턴은 같은 답 글의 메인 답 자리에, 짝 없는 턴은 다음 짝 앞에, 도는 턴은 끝에 둔다', async () => {
    const { mainChatRows } = await import('@renderer/13_Loop/mainChatModel')
    const items = [user('u0', '어제', 'sent'), said('a0', '알았다'), user('u1', '하나', 'sent'), said('a1', '알았다'), user('u2', '둘', 'sent')]
    const events = [...turn('m1', ''), ...turn('m2', '알았다'), ...turn('m3', '쓰는 중', false)]
    expect(shape(mainChatRows(items, rec(events), true))).toEqual(['u0', 'a0', 'u1', 'turn-0', 'a1+turn-1', 'u2', 'turn-2*'])
    expect(shape(mainChatRows(items, rec(events), false))).toEqual(['u0', 'a0', 'u1', 'turn-0', 'a1+turn-1', 'u2', 'turn-2'])
  })

  it('[M11-G4 M10-22] 기록이 없으면 대화 기록 그대로이고, 돌기 시작한 턴은 빈 줄로 끝에 선다. 앞이 잘린 기록의 첫 턴은 버린다', async () => {
    const { mainChatRows } = await import('@renderer/13_Loop/mainChatModel')
    const items = [user('u1', '하나', 'sent'), said('a1', '알았다')]
    expect(shape(mainChatRows(items, undefined, false))).toEqual(['u1', 'a1'])
    expect(shape(mainChatRows(items, rec(turn('m1', '알았다')), true))).toEqual(['u1', 'a1+turn-0', 'turn-next*'])
    expect(shape(mainChatRows(items, rec([...turn('m0', '잘린 조각'), ...turn('m1', '알았다')], true), false))).toEqual(['u1', 'a1+turn-0'])
  })
})

describe('대리 입력 표시 (M11 G4)', () => {
  it('[M11-G4 M06-29] 대리 입력 표지가 있는 사람 글에만 「대리 입력」이 보인다', async () => {
    const proxied: MainChatItem = { id: 'u2', at: '2026-11-20T10:00:00.000Z', kind: 'user', text: '합의', state: 'sent', proxy: true }
    install(mv({ items: [user('u1', '사람이 쓴 글', 'sent'), proxied] }))
    const { container } = await renderChat()
    const log = within(screen.getByRole('log', { name: '메인 대화 기록' }))
    expect(log.getAllByText('대리 입력')).toHaveLength(1)
    expect(container.querySelector('[data-item="u2"]')?.textContent).toContain('대리 입력')
    expect(container.querySelector('[data-item="u1"]')?.textContent).not.toContain('대리 입력')
  })
})

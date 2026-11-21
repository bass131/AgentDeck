// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { LoopCard, LoopStatus, MainChatView } from '@shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'not-started', milestoneId: null, node: null, nodeTitle: null, reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], ...over,
})
const mv = (over: Partial<MainChatView> = {}): MainChatView => ({
  cwd: CWD, root: CWD, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0, ...over,
})
const PREVIEW = '# 프로젝트 헌장\n\n## 목표\n\n에이전트가 마일스톤을 끝까지 맡는다.\n'
const card = (over: Partial<Extract<LoopCard, { kind: 'taste' }>> = {}): LoopCard => ({
  kind: 'taste', requestId: 'taste-1', node: 'main', goal: null, text: '프로젝트 헌장 초안', inChat: true,
  draft: { doc: 'charter', charter: { goal: ['에이전트가 마일스톤을 끝까지 맡는다.'], nonGoals: null } }, preview: PREVIEW, ...over,
})

type Fn = ReturnType<typeof vi.fn>
let api: Record<string, Fn>

function install(view: MainChatView): void {
  api = {
    loopMainRead: vi.fn().mockResolvedValue(view),
    loopMainSend: vi.fn().mockResolvedValue({ ok: true, view }),
    loopStatus: vi.fn().mockResolvedValue(st()),
    loopAnswerCard: vi.fn().mockResolvedValue({ ok: true }),
    loopDecide: vi.fn(),
    onLoopMainState: vi.fn(() => () => {}),
    onLoopState: vi.fn(() => () => {}),
  }
  Object.defineProperty(window, 'api', { value: adaptFlatApi(api), writable: true, configurable: true })
}

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const click = async (el: HTMLElement): Promise<void> => { await act(async () => { fireEvent.click(el) }); await flush() }
async function renderCard(c: LoopCard): Promise<HTMLElement> {
  install(mv({ cards: [c] }))
  const { MainChatView } = await import('@renderer/13_Loop')
  render(<MainChatView cwd={CWD} />)
  await flush()
  return within(screen.getByRole('region', { name: '메인 대화' })).getByTestId(`mc-card-${c.requestId}`)
}
const button = (box: HTMLElement, name: string): HTMLButtonElement => within(box).getByRole('button', { name }) as HTMLButtonElement

afterEach(() => cleanup())
beforeEach(() => { document.body.innerHTML = '' })

describe('대화 안 문서 초안 카드', () => {
  it('쓸 원문을 그대로 보이고, 확정은 구조 없이 decision confirm만 보낸다', async () => {
    const box = await renderCard(card())
    expect(within(box).getByText('프로젝트 헌장 초안')).toBeTruthy()
    expect(box.querySelector('pre')?.textContent).toBe(PREVIEW)
    await click(button(box, '확정'))
    expect(api.loopAnswerCard).toHaveBeenCalledWith({ cwd: CWD, requestId: 'taste-1', response: { kind: 'taste', decision: 'confirm' } })
    expect(button(box, '확정').disabled).toBe(true)
    expect(api.loopDecide).not.toHaveBeenCalled()
  })

  it('반려는 이유 한 줄이 있어야 켜지고, 그 이유를 실어 보낸다', async () => {
    const box = await renderCard(card())
    expect(button(box, '반려').disabled).toBe(true)
    const input = within(box).getByRole('textbox', { name: '반려 이유' })
    await act(async () => { fireEvent.change(input, { target: { value: '  하지 않을 것이 빠졌다  ' } }) })
    await click(button(box, '반려'))
    expect(api.loopAnswerCard).toHaveBeenCalledWith({ cwd: CWD, requestId: 'taste-1', response: { kind: 'taste', decision: 'reject', reason: '하지 않을 것이 빠졌다' } })
  })

  it('확정하는 중이면 두 버튼이 꺼지고, 거절된 확정은 이유를 보이며 다시 누를 수 있다', async () => {
    const busy = await renderCard(card({ confirming: true }))
    expect(within(busy).getByText(/확정하는 중/)).toBeTruthy()
    expect(button(busy, '확정').disabled).toBe(true)
    expect(button(busy, '반려').disabled).toBe(true)
    cleanup()
    const refused = await renderCard(card({ refused: '커밋하지 않은 변경이 있다' }))
    expect(within(refused).getByText(/커밋하지 않은 변경이 있다/)).toBeTruthy()
    expect(button(refused, '확정').disabled).toBe(false)
  })

  it('받아지지 않은 확정은 버튼을 되살리고 사유를 보인다', async () => {
    const box = await renderCard(card())
    api.loopAnswerCard.mockResolvedValue({ ok: false })
    await click(button(box, '확정'))
    expect(button(box, '확정').disabled).toBe(false)
    expect(within(screen.getByRole('region', { name: '메인 대화' })).getByText(/받아지지 않았어요/)).toBeTruthy()
  })
})

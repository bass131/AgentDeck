// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { MainChatView, TasteDocsRead } from '@shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const mv = (over: Partial<MainChatView> = {}): MainChatView => ({
  cwd: CWD, root: CWD, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0, ...over,
})
const ABSENT: TasteDocsRead = {
  global: { absent: true, path: 'C:\\ud\\taste\\global.md' },
  charter: { absent: true, path: `${CWD}\\docs\\agentdeck\\헌장.md` },
  project: { absent: true, path: `${CWD}\\docs\\agentdeck\\taste.md` },
}
const OK: TasteDocsRead = {
  global: {
    absent: false, path: 'C:\\ud\\taste\\global.md', raw: '# 전역 Taste\n', problems: [],
    doc: { scope: 'global', items: [{ id: 'T1', title: '정보 밀도', fields: [{ name: '원칙', text: '한 화면에 카드 여섯 장 이상' }] }] },
  },
  charter: { absent: false, path: `${CWD}\\docs\\agentdeck\\헌장.md`, raw: '# 프로젝트 헌장\n', problems: [], doc: { goal: ['에이전트가 끝까지 맡는다.'], nonGoals: ['- 클라우드 동기화'] } },
  project: ABSENT.project,
}
const BROKEN: TasteDocsRead = {
  ...OK,
  global: {
    absent: false, path: 'C:\\ud\\taste\\global.md', raw: '# 전역\n아무 글\n', doc: { scope: 'global', items: [] },
    problems: [{ kind: 'bad-head', line: 1, message: '첫 줄은 「# 전역 Taste」여야 한다' }],
  },
}

type Fn = ReturnType<typeof vi.fn>
let api: Record<string, Fn>
let mainHandlers: Set<(v: MainChatView) => void>

function install(docs: TasteDocsRead): void {
  mainHandlers = new Set()
  api = {
    tasteRead: vi.fn().mockResolvedValue(docs),
    loopTasteOpen: vi.fn().mockResolvedValue({ ok: true, view: mv() }),
    loopMainSend: vi.fn(),
    onLoopMainState: vi.fn((cb: (v: MainChatView) => void) => { mainHandlers.add(cb); return () => mainHandlers.delete(cb) }),
  }
  Object.defineProperty(window, 'api', { value: adaptFlatApi(api), writable: true, configurable: true })
}

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const click = async (el: HTMLElement): Promise<void> => { await act(async () => { fireEvent.click(el) }); await flush() }
const panel = (): HTMLElement => screen.getByRole('region', { name: '헌장·Taste' })
const doc = (name: string): HTMLElement => within(panel()).getByRole('region', { name })

async function renderPanel(docs: TasteDocsRead, onOpened = vi.fn()): Promise<Fn> {
  install(docs)
  const { TastePanel } = await import('@renderer/13_Loop/TastePanel')
  render(<TastePanel cwd={CWD} onOpened={onOpened} />)
  await flush()
  return onOpened
}

afterEach(() => cleanup())
beforeEach(() => { document.body.innerHTML = '' })

describe('「헌장·Taste」 보기', () => {
  it('없는 문서는 없다고 보이고, 전역 Taste나 헌장이 없을 때만 힌트를 보인다. 여는 것만으로는 아무 턴도 보내지 않는다', async () => {
    await renderPanel(ABSENT)
    expect(api.tasteRead).toHaveBeenCalledWith({ cwd: CWD })
    for (const name of ['전역 Taste', '프로젝트 헌장', '프로젝트 Taste']) expect(within(doc(name)).getByText(/아직 없어요/)).toBeTruthy()
    const hint = within(panel()).getByRole('note')
    expect(hint.textContent).toContain('전역 Taste')
    expect(hint.textContent).toContain('프로젝트 헌장')
    expect(api.loopTasteOpen).not.toHaveBeenCalled()
    expect(api.loopMainSend).not.toHaveBeenCalled()
    expect(within(panel()).queryByRole('textbox')).toBeNull()
  })

  it('바른 문서는 항목과 절을 구조로 보이고, 둘 다 있으면 힌트가 없다', async () => {
    await renderPanel(OK)
    expect(within(doc('전역 Taste')).getByText('T1 정보 밀도')).toBeTruthy()
    expect(within(doc('전역 Taste')).getByText('한 화면에 카드 여섯 장 이상')).toBeTruthy()
    expect(within(doc('프로젝트 헌장')).getByText('에이전트가 끝까지 맡는다.')).toBeTruthy()
    expect(within(doc('프로젝트 헌장')).getByText('- 클라우드 동기화')).toBeTruthy()
    expect(within(panel()).queryByRole('note')).toBeNull()
  })

  it('문제가 있는 문서는 문제 줄과 원문을 보인다', async () => {
    await renderPanel(BROKEN)
    const g = doc('전역 Taste')
    expect(within(g).getByText(/1줄 — 첫 줄은 「# 전역 Taste」여야 한다/)).toBeTruthy()
    expect(g.querySelector('pre')?.textContent).toBe('# 전역\n아무 글\n')
  })

  it('「문답 열기」는 범위만 실어 tasteOpen을 부르고, 받아지면 메인 대화로 간다. 거절되면 이유를 보인다', async () => {
    const onOpened = await renderPanel(ABSENT)
    await click(within(panel()).getByRole('button', { name: '헌장·Taste 문답 열기' }))
    expect(api.loopTasteOpen).toHaveBeenCalledWith({ cwd: CWD, scope: 'project' })
    expect(onOpened).toHaveBeenCalledTimes(1)
    api.loopTasteOpen.mockResolvedValue({ ok: false, reason: '루프가 열려 있지 않다', view: mv() })
    await click(within(panel()).getByRole('button', { name: '전역 Taste 문답 열기' }))
    expect(api.loopTasteOpen).toHaveBeenLastCalledWith({ cwd: CWD, scope: 'global' })
    expect(onOpened).toHaveBeenCalledTimes(1)
    expect(within(panel()).getByText(/루프가 열려 있지 않다/)).toBeTruthy()
  })

  it('메인 대화의 문서 카드가 바뀌면 다시 읽는다', async () => {
    await renderPanel(ABSENT)
    expect(api.tasteRead).toHaveBeenCalledTimes(1)
    await act(async () => { for (const h of [...mainHandlers]) h(mv()) })
    await flush()
    expect(api.tasteRead).toHaveBeenCalledTimes(1)
    const card = { kind: 'taste' as const, requestId: 'taste-1', node: 'main', goal: null, text: '전역 Taste 초안', draft: { doc: 'global-taste' as const, items: [] }, preview: '' }
    await act(async () => { for (const h of [...mainHandlers]) h(mv({ cards: [card] })) })
    await flush()
    await act(async () => { for (const h of [...mainHandlers]) h(mv()) })
    await flush()
    expect(api.tasteRead).toHaveBeenCalledTimes(3)
  })
})

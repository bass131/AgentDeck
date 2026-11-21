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

function install(docs: TasteDocsRead, view: MainChatView = mv()): void {
  mainHandlers = new Set()
  api = {
    tasteRead: vi.fn().mockResolvedValue(docs),
    loopMainRead: vi.fn().mockResolvedValue(view),
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

async function renderPanel(docs: TasteDocsRead, onOpened = vi.fn(), view: MainChatView = mv()): Promise<Fn> {
  install(docs, view)
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

  it('확정이 연 PR이 아직 로컬에 들어오지 않았으면 그 PR을 보이고, 그 문서는 없다고 재촉하지 않는다', async () => {
    const text = '# 프로젝트 헌장\n\n## 목표\n\n에이전트가 끝까지 맡는다.\n'
    const pr = { pr: 4, branch: 'agentdeck/charter-20261121T050000', doc: 'charter' as const, text }
    await renderPanel(ABSENT, vi.fn(), mv({ tastePr: pr }))
    expect(within(panel()).getByText(/PR #4/).textContent).toContain('프로젝트 헌장')
    const hint = within(panel()).getByRole('note')
    expect(hint.textContent).toContain('전역 Taste')
    expect(hint.textContent).not.toContain('프로젝트 헌장')
    cleanup()
    const merged: TasteDocsRead = { ...OK, charter: { ...OK.charter, raw: text } as TasteDocsRead['charter'] }
    await renderPanel(merged, vi.fn(), mv({ tastePr: pr }))
    expect(within(panel()).queryByText(/PR #4/)).toBeNull()
  })

  it('CRLF로 체크아웃된 같은 원문(BOM·줄 끝 공백 포함)도 들어온 것으로 본다', async () => {
    const text = '# 프로젝트 헌장\n\n## 목표\n\n에이전트가 끝까지 맡는다.\n'
    const pr = { pr: 4, branch: 'agentdeck/charter-20261121T050000', doc: 'charter' as const, text }
    const crlf: TasteDocsRead = { ...OK, charter: { ...OK.charter, raw: `${String.fromCharCode(0xfeff)}${text.replace(/\n/g, '  \r\n')}` } as TasteDocsRead['charter'] }
    await renderPanel(crlf, vi.fn(), mv({ tastePr: pr }))
    expect(within(panel()).queryByText(/PR #4/)).toBeNull()
  })

  it('PR 기록이 사라지면(병합 없이 닫힘) 배너를 걷고 헌장 재촉을 다시 보인다. 문서를 모르는 PR은 문서 이름 없이 보인다', async () => {
    const pr = { pr: 4, branch: 'agentdeck/charter-20261121T050000', doc: 'charter' as const, text: '# 프로젝트 헌장\n' }
    await renderPanel(ABSENT, vi.fn(), mv({ tastePr: pr }))
    expect(within(panel()).getByText(/PR #4/)).toBeTruthy()
    expect(within(panel()).getByRole('note').textContent).not.toContain('프로젝트 헌장')
    await act(async () => { for (const h of [...mainHandlers]) h(mv()) })
    await flush()
    expect(within(panel()).queryByText(/PR #4/)).toBeNull()
    expect(within(panel()).getByRole('note').textContent).toContain('프로젝트 헌장')
    await act(async () => { for (const h of [...mainHandlers]) h(mv({ tastePr: { pr: 5, branch: 'agentdeck/charter-x' } })) })
    await flush()
    expect(within(panel()).getByText(/PR #5/).textContent).toContain('문서 확정 PR #5(agentdeck/charter-x)')
    expect(within(panel()).getByRole('note').textContent).toContain('프로젝트 헌장')
  })

  it('읽기 오류는 다시 읽어 성공하면 걷히고, 문답 열기 오류와 따로 보인다', async () => {
    install(ABSENT)
    api.tasteRead.mockRejectedValueOnce(new Error('읽기 실패'))
    const { TastePanel } = await import('@renderer/13_Loop/TastePanel')
    render(<TastePanel cwd={CWD} onOpened={vi.fn()} />)
    await flush()
    expect(within(panel()).getByText(/읽기 실패/)).toBeTruthy()
    api.loopTasteOpen.mockResolvedValue({ ok: false, reason: '루프가 닫혔다', view: mv() })
    await click(within(panel()).getByRole('button', { name: '전역 Taste 문답 열기' }))
    expect(within(panel()).getByText(/읽기 실패/)).toBeTruthy()
    expect(within(panel()).getByText(/루프가 닫혔다/)).toBeTruthy()
    const card = { kind: 'taste' as const, requestId: 'taste-1', node: 'main', goal: null, text: '초안', draft: { doc: 'global-taste' as const, items: [] }, preview: '' }
    await act(async () => { for (const h of [...mainHandlers]) h(mv({ cards: [card] })) })
    await flush()
    expect(within(panel()).queryByText(/읽기 실패/)).toBeNull()
    expect(within(panel()).getByText(/루프가 닫혔다/)).toBeTruthy()
    expect(doc('전역 Taste')).toBeTruthy()
  })
})

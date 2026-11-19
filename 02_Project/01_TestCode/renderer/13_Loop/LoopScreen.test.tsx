// @vitest-environment jsdom
// M09 G4 루프 화면 — 폴더 고르기·열기·시작·닫기가 맞는 loop IPC로 가고, 상태는 loop.status와 loop.state push로 받는다.
// 다른 저장소의 push는 버리고, 호출 중에 push가 오면 늦게 온 응답의 상태로 덮지 않는다. goal 목록과 지금 노드를 보인다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { useState, type JSX } from 'react'
import fs from 'node:fs'
import path from 'node:path'
import type { LoopStatus } from '../../../../02_Project/00_Source/shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'

const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'not-started', milestoneId: null, node: null, nodeTitle: null, reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], ...over,
})

type Fn = ReturnType<typeof vi.fn>
let api: Record<string, Fn>
let handlers: Set<(s: LoopStatus) => void>

function install(initial: LoopStatus = st({ phase: 'closed', root: null })): void {
  handlers = new Set()
  api = {
    loopOpen: vi.fn().mockResolvedValue(st()),
    loopStart: vi.fn().mockResolvedValue(st({ phase: 'running', milestoneId: 'M01' })),
    loopStatus: vi.fn().mockResolvedValue(initial),
    loopDecide: vi.fn(),
    loopAnswerCard: vi.fn().mockResolvedValue({ ok: true }),
    loopCancelSession: vi.fn().mockResolvedValue({ ok: true }),
    loopReleaseLatch: vi.fn(),
    loopClose: vi.fn().mockResolvedValue({ ok: true }),
    onLoopState: vi.fn((cb: (s: LoopStatus) => void) => {
      handlers.add(cb)
      return () => handlers.delete(cb)
    }),
    pickFolder: vi.fn().mockResolvedValue({ path: CWD }),
  }
  Object.defineProperty(window, 'api', {
    value: adaptFlatApi({ ...api, git: { prRead: vi.fn().mockResolvedValue({ ok: false, error: 'x' }), prMerge: vi.fn() } }),
    writable: true, configurable: true,
  })
}

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const emit = async (s: LoopStatus): Promise<void> => { await act(async () => { for (const h of [...handlers]) h(s) }) }
const btn = (name: string): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement

interface BoardProps {
  initialCwd?: string | null
  onCwdChange?: (c: string) => void
  onOpenSession?: (key: string) => void
  onOpenMain?: () => void
}
async function renderScreen(props: BoardProps = {}) {
  const { StatusBoard } = await import('@renderer/13_Loop')
  function Harness(): JSX.Element {
    const [cwd, setCwd] = useState<string | null>(props.initialCwd === undefined ? CWD : props.initialCwd)
    return (
      <StatusBoard
        cwd={cwd}
        onCwdChange={(c) => { setCwd(c); props.onCwdChange?.(c) }}
        onOpenSession={props.onOpenSession}
        onOpenMain={props.onOpenMain}
      />
    )
  }
  const r = render(<Harness />)
  await flush()
  return r
}

beforeEach(() => install())
afterEach(() => cleanup())

describe('루프 화면 — 폴더와 열기·시작·닫기 (M09 G4)', () => {
  it('폴더가 없으면 고르기만 할 수 있고, 고르면 기존 폴더 선택 길(workspace.pickFolder)로 받아 그 저장소의 상태를 읽는다', async () => {
    const onCwdChange = vi.fn()
    await renderScreen({ initialCwd: null, onCwdChange })
    expect(api.loopStatus).not.toHaveBeenCalled()
    expect(btn('열기').disabled).toBe(true)
    await act(async () => { fireEvent.click(btn('폴더 고르기')) })
    await flush()
    expect(api.pickFolder).toHaveBeenCalledTimes(1)
    expect(onCwdChange).toHaveBeenCalledWith(CWD)
    expect(api.loopStatus).toHaveBeenCalledWith({ cwd: CWD })
    expect(screen.getByText(CWD)).toBeTruthy()
    expect(btn('열기').disabled).toBe(false)
  })

  it('열기는 loop.open({cwd})를 부르고 응답 상태를 보인다', async () => {
    await renderScreen()
    expect(api.onLoopState).toHaveBeenCalledTimes(1)
    await act(async () => { fireEvent.click(btn('열기')) })
    await flush()
    expect(api.loopOpen).toHaveBeenCalledWith({ cwd: CWD })
    expect(screen.getByText('시작 전')).toBeTruthy()
  })

  it('시작은 입력한 마일스톤 id로 loop.start({cwd, milestoneId})를 부른다. id가 비면 버튼이 꺼진다', async () => {
    install(st())
    await renderScreen()
    expect(btn('시작').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('마일스톤 id'), { target: { value: ' M01 ' } })
    expect(btn('시작').disabled).toBe(false)
    await act(async () => { fireEvent.click(btn('시작')) })
    await flush()
    expect(api.loopStart).toHaveBeenCalledWith({ cwd: CWD, milestoneId: 'M01' })
    expect(screen.getByText('도는 중')).toBeTruthy()
  })

  it('닫기는 loop.close({cwd})를 부르고 상태를 다시 읽는다', async () => {
    install(st())
    await renderScreen()
    api.loopStatus.mockResolvedValue(st({ phase: 'closed', root: null }))
    await act(async () => { fireEvent.click(btn('루프 닫기')) })
    await flush()
    expect(api.loopClose).toHaveBeenCalledWith({ cwd: CWD })
    expect(api.loopStatus).toHaveBeenLastCalledWith({ cwd: CWD })
    expect(screen.getByText('닫힘')).toBeTruthy()
    expect(api.loopClose).toHaveBeenCalledTimes(1)
  })

  // M10 G1 — 루프 화면은 작업 모드의 몸체다. 모달·화면 닫기 버튼·Esc 닫기가 없고, 사라지는 것(모드 전환)은 루프를 닫지 않는다.
  it('모달이 아니다 — 겹침 창·화면 닫기 버튼이 없고, 화면이 내려가도 loop.close를 부르지 않는다', async () => {
    install(st())
    const r = await renderScreen()
    expect(r.container.querySelector('.status-board')).not.toBeNull()
    expect(document.querySelector('.modal-overlay, .loop-overlay')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: '화면 닫기' })).toBeNull()
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(r.container.querySelector('.status-board')).not.toBeNull()
    r.unmount()
    expect(api.loopClose).not.toHaveBeenCalled()
  })

  it('호출이 거부(throw)되면 사유를 보이고 버튼을 다시 켠다', async () => {
    api.loopOpen.mockRejectedValue(new Error('loop.open: cwd는 절대 경로여야 한다'))
    await renderScreen()
    await act(async () => { fireEvent.click(btn('열기')) })
    await flush()
    expect(screen.getByText(/cwd는 절대 경로여야 한다/)).toBeTruthy()
    expect(btn('열기').disabled).toBe(false)
  })

  // G4 검수 5 — 옛 폴더의 호출이 도는 동안 폴더를 바꾸면, 그 호출의 바쁨·오류·끝이 새 폴더 현황판에 번지지 않는다
  it('호출 중에 폴더가 바뀌면 옛 호출의 바쁨·오류가 새 폴더로 넘어가지 않고, 옛 호출의 끝이 새 호출의 바쁨을 풀지 않는다', async () => {
    const OTHER = 'C:\\work\\other'
    let rejectOld!: (e: Error) => void
    let resolveNew!: (s: LoopStatus) => void
    api.loopStatus.mockImplementation(async ({ cwd }: { cwd: string }) => st({ cwd, phase: 'closed', root: null }))
    api.loopOpen
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectOld = rej }))
      .mockImplementationOnce(() => new Promise((res) => { resolveNew = res }))
    const { StatusBoard } = await import('@renderer/13_Loop')
    const noop = (): void => {}
    const r = render(<StatusBoard cwd={CWD} onCwdChange={noop} />)
    await flush()
    await act(async () => { fireEvent.click(btn('열기')) })
    expect(btn('폴더 고르기').disabled).toBe(true)
    r.rerender(<StatusBoard cwd={OTHER} onCwdChange={noop} />)
    await flush()
    expect(btn('폴더 고르기').disabled).toBe(false)
    await act(async () => { fireEvent.click(btn('열기')) })
    expect(api.loopOpen).toHaveBeenLastCalledWith({ cwd: OTHER })
    expect(btn('폴더 고르기').disabled).toBe(true)
    await act(async () => { rejectOld(new Error('옛 폴더의 오류')) })
    await flush()
    expect(screen.queryByText('옛 폴더의 오류')).toBeNull()
    expect(btn('폴더 고르기').disabled).toBe(true)
    await act(async () => { resolveNew(st({ cwd: OTHER })) })
    await flush()
    expect(btn('폴더 고르기').disabled).toBe(false)
    expect(screen.getByText(OTHER)).toBeTruthy()
  })
})

describe('루프 화면 — 상태 push (M09 G4)', () => {
  it('같은 저장소의 push는 표기 차이(구분자·대소문자·끝 구분자)가 있어도 받고, 다른 저장소의 push는 버린다', async () => {
    install(st())
    await renderScreen()
    await emit(st({ cwd: 'C:\\work\\other', phase: 'done' }))
    expect(screen.queryByText('끝남')).toBeNull()
    expect(screen.getByText('시작 전')).toBeTruthy()
    await emit(st({ cwd: 'c:/work/practice/', phase: 'running' }))
    expect(screen.getByText('도는 중')).toBeTruthy()
  })

  it('호출 중에 이 저장소의 push가 오면, 늦게 온 응답의 상태로 덮지 않는다', async () => {
    let resolveOpen!: (s: LoopStatus) => void
    api.loopOpen.mockReturnValue(new Promise<LoopStatus>((r) => { resolveOpen = r }))
    await renderScreen()
    await act(async () => { fireEvent.click(btn('열기')) })
    await emit(st({ phase: 'running', node: 'brainstorm' }))
    await act(async () => { resolveOpen(st({ phase: 'not-started' })) })
    await flush()
    expect(screen.getByText('도는 중')).toBeTruthy()
    expect(screen.queryByText('시작 전')).toBeNull()
  })

  it('화면이 사라지면 push 구독을 푼다', async () => {
    const r = await renderScreen()
    expect(handlers.size).toBe(1)
    r.unmount()
    expect(handlers.size).toBe(0)
  })
})

describe('루프 화면 — goal 목록과 지금 노드 (M09 G4)', () => {
  it('마일스톤 id, 지금 노드와 제목, 기준 브랜치, FAIL 수, goal의 상태·등급·PR을 보인다', async () => {
    install(st({
      phase: 'running', milestoneId: 'M01', node: 'G1/implement', nodeTitle: '구현', failCount: 1,
      goals: [
        { id: 'G1', title: '첫 goal', status: 'active', grade: 'strong', pr: 12 },
        { id: 'G2', title: '둘째 goal', status: 'pending', grade: null, pr: null },
      ],
    }))
    await renderScreen()
    expect(screen.getByText('M01')).toBeTruthy()
    expect(screen.getByText('G1/implement')).toBeTruthy()
    expect(screen.getByText('구현')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('FAIL 1')).toBeTruthy()
    const items = screen.getAllByRole('listitem').filter((li) => li.classList.contains('loop-goal'))
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('G1')
    expect(items[0].textContent).toContain('첫 goal')
    expect(items[0].textContent).toContain('진행')
    expect(items[0].textContent).toContain('강')
    expect(items[0].textContent).toContain('#12')
    expect(items[1].textContent).toContain('대기')
  })
})

describe('루프 화면 — 껍데기 (M09 G4)', () => {
  // M10 G1 — 루프 화면은 「작업」 모드의 가운데 칸이라 모달이 아니다. 전역 단축키가 모달로 보면 작업 모드의 단축키가 막힌다.
  // Esc가 뒤 대화의 실행을 멈추지 않는 것은 Shell의 Esc 처리가 채팅 배치에서만 도는 것으로 지킨다(panelSession.difference-pins B2).
  it('화면이 떠 있어도 전역 단축키는 모달로 보지 않는다(모달 아님)', async () => {
    const { isAnyModalOpen } = await import('@renderer/12_Window/useGlobalShortcuts')
    await renderScreen()
    expect(isAnyModalOpen()).toBe(false)
  })

  it('13_Loop 소스에는 병합을 부르는 길이 없다 — 병합은 PR 카드의 「병합」 버튼뿐이다', () => {
    // jsdom 환경의 import.meta.url은 file: 꼴이 아니다 — 시험 파일 자리(__dirname)에서 소스 자리를 잡는다
    const dir = path.resolve(__dirname, '../../../00_Source/renderer/src/13_Loop')
    const files = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/prMerge|gh pr merge|\/merges?\b/)
    }
  })

  it('현황판이 부르는 loop 호출은 루프 화면의 것 그대로다 — 판정은 decide·releaseLatch·answerCard·cancelSession뿐이다', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../00_Source/renderer/src/13_Loop/LoopScreen.tsx'), 'utf8')
    const calls = new Set([...src.matchAll(/ipc\.loop\.(\w+)/g)].map((m) => m[1]))
    expect([...calls].sort()).toEqual(['answerCard', 'cancelSession', 'close', 'decide', 'onState', 'open', 'releaseLatch', 'start', 'status'])
  })
})

describe('현황판 여섯 칸 (M10 G4)', () => {
  const full = st({
    phase: 'running', milestoneId: 'M02', node: 'G2/implement', nodeTitle: '구현', failCount: 1,
    lastVerdict: { node: 'G1/review', verdict: 'pass', evidence: '검수 통과' },
    goals: [
      { id: 'G1', title: '요청기와 타임아웃', status: 'done', grade: 'strong', pr: 4 },
      { id: 'G2', title: '결과 표', status: 'active', grade: 'weak', pr: null },
    ],
    sessions: [
      { key: 'w.1', kind: 'review', node: 'review', goal: 'G1', live: false },
      { key: 'w.2', kind: 'work', node: 'implement', goal: 'G2', live: true },
    ],
    recentLines: [
      { marker: 'PASS', at: '2026-11-19T05:24:00Z', node: 'review', goal: 'G1', sentence: '독립 검수 통과' },
      { marker: 'FAIL', at: '2026-11-19T05:40:00Z', node: 'checks', goal: 'G2', sentence: 'npm test 실패' },
    ],
    sessionActive: true,
  })
  const box = (name: string): HTMLElement => screen.getByRole('region', { name })

  it('여섯 칸이 순서대로 있고, 칸마다 상태의 값이 보인다', async () => {
    install(full)
    await renderScreen()
    const names = [...document.querySelectorAll('.status-board > .board-body > .board-box')].map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['마일스톤', '기다리는 결정', 'goal', '노드 세션', 'PR', '검증 기록'])
    const ms = box('마일스톤')
    expect(within(ms).getByText('M02')).toBeTruthy()
    expect(within(ms).getByText('G2/implement')).toBeTruthy()
    expect(within(ms).getByText('FAIL 1')).toBeTruthy()
    expect(within(ms).getByText('goal 1/2 끝')).toBeTruthy()
    expect(within(box('goal')).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('요청기와 타임아웃'), expect.stringContaining('결과 표'),
    ])
    const rows = within(box('노드 세션')).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('G1 review · 검수'), expect.stringContaining('G2 implement · 작업')])
    expect(rows[1].getAttribute('data-live')).toBe('true')
    expect(within(box('기다리는 결정')).getByText('지금 네 손이 필요한 일은 없어')).toBeTruthy()
    expect(within(box('PR')).getByText('G1 #4')).toBeTruthy()
    const lines = within(box('검증 기록')).getAllByRole('listitem')
    expect(lines.map((l) => l.getAttribute('data-marker'))).toEqual(['PASS', 'FAIL'])
    expect(lines[1].textContent).toContain('G2 checks')
    expect(lines[1].textContent).toContain('npm test 실패')
  })

  it('노드 세션 줄의 「열기」는 그 세션 key로 탭을 연다', async () => {
    install(full)
    const onOpenSession = vi.fn()
    await renderScreen({ onOpenSession })
    const rows = within(box('노드 세션')).getAllByRole('listitem')
    await act(async () => { fireEvent.click(within(rows[0]).getByRole('button', { name: '열기' })) })
    expect(onOpenSession).toHaveBeenCalledWith('w.1')
  })

  it('브레인스토밍(메인 노드) 중에는 작업 세션 취소가 없고, 노드 세션 칸은 메인 대화 줄을 보인다 (Backlog 14)', async () => {
    install(st({ phase: 'running', milestoneId: 'M02', node: 'brainstorm', mainNode: true, sessionActive: true, mainBusy: true }))
    const onOpenMain = vi.fn()
    await renderScreen({ onOpenMain })
    expect(screen.queryByRole('button', { name: '작업 세션 취소' })).toBeNull()
    const nodes = box('노드 세션')
    expect(within(nodes).getByText('메인 · 브레인스토밍')).toBeTruthy()
    await act(async () => { fireEvent.click(within(nodes).getByRole('button', { name: '열기' })) })
    expect(onOpenMain).toHaveBeenCalledTimes(1)
    // 같은 상태에서 메인 노드가 아니면 작업 세션 취소가 보인다
    await emit(st({ phase: 'running', milestoneId: 'M02', node: 'G2/implement', mainNode: false, sessionActive: true }))
    expect(screen.getByRole('button', { name: '작업 세션 취소' })).toBeTruthy()
  })

  it('비어 있는 칸은 빈 글을 보인다 — goal 없음, 노드 세션 없음, 열린 PR 없음, 검증 기록 없음', async () => {
    install(st({ phase: 'not-started' }))
    await renderScreen()
    expect(within(box('goal')).getByText('아직 goal이 없어')).toBeTruthy()
    expect(within(box('노드 세션')).getByText('돌고 있는 노드 없음')).toBeTruthy()
    expect(within(box('PR')).getByText('열린 PR이 없어')).toBeTruthy()
    expect(within(box('검증 기록')).getByText('(아직 없음)')).toBeTruthy()
  })
})

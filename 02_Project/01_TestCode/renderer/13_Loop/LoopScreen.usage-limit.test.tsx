// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { LoopLimitView, LoopStatus } from '@shared/ipcContract'
import { projectTag } from '@renderer/13_Loop/workModel'
import { foldSession } from '@renderer/13_Loop/sessionLogModel'
import type { AgentEvent } from '@shared/agentEvents'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const LIMIT: LoopLimitView = {
  reason: 'rejected', window: 'five_hour', resetsAt: '2026-11-21T10:00:00.000Z', resumeAt: '2026-11-21T10:02:00.000Z', utilization: null, human: false,
}
const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'limit', milestoneId: 'M01', node: 'G1/implement', nodeTitle: null, reason: '사용량 한도(거부, five_hour 창)',
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: false, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [], limit: LIMIT, ...over,
})

type Fn = ReturnType<typeof vi.fn>
let api: Record<string, Fn>

async function renderScreen(initial: LoopStatus): Promise<void> {
  api = {
    loopOpen: vi.fn().mockResolvedValue(initial),
    loopStart: vi.fn().mockResolvedValue(initial),
    loopStatus: vi.fn().mockResolvedValue(initial),
    loopDecide: vi.fn().mockResolvedValue({ ok: true, status: st({ phase: 'running', limit: undefined }) }),
    loopAnswerCard: vi.fn().mockResolvedValue({ ok: true }),
    loopCancelSession: vi.fn().mockResolvedValue({ ok: true }),
    loopReleaseLatch: vi.fn(),
    loopClose: vi.fn().mockResolvedValue({ ok: true }),
    onLoopState: vi.fn(() => () => {}),
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
  }
  const git = { prRead: vi.fn().mockResolvedValue({ ok: false, error: 'x' }), prMerge: vi.fn() }
  Object.defineProperty(window, 'api', { value: adaptFlatApi({ ...api, git }), writable: true, configurable: true })
  const { StatusBoard } = await import('@renderer/13_Loop')
  render(<StatusBoard cwd={CWD} onCwdChange={() => {}} />)
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

afterEach(() => cleanup())
beforeEach(() => { document.body.innerHTML = '' })

describe('사용량 한도 멈춤의 화면', () => {
  it('「한도 멈춤」과 사유·풀리는 시각·스스로 이어 갈 시각·사용률(모름)을 보이고, 「지금 이어 가기」가 decide pass를 보낸다', async () => {
    await renderScreen(st())
    const line = screen.getByRole('status')
    expect(line.textContent).toContain('한도 멈춤')
    expect(line.textContent).toContain('사용량 한도(거부, five_hour 창)')
    const facts = screen.getByTestId('loop-limit')
    expect(facts.textContent).toContain('2026-11-21T10:00:00.000Z')
    expect(facts.textContent).toContain('2026-11-21T10:02:00.000Z')
    expect(facts.textContent).toContain('사용률 모름')
    expect(screen.queryByRole('button', { name: '이어 가기' })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '지금 이어 가기' })) })
    expect(api.loopDecide).toHaveBeenCalledTimes(1)
    expect(api.loopDecide.mock.calls[0][0]).toMatchObject({ cwd: CWD, verdict: 'pass', expectNode: 'G1/implement' })
  })

  it('사용률이 있으면 백분율로, 시각을 모르면 「모름」으로, 사람 기다림이면 스스로 이어 가지 않는다고 보인다', async () => {
    await renderScreen(st({ limit: { ...LIMIT, resetsAt: null, resumeAt: null, utilization: 0.93, human: true } }))
    const facts = screen.getByTestId('loop-limit')
    expect(facts.textContent).toContain('사용률 93%')
    expect(facts.textContent).toContain('풀리는 시각 모름')
    expect(facts.textContent).toContain('스스로 이어 가지 않는다')
  })

  it('작업 모드 꼬리표는 「한도 멈춤」이다', () => {
    expect(projectTag(st())).toEqual({ label: 'M01 · 한도 멈춤', tone: 'stop' })
  })

  // 실물 세션은 허용 사건도 내므로 노드 세션 보기에 한도 사건이 섞인다
  it('노드 세션 보기는 한도 사건을 그리지 않고 지나간다', () => {
    const base: AgentEvent[] = [{ type: 'text', delta: '일했다' }, { type: 'done' }]
    const mixed: AgentEvent[] = [
      { type: 'rate_limit', status: 'allowed', rateLimitType: 'seven_day', resetsAt: 1795518000 }, base[0], { type: 'rate_limit_error' }, base[1],
    ]
    expect(foldSession(mixed, false)).toEqual(foldSession(base, false))
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { AppState, ToolCard } from '../../../02_Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02_Source/shared/ipc/agent'
import { ToolCallCard } from '../../../02_Source/renderer/src/components/01_conversation/ToolCallCard'

const mockApi = {
  agentTaskStop: vi.fn().mockResolvedValue({ accepted: true }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const runId = 'run-p09'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

interface BgTaskState {
  taskId: string
  toolUseId?: string
  description?: string
  status: string
  tail: string
  truncated?: boolean
}

type CardWithBg = ToolCard & { background?: boolean; bgTask?: BgTaskState }

const TERMINAL_STATUSES = ['completed', 'failed', 'stopped', 'killed'] as const

const MAX_BG_TAIL_CHARS = 100_000

function allToolCards(state: AppState): CardWithBg[] {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools as CardWithBg[])
}

function findCard(state: AppState, id: string): CardWithBg | undefined {
  return allToolCards(state).find((c) => c.id === id)
}

const TASK_ID = 'b7hqf83vz'

function stateWithBgCard(): AppState {
  return applyAgentEvent(
    makeInitialState(),
    payload({
      type: 'tool_call',
      id: 'tc-bg',
      name: 'Bash',
      input: { command: 'npm run dev', run_in_background: true },
      background: true,
    })
  )
}

function bgStarted(toolUseId = 'tc-bg'): AgentEventPayload['event'] {
  return {
    type: 'bg_task',
    kind: 'started',
    taskId: TASK_ID,
    toolUseId,
    taskType: 'local_bash',
    description: 'dev server',
  }
}

function bgOutput(chunk: string, taskId = TASK_ID): AgentEventPayload['event'] {
  return { type: 'bg_task', kind: 'output', taskId, outputChunk: chunk }
}

const BG_VIEW_PATH = '../../../02_Source/renderer/src/components/01_conversation/BackgroundTaskView'

function mkBg(status: string, tail = 'tick-1\ntick-2\n'): BgTaskState {
  return { taskId: TASK_ID, toolUseId: 'tc-bg', description: 'dev server', status, tail }
}

describe('GAP1 P09 — reducer tool_call.background 카드 보존', () => {
  it('background:true tool_call → card.background 보존 (RED)', () => {
    const card = findCard(stateWithBgCard(), 'tc-bg')
    expect(card).toBeTruthy()
    expect(card?.background).toBe(true)
    expect(card?.status).toBe('running')
    expect(card?.name).toBe('Bash')
  })

  it('대조군(GREEN 핀): background 미지정 tool_call → card.background undefined(포그라운드)', () => {
    const state = applyAgentEvent(
      makeInitialState(),
      payload({ type: 'tool_call', id: 'tc-fg', name: 'Bash', input: { command: 'ls' } })
    )
    expect(findCard(state, 'tc-fg')?.background).toBeUndefined()
  })
})

describe("GAP1 P09 — reducer 'bg_task' 카드 부착·갱신 (RED)", () => {
  it("kind:'started' → toolUseId 매칭 카드에 bgTask 생성(tail:'' · 비터미널 status · 기존 필드 불변)", () => {
    const next = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    const card = findCard(next, 'tc-bg')
    const bg = card?.bgTask
    expect(bg).toBeDefined()
    expect(bg?.taskId).toBe(TASK_ID)
    expect(bg?.description).toBe('dev server')
    expect(bg?.tail).toBe('')
    expect(TERMINAL_STATUSES.includes((bg?.status ?? 'completed') as (typeof TERMINAL_STATUSES)[number])).toBe(false)
    expect(card?.status).toBe('running')
  })

  it("kind:'output' ×2 → outputChunk를 순서대로 tail에 이어붙임(taskId 역인덱스)", () => {
    let s = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    s = applyAgentEvent(s, payload(bgOutput('tick-1\n')))
    s = applyAgentEvent(s, payload(bgOutput('tick-2\n')))
    expect(findCard(s, 'tc-bg')?.bgTask?.tail).toBe('tick-1\ntick-2\n')
  })

  it('tail 누적 상한(MAX_BG_TAIL_CHARS=100_000자) — 초과 시 앞부분 절단·최신 로그 유지', () => {
    let s = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    s = applyAgentEvent(s, payload(bgOutput('A'.repeat(60_000))))
    s = applyAgentEvent(s, payload(bgOutput('B'.repeat(60_000))))
    const tail = findCard(s, 'tc-bg')?.bgTask?.tail ?? ''
    expect(tail.length).toBeLessThanOrEqual(MAX_BG_TAIL_CHARS)
    expect(tail.endsWith('B'.repeat(1_000))).toBe(true)
  })

  it('outputTruncated:true 조각 → bgTask.truncated=true(절단 표시 전달)', () => {
    let s = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    s = applyAgentEvent(
      s,
      payload({ type: 'bg_task', kind: 'output', taskId: TASK_ID, outputChunk: 'x', outputTruncated: true })
    )
    expect(findCard(s, 'tc-bg')?.bgTask?.truncated).toBe(true)
  })

  it("kind:'updated' → patch.status로 status 갱신(taskId 역인덱스 — toolUseId 없음)", () => {
    let s = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    s = applyAgentEvent(
      s,
      payload({ type: 'bg_task', kind: 'updated', taskId: TASK_ID, patch: { status: 'killed', endTime: 1783947441873 } })
    )
    expect(findCard(s, 'tc-bg')?.bgTask?.status).toBe('killed')
  })

  it("kind:'notification' → status 갱신(stopped)", () => {
    let s = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    s = applyAgentEvent(
      s,
      payload({
        type: 'bg_task',
        kind: 'notification',
        taskId: TASK_ID,
        toolUseId: 'tc-bg',
        status: 'stopped',
        outputFile: 'C:\\tmp\\tasks\\b7hqf83vz.output',
        summary: 'dev server',
      })
    )
    expect(findCard(s, 'tc-bg')?.bgTask?.status).toBe('stopped')
  })

  it("미지 taskId의 output → no-op(기존 bgTask.tail 불변·throw 없음)", () => {
    let s = applyAgentEvent(stateWithBgCard(), payload(bgStarted()))
    s = applyAgentEvent(s, payload(bgOutput('stray\n', 'unknown-task-id')))
    const bg = findCard(s, 'tc-bg')?.bgTask
    expect(bg).toBeDefined()
    expect(bg?.tail).toBe('')
  })

  it("대조군(GREEN 핀): 미매칭 toolUseId의 started → 어떤 카드에도 bgTask 부착 없음·throw 없음", () => {
    const next = applyAgentEvent(stateWithBgCard(), payload(bgStarted('tc-없는-카드')))
    for (const card of allToolCards(next)) {
      expect(card.bgTask).toBeUndefined()
    }
  })
})

describe('GAP1 P09 — BackgroundTaskView tail 뷰·정지 버튼 (RED)', () => {
  it('tail 로그 뷰([data-testid="bg-tail-view"])에 tail 내용 렌더', async () => {
    const { BackgroundTaskView } = await import(BG_VIEW_PATH)
    const { container } = render(<BackgroundTaskView bgTask={mkBg('running')} runId={runId} />)

    const view = container.querySelector('[data-testid="bg-tail-view"]')
    expect(view).toBeTruthy()
    expect(view?.textContent).toContain('tick-1')
    expect(view?.textContent).toContain('tick-2')
  })

  it('실행 중(running) → 정지 버튼 렌더 + 클릭 → window.api.agentTaskStop({runId, taskId})', async () => {
    const { BackgroundTaskView } = await import(BG_VIEW_PATH)
    const { container } = render(<BackgroundTaskView bgTask={mkBg('running')} runId={runId} />)

    const btn = container.querySelector('[data-testid="bg-stop-btn"]') as HTMLElement
    expect(btn).toBeTruthy()
    fireEvent.click(btn)

    expect(mockApi.agentTaskStop).toHaveBeenCalledTimes(1)
    expect(mockApi.agentTaskStop).toHaveBeenCalledWith({ runId, taskId: TASK_ID })
  })

  it("비터미널 status('pending')에도 정지 버튼 렌더(실행 중 판정 = TERMINAL 집합 부정)", async () => {
    const { BackgroundTaskView } = await import(BG_VIEW_PATH)
    const { container } = render(<BackgroundTaskView bgTask={mkBg('pending')} runId={runId} />)
    expect(container.querySelector('[data-testid="bg-stop-btn"]')).toBeTruthy()
  })

  it.each(TERMINAL_STATUSES)(
    "종료 status '%s' → 정지 버튼 미표시 + tail 뷰는 유지(종료 후 로그 보존 표시)",
    async (status) => {
      const { BackgroundTaskView } = await import(BG_VIEW_PATH)
      const { container } = render(<BackgroundTaskView bgTask={mkBg(status)} runId={runId} />)
      expect(container.querySelector('[data-testid="bg-stop-btn"]')).toBeFalsy()
      expect(container.querySelector('[data-testid="bg-tail-view"]')).toBeTruthy()
    }
  )
})

describe('GAP1 P09 — ToolCallCard 배경 셸 배지·bgTask 배선', () => {
  it('card.background=true → 배지([data-testid="bg-badge"])를 클릭 없이 행에 렌더 (RED)', () => {
    const card: CardWithBg = {
      id: 'tc-bg',
      name: 'Bash',
      input: { command: 'npm run dev', run_in_background: true },
      status: 'running',
      background: true,
    }
    const { container } = render(<ToolCallCard card={card} />)
    expect(container.querySelector('[data-testid="bg-badge"]')).toBeTruthy()
  })

  it('card.bgTask 있음 → BackgroundTaskView([data-testid="bg-tail-view"])를 클릭 없이 상시 렌더 (RED)', () => {
    const card: CardWithBg = {
      id: 'tc-bg',
      name: 'Bash',
      input: { command: 'npm run dev', run_in_background: true },
      status: 'running',
      background: true,
      bgTask: mkBg('running'),
    }
    const { container } = render(<ToolCallCard card={card} />)
    expect(container.querySelector('[data-testid="bg-tail-view"]')).toBeTruthy()
  })

  it('폴백(GREEN 핀): background 미지정 카드 → 배지 없음(포그라운드 렌더 회귀 0)', () => {
    const card: ToolCard = {
      id: 'tc-fg',
      name: 'Bash',
      input: { command: 'ls' },
      status: 'running',
    }
    const { container } = render(<ToolCallCard card={card} />)
    expect(container.querySelector('[data-testid="bg-badge"]')).toBeFalsy()
  })

  it('폴백(GREEN 핀): bgTask 없는 카드 → tail 뷰 없음(기존 렌더 회귀 0)', () => {
    const card: ToolCard = {
      id: 'tc-fg2',
      name: 'Bash',
      input: { command: 'ls' },
      status: 'done',
      result: 'file-a\nfile-b',
    }
    const { container } = render(<ToolCallCard card={card} />)
    expect(container.querySelector('[data-testid="bg-tail-view"]')).toBeFalsy()
  })
})

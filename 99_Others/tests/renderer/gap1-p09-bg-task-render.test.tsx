// @vitest-environment jsdom
/**
 * gap1-p09-bg-task-render.test.tsx — GAP1 P09 배경 셸 배지·라이브 tail·정지 버튼 renderer RED (TDD 선행).
 *
 * 대상(R only — qa는 앱 소스 미편집, 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/store/reducer.ts           — case 'bg_task' 신설(현재 default 무시)
 *   02.Source/renderer/src/store/reducer/tool.ts      — tool_call.background 카드 보존 +
 *                                                       bg_task → 카드 bgTask 부착/갱신
 *   02.Source/renderer/src/store/reducer/types.ts     — ToolCard additive optional
 *                                                       `background?: boolean` · `bgTask?: BgTaskState`
 *   02.Source/renderer/src/components/01_conversation/BackgroundTaskView.tsx — 신규(현재 미존재)
 *   02.Source/renderer/src/components/01_conversation/ToolCallCard.tsx       — 배지·bgTask 배선
 *
 * 계약(interface-of-record — 구현이 여기에 맞춘다):
 *   [store] BgTaskState { taskId: string; toolUseId?: string; description?: string;
 *           status: string; tail: string; truncated?: boolean }
 *     · kind='started'      → toolUseId 매칭 카드에 bgTask 생성(taskId/description 매핑,
 *       tail:'' 초기화, status는 비터미널 값 — 아래 TERMINAL 집합에 속하지 않음).
 *     · kind='output'       → outputChunk를 tail에 이어붙임(taskId 역인덱스 — output
 *       이벤트에는 toolUseId 없음). 누적 상한 MAX_BG_TAIL_CHARS = 100_000자 — 초과 시
 *       **앞부분 절단**(최신 로그 유지). 이벤트 outputTruncated:true → bgTask.truncated=true.
 *     · kind='updated'      → patch.status로 status 갱신(taskId 역인덱스 — SDK 선언상
 *       toolUseId 없음).
 *     · kind='notification' → status 갱신.
 *     · 미매칭 toolUseId/taskId → no-op(throw 없음·어떤 카드에도 부착/변형 없음).
 *   [컴포넌트] BackgroundTaskView — named export, props { bgTask: BgTaskState; runId?: string }.
 *     · tail 로그 뷰 [data-testid="bg-tail-view"] (상태 무관 상시 — 종료 후에도 로그 보존 표시).
 *     · 실행 중(status가 TERMINAL('completed'|'failed'|'stopped'|'killed')이 아닐 때)에만
 *       정지 버튼 [data-testid="bg-stop-btn"] — 클릭 → window.api.agentTaskStop({runId, taskId}).
 *   [배선] ToolCallCard — card.background===true → 배지 [data-testid="bg-badge"](클릭 없이 행에
 *     상시) · card.bgTask 있으면 BackgroundTaskView 렌더(클릭 없이 상시 — 라이브 tail은
 *     접힘 뒤에 숨기지 않는다, 감사 T-01 일상 루프 요건). 미부여 카드는 기존 렌더 그대로(회귀 0).
 *
 * TDD 상태: RED.
 *   - reducer는 'bg_task'를 default(무시)로 흘려 background/bgTask 미부착 → 부착 단정 FAIL.
 *   - BackgroundTaskView 모듈 미존재 → dynamic import 에러 FAIL(P07/P08 선례).
 *   - ToolCallCard는 background/bgTask를 몰라 배지·뷰 미렌더 → 배선 단정 FAIL.
 *   - no-op·폴백 케이스는 현행 거동 그대로 GREEN(회귀 핀 — 구현 후에도 불변).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AppState, ToolCard } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc/agent'
import { ToolCallCard } from '../../../02.Source/renderer/src/components/01_conversation/ToolCallCard'

// ── window.api mock (bf3-p06 관례 — Object.defineProperty 주입) ────────────────────

const mockApi = {
  agentTaskStop: vi.fn().mockResolvedValue({ accepted: true }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────────

const runId = 'run-p09'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

/** 구현 예정 BgTaskState — 구현 전 구조적 타입 다리(P07/P08 선례, reducer/types.ts 예정 정의와 동형). */
interface BgTaskState {
  taskId: string
  toolUseId?: string
  description?: string
  status: string
  tail: string
  truncated?: boolean
}

/** ToolCard + 구현 예정 additive 필드(background/bgTask) — 구현 전 타입 다리. */
type CardWithBg = ToolCard & { background?: boolean; bgTask?: BgTaskState }

/** 종료 상태 집합 — 정지 버튼 비표시 판정(interface-of-record). */
const TERMINAL_STATUSES = ['completed', 'failed', 'stopped', 'killed'] as const

/** 누적 tail 상한(자) — 구현 상수 MAX_BG_TAIL_CHARS와 일치해야 함(합의 표면 100_000). */
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

/** background Bash tool_call까지 흘린 기저 상태. */
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

const BG_VIEW_PATH = '../../../02.Source/renderer/src/components/01_conversation/BackgroundTaskView'

function mkBg(status: string, tail = 'tick-1\ntick-2\n'): BgTaskState {
  return { taskId: TASK_ID, toolUseId: 'tc-bg', description: 'dev server', status, tail }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. store: tool_call.background 보존 + bg_task 카드 부착 (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GAP1 P09 — reducer tool_call.background 카드 보존', () => {
  it('background:true tool_call → card.background 보존 (RED)', () => {
    const card = findCard(stateWithBgCard(), 'tc-bg')
    expect(card).toBeTruthy()
    // RED: 현행 handleToolCall은 id/name/input/status만 복사 — background 탈락.
    expect(card?.background).toBe(true)
    // 기존 필드 회귀 0.
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
    // RED: 현행 reducer는 'bg_task'를 default(무시)로 흘림 → bgTask undefined.
    expect(bg).toBeDefined()
    expect(bg?.taskId).toBe(TASK_ID)
    expect(bg?.description).toBe('dev server')
    expect(bg?.tail).toBe('')
    // started 직후는 실행 중 — 정지 버튼 게이트(TERMINAL 아님)와 정합.
    expect(TERMINAL_STATUSES.includes((bg?.status ?? 'completed') as (typeof TERMINAL_STATUSES)[number])).toBe(false)
    // 부착만 — tool_call이 채운 기존 필드는 그대로.
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
    // 상한 준수(장시간 dev 서버 로그의 메모리·렌더 성능 보호).
    expect(tail.length).toBeLessThanOrEqual(MAX_BG_TAIL_CHARS)
    // 최신(뒤쪽) 로그 유지 — 앞부분 절단이지 뒷부분 절단이 아니다.
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
    // RED(선행 started 부착에 의존): 부착된 bgTask의 tail이 오염되지 않아야 한다.
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

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 컴포넌트: BackgroundTaskView (신규 — 현재 모듈 미존재 → import 에러 RED)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 배선: ToolCallCard — 배경 셸 배지 + bgTask 뷰 (RED) / 폴백 (GREEN 회귀 핀)
// ═══════════════════════════════════════════════════════════════════════════════

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
    // RED: 현행 ToolCallCard는 background를 몰라 배지 미렌더.
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
    // 라이브 tail은 접힘 뒤에 숨기지 않는다(dev 서버 로그를 지켜보는 일상 루프 — 감사 T-01).
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

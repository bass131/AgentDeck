/**
 * bgTaskObserver.test.ts — RS1 P06 ① 분리 모듈의 특성화(characterization) 테스트
 *
 * 대상 모듈(신규): 02_Source/main/01_agents/bgTaskObserver.ts
 *   claudeAgentRun에 흩어져 있던 백그라운드 태스크 관찰 관심사
 *   (`extractBgOutputPath`·`_bgTasks`·`_bgTaskGateOpen`·`_observeBgTaskEvent`·
 *   `_maybeStartBgTail`·`_stopAllBgTails`)를 한 모듈로 옮긴 것.
 *
 * 성격: **거동 불변 리팩토링의 안전망**이지 신규 기능 명세가 아니다. 여기 단정된
 * 내용은 전부 분리 이전 claudeAgentRun의 실제 거동을 그대로 옮겨 적은 것이며,
 * 통합 수준 계약(펌프 배선·idle-close 회복 트리거)은 기존 골든 테스트
 * (`gap1-p09-bg-task.golden` · `gap1-p09-bg-tail-wiring` · `gap1-p09-idle-close-bgtask`)가
 * 계속 소유한다 — 이 파일은 분리된 단위(unit) 표면만 잠근다.
 *
 * 신뢰경계: 실 fs/타이머 접근 0 — bgTaskTail 모듈을 mock으로 대체해 "언제 tail을
 * 시작/정지하는가"라는 결정만 관측한다(폴러 자체의 계약은 gap1-p09-bg-task-tail 소유).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AgentEvent, AgentEventBgTask } from '../../../02_Source/shared/agentEvents'

// ── bgTaskTail mock — 시작/정지 호출만 기록하는 대역 ────────────────────────────
const tailSpy = vi.hoisted(() => ({
  started: [] as { taskId: string; outputFile: string }[],
  stopped: [] as { taskId: string; finalFlush: boolean | undefined }[],
  emits: [] as ((ev: unknown) => void)[],
}))

vi.mock('../../../02_Source/main/01_agents/bgTaskTail', () => ({
  startBgTaskTail: (opts: { taskId: string; outputFile: string; emit: (ev: unknown) => void }) => {
    tailSpy.started.push({ taskId: opts.taskId, outputFile: opts.outputFile })
    tailSpy.emits.push(opts.emit)
    return {
      stop: (finalFlush?: boolean) => {
        tailSpy.stopped.push({ taskId: opts.taskId, finalFlush })
        return Promise.resolve()
      },
    }
  },
}))

import { BgTaskObserver, extractBgOutputPath } from '../../../02_Source/main/01_agents/bgTaskObserver'

// ── 픽스처 헬퍼 ────────────────────────────────────────────────────────────────

/** 백그라운드 Bash tool_result 원시 user 메시지(probe④ 형상 축약). */
function bgToolResultMsg(taskId: string, hint: string | null): Record<string, unknown> {
  return {
    type: 'user',
    tool_use_result: { backgroundTaskId: taskId },
    message: {
      content: [
        {
          type: 'tool_result',
          content: hint === null ? 'Command running in background' : hint,
        },
      ],
    },
  }
}

function startedEvent(taskId: string): AgentEvent {
  return { type: 'bg_task', kind: 'started', taskId } satisfies AgentEventBgTask
}

function notificationEvent(taskId: string, outputFile?: string): AgentEvent {
  return { type: 'bg_task', kind: 'notification', taskId, outputFile } satisfies AgentEventBgTask
}

describe('extractBgOutputPath (분리 전 claudeAgentRun 사문서 동일)', () => {
  it('안내 문구가 문자열 content면 .output 경계까지만 캡처한다', () => {
    const m = bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output. 계속 진행합니다')
    expect(extractBgOutputPath(m)).toBe('/tmp/tasks/t1.output')
  })

  it('content가 텍스트 파트 배열이어도 이어붙여 추출한다', () => {
    const m = {
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            content: [
              { type: 'text', text: 'Output is being written' },
              { type: 'text', text: ' to: /tmp/tasks/t2.output' },
            ],
          },
        ],
      },
    }
    expect(extractBgOutputPath(m)).toBe('/tmp/tasks/t2.output')
  })

  it('안내 문구가 없거나 형상이 어긋나면 null(조용한 degrade)', () => {
    expect(extractBgOutputPath(bgToolResultMsg('t3', null))).toBeNull()
    expect(extractBgOutputPath({ type: 'user' })).toBeNull()
    expect(extractBgOutputPath({ type: 'user', message: { content: 'not-an-array' } })).toBeNull()
  })
})

describe('BgTaskObserver — 레지스트리·게이트', () => {
  let emitted: AgentEventBgTask[]
  let obs: BgTaskObserver

  beforeEach(() => {
    tailSpy.started.length = 0
    tailSpy.stopped.length = 0
    tailSpy.emits.length = 0
    emitted = []
    obs = new BgTaskObserver((ev) => emitted.push(ev))
  })

  it('활성 태스크가 없으면 게이트가 열려 있다(기존 거동 무변경 지점)', () => {
    expect(obs.gateOpen()).toBe(true)
  })

  it("'started' 관측 → 게이트 닫힘, 'notification' 관측 → 다시 열림", () => {
    obs.observeEvent(startedEvent('t1'))
    expect(obs.gateOpen()).toBe(false)
    obs.observeEvent(notificationEvent('t1'))
    expect(obs.gateOpen()).toBe(true)
  })

  it('중복 started는 멱등이고, 미등록 taskId의 notification은 no-op이다', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.observeEvent(startedEvent('t1'))
    obs.observeEvent(notificationEvent('unknown'))
    expect(obs.gateOpen()).toBe(false)
    obs.observeEvent(notificationEvent('t1'))
    expect(obs.gateOpen()).toBe(true)
  })

  it('bg_task 이외 이벤트는 무시한다', () => {
    obs.observeEvent({ type: 'text', delta: 'hi' } as AgentEvent)
    expect(obs.gateOpen()).toBe(true)
  })

  it("kind:'updated'는 수명 경계가 아니다(게이트 불변)", () => {
    obs.observeEvent(startedEvent('t1'))
    obs.observeEvent({ type: 'bg_task', kind: 'updated', taskId: 't1' } satisfies AgentEventBgTask)
    expect(obs.gateOpen()).toBe(false)
  })
})

describe('BgTaskObserver — tail 배선', () => {
  let emitted: AgentEventBgTask[]
  let obs: BgTaskObserver

  beforeEach(() => {
    tailSpy.started.length = 0
    tailSpy.stopped.length = 0
    tailSpy.emits.length = 0
    emitted = []
    obs = new BgTaskObserver((ev) => emitted.push(ev))
  })

  it('started 선행 + 안내 문구 있음 → tail 시작', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output'))
    expect(tailSpy.started).toEqual([{ taskId: 't1', outputFile: '/tmp/tasks/t1.output' }])
  })

  it('started 미선행이면 tail을 시작하지 않는다(graceful skip)', () => {
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output'))
    expect(tailSpy.started).toHaveLength(0)
  })

  it('구조 payload(backgroundTaskId)가 없으면 문구가 있어도 무시한다(문자열 추출은 보조)', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.maybeStartTail({
      type: 'user',
      message: { content: [{ type: 'tool_result', content: 'Output is being written to: /tmp/x.output' }] },
    })
    expect(tailSpy.started).toHaveLength(0)
  })

  it('경로 추출 실패는 tail 없이 생명주기만(degrade) — 이후 재시도 가능', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.maybeStartTail(bgToolResultMsg('t1', null))
    expect(tailSpy.started).toHaveLength(0)
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output'))
    expect(tailSpy.started).toHaveLength(1)
  })

  it('이미 tail이 붙은 태스크는 두 번 시작하지 않는다', () => {
    obs.observeEvent(startedEvent('t1'))
    const msg = bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output')
    obs.maybeStartTail(msg)
    obs.maybeStartTail(msg)
    expect(tailSpy.started).toHaveLength(1)
  })

  it('notification의 output_file이 추출 경로와 일치/미상이면 잔여분을 flush(true)', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output'))
    obs.observeEvent(notificationEvent('t1', '/tmp/tasks/t1.output'))
    expect(tailSpy.stopped).toEqual([{ taskId: 't1', finalFlush: true }])
  })

  it('notification의 output_file(정본)이 추출 경로와 불일치하면 flush 포기(false)', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/wrong.output'))
    obs.observeEvent(notificationEvent('t1', '/tmp/tasks/t1.output'))
    expect(tailSpy.stopped).toEqual([{ taskId: 't1', finalFlush: false }])
  })

  it('stopAll은 flush 없이 전량 정지 + 레지스트리 비움(타이머 누수 0 지점)', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.observeEvent(startedEvent('t2'))
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output'))
    obs.maybeStartTail(bgToolResultMsg('t2', 'Output is being written to: /tmp/tasks/t2.output'))
    obs.stopAll()
    expect(tailSpy.stopped).toEqual([
      { taskId: 't1', finalFlush: false },
      { taskId: 't2', finalFlush: false },
    ])
    expect(obs.gateOpen()).toBe(true)
  })

  it('tail이 방출한 조각은 생성자에 주입된 emit 콜백으로 그대로 흘러간다', () => {
    obs.observeEvent(startedEvent('t1'))
    obs.maybeStartTail(bgToolResultMsg('t1', 'Output is being written to: /tmp/tasks/t1.output'))
    const chunk: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'output',
      taskId: 't1',
      outputChunk: 'hello\n',
    }
    tailSpy.emits[0](chunk)
    expect(emitted).toEqual([chunk])
  })
})

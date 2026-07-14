/**
 * gap1-p15-r1-s1-interrupt-unhandled-rejection.test.ts — GAP1 P15 라운드1 시드 S1 RED.
 *
 * 결함(라운드 0 시드 — coordinator 스카우트 확정):
 *   claudeAgentRun.ts의 두 지점이 `void this._queryHandle.interrupt()`를 try/catch로만
 *   감싼다 — abort() 경로(:613-619)와 interrupt() 경로(:716-725). try/catch는 *동기 throw*만
 *   잡고, interrupt()가 **rejected Promise를 반환**하면 그 reject는 아무도 받지 않아
 *   unhandledRejection으로 누수된다(프로세스 전역 오염 — Electron main에서 앱 크래시/
 *   경고 로그 원인). 같은 파일의 stopTask(:661-667)·setPermissionMode(:702-707)는 이미
 *   `void Promise.resolve(handle.X()).catch(() => {})` 패턴으로 흡수한다 — 두 interrupt
 *   지점만 남은 비대칭.
 *
 * 기대 스펙(interface-of-record — 봉합은 agent-backend Worker):
 *   interrupt()/abort()의 queryHandle.interrupt() 호출도 stopTask 미러로 reject를 흡수한다.
 *   → 어떤 경로에서든 queryHandle.interrupt()가 reject해도 unhandledRejection 미발생.
 *
 * 검증 기법(결정론): process의 'unhandledRejection' 리스너를 테스트 동안 스왑해
 *   (vitest 자체 리스너 제거 → 캡처 리스너 설치 → finally 복원) 우리 마커 메시지의
 *   reject만 계수한다. Node는 마이크로태스크 큐가 비고 매크로태스크 틱이 지나면
 *   unhandledRejection을 발화하므로 setTimeout 대기 후 단정한다(시간 의존 아님 — 틱 경계만).
 *
 * TDD 상태: RED 2건(아래 두 it). 봉합(.catch 흡수) 후 GREEN 전환 = 회귀 잠금.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/queryFn'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

/** 이 테스트가 심는 reject 식별 마커 — 다른 출처의 reject를 오계수하지 않기 위한 필터. */
const REJECT_MARKER = 'S1-interrupt-reject-p15r1'

function mkAssistantText(text: string, id = 'm1'): Record<string, unknown> {
  return {
    type: 'assistant',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${id}`,
    session_id: 'sess-s1',
  }
}

function mkResult(): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: 'done',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-0000000000s1',
    session_id: 'sess-s1',
  }
}

/**
 * 단발(비-persistent) mock queryFn — 텍스트 1개 yield 후 hold(진행 중 turn 모델링).
 * 핸들의 interrupt()는 **rejected Promise 반환**(동기 throw 아님 — 결함 표적 그 지점).
 * release()로 hold를 풀면 result를 yield하고 자연 종료한다(펌프 좀비 방지).
 */
function makeRejectingInterruptQueryFn(): {
  queryFn: QueryFn
  started: Promise<void>
  release: () => void
} {
  let releaseFn: () => void = () => {}
  let startedResolve: () => void = () => {}
  const started = new Promise<void>((r) => { startedResolve = r })

  const queryFn: QueryFn = function () {
    const gen = (async function* () {
      yield mkAssistantText('스트리밍 진행 중…')
      startedResolve()
      await new Promise<void>((r) => { releaseFn = r })
      yield mkResult()
    })()
    // 결함 표적: 동기 throw가 아니라 *rejected Promise 반환* — try/catch로는 안 잡힌다.
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = () =>
      Promise.reject(new Error(REJECT_MARKER))
    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, started, release: () => releaseFn() }
}

/**
 * 리스너 스왑 실행기 — fn 실행 동안 unhandledRejection을 캡처하고 마커 계수를 반환.
 * finally에서 vitest 원 리스너를 반드시 복원한다(다른 테스트 오염 0).
 */
async function countMarkerUnhandledRejections(fn: () => Promise<void>): Promise<number> {
  const captured: unknown[] = []
  const previous = process.listeners('unhandledRejection')
  process.removeAllListeners('unhandledRejection')
  const capture = (reason: unknown): void => { captured.push(reason) }
  process.on('unhandledRejection', capture)
  try {
    await fn()
    // unhandledRejection은 마이크로태스크 드레인 후 발화 — 매크로태스크 2틱 대기(결정론).
    await new Promise((r) => setTimeout(r, 20))
    await new Promise((r) => setTimeout(r, 20))
  } finally {
    process.removeAllListeners('unhandledRejection')
    for (const l of previous) process.on('unhandledRejection', l)
  }
  return captured.filter(
    (reason) => reason instanceof Error && reason.message.includes(REJECT_MARKER)
  ).length
}

describe('GAP1 P15-R1 S1 — queryHandle.interrupt() reject 흡수 (RED)', () => {
  it('interrupt() 경로: 핸들 interrupt가 reject해도 unhandledRejection 미발생(.catch 흡수 계약)', async () => {
    const { queryFn, started, release } = makeRejectingInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)

    const count = await countMarkerUnhandledRejections(async () => {
      const run = backend.start({ messages: [{ role: 'user', content: 'S1 interrupt 경로' }] })
      const events: AgentEvent[] = []
      const consumed = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      await started // _queryHandle 캡처 확정(펌프가 첫 yield를 지남)
      run.interrupt() // → void this._queryHandle.interrupt() … reject 누수 지점(:721)
      await new Promise((r) => setTimeout(r, 10))
      release() // hold 해제 → result → 펌프 자연 종료(좀비 0)
      await consumed
    })

    // 현행: void 폐기라 reject 1건 누수 → RED. 봉합(.catch) 후 0 → GREEN.
    expect(count).toBe(0)
  })

  it('abort() 경로: 핸들 interrupt가 reject해도 unhandledRejection 미발생(.catch 흡수 계약)', async () => {
    const { queryFn, started, release } = makeRejectingInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)

    const count = await countMarkerUnhandledRejections(async () => {
      const run = backend.start({ messages: [{ role: 'user', content: 'S1 abort 경로' }] })
      const events: AgentEvent[] = []
      const consumed = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      await started
      run.abort() // → void this._queryHandle.interrupt() … reject 누수 지점(:615)
      await new Promise((r) => setTimeout(r, 10))
      release() // 펌프 hold 해제(큐는 이미 close — 늦은 이벤트는 _push 가드가 차단)
      await consumed
    })

    expect(count).toBe(0)
  })
})

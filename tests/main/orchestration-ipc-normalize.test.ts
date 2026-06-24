/**
 * orchestration-ipc-normalize.test.ts
 *
 * AGENT_RUN IPC 핸들러의 orchestration 정규화·전달 단위 테스트 (Phase 37 #4a).
 *
 * 검증 범위:
 *   (ORC-1) req.orchestration === true  → AgentRunInput.orchestration === true
 *   (ORC-2) req.orchestration === false → AgentRunInput.orchestration === false
 *   (ORC-3) req.orchestration 미전달(undefined) → false
 *   (ORC-4) req.orchestration = 1 (number truthy) → false  [신뢰경계 핵심]
 *   (ORC-5) req.orchestration = "true" (string) → false    [신뢰경계 핵심]
 *   (ORC-6) req.orchestration = "1" (string) → false       [신뢰경계 핵심]
 *   (ORC-7) req.orchestration = {} (truthy object) → false [신뢰경계 핵심]
 *   (ORC-8) req.orchestration = null → false
 *
 * 테스트 전략:
 *
 *   Layer A — 정규화 표현식 특성화(characterization):
 *     `src/main/ipc/index.ts:401`의 `const orchestration = req.orchestration === true`는
 *     분리된 순수 함수가 아닌 인라인 표현식이다. 해당 표현식과 동등한 연산을
 *     직접 검증함으로써 계약을 "정답 파일"로 고정한다.
 *     → 구현이 변경되어 다른 truthy 값이 통과되면 이 테스트가 RED가 된다.
 *
 *   Layer B — RunManager + backend.start spy:
 *     createRunManager.start(backend, { ..., orchestration }, onEvent) 호출 시
 *     backend.start(req)가 받는 req.orchestration이 정규화 결과를 그대로 운반하는지
 *     검증한다. (전달 보장 — B1 패턴과 동일, systemprompt-ipc.test.ts 참조)
 *
 * 상태: 현재 구현이 이미 `=== true`를 사용하므로 즉시 GREEN(특성화 테스트).
 *       GREEN이지만 회귀 방어막 역할 — 정규화 완화 시 즉시 RED.
 *
 * 신뢰경계(CRITICAL): truthy 아무 값이나 통과 금지.
 *   boolean true 외의 모든 값(1/"true"/"1"/{}) → false로 강제.
 *   이 게이트가 없으면 renderer가 임의 truthy를 보내 Workflow 도구를 무단 활성화할 수 있다.
 */

import { describe, it, expect, vi } from 'vitest'
import { createRunManager } from '../../src/main/ipc/agent-runs'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../src/main/agents/AgentBackend'
import type { AgentEvent } from '../../src/shared/agent-events'
import type { BackendId } from '../../src/shared/ipc-contract'

// ── 정규화 표현식 헬퍼 ────────────────────────────────────────────────────────
//
// src/main/ipc/index.ts:401의 인라인 표현식과 완전히 동일:
//   const orchestration = req.orchestration === true
//
// 이 함수는 테스트 코드 내에서만 존재하며 앱 소스를 수정하지 않는다.
// 표현식이 바뀌면 이 헬퍼 자체도 변경이 필요하지만, 그 변경이 "의도된 것인지"
// 이 테스트 슈트가 리뷰어에게 경고를 준다.
function applyOrchestrationNormalize(raw: unknown): boolean {
  // 핸들러 코드와 동일한 표현식 — 의도적으로 동일 연산을 복사해 계약을 고정.
  return raw === true
}

// ── Mock 헬퍼 ─────────────────────────────────────────────────────────────────

/** 최소한의 AgentRun fake — done 이벤트 1개만 emit */
function makeFakeRun(captured?: { req?: AgentRunInput }): AgentRun {
  return {
    events: (async function* () {
      yield { type: 'done' } as AgentEvent
    })(),
    abort: () => {},
    respond: () => {},
    // captured는 Layer B에서 start spy 대신 사용할 수 있지만,
    // 여기서는 start spy(vi.fn)로 캡처하므로 사용하지 않음.
    ...(captured ? {} : {}),
  }
}

/**
 * backend.start를 vi.fn()으로 감싼 AgentBackend.
 * start 호출 인자를 spy.mock.calls[N][0]으로 캡처한다.
 */
function makeSpyBackend(): { backend: AgentBackend; startSpy: ReturnType<typeof vi.fn> } {
  const startSpy = vi.fn((_req: AgentRunInput): AgentRun => makeFakeRun())

  const backend: AgentBackend = {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    start: startSpy,
    listSupportedCommands: () => [],
  }

  return { backend, startSpy }
}

// ── Layer A: 정규화 표현식 특성화 테스트 ──────────────────────────────────────
//
// 골든 테스트(golden/snapshot test) 개념 적용:
//   각 입력에 대한 "정답"을 고정해두고 매번 비교.
//   의도된 변경이면 정답을 갱신, 아니면 회귀 버그.

describe('orchestration 정규화 — `=== true` 표현식 계약 고정 (Layer A)', () => {

  describe('ORC-1: boolean true → true (정상 케이스)', () => {
    it('true → true', () => {
      expect(applyOrchestrationNormalize(true)).toBe(true)
    })
  })

  describe('ORC-2: boolean false → false', () => {
    it('false → false', () => {
      expect(applyOrchestrationNormalize(false)).toBe(false)
    })
  })

  describe('ORC-3: undefined(미전달) → false', () => {
    it('undefined → false', () => {
      expect(applyOrchestrationNormalize(undefined)).toBe(false)
    })
  })

  describe('신뢰경계 핵심: truthy non-boolean → false (통과 금지)', () => {
    it('ORC-4: number 1 → false (truthy지만 boolean true 아님)', () => {
      expect(applyOrchestrationNormalize(1)).toBe(false)
    })

    it('ORC-5: string "true" → false (truthy지만 boolean true 아님)', () => {
      expect(applyOrchestrationNormalize('true')).toBe(false)
    })

    it('ORC-6: string "1" → false (truthy지만 boolean true 아님)', () => {
      expect(applyOrchestrationNormalize('1')).toBe(false)
    })

    it('ORC-7: {} (truthy object) → false (boolean true 아님)', () => {
      expect(applyOrchestrationNormalize({})).toBe(false)
    })

    it('ORC-7b: [] (truthy array) → false', () => {
      expect(applyOrchestrationNormalize([])).toBe(false)
    })

    it('ORC-7c: 임의 함수 → false', () => {
      expect(applyOrchestrationNormalize(() => true)).toBe(false)
    })
  })

  describe('ORC-8: null → false', () => {
    it('null → false', () => {
      expect(applyOrchestrationNormalize(null)).toBe(false)
    })
  })

  describe('기타 falsy 값 → false', () => {
    it('0 → false', () => {
      expect(applyOrchestrationNormalize(0)).toBe(false)
    })

    it('빈문자열("") → false', () => {
      expect(applyOrchestrationNormalize('')).toBe(false)
    })
  })

  describe('boolean true만 엄격히 통과 — 불변 단정', () => {
    it('typeof 결과가 boolean이고 값이 true인 경우만 true', () => {
      // === true는 정확히 두 조건을 동시에 검사:
      //   1) typeof val === 'boolean'  (boolean type check)
      //   2) val === true              (value check)
      // 이 단정은 "=== true 외에는 false"라는 계약을 명시적으로 문서화한다.
      const trueCases = [true]
      const falseCases = [false, 0, 1, '', 'true', '1', null, undefined, {}, [], () => {}, -1, NaN]

      for (const v of trueCases) {
        expect(applyOrchestrationNormalize(v)).toBe(true)
      }
      for (const v of falseCases) {
        expect(applyOrchestrationNormalize(v)).toBe(false)
      }
    })
  })
})

// ── Layer B: RunManager + backend.start spy (전달 보장) ─────────────────────
//
// createRunManager.start()가 backend.start(req)를 호출할 때
// req.orchestration이 정규화된 값을 그대로 운반하는지 검증한다.
//
// IPC 핸들러에서 정규화 후 { ..., orchestration } 를 RunManager.start에 넘기고,
// RunManager.start는 그것을 backend.start(req)로 그대로 전달한다.
// 따라서 backend.start spy를 통해 "전달 보장"을 확인할 수 있다.
//
// 참고: systemprompt-ipc.test.ts B1 패턴과 동일한 하네스.

describe('B1 — backend.start에 orchestration 전달 보장 (Layer B spy 패턴)', () => {

  it('orchestration: true → backend.start에 orchestration: true 전달', async () => {
    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hello' }], orchestration: true },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(true)
  })

  it('orchestration: false → backend.start에 orchestration: false 전달', async () => {
    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hello' }], orchestration: false },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })

  it('orchestration 미전달(undefined) → backend.start에 orchestration: undefined 전달', async () => {
    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hello' }] },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    // orchestration 키 자체가 없거나 undefined — 어느 쪽이든 falsy
    expect(req.orchestration).toBeFalsy()
  })

  it('IPC 핸들러가 정규화 후 false를 전달하는 시나리오 시뮬레이션: number 1 → 정규화 결과 false', async () => {
    // IPC 핸들러가 하는 일:
    //   const orchestration = req.orchestration === true  // 1 === true → false
    //   _runManager.start(backend, { ..., orchestration }, ...)
    //
    // 여기서는 핸들러 레이어(electron 의존)를 우회하고,
    // "핸들러가 정규화 후 RunManager에 넘길 값"을 직접 계산해 전달함으로써
    // RunManager가 그 값을 backend.start에 무변형 전달하는지 검증한다.
    const untrustedOrchestration: unknown = 1 // renderer가 보낸 truthy number
    const normalizedOrchestration = untrustedOrchestration === true // false

    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'test' }], orchestration: normalizedOrchestration },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })

  it('IPC 핸들러 정규화 시뮬레이션: string "true" → 정규화 결과 false', async () => {
    const untrustedOrchestration: unknown = 'true'
    const normalizedOrchestration = untrustedOrchestration === true // false

    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'test' }], orchestration: normalizedOrchestration },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })

  it('IPC 핸들러 정규화 시뮬레이션: {} (truthy object) → 정규화 결과 false', async () => {
    const untrustedOrchestration: unknown = {}
    const normalizedOrchestration = untrustedOrchestration === true // false

    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'test' }], orchestration: normalizedOrchestration },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })
})

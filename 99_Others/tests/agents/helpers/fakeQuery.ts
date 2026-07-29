/**
 * fakeQuery.ts — `QueryFn`(SDK query 시그니처) 가짜 구현 공용 팩토리 (RS1 P02)
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────────────────────────
 *   `makeMockQueryFn(messages)` 은 8개 파일에 **글자 단위로 같은 몸통**이 복제돼 있었다
 *   (한 곳만 abort 체크가 빠진 변종). 어댑터 계약을 바꿀 때 그 8곳을 다 고쳐야 하는데,
 *   실제로는 한두 곳이 빠져 조용히 어긋난다 — 그게 이 파일이 존재하는 이유다.
 *
 * ── 신뢰 경계 ────────────────────────────────────────────────────────────────
 *   실 SDK(@anthropic-ai/claude-agent-sdk) 를 절대 import 하지 않는다. 네트워크 0.
 *   `setTimeout` 도 쓰지 않는다 — 순서는 전부 호출자가 쥔 Promise(게이트)로 고정한다
 *   (결정론: 스케줄러 타이밍에 기대는 flaky 테스트 방지).
 *
 * ── ADR-003 (엔진 추상화) ─────────────────────────────────────────────────────
 *   `QueryFn` 의 공개 시그니처는 `prompt: string` 이다. 지속세션(held-open, ADR-024)
 *   경로에서는 어댑터가 `AsyncIterable` 을 정밀 캐스트해 넘기므로, 아래 팩토리들은
 *   prompt 를 `unknown` 으로 받아 `Symbol.asyncIterator` 유무로 두 경로를 구분한다.
 *   SDK 고유 형상(SDKUserMessage 등)은 이 파일 밖으로 새지 않는다.
 */

import type { QueryFn } from '../../../../02_Source/main/01_agents/ClaudeCodeBackend'

// ── 공통 유틸 ────────────────────────────────────────────────────────────────

/** prompt 가 held-open(AsyncIterable) 경로인지 판정. string 이면 단발 경로. */
function isAsyncIterablePrompt(prompt: unknown): prompt is AsyncIterable<unknown> {
  return prompt !== null && typeof prompt === 'object' && Symbol.asyncIterator in (prompt as object)
}

/** options 에서 abortController 를 꺼낸다(형상 미상이면 undefined). */
function abortSignalOf(options: unknown): AbortSignal | undefined {
  return (options as { abortController?: AbortController } | undefined)?.abortController?.signal
}

// ── ① 고정 메시지 재생 ────────────────────────────────────────────────────────

/**
 * 주어진 SDK 메시지 배열을 순서대로 흘려보내는 가장 단순한 가짜 query.
 *
 * abort 관찰: 매 메시지 직전에 `options.abortController.signal.aborted` 를 확인하고
 * 참이면 즉시 종료한다 — 실 SDK 가 abort 신호에 반응하는 것과 같은 모양이라,
 * "abort 후 스트림이 무한 대기하지 않는다" 같은 계약을 이 가짜로도 검증할 수 있다.
 */
export function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const signal = abortSignalOf(params.options)
    for (const msg of messages) {
      if (signal?.aborted) return
      yield msg
    }
  }
}

// ── ② 호출 인자 캡처 ──────────────────────────────────────────────────────────

/** {@link makeCaptureQuery} 가 채우는 관찰 기록. queryFn 호출 후에 읽는다. */
export interface CapturedQueryCall {
  /** queryFn 이 호출된 횟수. */
  calls: number
  /** 마지막 호출의 prompt(원본 — string 이거나 AsyncIterable). */
  prompt: unknown
  /** 마지막 호출의 options(어댑터가 조립한 SDK 옵션). 미전달이면 null. */
  options: Record<string, unknown> | null
  /** prompt 가 held-open(AsyncIterable) 형상이었는가 — 단발로 degrade 됐는지 검증용. */
  promptIsAsyncIterable: boolean
}

/**
 * 어댑터가 SDK 에 **무엇을 넘겼는지**를 검사하기 위한 가짜 query.
 *
 * "resume 이 options 까지 도달했는가", "canUseTool 콜백이 주입됐는가", "지속세션인데
 * prompt 가 단발(string)로 떨어지지 않았는가" 같은 계약이 이 팩토리의 사용처다.
 *
 * held-open prompt 를 받으면 초기 입력 1개를 소비한 뒤 messages 를 흘린다 — 소비하지
 * 않으면 어댑터의 입력 제너레이터가 열린 채 남아 스트림이 끝나지 않는다.
 */
export function makeCaptureQuery(messages: unknown[] = []): {
  queryFn: QueryFn
  captured: CapturedQueryCall
} {
  const captured: CapturedQueryCall = {
    calls: 0,
    prompt: undefined,
    options: null,
    promptIsAsyncIterable: false,
  }

  const queryFn: QueryFn = async function* (params) {
    captured.calls += 1
    captured.prompt = params.prompt
    captured.options = (params.options ?? null) as Record<string, unknown> | null

    const prompt = params.prompt as unknown
    captured.promptIsAsyncIterable = isAsyncIterablePrompt(prompt)
    if (captured.promptIsAsyncIterable) {
      const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      await iter.next()
    }

    const signal = abortSignalOf(params.options)
    for (const msg of messages) {
      if (signal?.aborted) return
      yield msg
    }
  }

  return { queryFn, captured }
}

// ── ③ interrupt 모델링 ───────────────────────────────────────────────────────

/** {@link makeInterruptibleQueryFn} 옵션. */
export interface InterruptibleQueryOptions {
  /** 대기(=진행 중 turn) 진입 **전에** 흘릴 메시지들. 보통 text/thinking/tool_use 블록. */
  before?: unknown[]
  /**
   * interrupt() 가 대기를 **resolve** 로 깨운 뒤 흘릴 메시지들.
   * 실측: 실 SDK 의 interrupt() 는 throw 하지 않고 `result(is_error)` 메시지를 emit 한다.
   * `reject` 를 준 경우엔 이 값이 쓰이지 않는다(스트림이 그 지점에서 throw 하므로).
   */
  after?: unknown[]
  /**
   * held-open 경로에서 **두 번째 입력**이 도착하면 흘릴 메시지들.
   * "interrupt 후에도 같은 query 핸들이 살아 다음 턴을 처리한다"(실측)를 모델링한다.
   */
  onNextInput?: unknown[]
  /**
   * 주면 interrupt() 가 대기를 **reject** 로 깨운다 — 도구 실행 도중 중단 신호가
   * 진행 중 프로미스를 거부시켜 스트림 밖으로 throw 가 전파되는 잔여 경로 모델링.
   * 없으면 resolve(정상 경로).
   */
  reject?: Error
}

/**
 * "진행 중 turn 에서 interrupt() 가 호출된다"를 **타이밍 추측 없이** 재현하는 가짜 query.
 *
 * 반환된 `ready` 는 제너레이터가 대기 지점(=진행 중 turn)에 실제로 도달했을 때 resolve
 * 된다. 테스트는 `await ready` 뒤에 `run.interrupt()` 를 호출하면 되므로 경합이 없다
 * (`setTimeout(…, 50)` 같은 추측 대기가 필요 없다 — 결정론).
 *
 * @example
 *   const { queryFn, ready } = makeInterruptibleQueryFn({
 *     before: [mkAssistantText('생각 중...')],
 *     after: [mkResult({ subtype: 'error_during_execution', is_error: true })],
 *   })
 */
export function makeInterruptibleQueryFn(opts: InterruptibleQueryOptions = {}): {
  queryFn: QueryFn
  ready: Promise<void>
} {
  const { before = [], after = [], onNextInput = [], reject } = opts

  let wake: ((err?: Error) => void) | null = null
  let readyResolve: (() => void) | null = null
  const ready = new Promise<void>((r) => {
    readyResolve = r
  })

  const queryFn: QueryFn = function (p) {
    const prompt = p.prompt as unknown

    const gen = (async function* () {
      // held-open 경로면 초기 입력 1개를 소비한다(단발 string 경로는 건너뜀).
      let inputIter: AsyncIterator<unknown> | null = null
      if (isAsyncIterablePrompt(prompt)) {
        inputIter = prompt[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return
      }

      for (const msg of before) yield msg

      // 진행 중 turn 모델링 — interrupt() 가 올 때까지 멈춘다.
      await new Promise<void>((resolve, rejectWait) => {
        wake = (err?: Error) => (err ? rejectWait(err) : resolve())
        readyResolve?.()
      })

      for (const msg of after) yield msg

      // held-open: 같은 핸들이 살아 다음 입력을 받으면 그 턴을 처리한다.
      if (inputIter && onNextInput.length > 0) {
        const second = await inputIter.next()
        if (!second.done) {
          for (const msg of onNextInput) yield msg
        }
      }
    })()

    // SDK query 핸들의 interrupt() — 대기 중인 Promise 를 깨운다.
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
      if (wake) {
        const w = wake
        wake = null
        w(reject)
      }
    }

    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, ready }
}

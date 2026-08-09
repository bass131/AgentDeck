import type { QueryFn } from '../../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'

function isAsyncIterablePrompt(prompt: unknown): prompt is AsyncIterable<unknown> {
  return prompt !== null && typeof prompt === 'object' && Symbol.asyncIterator in (prompt as object)
}

function abortSignalOf(options: unknown): AbortSignal | undefined {
  return (options as { abortController?: AbortController } | undefined)?.abortController?.signal
}

export function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const signal = abortSignalOf(params.options)
    for (const msg of messages) {
      if (signal?.aborted) return
      yield msg
    }
  }
}

export interface CapturedQueryCall {
  calls: number
  prompt: unknown
  options: Record<string, unknown> | null
  promptIsAsyncIterable: boolean
}

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

export interface InterruptibleQueryOptions {
  before?: unknown[]
  after?: unknown[]
  onNextInput?: unknown[]
  reject?: Error
}

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
      let inputIter: AsyncIterator<unknown> | null = null
      if (isAsyncIterablePrompt(prompt)) {
        inputIter = prompt[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return
      }

      for (const msg of before) yield msg

      await new Promise<void>((resolve, rejectWait) => {
        wake = (err?: Error) => (err ? rejectWait(err) : resolve())
        readyResolve?.()
      })

      for (const msg of after) yield msg

      if (inputIter && onNextInput.length > 0) {
        const second = await inputIter.next()
        if (!second.done) {
          for (const msg of onNextInput) yield msg
        }
      }
    })()

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

/**
 * model-alias-sonnet5-live-probe.test.ts — 'sonnet' 별칭 실 SDK 해석 실측 (opt-in: LIVE_SDK=1).
 *
 * 배경: run-args.ts는 `query()` options.model에 짧은 별칭('sonnet' 등)을 그대로 넘긴다.
 * 이 별칭이 설치된 SDK/백엔드에서 실제로 어떤 full 모델 ID로 해석되는지 SDK 문서에 명시가
 * 없어(서버측 해석 추정) 라이브 호출로 응답 message.model을 직접 관측해야 한다.
 *
 * 비용 최소화: model:'sonnet' + 트리비얼 1단어 프롬프트, 단발(비-persistent) 세션 1회.
 * fb2-p07-subagent-live-probe.test.ts의 opt-in 관례(LIVE_SDK=1, queryFn 가로채기)를 따른다.
 *
 * opt-in: LIVE_SDK=1 npx vitest run tests/agents/model-alias-sonnet5-live-probe.test.ts
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/queryFn'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'

/** 실 SDK query()를 그대로 감싸 raw 메시지를 collected에 적재하는 QueryFn을 만든다. */
async function makeTappingQueryFn(collected: unknown[]): Promise<QueryFn> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as any
  const realQuery = sdk.query as QueryFn
  return (params) => {
    const iterable = realQuery(params)
    async function* tap(): AsyncGenerator<unknown> {
      for await (const msg of iterable) {
        collected.push(msg)
        yield msg
      }
    }
    const wrapped = tap() as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    const rawHandle = iterable as unknown as Record<string, unknown>
    if (typeof rawHandle['interrupt'] === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapped as any).interrupt = () => (rawHandle['interrupt'] as () => Promise<void>)()
    }
    return wrapped
  }
}

const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))

async function drainToDone(run: AgentRun, timeoutMs = 60_000): Promise<void> {
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') return
    if (r.done) return
    const e = r.value as { type: string }
    if (e.type === 'done' || e.type === 'error') return
  }
}

describe.skipIf(!LIVE)("모델 별칭 'sonnet' 실측 — LIVE_SDK=1", () => {
  it("model:'sonnet' 단발 호출 → 응답 message.model 관측", async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'sonnet5-probe-'))
    try {
      const run = backend.start({
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        workspaceRoot: ws,
        model: 'sonnet',
      })
      await drainToDone(run)

      const modelsSeen = new Set<string>()
      for (const msg of collected) {
        const obj = (msg ?? {}) as Record<string, unknown>
        const message = obj['message']
        if (message && typeof message === 'object') {
          const m = (message as Record<string, unknown>)['model']
          if (typeof m === 'string' && m) modelsSeen.add(m)
        }
      }
      // eslint-disable-next-line no-console
      console.log("[sonnet5-probe] 관측된 message.model 값들:", JSON.stringify([...modelsSeen]))
      // eslint-disable-next-line no-console
      console.log('[sonnet5-probe] raw 메시지 개수:', collected.length)

      // 관측 probe — 판정은 콘솔 로그로 보고서에서 수행.
      expect(true).toBe(true)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }, 90_000)
})

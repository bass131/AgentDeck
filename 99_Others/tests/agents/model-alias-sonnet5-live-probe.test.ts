import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/queryFn'
import type { AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'

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

      expect(true).toBe(true)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }, 90_000)
})

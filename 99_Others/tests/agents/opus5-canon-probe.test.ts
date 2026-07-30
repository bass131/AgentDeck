/**
 * opus5-canon-probe.test.ts — 임시 실측 프로브 (LIVE_SDK=1). 재구축 후 삭제 예정.
 *
 * 측정 대상:
 *  1) 별칭 4종(opus/fable/sonnet/haiku) → 실제 full 모델 ID (message.model 관측)
 *  2) opus + effort:'max'    → 통과 여부 (Opus 5 effort 사다리 상한)
 *  3) opus + effort:'minimal' → thinking:{type:'disabled'} 통과 여부
 *     (Opus 5는 effort ≤ high에서만 disabled 허용 — xhigh/max는 400)
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/queryFn'
import type { AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'
const OUT = join(tmpdir(), 'opus5-canon-probe.log')

function record(line: string): void {
  appendFileSync(OUT, line + '\n', 'utf8')
  // eslint-disable-next-line no-console
  console.log(line)
}

async function makeTappingQueryFn(collected: unknown[]): Promise<QueryFn> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as any
  const realQuery = sdk.query as QueryFn
  return (params) => {
    // 실제로 SDK에 넘어가는 옵션을 그대로 기록 (effort/thinking 키 확인)
    record('  [opts] ' + JSON.stringify(params.options, (k, v) =>
      k === 'env' || k === 'abortController' || k === 'canUseTool' || k === 'onUserDialog'
        ? '<omitted>' : v))
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

/** done/error까지 배수하고 마지막 종료 이벤트를 반환한다. */
async function drain(run: AgentRun, timeoutMs = 120_000): Promise<Record<string, unknown> | null> {
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { type: 'TIMEOUT' }
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') return { type: 'TIMEOUT' }
    if (r.done) return null
    const e = r.value as Record<string, unknown>
    if (e['type'] === 'done' || e['type'] === 'error') return e
  }
}

/** 한 케이스 실행 → 관측된 message.model 집합 + 종료 이벤트 */
async function probe(label: string, input: Record<string, unknown>): Promise<void> {
  const collected: unknown[] = []
  const queryFn = await makeTappingQueryFn(collected)
  const backend = new ClaudeCodeBackend(queryFn)
  const ws = mkdtempSync(join(tmpdir(), 'canon-probe-'))
  record(`=== ${label} :: input=${JSON.stringify(input)}`)
  try {
    const run = backend.start({
      messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
      workspaceRoot: ws,
      ...input,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const last = await drain(run)

    const modelsSeen = new Set<string>()
    for (const msg of collected) {
      const obj = (msg ?? {}) as Record<string, unknown>
      const message = obj['message']
      if (message && typeof message === 'object') {
        const m = (message as Record<string, unknown>)['model']
        if (typeof m === 'string' && m) modelsSeen.add(m)
      }
      // init 시스템 메시지에도 model이 실린다
      if (obj['type'] === 'system' && typeof obj['model'] === 'string') {
        modelsSeen.add(obj['model'] as string)
      }
    }
    record(`  [models] ${JSON.stringify([...modelsSeen])}`)
    record(`  [msgcount] ${collected.length}`)
    record(`  [last] ${JSON.stringify(last).slice(0, 600)}`)
  } catch (err) {
    record(`  [THROW] ${String(err).slice(0, 600)}`)
  } finally {
    rmSync(ws, { recursive: true, force: true })
    record('')
  }
}

describe.skipIf(!LIVE)('Opus5 canon 실측 — LIVE_SDK=1', () => {
  it('별칭 4종 해석', async () => {
    record('##### 별칭 해석 #####')
    for (const model of ['opus', 'fable', 'sonnet', 'haiku']) {
      await probe(`alias:${model}`, { model })
    }
    expect(true).toBe(true)
  }, 600_000)

  it('opus effort 상한 조합', async () => {
    record('##### effort 조합 #####')
    await probe('opus+max', { model: 'opus', effort: 'max' })
    await probe('opus+xhigh', { model: 'opus', effort: 'xhigh' })
    await probe('opus+minimal(thinking disabled)', { model: 'opus', effort: 'minimal' })
    expect(true).toBe(true)
  }, 600_000)
})

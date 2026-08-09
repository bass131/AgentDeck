import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/queryFn'
import type { AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'

type RunWithSetModel = AgentRun & { setModel?: (modelId: string) => void }

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
    const wrapped = tap() as unknown as AsyncIterable<unknown> & Record<string, unknown>
    const rawHandle = iterable as unknown as Record<string, unknown>
    for (const m of ['interrupt', 'setModel', 'setPermissionMode', 'stopTask']) {
      if (typeof rawHandle[m] === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wrapped[m] = (...args: unknown[]): unknown => (rawHandle[m] as (...a: unknown[]) => unknown)(...args)
      }
    }
    return wrapped as unknown as ReturnType<QueryFn>
  }
}

const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))
const tick = (ms = 50): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface TurnObs {
  text: string
  sawDone: boolean
  sawError: boolean
  errorMessages: string[]
  timedOut: boolean
  sessionId: string | null
}

async function driveTurnToDone(run: AgentRun, timeoutMs = 120_000): Promise<TurnObs> {
  const obs: TurnObs = { text: '', sawDone: false, sawError: false, errorMessages: [], timedOut: false, sessionId: null }
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) { obs.timedOut = true; break }
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') { obs.timedOut = true; break }
    if (r.done) break
    const e = r.value as { type: string; [k: string]: unknown }
    if (e.type === 'permission_request') {
      run.respond(String(e.requestId), { kind: 'permission', behavior: 'allow' })
    } else if (e.type === 'question_request') {
      run.respond(String(e.requestId), { kind: 'question', answers: null })
    } else if (e.type === 'session') {
      obs.sessionId = String(e.sessionId)
    } else if (e.type === 'text') {
      obs.text += String(e.delta ?? '')
    } else if (e.type === 'error') {
      obs.sawError = true
      obs.errorMessages.push(String(e.message ?? JSON.stringify(e)))
    } else if (e.type === 'done') {
      obs.sawDone = true
      break
    }
  }
  return obs
}

function modelsInRange(collected: unknown[], from: number, to: number): string[] {
  const seen = new Set<string>()
  for (let i = from; i < to; i++) {
    const obj = (collected[i] ?? {}) as Record<string, unknown>
    const message = obj['message']
    if (message && typeof message === 'object') {
      const m = (message as Record<string, unknown>)['model']
      if (typeof m === 'string' && m) seen.add(m)
    }
  }
  return [...seen]
}

function resultSummary(collected: unknown[], from: number, to: number): string {
  const rows: string[] = []
  for (let i = from; i < to; i++) {
    const obj = (collected[i] ?? {}) as Record<string, unknown>
    if (obj['type'] === 'result') {
      rows.push(`subtype=${String(obj['subtype'])} is_error=${String(obj['is_error'])}`)
    }
  }
  return rows.length ? rows.join(' | ') : '(result 메시지 없음)'
}

describe.skipIf(!LIVE)('LM1 P05 라이브 setModel 실측 probe — LIVE_SDK=1', () => {
  it("ⓐ sonnet → setModel('haiku') → 두 턴 message.model 원시 ID 비교", async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'lm1-setmodel-a-'))
    let run: RunWithSetModel | null = null
    try {
      run = backend.start({
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'lm1p05-a',
        model: 'sonnet',
      }) as RunWithSetModel

      const t1From = 0
      const obs1 = await driveTurnToDone(run)
      const t1To = collected.length
      const turn1Models = modelsInRange(collected, t1From, t1To)

      expect(typeof run.setModel).toBe('function')
      run.setModel?.('haiku')
      await tick()
      run.push('Reply with exactly one word: DONE')
      const obs2 = await driveTurnToDone(run)
      const t2To = collected.length
      const turn2Models = modelsInRange(collected, t1To, t2To)

      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] 턴1(sonnet) message.model:', JSON.stringify(turn1Models), 'done=', obs1.sawDone, 'timedOut=', obs1.timedOut)
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] 턴2(haiku) message.model:', JSON.stringify(turn2Models), 'done=', obs2.sawDone, 'timedOut=', obs2.timedOut)
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] 전환 반영 여부(교집합 비어야 반영):', JSON.stringify({ turn1Models, turn2Models }))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] raw 메시지 개수:', collected.length, 'turn1 text=', JSON.stringify(obs1.text.slice(0, 40)), 'turn2 text=', JSON.stringify(obs2.text.slice(0, 40)))

      expect(obs1.sawDone || obs1.text.length > 0).toBe(true)
      expect(obs2.sawDone || obs2.text.length > 0).toBe(true)
    } finally {
      run?.abort()
      await tick(2000)
      try { rmSync(ws, { recursive: true, force: true }) } catch { }
    }
  }, 300_000)

  it("ⓑ opus(effort:'xhigh') 세션 → setModel('haiku') → 잔존 effort 거동 기록", async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'lm1-setmodel-b-'))
    let run: RunWithSetModel | null = null
    try {
      run = backend.start({
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'lm1p05-b',
        model: 'opus',
        effort: 'xhigh',
      }) as RunWithSetModel

      const obs1 = await driveTurnToDone(run)
      const t1To = collected.length
      const turn1Models = modelsInRange(collected, 0, t1To)

      run.setModel?.('haiku')
      await tick()
      run.push('Reply with exactly one word: DONE')
      const obs2 = await driveTurnToDone(run)
      const t2To = collected.length
      const turn2Models = modelsInRange(collected, t1To, t2To)

      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴1(opus+xhigh) message.model:', JSON.stringify(turn1Models), 'result:', resultSummary(collected, 0, t1To))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴2(haiku, effort 잔존) message.model:', JSON.stringify(turn2Models), 'result:', resultSummary(collected, t1To, t2To))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴2 성립:', JSON.stringify({ sawDone: obs2.sawDone, sawError: obs2.sawError, timedOut: obs2.timedOut, textLen: obs2.text.length }))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴2 error 메시지:', JSON.stringify(obs2.errorMessages), '| 턴1 error:', JSON.stringify(obs1.errorMessages))

      expect(obs2.sawDone || obs2.sawError || obs2.text.length > 0).toBe(true)
    } finally {
      run?.abort()
      await tick(2000)
      try { rmSync(ws, { recursive: true, force: true }) } catch { }
    }
  }, 300_000)
})

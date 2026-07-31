import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

async function drainToDone(run: AgentRun, timeoutMs = 240_000): Promise<unknown[]> {
  const agentEvents: unknown[] = []
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return agentEvents
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') return agentEvents
    if (r.done) return agentEvents
    const e = r.value as { type: string; requestId?: string }
    agentEvents.push(e)
    if (e.type === 'permission_request' && e.requestId) {
      run.respond(e.requestId, { kind: 'permission', behavior: 'allow' })
    }
    if (e.type === 'question_request' && e.requestId) {
      run.respond(e.requestId, { kind: 'question', answers: null })
    }
    if (e.type === 'done' || e.type === 'error') return agentEvents
  }
}

describe.skipIf(!LIVE)('NG-1/NG-2b 서브에이전트 표시명·비동기 디스패치 라이브 진단 — LIVE_SDK=1', () => {
  it('named 서브에이전트 2개 병렬 + 1+1 계산 — raw tool_use.input 및 model 도달 관측', async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'ng1ng2b-probe-'))
    try {
      const run = backend.start({
        messages: [{
          role: 'user',
          content:
            "Use the Task tool to launch exactly TWO subagents (general-purpose) in parallel. " +
            "Name the first one '소네트 테스트 에이전트 1' and the second one '소네트 테스트 에이전트 2' " +
            "(use whatever input field is appropriate for a human-readable name/label). " +
            "Each subagent should compute 1+1 and reply with just the number. " +
            "Wait for both to finish, then relay both results to me in one short line.",
        }],
        workspaceRoot: ws,
        model: 'haiku',
      })
      const agentEvents = await drainToDone(run)

      const rawTaskInputs: unknown[] = []
      for (const msg of collected) {
        const obj = (msg ?? {}) as Record<string, unknown>
        if (obj['type'] !== 'assistant') continue
        const message = obj['message']
        if (!message || typeof message !== 'object') continue
        const content = (message as Record<string, unknown>)['content']
        if (!Array.isArray(content)) continue
        for (const block of content) {
          if (!block || typeof block !== 'object') continue
          const b = block as Record<string, unknown>
          if (b['type'] === 'tool_use' && (b['name'] === 'Task' || b['name'] === 'Agent')) {
            rawTaskInputs.push({ toolUseId: b['id'], name: b['name'], input: b['input'] })
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log('[NG1-probe] Task/Agent tool_use raw input 목록:', JSON.stringify(rawTaskInputs, null, 2))

      const debugSummary = collected.map((msg) => {
        const obj = (msg ?? {}) as Record<string, unknown>
        const t = obj['type']
        if (t === 'assistant') {
          const message = obj['message']
          const content = message && typeof message === 'object' ? (message as Record<string, unknown>)['content'] : undefined
          const blocks = Array.isArray(content) ? content.map((b) => {
            const bo = (b ?? {}) as Record<string, unknown>
            if (bo['type'] === 'tool_use') return `tool_use:${String(bo['name'])}`
            if (bo['type'] === 'text') return `text:${String(bo['text']).slice(0, 80)}`
            return String(bo['type'])
          }) : []
          return { type: t, parentToolUseId: obj['parent_tool_use_id'], blocks }
        }
        if (t === 'result') {
          return { type: t, subtype: obj['subtype'], is_error: obj['is_error'] }
        }
        return { type: t, subtype: obj['subtype'] }
      })
      // eslint-disable-next-line no-console
      console.log('[DEBUG] 전체 메시지 요약:', JSON.stringify(debugSummary, null, 2))

      const subagentEvents = agentEvents.filter((e) => (e as { type: string }).type === 'subagent')
      // eslint-disable-next-line no-console
      console.log('[NG1-probe] subagent AgentEvent(정규화 후):', JSON.stringify(subagentEvents, null, 2))

      const taskIds = new Set(rawTaskInputs.map((t) => (t as { toolUseId: unknown }).toolUseId))
      const orderedRelevant: { idx: number; type: string; parentToolUseId?: unknown; toolResultId?: unknown; isErr?: unknown; textPreview?: unknown; model?: unknown }[] = []
      collected.forEach((msg, idx) => {
        const obj = (msg ?? {}) as Record<string, unknown>
        const t = obj['type']
        if (t === 'assistant') {
          const parentId = obj['parent_tool_use_id']
          if (typeof parentId === 'string' && taskIds.has(parentId)) {
            const message = obj['message']
            const model = message && typeof message === 'object' ? (message as Record<string, unknown>)['model'] : undefined
            orderedRelevant.push({ idx, type: 'assistant(subagent)', parentToolUseId: parentId, model })
          }
        } else if (t === 'user') {
          const message = obj['message']
          const content = message && typeof message === 'object' ? (message as Record<string, unknown>)['content'] : undefined
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block && typeof block === 'object' && (block as Record<string, unknown>)['type'] === 'tool_result') {
                const trId = (block as Record<string, unknown>)['tool_use_id']
                if (typeof trId === 'string' && taskIds.has(trId)) {
                  const c = (block as Record<string, unknown>)['content']
                  const preview = typeof c === 'string' ? c.slice(0, 200) : JSON.stringify(c).slice(0, 200)
                  orderedRelevant.push({ idx, type: 'tool_result(Task)', toolResultId: trId, isErr: (block as Record<string, unknown>)['is_error'], textPreview: preview })
                }
              }
            }
          }
        }
      })
      // eslint-disable-next-line no-console
      console.log('[NG2b-probe] Task id 관련 raw 메시지 순서(assistant-subagent / tool_result):', JSON.stringify(orderedRelevant, null, 2))

      writeFileSync(
        join(tmpdir(), 'ng1-ng2b-live-probe-dump.json'),
        JSON.stringify({ rawTaskInputs, subagentEvents, orderedRelevant, totalRawMsgs: collected.length }, null, 2),
        'utf8'
      )
      // eslint-disable-next-line no-console
      console.log('[NG1/NG2b-probe] 상세 덤프:', join(tmpdir(), 'ng1-ng2b-live-probe-dump.json'))

      expect(true).toBe(true)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }, 300_000)
})

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/queryFn'
import type { AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'

interface RawSummary {
  type: unknown
  parentToolUseId: unknown
  hasMessage: boolean
  messageModel: unknown
  contentBlockTypes: string[] | null
  contentPreview: string | null
}

function summarize(msg: unknown): RawSummary {
  const obj = (msg ?? {}) as Record<string, unknown>
  const message = obj['message']
  const hasMessage = message !== null && typeof message === 'object'
  const messageObj = hasMessage ? (message as Record<string, unknown>) : {}
  const content = messageObj['content']
  const blockTypes = Array.isArray(content)
    ? content.map((b) => (b && typeof b === 'object' ? String((b as Record<string, unknown>)['type']) : typeof b))
    : null
  let preview: string | null = null
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const b of content) {
      if (b && typeof b === 'object') {
        const bt = (b as Record<string, unknown>)['type']
        if (bt === 'text') parts.push('text:' + String((b as Record<string, unknown>)['text']).slice(0, 60))
        if (bt === 'thinking') parts.push('thinking:' + String((b as Record<string, unknown>)['thinking']).slice(0, 60))
        if (bt === 'tool_use') parts.push('tool_use:' + String((b as Record<string, unknown>)['name']) + '#' + String((b as Record<string, unknown>)['id']).slice(-8))
        if (bt === 'tool_result') parts.push('tool_result#' + String((b as Record<string, unknown>)['tool_use_id']).slice(-8))
      }
    }
    preview = parts.join(' | ').slice(0, 200)
  }
  return {
    type: obj['type'],
    parentToolUseId: obj['parent_tool_use_id'],
    hasMessage,
    messageModel: messageObj['model'],
    contentBlockTypes: blockTypes,
    contentPreview: preview,
  }
}

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
    if (typeof rawHandle['supportedCommands'] === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapped as any).supportedCommands = () => (rawHandle['supportedCommands'] as () => Promise<unknown>)()
    }
    return wrapped
  }
}

const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))

async function drainToDone(run: AgentRun, agentEvents: unknown[], timeoutMs = 180_000): Promise<void> {
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') return
    if (r.done) return
    const e = r.value as { type: string; requestId?: string }
    agentEvents.push(e)
    if (e.type === 'permission_request' && e.requestId) {
      run.respond(e.requestId, { kind: 'permission', behavior: 'allow' })
    }
    if (e.type === 'question_request' && e.requestId) {
      run.respond(e.requestId, { kind: 'question', answers: null })
    }
    if (e.type === 'done' || e.type === 'error') return
  }
}

describe.skipIf(!LIVE)('FB2 P07 서브에이전트 모델 표기 라이브 진단 — LIVE_SDK=1', () => {
  it('subagent Task 위임 1회 — raw 스트림에서 parent_tool_use_id/model 관측', async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'fb2p07-probe-'))
    try {
      const run = backend.start({
        messages: [{
          role: 'user',
          content:
            'Use the Task tool to spawn exactly ONE subagent (general-purpose). Tell it to reply with ' +
            'exactly the single word OK and nothing else. Once it replies, relay its answer to me in one word.',
        }],
        workspaceRoot: ws,
        model: 'haiku',
      })
      const agentEvents: unknown[] = []
      await drainToDone(run, agentEvents)
      const subagentEvents = agentEvents.filter((e) => (e as { type: string }).type === 'subagent')
      console.log('[FB2-P07-probe] subagent AgentEvent 방출:', JSON.stringify(subagentEvents, null, 2))

      const summaries = collected.map(summarize)
      const meaningful = summaries.filter((s) => s.type !== 'stream_event' && s.type !== 'system' && s.type !== 'rate_limit_event')
      console.log('[FB2-P07-probe] 순서(노이즈 제거):', JSON.stringify(meaningful, null, 2))
      const subagentMsgs = summaries.filter((s) => typeof s.parentToolUseId === 'string' && s.parentToolUseId)
      const assistantSubagentMsgs = subagentMsgs.filter((s) => s.type === 'assistant')
      const withModel = assistantSubagentMsgs.filter((s) => typeof s.messageModel === 'string' && s.messageModel)

      const dump = {
        totalRawMsgs: collected.length,
        typesSeen: [...new Set(summaries.map((s) => String(s.type)))],
        subagentTaggedMsgCount: subagentMsgs.length,
        subagentTaggedTypes: subagentMsgs.map((s) => String(s.type)),
        assistantSubagentMsgCount: assistantSubagentMsgs.length,
        assistantSubagentWithModelCount: withModel.length,
        assistantSubagentSamples: assistantSubagentMsgs.slice(0, 5),
      }
      console.log('[FB2-P07-probe] 진단 요약:', JSON.stringify(dump, null, 2))

      writeFileSync(
        join(tmpdir(), 'fb2-p07-live-probe-dump.json'),
        JSON.stringify({ dump, allSummaries: summaries }, null, 2),
        'utf8'
      )
      console.log('[FB2-P07-probe] 상세 덤프:', join(tmpdir(), 'fb2-p07-live-probe-dump.json'))

      expect(true).toBe(true)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }, 240_000)

  it('persistent(REPL 기본 모드, ADR-024) 경로 — 실제 앱 기본 경로와 동일 조건 재현', async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'fb2p07-probe-persist-'))
    try {
      const run = backend.start({
        messages: [{
          role: 'user',
          content:
            'Use the Task tool to spawn exactly ONE subagent (general-purpose). Tell it to reply with ' +
            'exactly the single word OK and nothing else. Once it replies, relay its answer to me in one word.',
        }],
        workspaceRoot: ws,
        model: 'haiku',
        persistent: true,
        sessionKey: 'fb2p07-probe-persist',
      })
      const agentEvents: unknown[] = []
      await drainToDone(run, agentEvents)
      run.abort()

      const subagentEvents = agentEvents.filter((e) => (e as { type: string }).type === 'subagent')
      console.log('[FB2-P07-probe-persist] subagent AgentEvent 방출:', JSON.stringify(subagentEvents, null, 2))
      const allTypesOrder = agentEvents.map((e) => (e as { type: string; id?: string }).type + ((e as { id?: string }).id ? '#' + String((e as { id?: string }).id).slice(-8) : ''))
      console.log('[FB2-P07-probe-persist] 전체 이벤트 순서:', JSON.stringify(allTypesOrder))

      expect(true).toBe(true)
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }, 240_000)
})

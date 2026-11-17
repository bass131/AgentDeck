// M07 G5 — Claude 실행을 열 때 컨트롤 설정을 한 번 읽는다.
// 봉인이 맞지 않으면 SDK를 부르지 않고 오류와 done을 낸다(닫힌 실패). 맞으면 꺼진 노드를 뺀 등록부로 권한 콜백을 만든다.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({ ud: '' }))

vi.mock('@main/02_Common/userData', () => ({ getUserDataDir: (): string => h.ud }))

import { ClaudeAgentRun } from '@main/04_Claude/run/claudeAgentRun'
import { setControlEnabled } from '@main/04_Claude/permission/controlsStore'
import type { QueryFn } from '@main/04_Claude/queryFn'
import type { AgentEvent } from '../../../../02_Project/00_Source/shared/agentEvents'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-run-controls-'))

beforeEach(() => {
  h.ud = fs.mkdtempSync(path.join(root, 'ud-'))
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const result = { type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {}, errors: [] }

async function drain(events: AsyncIterable<AgentEvent>, onEvent?: (e: AgentEvent) => void): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) {
    out.push(e)
    onEvent?.(e)
  }
  return out
}

describe('실행 시작의 컨트롤 설정 검사 (M07 G5)', () => {
  it('controls.json이 앱 밖에서 바뀌면 SDK를 부르지 않고 오류와 done을 낸다', async () => {
    setControlEnabled(h.ud, 'readonly-allow', false)
    fs.writeFileSync(path.join(h.ud, 'controls.json'), JSON.stringify({ version: 1, disabled: [] }))
    const query = vi.fn()
    const run = new ClaudeAgentRun({ messages: [{ role: 'user', content: 'hi' }] }, query as unknown as QueryFn, () => null, () => null)
    const events = await drain(run.events)
    expect(query).not.toHaveBeenCalled()
    const err = events.find((e) => e.type === 'error') as { message: string } | undefined
    expect(err?.message).toContain('설정 › 컨트롤')
    expect(events[events.length - 1].type).toBe('done')
  })

  it('이어지는(persistent) 실행도 같은 자리에서 오류와 done을 내고 닫힌다', async () => {
    fs.writeFileSync(path.join(h.ud, 'controls.json'), JSON.stringify({ version: 1, disabled: [] }))
    const query = vi.fn()
    const run = new ClaudeAgentRun(
      { messages: [{ role: 'user', content: 'hi' }], persistent: true },
      query as unknown as QueryFn,
      () => null,
      () => null,
    )
    const events = await drain(run.events)
    expect(query).not.toHaveBeenCalled()
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['error', 'done']))
  })

  it('봉인만 없어도(missing) 열지 않는다', async () => {
    fs.writeFileSync(path.join(h.ud, 'controls.json'), JSON.stringify({ version: 1, disabled: [] }))
    const query = vi.fn()
    const run = new ClaudeAgentRun({ messages: [{ role: 'user', content: 'hi' }] }, query as unknown as QueryFn, () => null, () => null)
    const events = await drain(run.events)
    expect(query).not.toHaveBeenCalled()
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('봉인이 맞으면 꺼진 노드를 뺀 등록부로 판정한다 — auto의 Bash가 카드로 온다', async () => {
    setControlEnabled(h.ud, 'mode-auto-bypass-allow', false)
    let decision: unknown = null
    const query: QueryFn = async function* (params: { prompt: string; options?: unknown }) {
      const opts = params.options as { canUseTool: (n: string, i: Record<string, unknown>, o: unknown) => Promise<unknown> }
      decision = await opts.canUseTool('Bash', { command: 'echo hi' }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu_1',
        suggestions: [{ type: 'addRules' }],
      })
      yield result
    }
    const run = new ClaudeAgentRun({ messages: [{ role: 'user', content: 'hi' }], mode: 'auto' }, query, () => null, () => null)
    const events = await drain(run.events, (e) => {
      if (e.type === 'permission_request') run.abort()
    })
    expect(events.some((e) => e.type === 'permission_request')).toBe(true)
    // abort가 카드 대기를 거부로 풀면 SDK 쪽 await가 그 뒤에 이어진다
    await new Promise((r) => setTimeout(r, 0))
    expect(decision).toMatchObject({ behavior: 'deny' })
  })

  it('토글은 다음 실행부터다 — 실행 중에 꺼도 이번 실행의 판정은 열 때 읽은 그대로다', async () => {
    let decision: unknown = null
    const query: QueryFn = async function* (params: { prompt: string; options?: unknown }) {
      setControlEnabled(h.ud, 'mode-auto-bypass-allow', false)
      const opts = params.options as { canUseTool: (n: string, i: Record<string, unknown>, o: unknown) => Promise<unknown> }
      decision = await opts.canUseTool('Bash', { command: 'echo hi' }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu_3',
        suggestions: [{ type: 'addRules' }],
      })
      yield result
    }
    const run = new ClaudeAgentRun({ messages: [{ role: 'user', content: 'hi' }], mode: 'auto' }, query, () => null, () => null)
    await drain(run.events)
    expect(decision).toMatchObject({ behavior: 'allow' })
  })

  it('첫 실행(none)은 전부 켬이다 — auto의 Bash는 카드 없이 허용된다', async () => {
    let decision: unknown = null
    const query: QueryFn = async function* (params: { prompt: string; options?: unknown }) {
      const opts = params.options as { canUseTool: (n: string, i: Record<string, unknown>, o: unknown) => Promise<unknown> }
      decision = await opts.canUseTool('Bash', { command: 'echo hi' }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu_2',
        suggestions: [{ type: 'addRules' }],
      })
      yield result
    }
    const run = new ClaudeAgentRun({ messages: [{ role: 'user', content: 'hi' }], mode: 'auto' }, query, () => null, () => null)
    const events = await drain(run.events)
    expect(events.some((e) => e.type === 'permission_request')).toBe(false)
    expect(decision).toMatchObject({ behavior: 'allow' })
  })
})
